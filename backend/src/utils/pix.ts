// Gera o payload PIX no padrão EMV (BR Code) e o QR Code correspondente
import QRCode from 'qrcode';

function crc16(payload: string): string {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
            else crc <<= 1;
        }
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function campo(id: string, valor: string): string {
    const tamanho = valor.length.toString().padStart(2, '0');
    return `${id}${tamanho}${valor}`;
}

export interface PixOptions {
    chave: string;
    nome: string;
    cidade: string;
    valor: number;
    txid: string;
}

export function gerarPixPayload({ chave, nome, cidade, valor, txid }: PixOptions): string {
    const nomeNormalizado = nome.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 25);
    const cidadeNormalizada = cidade.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 15);
    const txidNormalizado = txid.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 25) || '***';

    const gui = campo('00', 'BR.GOV.BCB.PIX');
    const chaveCampo = campo('01', chave);
    const merchantAccount = campo('26', gui + chaveCampo);

    let payload = '000201' + '010212' + merchantAccount + '52040000' + '5303986';
    payload += campo('54', valor.toFixed(2));
    payload += '5802BR';
    payload += campo('59', nomeNormalizado);
    payload += campo('60', cidadeNormalizada);
    payload += campo('62', campo('05', txidNormalizado));
    payload += '6304';

    return payload + crc16(payload);
}

export async function gerarPixQrCode(opts: PixOptions): Promise<{ payload: string; qrDataUrl: string }> {
    const payload = gerarPixPayload(opts);
    const qrDataUrl = await QRCode.toDataURL(payload, { width: 220, margin: 1 });
    return { payload, qrDataUrl };
}
