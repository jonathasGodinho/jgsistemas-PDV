import { createSign, generateKeyPairSync } from 'crypto';
import * as forge from 'node-forge';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { SignedXml } from 'xml-crypto';

const execFileAsync = promisify(execFile);

export interface Assinador {
    tipo: 'test' | 'pfx' | 'pkcs11';
    certificadoPem: string;
    assinar(dados: Buffer): Promise<Buffer>;
}

function env(nome: string): string {
    return process.env[nome] ?? '';
}

function criarTeste(): Assinador {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const chavePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicaPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const chaveForge = forge.pki.privateKeyFromPem(chavePem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = chaveForge as any;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
    const attrs = [{ name: 'commonName', value: 'JG Sistemas - Certificado de Teste' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(chaveForge as any);
    const certPem = forge.pki.certificateToPem(cert);

    return {
        tipo: 'test',
        certificadoPem: certPem,
        async assinar(dados) {
            return createSign('RSA-SHA1').update(dados).sign(chavePem);
        }
    };
}

async function criarPfx(caminho: string, senha: string): Promise<Assinador> {
    const dados = await readFile(caminho);
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(dados.toString('latin1')));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha || undefined);

    let chave: forge.pki.rsa.PrivateKey | null = null;
    let cert: forge.pki.Certificate | null = null;

    const bolsasChave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag! });
    const keyBag = bolsasChave[forge.pki.oids.pkcs8ShroudedKeyBag!]?.[0];
    if (keyBag?.key) chave = keyBag.key as any;

    if (!chave) {
        const bolsasEnc = p12.getBags({ bagType: forge.pki.oids.encryptedPrivateKeyInfo! });
        const enc = bolsasEnc[forge.pki.oids.encryptedPrivateKeyInfo!]?.[0];
        if (enc?.key) chave = enc.key as any;
    }

    const bolsasCert = p12.getBags({ bagType: forge.pki.oids.certBag! });
    const certBag = bolsasCert[forge.pki.oids.certBag!]?.[0];
    if (certBag?.cert) cert = certBag.cert as any;

    if (!chave) throw new Error('Nenhuma chave privada encontrada no certificado .pfx');
    if (!cert) throw new Error('Nenhum certificado encontrado no arquivo .pfx');

    const chavePem = forge.pki.privateKeyToPem(chave);
    const certPem = forge.pki.certificateToPem(cert);

    return {
        tipo: 'pfx',
        certificadoPem: certPem,
        async assinar(dados) {
            return createSign('RSA-SHA1').update(dados).sign(chavePem);
        }
    };
}

async function obterCertificadoPkcs11(): Promise<string> {
    const pemPath = env('NFE_CERT_PEM');
    if (!pemPath) {
        throw new Error(
            'NFE_CERT_PEM não configurado. Exporte o certificado público (chave pública) do token para um arquivo .pem/.cer e informe o caminho.'
        );
    }
    const dados = await readFile(pemPath);
    if (dados.toString('latin1').includes('BEGIN CERTIFICATE')) {
        return dados.toString('utf8');
    }
    const der = dados.toString('latin1');
    return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der))));
}

async function criarPkcs11(): Promise<Assinador> {
    const openssl = env('NFE_OPENSSL') || 'openssl';
    const moduloDll = env('NFE_CERT_DLL');
    const pin = env('NFE_CERT_PIN');
    const uri = env('NFE_CERT_URI') || `pkcs11:type=private;pin-value=${pin || ''}`;
    const config = env('NFE_OPENSSL_CONFIG');
    if (!moduloDll) throw new Error('NFE_CERT_DLL (DLL do middleware PKCS#11) não configurado.');

    const certificadoPem = await obterCertificadoPkcs11();

    const args = ['dgst', '-sha1', '-engine', 'pkcs11', '-keyform', 'engine', '-sign', uri];
    if (config) args.push('-config', config);

    return {
        tipo: 'pkcs11',
        certificadoPem,
        async assinar(dados) {
            const dir = await mkdtemp(path.join(tmpdir(), 'nfe-ass-'));
            try {
                const dadosPath = path.join(dir, 'signedinfo.txt');
                const sigPath = path.join(dir, 'signature.bin');
                await writeFile(dadosPath, dados);
                const cmd = [...args, '-out', sigPath, '-in', dadosPath];
                await execFileAsync(openssl, cmd, { windowsHide: true });
                return readFile(sigPath);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        }
    };
}

export async function criarAssinador(): Promise<Assinador> {
    const modo = (env('NFE_CERT_MODE') || '').toLowerCase();
    const pfx = env('NFE_CERT_PFX');
    const dll = env('NFE_CERT_DLL');

    if (modo === 'test') return criarTeste();
    if (pfx) return criarPfx(pfx, env('NFE_CERT_PASSWORD'));
    if (dll) return criarPkcs11();
    throw new Error(
        'Nenhum certificado configurado. Defina NFE_CERT_MODE=test (somente testes), NFE_CERT_PFX (certificado A1) ou NFE_CERT_DLL (token A3) no arquivo .env.'
    );
}

function algoritmoRsaSha1Externo(assinador: Assinador) {
    return class RsaSha1Externo {
        getSignature(signedInfo: string, _privateKey: unknown, callback?: (err: any, value: string) => void): void {
            if (typeof callback !== 'function') {
                throw new Error('Assinatura síncrona não suportada para este certificado');
            }
            assinador
                .assinar(Buffer.from(signedInfo, 'utf8'))
                .then((sig) => callback(null, Buffer.from(sig).toString('base64')))
                .catch((err) => callback(err, ''));
        }
        getAlgorithmName(): string {
            return 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
        }
    };
}

export async function assinarXml(
    xml: string,
    assinador: Assinador,
    refXPath = "//*[local-name(.)='infNFe']"
): Promise<string> {
    const sig = new SignedXml({
        privateKey: 'certificado-externo',
        publicCert: assinador.certificadoPem,
        canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
    });
    sig.SignatureAlgorithms['http://www.w3.org/2000/09/xmldsig#rsa-sha1'] = algoritmoRsaSha1Externo(assinador);
    sig.addReference({
        xpath: refXPath,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1'
    });
    const assinado = await new Promise<SignedXml>((resolve, reject) => {
        sig.computeSignature(xml, {}, (err, obj) => {
            if (err) return reject(err);
            resolve(obj);
        });
    });
    return assinado.getSignedXml();
}
