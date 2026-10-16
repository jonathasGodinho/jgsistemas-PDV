import { describe, expect, it } from 'vitest';
import { validarReceita } from '../src/utils/sngpc/receita';
import { receitaValida, diasAtras } from './sngpc-factories';

// T-03.01 — validação da receita (Guia SNGPC v2.3 §4.2; D-04, D-10, D-24, D-25).

const b1 = { name: 'Clonazepam 2mg', classeSngpc: 'CONTROLADO', listaPortaria344: 'B1', qtdMaxReceita: null };
const amoxi = { name: 'Amoxicilina 500mg', classeSngpc: 'ANTIMICROBIANO', listaPortaria344: null, qtdMaxReceita: 2 };

describe('validarReceita (T-03.01)', () => {
  it('controlado: exige comprador e recusa conselho veterinário em uso humano', () => {
    const semComprador = validarReceita(receitaValida({ comprador: undefined }), [{ produto: b1, quantidade: 1 }]);
    expect(semComprador.erros.join(' ')).toMatch(/comprador/i);
    expect(semComprador.tipoReceituario).toBe(2);

    const crmv = validarReceita(
      receitaValida({ prescritor: { nome: 'Dra. Vet', conselho: 'CRMV', numero: '1', uf: 'AM' } }),
      [{ produto: b1, quantidade: 1 }],
    );
    expect(crmv.erros.join(' ')).toMatch(/conselho/i);

    const ok = validarReceita(receitaValida(), [{ produto: b1, quantidade: 1 }]);
    expect(ok.erros).toEqual([]);
  });

  it('antimicrobiano: número opcional, paciente obrigatório, alerta acima do máximo e erro acima de 999', () => {
    const r = validarReceita(receitaValida({ numero: undefined, comprador: undefined }), [{ produto: amoxi, quantidade: 3 }]);
    expect(r.erros).toEqual([]);
    expect(r.tipoReceituario).toBe(5);
    expect(r.alertas).toEqual([{ codigo: 'QTD_ACIMA_MAXIMO', produto: 'Amoxicilina 500mg', quantidade: 3, maximo: 2 }]);

    const semPaciente = validarReceita(receitaValida({ paciente: undefined }), [{ produto: amoxi, quantidade: 1 }]);
    expect(semPaciente.erros.join(' ')).toMatch(/paciente/i);

    const mil = validarReceita(receitaValida(), [{ produto: { ...amoxi, qtdMaxReceita: null }, quantidade: 1000 }]);
    expect(mil.erros.join(' ')).toMatch(/999/);
  });

  it('vencida, número ausente em notificação e tipos misturados viram erro', () => {
    const vencida = validarReceita(receitaValida({ dataPrescricao: diasAtras(31) }), [{ produto: b1, quantidade: 1 }]);
    expect(vencida.erros.join(' ')).toMatch(/vencida/i);

    const semNumero = validarReceita(receitaValida({ numero: '' }), [{ produto: b1, quantidade: 1 }]);
    expect(semNumero.erros.join(' ')).toMatch(/número/i);

    const misturada = validarReceita(receitaValida(), [{ produto: b1, quantidade: 1 }, { produto: amoxi, quantidade: 1 }]);
    expect(misturada.erros.join(' ')).toMatch(/mesma receita/i);
  });
});
