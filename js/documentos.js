/* ============================================
   SEBRAE - Termos URC - Página de documento
   documento.html?id=<parceiro>&tipo=<slug>
   Formulário por termo + pré-visualização com a
   redação oficial dos modelos (docs/*.docx|pdf)
   ============================================ */

// ===== Helpers =====

/** Escapa HTML de valores digitados antes de injetar no preview */
function escHTML(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Valor preenchido em negrito, ou lacuna quando vazio */
function docValor(v, lacuna = '__________________') {
    const s = String(v ?? '').trim();
    return s ? `<b>${escHTML(s)}</b>` : `<span class="doc-lacuna">${lacuna}</span>`;
}

/** Checkbox do preview: (X) quando marcado, ( ) quando não */
function docCheck(marcado) {
    return marcado ? '<b>( X )</b>' : '(&nbsp;&nbsp;&nbsp;)';
}

/** Um campo só conta como preenchido se não for vazio nem um traço de "sem dado" */
function temValor(v) {
    const s = String(v ?? '').trim();
    return s !== '' && s !== '—' && s !== '-';
}

/**
 * Devolve o trecho apenas quando o dado existe. Usado nos dados de
 * qualificação (CNPJ, e-mail, telefone, RG) para o documento não sair com
 * lacunas em branco quando o consultor não tem a informação.
 */
function trechoSe(valor, montar) {
    return temValor(valor) ? montar(`<b>${escHTML(String(valor).trim())}</b>`) : '';
}

/** Data de hoje por extenso parcial: {dia, mesNome, ano} */
function dataHojePartes() {
    // Data do atendimento no fuso de MS: perto da meia-noite, o fuso do
    // navegador poderia imprimir o dia seguinte no documento.
    const h = hojeSebrae();
    return { dia: h.day, mesNome: h.mesNome, ano: h.year };
}

/** Formata um CNPJ como 00.000.000/0000-00 (o FOCO já costuma vir mascarado) */
function formatarCNPJValor(valor) {
    let v = String(valor ?? '').replace(/\D/g, '').slice(0, 14);
    return v.replace(/^(\d{2})(\d)/, '$1.$2')
            .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d)/, '.$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Máscara simples de CNPJ (00.000.000/0000-00) */
function mascaraCNPJDoc(input) {
    input.value = formatarCNPJValor(input.value);
}

/** Só os dígitos — para comparar CNPJs sem tropeçar na máscara */
function digitosCNPJ(valor) {
    return String(valor ?? '').replace(/\D/g, '');
}

// ===== Blocos de assinatura/local reutilizados nos templates =====

function blocoLocalDataAssinatura(local, assinante) {
    const { dia, mesNome, ano } = dataHojePartes();
    return `
        <p class="doc-assinatura-espaco">${docValor(local, '___________________________')}, ${dia} de ${mesNome} de ${ano}.</p>
        <p class="doc-assinatura">_______________________________________<br>
        <span class="doc-assinatura-label">${escHTML(assinante)}</span><br>
        <span class="doc-assinatura-label doc-assinatura-nota">Assinatura eletrônica / aceite via WhatsApp</span></p>`;
}

/** Data de hoje no formato dd/mm/aaaa */
function dataHojeBR() {
    return formatarDataSebrae(new Date());   // horário de MS (js/datas.js)
}

/**
 * Campos-base comuns a todos os termos editáveis (formulário padrão da POC —
 * Tela 3): Nome, CPF, CNPJ, Telefone, E-mail, Account ID, Nº interação, Data.
 */
function camposBaseTermo() {
    return [
        { id: 'nome', label: 'Nome/Razão Social', auto: true, valor: c => c.parceiro.nome_razao_social },
        { id: 'cpf', label: 'CPF', auto: true, valor: c => c.parceiro.cpf },
        // Dado do FOCO (Account.CNPJ__c): trava quando a conta tem CNPJ;
        // só fica editável quando o cadastro do FOCO não traz a informação.
        { id: 'cnpj', label: 'CNPJ', autoFoco: true, mascara: 'cnpj', placeholder: '00.000.000/0000-00',
          valor: c => c.foco?.Account?.CNPJ__c || '' },
        { id: 'telefone', label: 'Telefone (WhatsApp)', valor: c => c.parceiro.telefone || '', placeholder: '(00)00000-0000' },
        { id: 'email', label: 'E-mail', valor: c => c.parceiro.email || c.foco?.Email || '', placeholder: 'email@exemplo.com' },
        { id: 'account_id', label: 'Account ID', auto: true, valor: c => c.parceiro.id_salesforce || c.foco?.AccountId || '—' },
        { id: 'interacao', label: 'Nº do processo / interação', auto: true, valor: c => c.interacao?.CaseNumber || '—' },
        { id: 'data', label: 'Data do atendimento', auto: true, valor: () => dataHojeBR() }
    ];
}

/** Campo de observações complementares (padrão POC), sempre por último */
const CAMPO_OBSERVACOES = { id: 'observacoes', label: 'Observações complementares', tipo: 'textarea', full: true, placeholder: 'Observações do atendimento (opcional)' };

/**
 * Bloco padrão do preview (POC): Processo/Interação nº + Data do atendimento
 * e, se preenchidas, as observações complementares.
 */
function blocoProcessoObservacoes(d) {
    // Sem número de interação (FOCO indisponível), imprime apenas a data
    let html = temValor(d.interacao)
        ? `<p>Processo/Interação nº <b>${escHTML(String(d.interacao).trim())}</b> — Data do atendimento: ${docValor(d.data)}.</p>`
        : `<p>Data do atendimento: ${docValor(d.data)}.</p>`;
    if ((d.observacoes || '').trim()) {
        html += `<p>${escHTML(d.observacoes)}</p>`;
    }
    return html;
}

// ===== Catálogo dos termos =====
// campo: { id, label, tipo: text|textarea|radio|check|checklist|debitos|dasn, auto, valor(ctx), opcoes, placeholder, mascara, full }

const TERMOS_URC = {

    'termo-lgpd': {
        titulo: 'Termo LGPD',
        descricao: 'Termo de Consentimento LGPD — preenchimento 100% automático (FOCO). Sem edição.',
        envioDireto: true,
        campos: [
            { id: 'nome', label: 'Nome/Razão Social', auto: true, valor: c => c.parceiro.nome_razao_social },
            { id: 'cpf', label: 'CPF', auto: true, valor: c => c.parceiro.cpf },
            { id: 'telefone', label: 'Telefone (WhatsApp)', auto: true, valor: c => c.parceiro.telefone },
            { id: 'email', label: 'E-mail', auto: true, valor: c => c.parceiro.email || c.foco?.Email || '—' },
            { id: 'account_id', label: 'Account ID', auto: true, valor: c => c.parceiro.id_salesforce || c.foco?.AccountId || '—' },
            { id: 'interacao', label: 'Nº do processo / interação', auto: true, valor: c => c.interacao?.CaseNumber || '—' },
            { id: 'data', label: 'Data do atendimento', auto: true, valor: () => dataHojeBR() }
        ],
        template(d) {
            return `
                <h3>Termo de Consentimento LGPD</h3>
                <p>O termo de consentimento para tratamento de dados pessoais (LGPD — Lei nº 13.709/2018)
                será gerado automaticamente com os dados do cliente e enviado por WhatsApp para leitura e aceite.</p>
                <p>Cliente: ${docValor(d.nome)}<br>
                CPF: ${docValor(d.cpf)}<br>
                Telefone: ${docValor(d.telefone)}</p>
                <p>Ao responder <b>"1 - Aceito"</b> no WhatsApp, o cliente recebe o PDF assinado digitalmente
                (hash SHA-256) e o aceite é registrado com data e hora. A resposta <b>"2 - Não aceito"</b>
                registra a recusa.</p>
                <p>Processo/Interação nº ${docValor(d.interacao, '________________')} — Data do atendimento: ${docValor(d.data)}.</p>`;
        }
    },

    'parcelamento-mei': {
        titulo: 'Parcelamento de Débitos do MEI — Termo de Ciência e Responsabilidade',
        descricao: 'Parcelamento dos débitos junto à Receita Federal do Brasil (Portal do Simples Nacional).',
        campos: [
            ...camposBaseTermo(),
            { id: 'valor', label: 'Total do Valor Parcelado (R$)', placeholder: '0.000,00' },
            { id: 'local', label: 'Local (cidade)', placeholder: 'Campo Grande' },
            { id: 'modalidade', label: 'Modalidade do parcelamento', tipo: 'radio', full: true, opcoes: [
                'Parcelamento – Microempreendedor Individual – Máximo 60 meses',
                'Parcelamento Especial – Microempreendedor Individual – Máximo 120 meses'
            ] },
            { id: 'incluir_nao_exigiveis', label: 'Autorização: Solicito ao SEBRAE que inclua os débitos não exigíveis neste parcelamento.', tipo: 'check', full: true },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            return `
                <h3>PARCELAMENTO DE DÉBITOS DO MEI<br>TERMO DE CIÊNCIA E RESPONSABILIDADE JUNTO AO SEBRAE</h3>
                <p>Eu, ${docValor(d.nome)}, portador do CPF ${docValor(d.cpf)}${trechoSe(d.cnpj, v => `, devidamente inscrito no CNPJ sob n.º ${v}`)}, declaro para os devidos fins que se fizerem necessários, que solicitei ao
                SEBRAE a realização do <b>PARCELAMENTO DOS DÉBITOS JUNTO À RECEITA FEDERAL DO BRASIL</b> de minha
                inscrição como Microempreendedor Individual no Portal do Simples Nacional na seguinte modalidade:</p>
                <p>${docCheck(d.modalidade === 'Parcelamento – Microempreendedor Individual – Máximo 60 meses')} Parcelamento – Microempreendedor Individual – Máximo 60 meses<br>
                ${docCheck(d.modalidade === 'Parcelamento Especial – Microempreendedor Individual – Máximo 120 meses')} Parcelamento Especial – Microempreendedor Individual – Máximo 120 meses</p>
                <p>Total do Valor Parcelado R$ ${docValor(d.valor)}</p>
                <p>Declaro que fui informado sobre o total NÃO EXIGÍVEL e suas implicações para fins de contagem de
                carência para obtenção dos benefícios previdenciários.</p>
                <p>Fui orientado quanto ao benefício fiscal criado pela Lei Complementar nº 123/2006, 128/2008 e suas
                Resoluções e sobre a regularização e obrigatoriedade da entrega da Declaração Anual de Faturamento da
                Empresa (DASN MEI – Declaração Anual do Simples Nacional – Microempreendedor Individual), neste ato.</p>
                <p>Por fim, autorizo o parcelamento de débitos do CNPJ de minha responsabilidade para fins de contagem
                de carência e obtenção dos benefícios previdenciários.</p>
                <p>${docCheck(d.incluir_nao_exigiveis)} Autorização: Solicito ao SEBRAE que inclua os débitos não
                exigíveis neste parcelamento.</p>
                ${blocoProcessoObservacoes(d)}
                <p>Por ser verdade, firmo o presente.</p>
                ${blocoLocalDataAssinatura(d.local ? d.local + '/MS' : '', 'Assinatura do Responsável pela empresa (Idêntica a do RG)')}`;
        }
    },

    'parcelamento-pgfn': {
        titulo: 'Parcelamento de Débitos do MEI — PGFN',
        descricao: 'Parcelamento de débitos inscritos em Dívida Ativa junto à PGFN (portal REGULARIZE).',
        campos: [
            ...camposBaseTermo(),
            { id: 'valor', label: 'Valor total do débito (R$)', placeholder: '0.000,00' },
            { id: 'local', label: 'Local (cidade)', placeholder: 'Campo Grande' },
            { id: 'modalidade', label: 'Acesso ao Sistema de Negociações – Parcelamento ou Acordo de Transação – Máximo 60 meses', tipo: 'check', full: true },
            { id: 'incluir_nao_exigiveis', label: 'Solicitei ao SEBRAE que incluísse os débitos não exigíveis neste parcelamento.', tipo: 'check', full: true },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            const { dia, mesNome, ano } = dataHojePartes();
            return `
                <h3>PARCELAMENTO DE DÉBITOS DO MEI - PGFN<br>TERMO DE CIÊNCIA E RESPONSABILIDADE JUNTO AO SEBRAE/MS</h3>
                <p>Eu, ${docValor(d.nome)}, inscrito(a) no CPF/MF sob o nº ${docValor(d.cpf)}${trechoSe(d.email, v => `, e-mail ${v}`)}${trechoSe(d.telefone, v => `, telefone ${v}`)}${trechoSe(d.cnpj, v => `, devidamente inscrito(a) no CNPJ sob nº ${v}`)}, declaro para os fins que se fizerem necessários, que solicitei ao SEBRAE/MS a
                realização do <b>PARCELAMENTO DE DÉBITOS INSCRITOS EM DÍVIDA ATIVA JUNTO A PROCURADORIA GERAL DA
                FAZENDA NACIONAL</b>, que constavam em minha inscrição como Micro Empreendedor Individual no portal
                REGULARIZE da PGFN, tendo o parcelamento se firmado nos seguintes termos:</p>
                <p>${docCheck(d.modalidade)} Acesso ao Sistema de Negociações – Parcelamento ou Acordo de Transação – Máximo 60 meses<br>
                ${docCheck(d.incluir_nao_exigiveis)} Solicitei ao SEBRAE que incluísse os débitos não exigíveis neste parcelamento.</p>
                <p>O valor total do débito, com todos os eventuais juros e correções monetárias, corresponde a
                R$ ${docValor(d.valor)}</p>
                <p>Declaro que acessei o portal https://www.regularize.pgfn.gov.br com meu login e senha, onde, após
                logado, autorizei que o Consultor do SEBRAE me auxiliasse, realizando o parcelamento dos meus débitos,
                conforme acima descrito. Após o término do procedimento, eu mesmo(a) realizei meu logoff do sistema.</p>
                <p>Declaro que fui orientado pelo Consultor do SEBRAE a realizar a alteração da senha do gov.br.</p>
                <p>Declaro, ainda, que fui informado sobre o total dos demais débitos EXIGÍVEIS no âmbito da Receita
                Federal do Brasil, Prefeitura Municipal e Governo estadual e suas implicações, e recebi orientações
                sobre as implicações previdenciárias dos débitos NÃO EXIGÍVEIS.</p>
                ${blocoProcessoObservacoes(d)}
                <p>Local: ${docValor(d.local)} &nbsp; Data: ${dia}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${ano}.</p>
                <p class="doc-assinatura">_______________________________________<br>
                <span class="doc-assinatura-label">Assinatura do(a) Empreendedor(a)</span><br>
                <span class="doc-assinatura-label doc-assinatura-nota">Assinatura eletrônica / aceite via WhatsApp</span></p>`;
        }
    },

    'reenquadramento-mei': {
        titulo: 'Solicitação de Reenquadramento do MEI',
        descricao: 'Reenquadramento no Simples Nacional e SIMEI junto à Receita Federal do Brasil.',
        campos: [
            ...camposBaseTermo(),
            { id: 'local', label: 'Local (cidade)', placeholder: 'Campo Grande' },
            { id: 'debitos', label: 'Anotações Importantes e Recomendações — débitos quitados/parcelados', tipo: 'debitos', full: true, opcoes: [
                'Débitos Simples Nacional DAS-SIMEI',
                'Débitos PGFN Inscritos em Dívida Ativa',
                'Débitos Inscrição Municipal',
                'Débitos Inscrição Estadual'
            ] },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            const { dia, ano } = dataHojePartes();
            const linhasDebitos = (this.campos.find(c => c.id === 'debitos').opcoes)
                .map((rotulo, i) => {
                    const marcado = d[`debitos_${i}_check`];
                    const data = d[`debitos_${i}_data`];
                    return `${escHTML(rotulo)}: ${docCheck(marcado)} Quitado/Parcelado em ${docValor(data, '____/____/____')};`;
                }).join('<br>');
            return `
                <h3>SOLICITAÇÃO DE REENQUADRAMENTO DO MEI<br>TERMO DE CIÊNCIA E RESPONSABILIDADE JUNTO AO SEBRAE/MS</h3>
                <p>Eu, ${docValor(d.nome)}, inscrito(a) no CPF/MF sob o nº ${docValor(d.cpf)}${trechoSe(d.email, v => `, e-mail ${v}`)}${trechoSe(d.telefone, v => `, telefone ${v}`)}${trechoSe(d.cnpj, v => `, devidamente inscrito(a) no CNPJ sob nº ${v}`)}, declaro para os fins que se fizerem necessários, que solicitei ao SEBRAE/MS a
                realização da <b>SOLICITAÇÃO DE REENQUADRAMENTO DO MEI JUNTO À RECEITA FEDERAL DO BRASIL</b>, de minha
                inscrição como Microempreendedor Individual, no Portal do Simples Nacional, considerando meu anterior
                desenquadramento. Os serviços solicitados e realizados pelo SEBRAE/MS foram:</p>
                <p>Solicitação de Opção pelo Simples Nacional;<br>Solicitação de Enquadramento no SIMEI.</p>
                <p>Declaro estar ciente das condições estabelecidas para o reenquadramento e comprometo-me a cumprir
                todas as responsabilidades decorrentes do reenquadramento do MEI e obrigações fiscais, tributárias e
                legais aplicáveis ao Microempreendedor Individual.</p>
                <p>Declaro, tendo pleno conhecimento, que os dados cadastrais utilizados no momento desta solicitação
                de reenquadramento do meu MEI junto à Receita Federal do Brasil, foram fornecidos por mim ao atendente
                do SEBRAE/MS com o objetivo de realizar os procedimentos necessários no portal
                https://www8.receita.fazenda.gov.br/simplesnacional/. Estou ciente de que o fornecimento correto desses
                dados é de minha única e exclusiva responsabilidade.</p>
                <p>Afirmo, ainda, que antes da confirmação do cadastro nos Portais do Simples Nacional, Portal E-CAC da
                Receita Federal e REGULARIZE-PGFN, li atentamente todos os dados e os confirmei ao atendente do
                SEBRAE/MS, não cabendo, desse modo, qualquer tipo de reclamação judicial ou administrativa após a
                efetivação das ações buscadas junto ao SEBRAE/MS.</p>
                <p><b>Anotações Importantes e Recomendações:</b><br>${linhasDebitos}</p>
                ${blocoProcessoObservacoes(d)}
                <p>Local: ${docValor(d.local)} &nbsp; Data: ${dia}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${ano}.</p>
                <p class="doc-assinatura">_______________________________________<br>
                <span class="doc-assinatura-label">Assinatura do(a) Empreendedor(a)</span><br>
                <span class="doc-assinatura-label doc-assinatura-nota">Assinatura eletrônica / aceite via WhatsApp</span></p>`;
        }
    },

    'formalizacao': {
        titulo: 'Termo de Responsabilidade — Formalização',
        descricao: 'Orientação para obtenção do registro na condição de Microempreendedor Individual.',
        campos: [
            ...camposBaseTermo(),
            { id: 'rg', label: 'RG', placeholder: '000000000' },
            { id: 'objeto', label: 'Objeto da formalização', full: true, placeholder: 'Ex.: Formalização de MEI — atividade de comércio varejista' },
            { id: 'documentos', label: 'Documentos utilizados na emissão do certificado', tipo: 'checklist', full: true, opcoes: [
                'Guia de Localização Aprovada', 'CPF', 'RG', 'Comprovante de endereço',
                'Título de eleitor', 'IRPF', 'E-mail', 'Senha do Portal GOV'
            ] },
            { id: 'documentos_outros', label: 'Outros documentos (se houver)', placeholder: 'Descreva', full: true },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            const checklist = (this.campos.find(c => c.id === 'documentos').opcoes)
                .map((rotulo, i) => `${docCheck(d[`documentos_${i}`])} ${escHTML(rotulo)};`).join('<br>');
            const outros = `${docCheck(!!(d.documentos_outros || '').trim())} Outros: ${docValor(d.documentos_outros, '_____________________')};`;
            return `
                <h3>TERMO DE RESPONSABILIDADE - FORMALIZAÇÃO</h3>
                <p>${docValor(d.nome)}, ${temValor(d.rg)
                    ? `portador do RG n.º <b>${escHTML(String(d.rg).trim())}</b> e CPF n.º ${docValor(d.cpf)}`
                    : `portador do CPF n.º ${docValor(d.cpf)}`}, declara para
                os devidos fins, que procurou o SEBRAE/MS – Serviço de Apoio às Micro e Pequenas Empresas do Estado de
                Mato Grosso do Sul, associação civil sem fins lucrativos, inscrito no CNPJ nº. 15.419.591/0001-03, com o
                objetivo de solicitar orientação para obtenção do registro na condição de Microempreendedor Individual,
                tendo pleno conhecimento que os dados cadastrais utilizados no momento da formalização são referência ao
                atendente e de exclusiva responsabilidade do declarante.</p>
                <p>Declara, também, que antes da confirmação do cadastro no Portal do Empreendedor, leu atentamente os
                dados e confirmou ao atendente do SEBRAE/MS, não cabendo, desse modo, qualquer tipo de reclamação ao
                SEBRAE/MS após a emissão do certificado da condição de microempreendedor individual.</p>
                <p>O declarante utilizou, no momento da emissão do certificado de condição de microempreendedor
                individual, os seguintes documentos:</p>
                <p>${checklist}<br>${outros}</p>
                ${(d.objeto || '').trim() ? `<p>Objeto da formalização: <b>${escHTML(d.objeto)}</b>.</p>` : ''}
                ${blocoProcessoObservacoes(d)}
                ${blocoLocalDataAssinatura('Campo Grande/MS', 'Assinatura')}`;
        }
    },

    'alteracao': {
        titulo: 'Termo de Responsabilidade — Alteração',
        descricao: 'Orientação para Alteração do registro de Microempreendedor Individual.',
        campos: [
            ...camposBaseTermo(),
            { id: 'local', label: 'Local (cidade)', placeholder: 'Campo Grande' },
            { id: 'documentos', label: 'Documentos utilizados na Alteração', tipo: 'checklist', full: true, opcoes: [
                'Certificado de Condição de Microempreendedor Individual', 'Guia de Localização Aprovada',
                'CPF', 'RG', 'Título Eleitoral', 'Comprovante de endereço', 'Senha do Portal GOV'
            ] },
            { id: 'documentos_outros', label: 'Outros documentos (se houver)', placeholder: 'Descreva', full: true },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            const checklist = (this.campos.find(c => c.id === 'documentos').opcoes)
                .map((rotulo, i) => `${docCheck(d[`documentos_${i}`])} ${escHTML(rotulo)};`).join('<br>');
            const outros = `${docCheck(!!(d.documentos_outros || '').trim())} Outros: ${docValor(d.documentos_outros, '_____________________')};`;
            return `
                <h3>TERMO DE RESPONSABILIDADE – ALTERAÇÃO</h3>
                <p>Eu, ${docValor(d.nome)}, Empreendedor Individual${trechoSe(d.cnpj, v => `, devidamente inscrito no CNPJ sob n.º ${v}`)}, portador do CPF n.º ${docValor(d.cpf)}, declaro para os devidos fins, que procurou
                o SEBRAE/MS - Serviço de Apoio às Micro e Pequenas Empresas do Estado de Mato Grosso do Sul, associação
                civil sem fins lucrativos, inscrito no CNPJ nº. 15.419.591/0001-03, com o objetivo de solicitar
                orientação para Alteração do registro de Microempreendedor Individual, tendo pleno conhecimento que os
                dados cadastrais utilizados no momento da Alteração são referência ao atendente e de exclusiva
                responsabilidade do declarante.</p>
                <p>Declaro, também, que antes da confirmação do cadastro no Portal do Empreendedor, li atentamente os
                dados e confirmei ao atendente do SEBRAE/MS, não cabendo, desse modo, qualquer tipo de reclamação
                judicial ou não, após a efetivação das ações buscadas junto ao SEBRAE/MS.</p>
                <p>O declarante utilizou, no momento da Alteração do Certificado de condição de Microempreendedor
                Individual, os seguintes documentos:</p>
                <p>${checklist}<br>${outros}</p>
                ${blocoProcessoObservacoes(d)}
                <p>Por ser verdade, firmo o presente.</p>
                ${blocoLocalDataAssinatura(d.local ? d.local + '/MS' : '', 'Assinatura do Empreendedor Individual')}`;
        }
    },

    'declaracao-responsabilidade': {
        titulo: 'Declaração de Responsabilidade',
        descricao: 'Declaração Anual DASN SIMEI — Declaração Anual para o Microempreendedor Individual.',
        campos: [
            ...camposBaseTermo(),
            { id: 'cidade', label: 'Cidade', placeholder: 'Campo Grande' },
            { id: 'anos', label: 'Declarações realizadas (até 5 anos)', tipo: 'dasn', full: true },
            { id: 'orientacao_irpf', label: 'Recebeu orientação para buscar profissional contábil (Declaração de IRPF)?', tipo: 'radio', full: true, opcoes: ['SIM', 'NÃO'] },
            CAMPO_OBSERVACOES
        ],
        template(d) {
            const linhasAnos = [];
            for (let i = 0; i < 5; i++) {
                const ano = d[`anos_${i}_ano`], valor = d[`anos_${i}_valor`],
                      ret = d[`anos_${i}_ret`], hora = d[`anos_${i}_hora`];
                if (!(ano || valor || hora || ret)) continue;
                linhasAnos.push(`Ano Declarado: ${docValor(ano, '________')} &nbsp; Valor declarado: R$ ${docValor(valor, '______________')} &nbsp; Retificadora ${docCheck(ret)} &nbsp; às ${docValor(hora, '____h:____m:____s')}.`);
            }
            const blocoAnos = linhasAnos.length
                ? linhasAnos.join('<br>')
                : 'Ano Declarado: ________ &nbsp; Valor declarado: R$ ______________ &nbsp; Retificadora (&nbsp;&nbsp;) &nbsp; às ____h:____m:____s.';
            return `
                <h3>DECLARAÇÃO DE RESPONSABILIDADE</h3>
                <p>Eu, ${docValor(d.nome)}, empreendedor individual${trechoSe(d.cnpj, v => `, devidamente inscrito no CNPJ sob o nº ${v}`)}, portador do CPF nº ${docValor(d.cpf)}, declaro pela presente e para os devidos
                fins de direito, que todos os dados constantes na declaração prestada para fins da DASN SIMEI -
                Declaração Anual para o Microempreendedor Individual correspondem com a verdade e estão de acordo ao
                que determina o artigo 100º da Resolução CGSN nº 94, de 29 de novembro de 2011 abaixo transcrita:</p>
                <p class="doc-citacao">Art. 100. Na hipótese de o MEI ser optante pelo SIMEI no ano calendário anterior,
                deverá apresentar, até o último dia de maio de cada ano, à RFB, a Declaração que trata o Art. 100 da
                Resolução CGSN nº 94, de 24 de novembro de 2011, em formato especial, que conterá:<br>
                I – a receita bruta total auferida relativa ao ano-calendário anterior;<br>
                II – a receita bruta total auferida relativa ao ano-calendário anterior, referente às atividades
                sujeitas ao ICMS.<br>
                III - informação referente à contratação de empregado, quando houver.</p>
                <p>${blocoAnos}</p>
                <p>Declaro ter recebido <b>orientação</b> para a busca de um profissional contábil para a verificação da
                necessidade de realização da <b>Declaração de Imposto de Renda de Pessoa Física</b>, devido ao valor de
                faturamento declarado e atividade exercida sob meu CNPJ MEI.
                ${docCheck(d.orientacao_irpf === 'SIM')} SIM &nbsp; ${docCheck(d.orientacao_irpf === 'NÃO')} NÃO</p>
                <p>Declara ainda, ter conhecimento que o SEBRAE/MS apenas presta o serviço de <b>orientação</b> e
                <b>auxílio</b> no preenchimento do formulário eletrônico disponibilizado no site da Receita Federal do
                Brasil, não tendo qualquer responsabilidade pelo conteúdo declarado.</p>
                ${blocoProcessoObservacoes(d)}
                ${blocoLocalDataAssinatura(d.cidade, 'Assinatura Empreendedor Individual')}`;
        }
    }
};

// ===== Estado da página =====

let _docParceiro = null;
let _docContexto = null;   // { parceiro, foco, interacao }
let _docTipo = null;
let _docRegistroId = null; // id do registro em public.documentos (status Gerado/Enviado)
let _docRegistroStatus = null; // status do registro retomado
let _docCnpjSalvo = null;  // CNPJ gravado no documento retomado (para avisar divergência)

// ===== Renderização do formulário =====

function renderCampoDocumento(campo, ctx) {
    const tagAuto = '<span class="tag-auto">AUTO</span>';
    const tagAutoFoco = '<span class="tag-auto">AUTO • FOCO</span>';
    const tagEdit = '<span class="tag-edit">✏️ EDITÁVEL</span>';
    const full = campo.full ? ' doc-form-full' : '';
    const valorInicial = campo.valor ? (campo.valor(ctx) ?? '') : '';

    if (campo.tipo === 'radio') {
        const opcoes = campo.opcoes.map((op, i) => `
            <label class="doc-opcao">
                <input type="radio" name="${campo.id}" value="${escHTML(op)}"> ${escHTML(op)}
            </label>`).join('');
        return `<div class="doc-form-group${full}"><label>${escHTML(campo.label)} ${tagEdit}</label>${opcoes}</div>`;
    }

    if (campo.tipo === 'check') {
        return `<div class="doc-form-group${full}">
            <label class="doc-opcao"><input type="checkbox" name="${campo.id}"> ${escHTML(campo.label)}</label>
        </div>`;
    }

    if (campo.tipo === 'checklist') {
        const opcoes = campo.opcoes.map((op, i) => `
            <label class="doc-opcao"><input type="checkbox" name="${campo.id}_${i}"> ${escHTML(op)}</label>`).join('');
        return `<div class="doc-form-group${full}"><label>${escHTML(campo.label)} ${tagEdit}</label><div class="doc-checklist">${opcoes}</div></div>`;
    }

    if (campo.tipo === 'debitos') {
        const linhas = campo.opcoes.map((op, i) => `
            <div class="doc-debito-linha">
                <label class="doc-opcao doc-debito-nome"><input type="checkbox" name="${campo.id}_${i}_check"> ${escHTML(op)}</label>
                <input type="text" name="${campo.id}_${i}_data" placeholder="dd/mm/aaaa" class="doc-debito-data">
            </div>`).join('');
        return `<div class="doc-form-group${full}"><label>${escHTML(campo.label)} ${tagEdit}</label>${linhas}</div>`;
    }

    if (campo.tipo === 'dasn') {
        let linhas = '';
        for (let i = 0; i < 5; i++) {
            linhas += `
            <div class="doc-dasn-linha">
                <input type="text" name="${campo.id}_${i}_ano" placeholder="Ano" class="doc-dasn-ano">
                <input type="text" name="${campo.id}_${i}_valor" placeholder="Valor R$" class="doc-dasn-valor">
                <input type="text" name="${campo.id}_${i}_hora" placeholder="hh:mm:ss" class="doc-dasn-hora">
                <label class="doc-opcao doc-dasn-ret"><input type="checkbox" name="${campo.id}_${i}_ret"> Retificadora</label>
            </div>`;
        }
        return `<div class="doc-form-group${full}"><label>${escHTML(campo.label)} ${tagEdit}</label>${linhas}</div>`;
    }

    if (campo.tipo === 'textarea') {
        return `<div class="doc-form-group${full}">
            <label>${escHTML(campo.label)} ${tagEdit}</label>
            <textarea name="${campo.id}" rows="2" placeholder="${escHTML(campo.placeholder || '')}">${escHTML(valorInicial)}</textarea>
        </div>`;
    }

    // text (default)
    // Campo "autoFoco" (CNPJ): trava só quando o FOCO trouxe o valor.
    const travado = campo.auto || (campo.autoFoco && temValor(valorInicial));
    const readonly = travado ? ' readonly class="campo-auto"' : '';
    const badge = travado ? (campo.autoFoco ? tagAutoFoco : tagAuto) : tagEdit;
    const mascara = campo.mascara === 'cnpj' ? ' oninput="mascaraCNPJDoc(this)"' : '';
    const hint = campo.autoFoco ? '<small class="doc-form-hint" hidden></small>' : '';
    return `<div class="doc-form-group${full}" data-campo="${campo.id}">
        <label>${escHTML(campo.label)} ${badge}</label>
        <input type="text" name="${campo.id}" value="${escHTML(valorInicial)}" placeholder="${escHTML(campo.placeholder || '')}"${readonly}${mascara}>
        ${hint}
    </div>`;
}

/**
 * Aplica no formulário os valores salvos em documentos.dados_formulario
 * (retomada de um documento já gerado).
 */
function aplicarDadosNoFormulario(dados) {
    if (!dados) return;
    const form = document.getElementById('documento-form');
    if (!form) return;

    // "select" entra na varredura por causa da lista de CNPJs do FOCO
    form.querySelectorAll('input, textarea, select').forEach(inp => {
        if (!(inp.name in dados)) return;
        const valor = dados[inp.name];
        if (inp.type === 'checkbox') inp.checked = !!valor;
        else if (inp.type === 'radio') inp.checked = (inp.value === valor);
        else inp.value = valor ?? '';
    });

    atualizarPreviewDocumento();
}

/**
 * Aplica no formulário o CNPJ vindo do FOCO (RF: o termo tem de sair no CNPJ
 * do cliente certo, não em digitação livre do consultor):
 *   - nenhum CNPJ na conta → campo segue editável, com aviso;
 *   - um CNPJ            → campo travado com o valor do FOCO;
 *   - vários CNPJs       → lista de seleção com as contas reais do cliente.
 * Muta só o grupo do campo — não re-renderiza o formulário (o consultor pode
 * estar digitando em outro campo e o listener de preview seria reanexado).
 */
function aplicarCnpjDoFoco(lista) {
    const form = document.getElementById('documento-form');
    if (!form) return;
    const grupo = form.querySelector('.doc-form-group[data-campo="cnpj"]');
    if (!grupo) return; // termo sem campo de CNPJ (ex.: termo-lgpd)

    const cnpjs = lista || [];
    const badge = grupo.querySelector('.tag-auto, .tag-edit');
    const hint = grupo.querySelector('.doc-form-hint');
    const atual = grupo.querySelector('[name="cnpj"]');
    const valorAtual = atual ? atual.value : '';

    // Preferência: conta do próprio cliente → valor já no campo → primeiro
    const doCliente = _docParceiro?.id_salesforce
        ? cnpjs.find(c => c.accountId === _docParceiro.id_salesforce) : null;
    const iguaisAoAtual = cnpjs.find(c => digitosCNPJ(c.cnpj) === digitosCNPJ(valorAtual));
    const escolhido = doCliente || iguaisAoAtual || cnpjs[0] || null;

    if (cnpjs.length > 1) {
        // Vários CNPJs: troca o campo por uma lista das contas do cliente
        const opcoes = cnpjs.map(c => {
            const rotulo = c.conta ? `${c.conta} — ${c.cnpj}` : c.cnpj;
            const sel = c === escolhido ? ' selected' : '';
            return `<option value="${escHTML(c.cnpj)}"${sel}>${escHTML(rotulo)}</option>`;
        }).join('');
        if (atual) atual.outerHTML = `<select name="cnpj" class="campo-auto">${opcoes}</select>`;
        if (badge) badge.outerHTML = '<span class="tag-auto">AUTO • FOCO</span>';
        if (hint) {
            hint.textContent = `Este CPF possui ${cnpjs.length} CNPJs no FOCO — selecione o correto.`;
            hint.hidden = false;
        }
    } else {
        // Um ou nenhum CNPJ: campo de texto, travado só quando o FOCO tem o dado
        const tem = !!escolhido;
        const valor = tem ? formatarCNPJValor(escolhido.cnpj) : valorAtual;
        if (!atual || atual.tagName === 'SELECT') {
            const marcacao = `<input type="text" name="cnpj" value="${escHTML(valor)}" placeholder="00.000.000/0000-00"` +
                (tem ? ' readonly class="campo-auto"' : '') + ' oninput="mascaraCNPJDoc(this)">';
            if (atual) atual.outerHTML = marcacao;
            else grupo.insertAdjacentHTML('beforeend', marcacao);
        } else {
            if (tem) atual.value = valor;
            atual.readOnly = tem;           // readOnly (nunca disabled): o valor
            atual.classList.toggle('campo-auto', tem); // precisa continuar sendo lido
        }
        if (badge) {
            badge.outerHTML = tem
                ? '<span class="tag-auto">AUTO • FOCO</span>'
                : '<span class="tag-edit">✏️ EDITÁVEL</span>';
        }
        if (hint) {
            hint.textContent = tem ? '' : 'Sem CNPJ no cadastro do FOCO — preencha manualmente se aplicável.';
            hint.hidden = tem;
        }
    }

    atualizarPreviewDocumento();
}

/**
 * Documento já respondido/enviado cujo CNPJ salvo não é mais o do FOCO: o
 * consultor precisa saber que o reenvio sairá com o CNPJ atual do cadastro.
 * O documento já gravado não é alterado — só o que for gerado de novo.
 */
function avisarDivergenciaCNPJ() {
    if (!_docCnpjSalvo) return;
    if (!['enviado', 'aceito', 'recusado', 'nao_aceito'].includes(_docRegistroStatus)) return;

    const campo = document.querySelector('#documento-form [name="cnpj"]');
    const atual = campo ? campo.value : '';
    if (!temValor(atual) || digitosCNPJ(atual) === digitosCNPJ(_docCnpjSalvo)) return;

    const aviso = document.getElementById('documento-aviso');
    if (!aviso) return;
    aviso.innerHTML += `<br><b>Atenção:</b> o CNPJ deste documento (${escHTML(_docCnpjSalvo)}) ` +
        `difere do cadastro atual do FOCO (${escHTML(atual)}). ` +
        'Ao gerar novamente, o termo passará a usar o do FOCO.';
    aviso.style.display = 'block';
}

/**
 * Carrega o registro de documentos a ser retomado:
 * - por id (?doc=<uuid>, vindo do Acompanhamento), ou
 * - o rascunho "gerado" mais recente deste parceiro+tipo (evita duplicar
 *   registro quando o consultor reabre o termo pelo Detalhe).
 * Registros já enviados/aceitos não são reaproveitados sem ?doc explícito.
 */
async function carregarDocumentoExistente(docId) {
    try {
        let query = supabaseClient.from('documentos').select('*');

        if (docId) {
            query = query.eq('id', docId);
        } else {
            query = query
                .eq('parceiro_id', _docParceiro.id)
                .eq('tipo_documento', _docTipo)
                .eq('status', 'gerado')
                .order('created_at', { ascending: false })
                .limit(1);
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) return null;

        const registro = data[0];
        _docRegistroId = registro.id;
        return registro;
    } catch (e) {
        console.warn('documentos (carregar existente):', e?.message || e);
        return null;
    }
}

/** Lê todos os valores do formulário para um objeto { name: valor } */
function lerDadosFormularioDocumento() {
    const form = document.getElementById('documento-form');
    const dados = {};
    // "select" entra na varredura por causa da lista de CNPJs do FOCO
    form.querySelectorAll('input, textarea, select').forEach(inp => {
        if (inp.type === 'checkbox') dados[inp.name] = inp.checked;
        else if (inp.type === 'radio') { if (inp.checked) dados[inp.name] = inp.value; }
        else dados[inp.name] = inp.value;
    });
    return dados;
}

function atualizarPreviewDocumento() {
    const termo = TERMOS_URC[_docTipo];
    const preview = document.getElementById('documento-preview');
    if (!termo || !preview) return;
    preview.innerHTML = termo.template(lerDadosFormularioDocumento());
}

// ===== Ações =====

function voltarParaDetalhe() {
    const id = _docParceiro?.id || new URLSearchParams(window.location.search).get('id');
    window.location.href = id ? `detalhe?id=${encodeURIComponent(id)}` : '/';
}

/**
 * Salva telefone e e-mail digitados no formulário direto no cadastro do
 * cliente (parceiros) e sincroniza Phone/Email do Contact no FOCO — evita
 * ter que voltar ao modal "Editar Cliente".
 */
async function salvarContatoDoFormulario() {
    const btn = document.getElementById('btn-salvar-contato');
    const aviso = document.getElementById('contato-aviso');
    if (!btn || !_docParceiro) return;

    const d = lerDadosFormularioDocumento();
    const telefone = (d.telefone || '').trim();
    const email = (d.email || '').trim();

    const mostrar = (classe, texto) => {
        aviso.className = 'documento-aviso ' + classe;
        aviso.innerHTML = texto;
        aviso.style.display = 'block';
    };

    if (telefone && telefone.replace(/\D/g, '').length < 10) {
        mostrar('documento-aviso-erro', 'Telefone inválido. Digite o telefone completo com DDD.');
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrar('documento-aviso-erro', 'E-mail inválido. Verifique o endereço digitado.');
        return;
    }
    if (!telefone && !email) {
        mostrar('documento-aviso-erro', 'Informe telefone e/ou e-mail para salvar.');
        return;
    }

    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';
    aviso.style.display = 'none';

    try {
        // 1) Cadastro no Supabase
        const atualizacao = {};
        if (telefone) atualizacao.telefone = telefone;
        atualizacao.email = email || null;

        const { error } = await supabaseClient
            .from('parceiros')
            .update(atualizacao)
            .eq('id', _docParceiro.id);

        if (error) {
            mostrar('documento-aviso-erro', 'Erro ao salvar no cadastro: ' + error.message);
            return;
        }

        Object.assign(_docParceiro, atualizacao);
        if (typeof invalidarCacheParceiro === 'function') invalidarCacheParceiro(_docParceiro.id);

        // 2) Sincronização no FOCO (Contact)
        let msg = 'Contato do cliente atualizado com sucesso.';
        let contactId = _docContexto.foco?.Id || _docParceiro.id_contato_salesforce || null;

        if (!contactId) {
            contactId = await buscarContactIdSalesforce(_docParceiro.cpf, _docParceiro.id_salesforce);
            if (contactId) {
                await supabaseClient
                    .from('parceiros')
                    .update({ id_contato_salesforce: contactId })
                    .eq('id', _docParceiro.id);
                _docParceiro.id_contato_salesforce = contactId;
            }
        }

        if (contactId) {
            try {
                const campos = {};
                if (telefone) campos.Phone = telefone;
                if (email) campos.Email = email;
                await atualizarContatoSebrae(contactId, campos);
                msg = 'Contato do cliente atualizado no cadastro e no FOCO.';
            } catch (err) {
                console.error('Erro ao sincronizar contato no FOCO:', err);
                msg = 'Contato salvo no cadastro. <b>Atenção:</b> não foi possível atualizar no FOCO ('
                    + (err.message || 'erro desconhecido') + ').';
            }
        } else {
            msg = 'Contato salvo no cadastro. <b>Atenção:</b> este cliente não foi localizado no FOCO, '
                + 'então os dados não foram atualizados lá.';
        }

        mostrar('documento-aviso-sucesso', msg);
    } catch (err) {
        console.error('Erro ao salvar contato:', err);
        mostrar('documento-aviso-erro', 'Erro inesperado ao salvar. Tente novamente.');
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

// ===== Envio do documento (webhook n8n) =====

// Webhook único dos Termos URC (todos os termos, inclusive o LGPD)
const WEBHOOK_TERMOS_URC = 'https://n8n.alfredooliveira.com.br/webhook/TERMOS-URC';

/**
 * Monta o payload enviado ao n8n: dados do cliente, do documento, os campos
 * preenchidos pelo consultor e o HTML já renderizado do termo (pronto para
 * virar PDF), além da interação (Case) do FOCO.
 */
async function montarPayloadEnvio(codigoResposta) {
    const termo = TERMOS_URC[_docTipo];
    const campos = lerDadosFormularioDocumento();
    const p = _docParceiro;

    const telefone = campos.telefone || p.telefone || null;
    const email = campos.email || p.email || _docContexto.foco?.Email || null;

    return {
        // --- Campos na raiz: compatíveis com o fluxo n8n atual ---
        nome_razao_social: p.nome_razao_social,
        cpf: p.cpf,
        telefone: telefone,
        email: email,

        // --- Dados do documento (para gerar o PDF e identificar o registro) ---
        documento: {
            id: _docRegistroId,
            tipo: _docTipo,
            nome: termo.titulo,
            // Letra que o cliente usa para responder (ex.: "1A" aceita, "2A" recusa)
            codigo: codigoResposta || null,
            html: termo.template(campos),
            campos: campos
        },

        // --- Dados completos do cliente ---
        cliente: {
            id: p.id,
            nome_razao_social: p.nome_razao_social,
            cpf: p.cpf,
            cnpj: campos.cnpj || null,
            telefone: telefone,
            email: email,
            account_id: p.id_salesforce || null,
            contact_id: p.id_contato_salesforce || _docContexto.foco?.Id || null
        },

        // --- Interação (Case) do FOCO ---
        interacao: {
            case_id: _docContexto.interacao?.Id || null,
            case_number: _docContexto.interacao?.CaseNumber || null
        },

        consultor: await nomeConsultorAtual(),
        enviado_em: new Date().toISOString()
    };
}

/**
 * Envia o documento para o webhook n8n dos Termos URC.
 * Retorna { ok: true } ou { ok: false, error }.
 */
async function enviarDocumentoWebhook(codigoResposta) {
    const payload = await montarPayloadEnvio(codigoResposta);

    const resp = await fetch(WEBHOOK_TERMOS_URC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        console.error('Webhook Termos URC respondeu com status:', resp.status);
        return { ok: false, error: `Webhook respondeu ${resp.status}` };
    }
    return { ok: true };
}

// ===== Etapa de envio via WhatsApp (Tela 4 da POC) =====

/** Monta a lista de validações automáticas antes do envio (POC Tela 4) */
function validarDadosEnvio() {
    const d = lerDadosFormularioDocumento();
    const p = _docParceiro;
    const telefone = d.telefone || p.telefone || '';
    const email = d.email || p.email || _docContexto.foco?.Email || '';

    return [
        { label: 'CPF Válido', ok: !!(p.cpf && p.cpf.length === 14) },
        { label: 'Cadastro validado no FOCO', ok: !!_docContexto.foco },
        { label: 'Nome válido', ok: !!(p.nome_razao_social && p.nome_razao_social.length > 2) },
        { label: 'Telefone válido', ok: telefone.replace(/\D/g, '').length >= 10 },
        { label: 'E-mail válido', ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) },
        { label: 'Documento gerado', ok: true, neutro: true }
    ];
}

/**
 * Grava (ou atualiza) o registro do documento em public.documentos com
 * status "gerado" + dados do formulário. Não bloqueia a navegação — em
 * falha, apenas loga (a tela de envio continua funcionando).
 */
async function registrarDocumentoGerado() {
    const termo = TERMOS_URC[_docTipo];
    const consultor = await nomeConsultorAtual();
    const registro = {
        parceiro_id: _docParceiro.id,
        tipo_documento: _docTipo,
        nome_documento: termo.titulo,
        status: 'gerado',
        dados_formulario: lerDadosFormularioDocumento(),
        // HTML do termo já preenchido: o fluxo de aceite usa isso para gerar
        // o PDF assinado sem depender do front
        html_documento: termo.template(lerDadosFormularioDocumento()),
        case_id_salesforce: _docContexto.interacao?.Id || null,
        case_number: _docContexto.interacao?.CaseNumber || null,
        updated_at: new Date().toISOString()
    };
    // Só grava o consultor quando conseguimos identificá-lo (nunca apaga o já salvo)
    if (consultor) registro.consultor = consultor;

    try {
        if (_docRegistroId) {
            const { error } = await supabaseClient
                .from('documentos')
                .update(registro)
                .eq('id', _docRegistroId);
            if (error) console.warn('documentos (update gerado):', error.message);
        } else {
            const { data, error } = await supabaseClient
                .from('documentos')
                .insert([registro])
                .select('id')
                .single();
            if (error) console.warn('documentos (insert gerado):', error.message);
            else _docRegistroId = data.id;
        }
    } catch (e) {
        console.warn('documentos (gerado):', e?.message || e);
    }
}

/**
 * Prepara o envio: a RPC marca o documento como enviado e atribui a letra
 * (A, B, C...) que o cliente usará para responder no WhatsApp — garantindo
 * que dois documentos pendentes do mesmo cliente nunca tenham a mesma letra.
 * Retorna a letra ou null se não for possível.
 */
async function prepararEnvioDocumento() {
    if (!_docRegistroId) return null;
    try {
        const { data, error } = await supabaseClient
            .rpc('preparar_envio_documento', { p_documento_id: _docRegistroId });

        if (error) {
            console.warn('preparar_envio_documento:', error.message);
            return null;
        }
        const registro = Array.isArray(data) ? data[0] : data;
        return registro?.codigo_resposta || null;
    } catch (e) {
        console.warn('preparar_envio_documento:', e?.message || e);
        return null;
    }
}

/** Mostra a etapa "Enviar via WhatsApp" preenchida com os dados do formulário */
function mostrarTelaEnvio() {
    const termo = TERMOS_URC[_docTipo];
    const d = lerDadosFormularioDocumento();

    // Registra o documento como "Gerado" (status da Tela 1) — sem bloquear a UI
    registrarDocumentoGerado();

    // Validações
    const cont = document.getElementById('envio-validacoes');
    cont.innerHTML = validarDadosEnvio().map(v => {
        const cls = v.neutro ? 'validacao-badge-warn' : (v.ok ? 'validacao-badge-success' : 'validacao-badge-danger');
        const icone = v.neutro ? 'file-lines' : (v.ok ? 'check' : 'times');
        return `<span class="validacao-badge ${cls}"><i class="fas fa-${icone}"></i> ${escHTML(v.label)}</span>`;
    }).join('');

    // Dados do envio
    document.getElementById('envio-doc-nome').textContent = termo.titulo;
    document.getElementById('envio-dado-nome').textContent = _docParceiro.nome_razao_social || '—';
    document.getElementById('envio-dado-cpf').textContent = _docParceiro.cpf || '—';
    document.getElementById('envio-dado-telefone').textContent = d.telefone || _docParceiro.telefone || '—';
    document.getElementById('envio-dado-email').textContent = d.email || _docParceiro.email || _docContexto.foco?.Email || '—';
    document.getElementById('envio-aviso').style.display = 'none';

    // Alterna as etapas e o cabeçalho
    document.getElementById('documento-edicao').style.display = 'none';
    document.getElementById('documento-envio').style.display = 'block';
    document.getElementById('documento-titulo').textContent = 'Enviar via WhatsApp';

    const btnVoltar = document.getElementById('btn-trocar-documento');
    btnVoltar.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar à edição';
    btnVoltar.onclick = (e) => { e.preventDefault(); voltarParaEdicao(); };

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Volta da etapa de envio para a edição do formulário */
function voltarParaEdicao() {
    const termo = TERMOS_URC[_docTipo];
    document.getElementById('documento-envio').style.display = 'none';
    document.getElementById('documento-edicao').style.display = 'grid';
    document.getElementById('documento-titulo').textContent = termo.titulo;

    const btnVoltar = document.getElementById('btn-trocar-documento');
    btnVoltar.innerHTML = '<i class="fas fa-arrow-left"></i> Trocar documento';
    btnVoltar.onclick = null; // volta a usar o href (detalhe)
}

/** Confirma o envio do documento via WhatsApp (webhook n8n) */
async function confirmarEnvioDocumento() {
    const aviso = document.getElementById('envio-aviso');
    const btn = document.getElementById('btn-envio-confirmar');

    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';
    aviso.style.display = 'none';

    try {
        // Garante que o documento está registrado (para enviar o id ao n8n)
        if (!_docRegistroId) await registrarDocumentoGerado();

        // Marca como enviado e reserva a letra de resposta (A, B, C...)
        const codigo = await prepararEnvioDocumento();

        const resultado = await enviarDocumentoWebhook(codigo);

        if (resultado.ok) {
            // LGPD: mantém data_envio em parceiros (a lista deriva o status de lá)
            if (_docTipo === 'termo-lgpd') {
                await registrarEnvioLGPDNoParceiro(_docParceiro);
            }
        }

        aviso.className = resultado.ok ? 'documento-aviso documento-aviso-sucesso' : 'documento-aviso documento-aviso-erro';
        aviso.innerHTML = resultado.ok
            ? 'Documento enviado com sucesso via WhatsApp!' + (codigo ? ` O cliente deve responder <b>1${codigo}</b> (aceito) ou <b>2${codigo}</b> (não aceito).` : '')
            : 'Erro ao enviar o documento. Tente novamente.';
        aviso.style.display = 'block';
    } catch (err) {
        console.error('Erro ao enviar documento:', err);
        aviso.className = 'documento-aviso documento-aviso-erro';
        aviso.textContent = 'Erro de conexão. Verifique sua internet.';
        aviso.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

// ===== Inicialização =====

async function inicializarPaginaDocumento() {
    const container = document.getElementById('documento-form-container');
    if (!container) return; // não é a página de documento

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    _docTipo = params.get('tipo');
    const termo = TERMOS_URC[_docTipo];

    const tituloEl = document.getElementById('documento-titulo');
    const formTituloEl = document.getElementById('documento-form-titulo');

    if (!id || !termo) {
        if (tituloEl) tituloEl.textContent = 'Documento não encontrado';
        container.innerHTML = '<p>Tipo de documento inválido ou cliente não informado.</p>';
        return;
    }

    if (tituloEl) tituloEl.textContent = termo.titulo;
    if (formTituloEl) formTituloEl.textContent = termo.titulo;
    document.title = `SEBRAE - TERMOS URC - ${termo.titulo}`;

    // Botões de navegação
    document.getElementById('btn-trocar-documento').href = `detalhe?id=${encodeURIComponent(id)}`;
    document.getElementById('btn-cancelar-documento').onclick = voltarParaDetalhe;

    // Carrega o parceiro — usa o cache da sessão quando disponível (render imediato)
    const chaveCache = 'sbr_parceiro_' + id;
    const emCache = (typeof cacheNavGet === 'function') ? cacheNavGet(chaveCache) : null;

    let parceiro = emCache;
    if (!parceiro) {
        const { data, error } = await supabaseClient
            .from('parceiros')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            if (tratarErroDeSessao(error)) return; // sessão expirada: vai para o login
            if (tituloEl) tituloEl.textContent = 'Cliente não encontrado';
            container.innerHTML = '<p>Não foi possível carregar os dados do cliente.</p>';
            return;
        }
        parceiro = data;
        if (typeof cacheNavSet === 'function') cacheNavSet(chaveCache, parceiro);
    } else {
        // Revalida em segundo plano, sem travar a montagem do formulário
        supabaseClient.from('parceiros').select('*').eq('id', id).single()
            .then(({ data }) => {
                if (data) {
                    _docParceiro = Object.assign(_docParceiro || {}, data);
                    if (typeof cacheNavSet === 'function') cacheNavSet(chaveCache, data);
                }
            });
    }
    _docParceiro = parceiro;

    // Contexto FOCO (e-mail etc.) — não bloqueia a renderização inicial.
    // O cache da sessão (gravado no Detalhe) já traz o contato: com ele o CNPJ
    // nasce travado, sem piscar como editável até a rede responder.
    const chaveFoco = 'sbr_foco_' + (parceiro.cpf || '').replace(/\D/g, '');
    const focoCache = (typeof cacheNavGet === 'function') ? cacheNavGet(chaveFoco) : null;
    _docContexto = { parceiro, foco: focoCache?.contato || null, interacao: null };
    renderFormularioDocumento(termo);
    if (focoCache?.contatos) aplicarCnpjDoFoco(cnpjsDosContatos(focoCache.contatos));

    // Retomada: documento já gerado (?doc=<id>) ou rascunho existente
    const registroExistente = await carregarDocumentoExistente(params.get('doc'));
    if (registroExistente) {
        _docRegistroStatus = registroExistente.status || null;
        _docCnpjSalvo = registroExistente.dados_formulario?.cnpj || '';
        aplicarDadosNoFormulario(registroExistente.dados_formulario);
        if (registroExistente.case_number) {
            _docContexto.interacao = {
                Id: registroExistente.case_id_salesforce,
                CaseNumber: registroExistente.case_number
            };
        }
        const aviso = document.getElementById('documento-aviso');
        if (aviso) {
            aviso.className = 'documento-aviso';
            aviso.innerHTML = registroExistente.status === 'enviado'
                ? 'Documento já <b>enviado</b> em ' + formatarDataHora(registroExistente.data_envio) + '. Revise os dados e use "Gerar e prosseguir" para reenviar.'
                : 'Retomando documento <b>gerado</b> em ' + formatarDataHora(registroExistente.created_at) + '. Os dados preenchidos foram recuperados.';
            aviso.style.display = 'block';
        }
    }

    let contatosFoco = [];
    try {
        // Um CPF pode responder por mais de uma conta/CNPJ: busca todas de uma vez
        contatosFoco = await buscarContatosFocoPorCPF(parceiro.cpf);
        const contato = escolherContatoFoco(contatosFoco, parceiro.id_salesforce);
        if (contato) {
            _docContexto.foco = contato;
            // Preenche campos que dependem do FOCO (e-mail, Account ID) se ainda vazios
            const emailInput = document.querySelector('#documento-form input[name="email"]');
            if (emailInput && !emailInput.value && contato.Email) {
                emailInput.value = contato.Email;
            }
            const accountInput = document.querySelector('#documento-form input[name="account_id"]');
            if (accountInput && (accountInput.value === '—' || !accountInput.value) && contato.AccountId) {
                accountInput.value = contato.AccountId;
            }
        }
        // O CNPJ é dado do FOCO: prevalece sobre o valor salvo no documento
        aplicarCnpjDoFoco(cnpjsDosContatos(contatosFoco));
        avisarDivergenciaCNPJ();

        // Última interação (Case) — nº do processo/interação da POC (RF12).
        // Documento retomado mantém a interação com que foi gerado.
        if (!_docContexto.interacao?.CaseNumber) {
            const interacao = await buscarUltimaInteracaoFoco(
                _docContexto.foco?.Id || parceiro.id_contato_salesforce,
                parceiro.cpf
            );
            if (interacao?.CaseNumber) {
                _docContexto.interacao = interacao;
                const interacaoInput = document.querySelector('#documento-form input[name="interacao"]');
                if (interacaoInput) interacaoInput.value = interacao.CaseNumber;
            }
        }
        if (typeof cacheNavSet === 'function' && (contatosFoco.length || _docContexto.interacao)) {
            cacheNavSet(chaveFoco, {
                contato: _docContexto.foco,
                interacao: _docContexto.interacao,
                contatos: contatosFoco
            });
        }
        atualizarPreviewDocumento();
    } catch (e) {
        // FOCO indisponível: segue com "—" e o CNPJ volta a ser editável
        console.warn('FOCO indisponível para o documento:', e?.message || e);
        aplicarCnpjDoFoco([]);
    }

    // Botões: "Gerar e prosseguir" → etapa de envio (Tela 4 da POC)
    document.getElementById('btn-gerar-documento').onclick = mostrarTelaEnvio;
    document.getElementById('btn-envio-cancelar').onclick = voltarParaDetalhe;
    document.getElementById('btn-envio-confirmar').onclick = confirmarEnvioDocumento;
    document.getElementById('btn-salvar-contato').onclick = salvarContatoDoFormulario;
}

function renderFormularioDocumento(termo) {
    const container = document.getElementById('documento-form-container');
    container.innerHTML = '<div class="doc-form-grid">' +
        termo.campos.map(c => renderCampoDocumento(c, _docContexto)).join('') +
        '</div>';

    // Preview reativo ("change" cobre a lista de CNPJs do FOCO)
    const form = document.getElementById('documento-form');
    form.addEventListener('input', atualizarPreviewDocumento);
    form.addEventListener('change', atualizarPreviewDocumento);
    atualizarPreviewDocumento();
}

document.addEventListener('DOMContentLoaded', inicializarPaginaDocumento);
