import { unzipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

// Helpers de teste para os arquivos do SNGPC (T-01.02): o arquivo é um zip em base64
// com um XML iso-8859-1 dentro (Guia SNGPC v2.3, seção 5).

export function abrirZipBase64(base64: string): { nome: string; bytes: Uint8Array; xml: string } {
  const arquivos = unzipSync(new Uint8Array(Buffer.from(base64, 'base64')));
  const [nome] = Object.keys(arquivos);
  if (!nome) throw new Error('zip vazio');
  const bytes = arquivos[nome];
  return { nome, bytes, xml: Buffer.from(bytes).toString('latin1') };
}

function elementos(xml: string, caminho: string): any[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const [primeiro, ...resto] = caminho.split('/');
  let atuais: any[] = Array.from(doc.getElementsByTagNameNS('*', primeiro) as any);
  for (const nome of resto) {
    const proximos: any[] = [];
    for (const el of atuais) {
      for (const filho of Array.from(el.childNodes as any) as any[]) {
        if (filho.nodeType === 1 && (filho.localName ?? filho.nodeName) === nome) proximos.push(filho);
      }
    }
    atuais = proximos;
  }
  return atuais;
}

/** Texto do primeiro elemento no caminho ("a/b/c": `a` em qualquer nível, depois filhos diretos), ou null. */
export function textoEm(xml: string, caminho: string): string | null {
  const [el] = elementos(xml, caminho);
  return el ? (el.textContent ?? '') : null;
}

/** Textos de todos os elementos no caminho, na ordem do documento. */
export function textosEm(xml: string, caminho: string): string[] {
  return elementos(xml, caminho).map(e => e.textContent ?? '');
}

/** Quantos elementos existem no caminho. */
export function contar(xml: string, caminho: string): number {
  return elementos(xml, caminho).length;
}

/** Nomes dos filhos diretos do primeiro elemento no caminho, na ordem (para conferir a ordem dos blocos). */
export function filhos(xml: string, caminho: string): string[] {
  const [el] = elementos(xml, caminho);
  if (!el) return [];
  return (Array.from(el.childNodes as any) as any[]).filter(n => n.nodeType === 1).map(n => n.localName ?? n.nodeName);
}
