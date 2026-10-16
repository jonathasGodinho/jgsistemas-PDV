// Pacote do arquivo SNGPC (farmácia Fase 2; D-02, D-17).
// O SNGPC só aceita o XML compactado em zip (Guia v2.3 §5) e, no envio, calcula o MD5 sobre o
// base64 do zip (Manual do Desenvolvedor p.4) — esse hash é guardado para conferir a recepção.
import { createHash } from 'crypto';
import { zipSync } from 'fflate';

export function empacotar(xml: string, nomeArquivo: string): { zipBase64: string; hash: string } {
    const bytes = new Uint8Array(Buffer.from(xml, 'latin1'));
    const zip = zipSync({ [nomeArquivo]: bytes }, { level: 9 });
    const zipBase64 = Buffer.from(zip).toString('base64');
    return { zipBase64, hash: createHash('md5').update(zipBase64).digest('hex') };
}
