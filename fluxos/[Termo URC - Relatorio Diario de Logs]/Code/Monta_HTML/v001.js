// ============================================
// TERMOS URC - RELATÓRIO DE LOGS (HTML → Gotenberg)
// Dados: RPC n8n_relatorio_logs_agendado / relatorio_logs_manual (nó "Prepara dados").
// Resumo (totais, categorias, por usuário) + lista de eventos em ordem de horário.
// "Tela aberta" não entra na lista: aparece só como contagem por usuário
// (decisão do desenvolvedor). A4 retrato; as margens e o rodapé "Página X de Y"
// vêm do Gotenberg (não usar @page aqui — somaria com as margens).
// ============================================

const d = $('Prepara dados').first().json;
let logo = '';
try {
  logo = String($('Logo base64').first().json.data || '').replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
} catch (e) { logo = ''; }

const TZ = 'America/Campo_Grande';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso, opt) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opt }).format(new Date(iso));
const dataHora = iso => fmt(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(',', '');
const diaHora = iso => fmt(iso, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).replace(',', '');
const num = n => Number(n || 0).toLocaleString('pt-BR');

const CAT = {
  acesso:    ['Acesso',    '#1d4ed8', '#dbeafe'],
  consulta:  ['Consulta',  '#6d28d9', '#ede9fe'],
  cliente:   ['Cliente',   '#0e7490', '#cffafe'],
  termo:     ['Termo',     '#047857', '#d1fae5'],
  usuario:   ['Usuário',   '#b45309', '#fef3c7'],
  senha:     ['Senha',     '#b91c1c', '#fee2e2'],
  whatsapp:  ['WhatsApp',  '#15803d', '#dcfce7'],
  foco:      ['FOCO',      '#4338ca', '#e0e7ff'],
  relatorio: ['Relatório', '#475569', '#f1f5f9']
};
const badge = c => {
  const x = CAT[c] || [c, '#374151', '#f3f4f6'];
  return `<span class="badge" style="color:${x[1]};background:${x[2]}">${esc(x[0])}</span>`;
};

const t = d.totais || {};
const eventos = Array.isArray(d.eventos) ? d.eventos : [];
const porUsuario = Array.isArray(d.por_usuario) ? d.por_usuario : [];
const cats = Object.entries(t.por_categoria || {}).sort((a, b) => b[1] - a[1]);
const maxCat = Math.max(1, ...cats.map(c => c[1]));
const titulo = d.modo === 'manual' ? 'Relatório de logs (envio manual)' : 'Relatório diário de logs';
const periodo = `${dataHora(d.periodo_inicio)} a ${dataHora(d.periodo_fim)}`;
// Horário do banco (fim do período), não o relógio do servidor do n8n
const geradoEm = dataHora(d.periodo_fim || new Date().toISOString());

const kpi = (rotulo, valor, cor) => `
  <div class="kpi" style="border-top-color:${cor}">
    <div class="kpi-valor">${num(valor)}</div>
    <div class="kpi-rotulo">${esc(rotulo)}</div>
  </div>`;

const blocoCategorias = cats.length ? `
  <h2>Eventos por categoria</h2>
  <table class="tabela barras">
    <tbody>
      ${cats.map(([c, n]) => {
        const x = CAT[c] || [c, '#374151', '#f3f4f6'];
        return `<tr>
          <td class="col-cat">${badge(c)}</td>
          <td><div class="barra"><span style="width:${Math.max(2, Math.round(n / maxCat * 100))}%;background:${x[1]}"></span></div></td>
          <td class="num">${num(n)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : '';

const blocoUsuarios = porUsuario.length ? `
  <h2>Atividade por usuário</h2>
  <table class="tabela">
    <thead><tr><th>Usuário</th><th class="num">Entradas</th><th class="num">Telas abertas</th><th class="num">Consultas</th><th class="num">Ações</th><th class="num">Total</th></tr></thead>
    <tbody>
      ${porUsuario.map(u => `<tr>
        <td><strong>${esc(u.nome)}</strong>${u.email ? `<br><span class="sub">${esc(u.email)}</span>` : ''}</td>
        <td class="num">${num(u.logins)}</td><td class="num">${num(u.telas)}</td><td class="num">${num(u.consultas)}</td>
        <td class="num">${num(u.alteracoes)}</td><td class="num"><strong>${num(u.total)}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>` : '';

const blocoEventos = eventos.length ? `
  <h2>Eventos do período <span class="h2-sub">(em ordem de horário; "tela aberta" só na contagem acima)</span></h2>
  <table class="tabela eventos">
    <thead><tr><th class="col-hora">Data e hora</th><th class="col-quem">Quem</th><th class="col-cat">Categoria</th><th>O que foi feito</th></tr></thead>
    <tbody>
      ${eventos.map(e => `<tr>
        <td class="col-hora">${esc(diaHora(e.criado_em))}</td>
        <td class="col-quem">${esc(e.quem)}</td>
        <td class="col-cat">${badge(e.categoria)}</td>
        <td>${esc(e.descricao)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ${d.eventos_omitidos > 0 ? `<p class="aviso">Mais ${num(d.eventos_omitidos)} evento(s) do período não couberam neste PDF — consulte a tela Logs do Sistema.</p>` : ''}`
  : (t.eventos > 0
      ? '<p class="vazio">No período houve apenas abertura de telas (contadas acima).</p>'
      : '');

const corpo = t.eventos > 0 ? `
  <div class="kpis">
    ${kpi('Eventos registrados', t.eventos, '#003087')}
    ${kpi('Usuários com atividade', t.usuarios, '#7c3aed')}
    ${kpi('Entradas no sistema', t.logins, '#1d4ed8')}
    ${kpi('Telas abertas', t.telas, '#0891b2')}
  </div>
  <div class="kpis">
    ${kpi('Termos gerados', t.termos_gerados, '#047857')}
    ${kpi('Termos enviados', t.termos_enviados, '#15803d')}
    ${kpi('Termos aceitos', t.termos_aceitos, '#16a34a')}
    ${kpi('Termos recusados', t.termos_recusados, '#dc2626')}
  </div>
  ${blocoCategorias}
  ${blocoUsuarios}
  ${blocoEventos}`
  : `<div class="sem-movimento">
       <div class="sem-titulo">Nenhuma atividade registrada no período</div>
       <div>Não houve acessos nem alterações no TERMOS URC entre ${esc(periodo)}.</div>
     </div>`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)} — TERMOS URC</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; }
  .topo { background: #003087; background: linear-gradient(135deg, #003087 0%, #0050d0 100%); color: #fff; padding: 18px 22px; border-radius: 8px; display: flex; align-items: center; gap: 18px; }
  .topo img { height: 38px; }
  .topo h1 { margin: 0; font-size: 19px; }
  .topo .sub { color: #dbeafe; font-size: 11px; margin-top: 3px; }
  .topo .direita { margin-left: auto; text-align: right; font-size: 10px; color: #dbeafe; }
  .periodo { margin: 12px 0 14px; padding: 9px 12px; background: #f1f5f9; border-left: 4px solid #003087; border-radius: 4px; font-size: 11.5px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 8px; }
  .kpi { flex: 1; border: 1px solid #e5e7eb; border-top: 4px solid #003087; border-radius: 6px; padding: 9px 8px; text-align: center; break-inside: avoid; }
  .kpi-valor { font-size: 20px; font-weight: 700; color: #111827; }
  .kpi-rotulo { font-size: 9.5px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 3px; }
  h2 { font-size: 13px; color: #003087; margin: 16px 0 6px; break-after: avoid; }
  .h2-sub { font-size: 10px; color: #6b7280; font-weight: 400; }
  .tabela { width: 100%; border-collapse: collapse; }
  .tabela thead { display: table-header-group; }
  .tabela th { background: #f3f4f6; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.3px; color: #374151; padding: 6px 7px; border-bottom: 1px solid #d1d5db; }
  .tabela td { padding: 5px 7px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  .tabela tr { break-inside: avoid; }
  .tabela .num { text-align: right; white-space: nowrap; }
  .sub { color: #6b7280; font-size: 9.5px; }
  .barras .col-cat { width: 110px; }
  .barra { background: #f1f5f9; border-radius: 4px; height: 10px; overflow: hidden; }
  .barra span { display: block; height: 10px; border-radius: 4px; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 9.5px; font-weight: 700; white-space: nowrap; }
  .eventos .col-hora { width: 92px; white-space: nowrap; color: #374151; }
  .eventos .col-quem { width: 130px; }
  .eventos .col-cat { width: 80px; }
  .eventos tbody tr:nth-child(even) td { background: #fafafa; }
  .aviso { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 8px 10px; border-radius: 6px; }
  .vazio { color: #6b7280; }
  .sem-movimento { margin-top: 30px; text-align: center; padding: 34px 20px; border: 2px dashed #cbd5e1; border-radius: 10px; color: #475569; font-size: 12px; }
  .sem-titulo { font-size: 16px; font-weight: 700; color: #003087; margin-bottom: 6px; }
</style>
</head>
<body>
  <div class="topo">
    ${logo ? `<img src="data:image/png;base64,${logo}" alt="SEBRAE">` : '<strong style="font-size:18px">SEBRAE</strong>'}
    <div>
      <h1>${esc(titulo)}</h1>
      <div class="sub">TERMOS URC · Sistema de Gestão de Aceites de Termos</div>
    </div>
    <div class="direita">Gerado em<br><strong style="color:#fff">${esc(geradoEm)}</strong></div>
  </div>
  <div class="periodo"><strong>Período:</strong> ${esc(periodo)} (horário de Mato Grosso do Sul)</div>
  ${corpo}
</body>
</html>`;

const arquivo = `Relatorio de logs TERMOS URC - ${fmt(d.periodo_fim, { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')}`;

// O Convert to File ("Move Base64 String to File") espera base64, não o HTML puro
const html_base64 = Buffer.from(html, 'utf8').toString('base64');

return [{ json: { html_base64, arquivo, titulo, periodo } }];
