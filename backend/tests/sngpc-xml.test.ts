import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { abrirZipBase64, contar, textoEm, textosEm } from './sngpc-xml';

// T-01.02 — helpers de teste para os arquivos do SNGPC (zip base64 com XML iso-8859-1).

const XML = `<?xml version="1.0" encoding="iso-8859-1" ?>
<mensagemSNGPC xmlns="urn:sngpc-schema">
  <cabecalho><cnpjEmissor>12345678000199</cnpjEmissor><cpfTransmissor>72586648153</cpfTransmissor></cabecalho>
  <corpo><medicamentos><saidaMedicamentoVendaAoConsumidor>
    <compradorMedicamento><nomeComprador>João Ação</nomeComprador></compradorMedicamento>
    <medicamentoVenda><numeroLoteMedicamento>L1</numeroLoteMedicamento></medicamentoVenda>
    <medicamentoVenda><numeroLoteMedicamento>L2</numeroLoteMedicamento></medicamentoVenda>
  </saidaMedicamentoVendaAoConsumidor></medicamentos></corpo>
</mensagemSNGPC>`;

describe('Helpers de XML e zip do SNGPC (T-01.02)', () => {
  it('abre o zip base64 e devolve o XML latin1 original com acentos', () => {
    const zip = zipSync({ 'sngpc.xml': new Uint8Array(Buffer.from(XML, 'latin1')) });
    const base64 = Buffer.from(zip).toString('base64');

    const aberto = abrirZipBase64(base64);
    expect(aberto.nome).toBe('sngpc.xml');
    expect(aberto.xml).toBe(XML);
    expect(aberto.xml).toContain('João Ação');
    // o conteúdo do zip está em latin1: "ã" ocupa 1 byte, não 2 (utf-8)
    expect(aberto.bytes.length).toBe(Buffer.byteLength(XML, 'latin1'));
    // um zip utf-8 do mesmo texto não volta igual pela leitura latin1
    const zipUtf8 = Buffer.from(zipSync({ 'x.xml': strToU8(XML) })).toString('base64');
    expect(abrirZipBase64(zipUtf8).xml).not.toBe(XML);
  });

  it('consulta elementos pelo caminho e conta repetições', () => {
    expect(textoEm(XML, 'cabecalho/cnpjEmissor')).toBe('12345678000199');
    expect(contar(XML, 'medicamentoVenda')).toBe(2);
    expect(textosEm(XML, 'medicamentoVenda/numeroLoteMedicamento')).toEqual(['L1', 'L2']);
    expect(textoEm(XML, 'cabecalho/naoExiste')).toBeNull();
  });
});
