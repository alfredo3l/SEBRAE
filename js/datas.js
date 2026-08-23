/* ============================================
   SEBRAE - Datas e horas no fuso do atendimento
   ============================================

   O sistema atende o SEBRAE/MS, mas o computador do consultor pode estar em
   outro fuso — Brasília, por exemplo, está 1 hora à frente de Campo Grande.
   Formatando pelo fuso do navegador, um documento gerado às 16:30 em MS
   aparecia como 17:30 na lista. Aqui todas as datas exibidas são convertidas
   para o horário local de MS, o mesmo que os PDFs gerados pelo n8n já usam. */

const FUSO_SEBRAE = 'America/Campo_Grande';

const _MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Quebra uma data no fuso de MS em partes já formatadas.
 * Aceita Date, ISO do banco ou "dd/mm/aaaa [hh:mm]" digitado no sistema.
 * Retorna null quando o valor não é uma data válida.
 */
function partesDataSebrae(valor) {
    if (valor === null || valor === undefined || valor === '' || valor === '-') return null;

    // Data já escrita no formato brasileiro é hora local do atendimento:
    // não tem fuso para converter, seria deslocada indevidamente.
    if (!(valor instanceof Date)) {
        const br = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
        if (br) {
            return {
                day: br[1], month: br[2], year: br[3],
                hour: br[4] || '00', minute: br[5] || '00',
                mesNome: _MESES_PT[parseInt(br[2], 10) - 1]
            };
        }
    }

    const d = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(d.getTime())) return null;

    const partes = {};
    new Intl.DateTimeFormat('pt-BR', {
        timeZone: FUSO_SEBRAE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d).forEach(p => { if (p.type !== 'literal') partes[p.type] = p.value; });

    partes.mesNome = _MESES_PT[parseInt(partes.month, 10) - 1];
    return partes;
}

/** dd/mm/aaaa hh:mm (horário de MS) */
function formatarDataHoraSebrae(valor, vazio = '-') {
    const p = partesDataSebrae(valor);
    return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : vazio;
}

/** dd/mm/aaaa (horário de MS) */
function formatarDataSebrae(valor, vazio = '-') {
    const p = partesDataSebrae(valor);
    return p ? `${p.day}/${p.month}/${p.year}` : vazio;
}

/** dd/mm hh:mm — versão curta usada nos cards do acompanhamento */
function formatarDataCurtaSebrae(valor, vazio = '—') {
    const p = partesDataSebrae(valor);
    return p ? `${p.day}/${p.month} ${p.hour}:${p.minute}` : vazio;
}

/** Partes da data de hoje no fuso de MS (para os termos gerados) */
function hojeSebrae() {
    return partesDataSebrae(new Date());
}
