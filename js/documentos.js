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

/*
 * Telefone e e-mail são dados do CLIENTE e editáveis em TODOS os termos
 * (inclusive no LGPD): o botão "Salvar contato do cliente" grava em parceiros
 * e sincroniza Phone/Email do Contact no FOCO.
 */
const CAMPO_TELEFONE = {
    id: 'telefone', label: 'Telefone (WhatsApp)', placeholder: '(00)00000-0000',
    valor: c => c.parceiro.telefone || ''
};
const CAMPO_EMAIL = {
    id: 'email', label: 'E-mail', placeholder: 'email@exemplo.com',
    valor: c => c.parceiro.email || c.foco?.Email || ''
};

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
        CAMPO_TELEFONE,
        CAMPO_EMAIL,
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
        descricao: 'Termo de Consentimento LGPD — preenchimento automático (FOCO). Telefone e e-mail editáveis.',
        campos: [
            { id: 'nome', label: 'Nome/Razão Social', auto: true, valor: c => c.parceiro.nome_razao_social },
            { id: 'cpf', label: 'CPF', auto: true, valor: c => c.parceiro.cpf },
            // Contato editável: o consultor corrige aqui e "Salvar contato do
            // cliente" grava no cadastro e sincroniza no FOCO
            CAMPO_TELEFONE,
            CAMPO_EMAIL,
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
        // "RFB" no título para não confundir com o parcelamento da PGFN; o nome
        // oficial completo continua no <h3> do próprio documento
        titulo: 'Parcelamento de Débitos do MEI — RFB',
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

// A página trata de UM cliente e de N termos (um por aba)
let _docTipos = [];        // slugs selecionados, deduplicados, na ordem escolhida
let _docTipoAtivo = null;  // slug da aba visível
const _docEstado = {};     // slug -> { registroId, registroStatus, cnpjSalvo, enviado, codigo, tocado, restaurado }

// Telefone, e-mail e CNPJ são dados do CLIENTE: o que for digitado numa aba
// vale para todas (e para todos os payloads do lote).
const CAMPOS_CLIENTE = ['telefone', 'email', 'cnpj'];

/**
 * Estado de um documento do lote, criado sob demanda.
 *   tocado     → o consultor interagiu com o formulário nesta sessão
 *   restaurado → os campos vieram de um registro já salvo (retomada)
 */
function estadoDoc(slug) {
    if (!_docEstado[slug]) {
        _docEstado[slug] = {
            registroId: null, registroStatus: null, cnpjSalvo: null,
            enviado: false, codigo: null, tocado: false, restaurado: false
        };
    }
    return _docEstado[slug];
}

/** Formulário (um por termo) do documento */
function formDoDocumento(slug) {
    return document.querySelector(`#documento-forms form[data-tipo="${slug}"]`);
}

/** Pré-visualização (uma por termo) do documento */
function previewDoDocumento(slug) {
    return document.querySelector(`#documento-previews .doc-preview[data-tipo="${slug}"]`);
}

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
function aplicarDadosNoFormulario(slug, dados) {
    if (!dados) return;
    const form = formDoDocumento(slug);
    if (!form) return;

    // "select" entra na varredura por causa da lista de CNPJs do FOCO
    form.querySelectorAll('input, textarea, select').forEach(inp => {
        if (!(inp.name in dados)) return;
        const valor = dados[inp.name];
        if (inp.type === 'checkbox') inp.checked = !!valor;
        else if (inp.type === 'radio') inp.checked = (inp.value === valor);
        else inp.value = valor ?? '';
    });

    atualizarPreviewDocumento(slug);
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
    _docTipos.forEach(slug => aplicarCnpjNoForm(slug, lista));
}

/** Aplica o CNPJ do FOCO no formulário de um termo (ver aplicarCnpjDoFoco) */
function aplicarCnpjNoForm(slug, lista) {
    const form = formDoDocumento(slug);
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

    atualizarPreviewDocumento(slug);
}

/**
 * Documento já respondido/enviado cujo CNPJ salvo não é mais o do FOCO: o
 * consultor precisa saber que o reenvio sairá com o CNPJ atual do cadastro.
 * O documento já gravado não é alterado — só o que for gerado de novo.
 */
function avisarDivergenciaCNPJ() {
    const aviso = document.getElementById('documento-aviso');
    if (!aviso) return;

    _docTipos.forEach(slug => {
        const est = estadoDoc(slug);
        if (!est.cnpjSalvo) return;
        if (!['enviado', 'aceito', 'recusado', 'nao_aceito'].includes(est.registroStatus)) return;

        const campo = formDoDocumento(slug)?.querySelector('[name="cnpj"]');
        const atual = campo ? campo.value : '';
        if (!temValor(atual) || digitosCNPJ(atual) === digitosCNPJ(est.cnpjSalvo)) return;

        const nome = _docTipos.length > 1 ? `${TERMOS_URC[slug].titulo}: ` : '';
        aviso.innerHTML += `<br><b>Atenção:</b> ${escHTML(nome)}o CNPJ deste documento (${escHTML(est.cnpjSalvo)}) ` +
            `difere do cadastro atual do FOCO (${escHTML(atual)}). ` +
            'Ao gerar novamente, o termo passará a usar o do FOCO.';
        aviso.style.display = 'block';
    });
}

/**
 * Carrega os registros de documentos a serem retomados:
 * - por id (?doc=<uuid>, vindo do Acompanhamento, sempre 1 documento), ou
 * - o rascunho "gerado" mais recente de cada tipo selecionado (evita duplicar
 *   registro quando o consultor reabre o termo pelo Detalhe).
 * Registros já enviados/aceitos não são reaproveitados sem ?doc explícito.
 * Devolve um objeto { slug: registro }.
 */
async function carregarDocumentosExistentes(docId) {
    const achados = {};
    try {
        let query = supabaseClient.from('documentos').select('*');

        if (docId) {
            query = query.eq('id', docId);
        } else {
            query = query
                .eq('parceiro_id', _docParceiro.id)
                .in('tipo_documento', _docTipos)
                .eq('status', 'gerado')
                .order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error || !data || data.length === 0) return achados;

        // Ordenado do mais recente para o mais antigo: fica o primeiro de cada tipo
        data.forEach(registro => {
            const slug = registro.tipo_documento;
            if (!_docTipos.includes(slug) || achados[slug]) return;
            achados[slug] = registro;
            estadoDoc(slug).registroId = registro.id;
        });
        return achados;
    } catch (e) {
        console.warn('documentos (carregar existentes):', e?.message || e);
        return achados;
    }
}

/** Lê todos os valores do formulário de um termo para um objeto { name: valor } */
function lerDadosFormularioDocumento(slug = _docTipoAtivo) {
    const form = formDoDocumento(slug);
    const dados = {};
    if (!form) return dados;
    // "select" entra na varredura por causa da lista de CNPJs do FOCO
    form.querySelectorAll('input, textarea, select').forEach(inp => {
        if (inp.type === 'checkbox') dados[inp.name] = inp.checked;
        else if (inp.type === 'radio') { if (inp.checked) dados[inp.name] = inp.value; }
        else dados[inp.name] = inp.value;
    });
    return dados;
}

function atualizarPreviewDocumento(slug = _docTipoAtivo) {
    const termo = TERMOS_URC[slug];
    const preview = previewDoDocumento(slug);
    if (!termo || !preview) return;
    preview.innerHTML = termo.template(lerDadosFormularioDocumento(slug));
}

/**
 * Telefone/e-mail/CNPJ são do cliente, não do documento: o valor digitado numa
 * aba é replicado nas demais. Campos travados (readOnly) e o <select> de CNPJ
 * vêm do FOCO e não são tocados. Definir .value por script não dispara
 * "input", então não há laço de eventos.
 */
function espelharCampoCliente(nome, valor, origem) {
    _docTipos.forEach(slug => {
        if (slug === origem) return;
        const campo = formDoDocumento(slug)?.querySelector(`[name="${nome}"]`);
        if (!campo || campo.readOnly || campo.tagName === 'SELECT') return;
        campo.value = valor;
        atualizarPreviewDocumento(slug);
    });
}

/**
 * Formulário de onde saem telefone/e-mail do cliente: o da aba ativa e, se ele
 * não tiver esses campos, o primeiro que tiver (com o espelhamento, todos
 * carregam o mesmo valor).
 */
function formContato() {
    const seletor = '[name="telefone"], [name="email"]';
    const ativo = formDoDocumento(_docTipoAtivo);
    if (ativo?.querySelector(seletor)) return ativo;
    for (const slug of _docTipos) {
        const form = formDoDocumento(slug);
        if (form?.querySelector(seletor)) return form;
    }
    return null;
}

/** Telefone e e-mail atualmente digitados nos formulários */
function dadosContatoAtuais() {
    const form = formContato();
    return {
        telefone: (form?.querySelector('[name="telefone"]')?.value || '').trim(),
        email: (form?.querySelector('[name="email"]')?.value || '').trim()
    };
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

    const { telefone, email } = dadosContatoAtuais();

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

        // O contato é do cliente: replica o valor salvo em todas as abas
        if (telefone) espelharCampoCliente('telefone', telefone, null);
        if (email) espelharCampoCliente('email', email, null);

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
async function montarPayloadEnvio(slug, codigoResposta, lote) {
    const termo = TERMOS_URC[slug];
    const campos = lerDadosFormularioDocumento(slug);
    const p = _docParceiro;

    const telefone = campos.telefone || p.telefone || null;
    const email = campos.email || p.email || _docContexto.foco?.Email || null;

    const payload = {
        // --- Campos na raiz: compatíveis com o fluxo n8n atual ---
        nome_razao_social: p.nome_razao_social,
        cpf: p.cpf,
        telefone: telefone,
        email: email,

        // --- Dados do documento (para gerar o PDF e identificar o registro) ---
        documento: {
            id: estadoDoc(slug).registroId,
            tipo: slug,
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

    // Envio de vários termos no mesmo clique: o lote inteiro vai em todas as
    // chamadas e só uma delas manda a mensagem de texto (o n8n lê enviar_texto).
    // Sem lote, o payload fica idêntico ao de um envio avulso.
    if (lote) payload.lote = lote;

    return payload;
}

/**
 * Envia o documento para o webhook n8n dos Termos URC.
 * Retorna { ok: true } ou { ok: false, error }.
 */
async function enviarDocumentoWebhook(slug, codigoResposta, lote) {
    const payload = await montarPayloadEnvio(slug, codigoResposta, lote);

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
    const contato = dadosContatoAtuais();
    const p = _docParceiro;
    const telefone = contato.telefone || p.telefone || '';
    const email = contato.email || p.email || _docContexto.foco?.Email || '';
    const total = _docTipos.length;

    return [
        { label: 'CPF Válido', ok: !!(p.cpf && p.cpf.length === 14) },
        { label: 'Cadastro validado no FOCO', ok: !!_docContexto.foco },
        { label: 'Nome válido', ok: !!(p.nome_razao_social && p.nome_razao_social.length > 2) },
        { label: 'Telefone válido', ok: telefone.replace(/\D/g, '').length >= 10 },
        { label: 'E-mail válido', ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) },
        { label: total > 1 ? `${total} documentos gerados` : 'Documento gerado', ok: true, neutro: true }
    ];
}

/**
 * Grava (ou atualiza) o registro do documento em public.documentos com
 * status "gerado" + dados do formulário. Não bloqueia a navegação — em
 * falha, apenas loga (a tela de envio continua funcionando).
 */
async function registrarDocumentoGerado(slug) {
    const termo = TERMOS_URC[slug];
    const est = estadoDoc(slug);
    const consultor = await nomeConsultorAtual();
    const campos = lerDadosFormularioDocumento(slug);
    const registro = {
        parceiro_id: _docParceiro.id,
        tipo_documento: slug,
        nome_documento: termo.titulo,
        status: 'gerado',
        dados_formulario: campos,
        // HTML do termo já preenchido: o fluxo de aceite usa isso para gerar
        // o PDF assinado sem depender do front
        html_documento: termo.template(campos),
        case_id_salesforce: _docContexto.interacao?.Id || null,
        case_number: _docContexto.interacao?.CaseNumber || null,
        updated_at: new Date().toISOString()
    };
    // Só grava o consultor quando conseguimos identificá-lo (nunca apaga o já salvo)
    if (consultor) registro.consultor = consultor;

    try {
        if (est.registroId) {
            const { error } = await supabaseClient
                .from('documentos')
                .update(registro)
                .eq('id', est.registroId);
            if (error) console.warn('documentos (update gerado):', error.message);
        } else {
            const { data, error } = await supabaseClient
                .from('documentos')
                .insert([registro])
                .select('id')
                .single();
            if (error) console.warn('documentos (insert gerado):', error.message);
            else est.registroId = data.id;
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
async function prepararEnvioDocumento(slug) {
    const registroId = estadoDoc(slug).registroId;
    if (!registroId) return null;
    try {
        const { data, error } = await supabaseClient
            .rpc('preparar_envio_documento', { p_documento_id: registroId });

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

/**
 * Clique em "Gerar (todos) e prosseguir": com alguma pendência de
 * preenchimento/revisão abre o modal de confirmação; sem pendência, gera direto.
 */
async function gerarTodosEProsseguir() {
    const grupos = pendenciasDoLote();
    if (grupos.length) {
        abrirModalPendencias(grupos);
        return;
    }
    await executarGeracao();
}

/**
 * Gera todos os documentos selecionados e avança para a etapa de envio.
 * Diferente do fluxo antigo, os registros são gravados COM await: cada id
 * alimenta a RPC que reserva a letra de resposta no envio.
 */
async function executarGeracao() {
    const btn = document.getElementById('btn-gerar-documento');
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';

    try {
        for (const slug of _docTipos) {
            await registrarDocumentoGerado(slug);
        }
        mostrarTelaEnvio();
    } catch (e) {
        console.warn('documentos (gerar todos):', e?.message || e);
        mostrarTelaEnvio();
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

/** Mostra a etapa "Enviar via WhatsApp" preenchida com os dados do formulário */
function mostrarTelaEnvio() {
    const total = _docTipos.length;
    const d = dadosContatoAtuais();

    // Validações
    const cont = document.getElementById('envio-validacoes');
    cont.innerHTML = validarDadosEnvio().map(v => {
        const cls = v.neutro ? 'validacao-badge-warn' : (v.ok ? 'validacao-badge-success' : 'validacao-badge-danger');
        const icone = v.neutro ? 'file-lines' : (v.ok ? 'check' : 'times');
        return `<span class="validacao-badge ${cls}"><i class="fas fa-${icone}"></i> ${escHTML(v.label)}</span>`;
    }).join('');

    // Dados do envio
    document.getElementById('envio-doc-nome').textContent = total > 1
        ? `${total} documentos`
        : `o documento ${TERMOS_URC[_docTipos[0]].titulo}`;
    document.getElementById('envio-dado-nome').textContent = _docParceiro.nome_razao_social || '—';
    document.getElementById('envio-dado-cpf').textContent = _docParceiro.cpf || '—';
    document.getElementById('envio-dado-telefone').textContent = d.telefone || _docParceiro.telefone || '—';
    document.getElementById('envio-dado-email').textContent = d.email || _docParceiro.email || _docContexto.foco?.Email || '—';
    document.getElementById('envio-aviso').style.display = 'none';

    // Lista dos documentos do lote (só faz sentido com 2 ou mais)
    const chips = document.getElementById('envio-chips');
    chips.innerHTML = total > 1
        ? _docTipos.map(s => `<span class="doc-chip"><i class="fas fa-file-lines"></i> ${escHTML(TERMOS_URC[s].titulo)}</span>`).join('')
        : '';

    document.getElementById('envio-card-titulo').textContent = total > 1
        ? 'Enviar Documentos via WhatsApp' : 'Enviar Documento via WhatsApp';
    const btnEnviar = document.getElementById('btn-envio-confirmar');
    btnEnviar.querySelector('.btn-text').innerHTML = total > 1
        ? '<i class="fab fa-whatsapp"></i> Enviar todos'
        : '<i class="fab fa-whatsapp"></i> Enviar';

    // Alterna as etapas e o cabeçalho
    document.getElementById('documento-edicao').style.display = 'none';
    document.getElementById('documento-abas-card').style.display = 'none';
    document.getElementById('documento-envio').style.display = 'block';
    document.getElementById('documento-titulo').textContent = 'Enviar via WhatsApp';

    const btnVoltar = document.getElementById('btn-trocar-documento');
    btnVoltar.innerHTML = '<i class="fas fa-arrow-left"></i> Voltar à edição';
    btnVoltar.onclick = (e) => { e.preventDefault(); voltarParaEdicao(); };

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Volta da etapa de envio para a edição do formulário */
function voltarParaEdicao() {
    document.getElementById('documento-envio').style.display = 'none';
    document.getElementById('documento-edicao').style.display = 'grid';
    if (_docTipos.length > 1) {
        document.getElementById('documento-abas-card').style.display = 'block';
    }
    ativarAbaDocumento(_docTipoAtivo); // restaura os títulos

    const btnVoltar = document.getElementById('btn-trocar-documento');
    btnVoltar.innerHTML = '<i class="fas fa-arrow-left"></i> Trocar documento';
    btnVoltar.onclick = null; // volta a usar o href (detalhe)
}

/**
 * Envia os documentos selecionados via WhatsApp (webhook n8n), um a um.
 *
 * O laço é SERIAL de propósito: preparar_envio_documento() reserva a primeira
 * letra livre (A, B, C...) e existe índice único parcial
 * (parceiro_id, codigo_resposta) where status='enviado' — chamadas simultâneas
 * colidiriam. A falha de um documento não interrompe os demais; um novo clique
 * reprocessa apenas o que não foi enviado.
 */
async function confirmarEnvioEmLote() {
    const aviso = document.getElementById('envio-aviso');
    const btn = document.getElementById('btn-envio-confirmar');
    const total = _docTipos.length;

    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';

    const enviados = [];
    const falhas = [];
    const preparados = [];

    const avisar = (texto) => {
        if (total > 1) {
            aviso.className = 'documento-aviso';
            aviso.innerHTML = texto;
            aviso.style.display = 'block';
        } else {
            aviso.style.display = 'none';
        }
    };

    // ===== Fase 1: reservar a letra de TODOS antes de enviar =====
    // A mensagem única do WhatsApp lista os documentos com suas letras, então
    // elas precisam existir antes do primeiro POST.
    for (let i = 0; i < total; i++) {
        const slug = _docTipos[i];
        const est = estadoDoc(slug);

        // Já enviado numa tentativa anterior: não reenvia
        if (est.enviado) { enviados.push({ slug, codigo: est.codigo }); continue; }

        avisar(`Preparando ${i + 1} de ${total}: <b>${escHTML(TERMOS_URC[slug].titulo)}</b>…`);

        try {
            // Garante que o documento está registrado (para enviar o id ao n8n)
            if (!est.registroId) await registrarDocumentoGerado(slug);
            if (!est.registroId) {
                falhas.push({ slug, motivo: 'não foi possível registrar o documento' });
                continue;
            }

            // Marca como enviado e reserva a letra de resposta (A, B, C...)
            const codigo = await prepararEnvioDocumento(slug);
            if (!codigo) {
                // Sem letra o cliente não teria como responder — não envia
                falhas.push({ slug, motivo: 'não foi possível reservar a letra de resposta' });
                continue;
            }

            est.codigo = codigo;
            preparados.push({ slug, codigo });
        } catch (err) {
            console.error('Erro ao preparar documento', slug, err);
            falhas.push({ slug, motivo: err?.message || 'erro ao preparar o documento' });
        }
    }

    // ===== Fase 2: enviar =====
    // O lote inteiro vai em todas as chamadas; só uma delas manda a mensagem de
    // texto (o n8n obedece a `enviar_texto`). "textoPendente" só baixa quando um
    // POST é aceito — se o primeiro falhar, quem manda o texto é o seguinte.
    const loteDocs = preparados.map(p => ({
        tipo: p.slug,
        nome: TERMOS_URC[p.slug].titulo,
        codigo: p.codigo
    }));
    let textoPendente = loteDocs.length > 0;

    for (let i = 0; i < preparados.length; i++) {
        const { slug, codigo } = preparados[i];
        const est = estadoDoc(slug);

        avisar(`Enviando ${i + 1} de ${preparados.length}: <b>${escHTML(TERMOS_URC[slug].titulo)}</b>…`);

        try {
            const lote = {
                total: loteDocs.length,
                indice: i + 1,
                enviar_texto: textoPendente,
                documentos: loteDocs
            };
            const resultado = await enviarDocumentoWebhook(slug, codigo, lote);
            if (resultado.ok) {
                textoPendente = false;
                est.enviado = true;
                est.registroStatus = 'enviado';
                enviados.push({ slug, codigo });
            } else {
                falhas.push({ slug, motivo: resultado.error || 'falha no envio' });
            }
        } catch (err) {
            console.error('Erro ao enviar documento', slug, err);
            falhas.push({ slug, motivo: err?.message || 'erro de conexão' });
        }
    }

    // LGPD: mantém data_envio em parceiros (a lista deriva o status de lá)
    if (enviados.some(e => e.slug === 'termo-lgpd')) {
        try {
            await registrarEnvioLGPDNoParceiro(_docParceiro);
        } catch (e) {
            console.warn('registrarEnvioLGPDNoParceiro:', e?.message || e);
        }
    }

    mostrarResultadoEnvio(enviados, falhas);

    if (falhas.length === 0) {
        // Sucesso total: trava o botão para não reenviar por engano
        btn.querySelector('.btn-text').innerHTML = '<i class="fas fa-check"></i> Enviado';
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    } else {
        btn.disabled = false;
        btn.querySelector('.btn-text').innerHTML = enviados.length
            ? '<i class="fab fa-whatsapp"></i> Enviar novamente'
            : (_docTipos.length > 1 ? '<i class="fab fa-whatsapp"></i> Enviar todos' : '<i class="fab fa-whatsapp"></i> Enviar');
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

/** Escreve o resultado do envio (total, parcial ou nenhum) no aviso da tela */
function mostrarResultadoEnvio(enviados, falhas) {
    const aviso = document.getElementById('envio-aviso');
    const linhaEnviado = e => `<li><b>${escHTML(TERMOS_URC[e.slug].titulo)}</b> — responder ` +
        `<b>1${e.codigo}</b> (aceito) ou <b>2${e.codigo}</b> (não aceito)</li>`;
    const linhaFalha = f => `<li><b>${escHTML(TERMOS_URC[f.slug].titulo)}</b> — ${escHTML(f.motivo)}</li>`;

    if (falhas.length === 0) {
        aviso.className = 'documento-aviso documento-aviso-sucesso';
        aviso.innerHTML = enviados.length > 1
            ? `${enviados.length} documentos enviados com sucesso via WhatsApp!<ul>${enviados.map(linhaEnviado).join('')}</ul>`
            : `Documento enviado com sucesso via WhatsApp! O cliente deve responder ` +
              `<b>1${enviados[0].codigo}</b> (aceito) ou <b>2${enviados[0].codigo}</b> (não aceito).`;
    } else if (enviados.length === 0) {
        aviso.className = 'documento-aviso documento-aviso-erro';
        aviso.innerHTML = falhas.length > 1
            ? `Nenhum documento foi enviado.<ul>${falhas.map(linhaFalha).join('')}</ul>`
            : `Erro ao enviar o documento: ${escHTML(falhas[0].motivo)}. Tente novamente.`;
    } else {
        aviso.className = 'documento-aviso documento-aviso-alerta';
        aviso.innerHTML = `<b>Enviados ${enviados.length} de ${enviados.length + falhas.length}.</b>` +
            `<ul>${enviados.map(linhaEnviado).join('')}</ul>` +
            `<b>Não enviados:</b><ul>${falhas.map(linhaFalha).join('')}</ul>` +
            'Clique em <b>Enviar novamente</b> para tentar só os que falharam, ' +
            'ou reenvie pelo Acompanhamento (a letra de resposta é preservada).';
    }
    aviso.style.display = 'block';
}

// ===== Abas dos documentos selecionados (Tela 3 da POC) =====

// Campos que podem ficar em branco sem que a aba conte como pendente
const CAMPOS_OPCIONAIS_DOC = ['observacoes', 'documentos_outros', 'rg'];

/** Monta a barra de abas — só aparece quando há 2 ou mais documentos */
function montarAbasDocumentos() {
    const card = document.getElementById('documento-abas-card');
    const barra = document.getElementById('documento-abas');
    if (!card || !barra) return;

    if (_docTipos.length <= 1) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    barra.innerHTML = _docTipos.map((slug, i) =>
        `<button type="button" class="doctab" data-tipo="${slug}" onclick="ativarAbaDocumento('${slug}')">` +
        `${i + 1}. ${escHTML(TERMOS_URC[slug].titulo)}</button>`
    ).join('');
}

/**
 * Mostra a aba de um documento. Nada é re-renderizado: os formulários e as
 * pré-visualizações de todos os termos ficam no DOM e só alternam a
 * visibilidade — o que já foi digitado nunca se perde.
 */
function ativarAbaDocumento(slug) {
    if (!TERMOS_URC[slug]) return;
    _docTipoAtivo = slug;

    _docTipos.forEach(s => {
        const form = formDoDocumento(s);
        const preview = previewDoDocumento(s);
        if (form) form.hidden = (s !== slug);
        if (preview) preview.hidden = (s !== slug);
    });

    document.querySelectorAll('#documento-abas .doctab').forEach(botao =>
        botao.classList.toggle('doctab-on', botao.dataset.tipo === slug));

    const termo = TERMOS_URC[slug];
    const formTitulo = document.getElementById('documento-form-titulo');
    if (formTitulo) formTitulo.textContent = termo.titulo;

    const titulo = document.getElementById('documento-titulo');
    if (titulo) {
        titulo.textContent = _docTipos.length > 1
            ? `Editar e Preencher Documentos (${_docTipos.indexOf(slug) + 1}/${_docTipos.length})`
            : termo.titulo;
    }
}

// ===== Pendências antes de gerar =====

/**
 * Lista o que ainda falta num termo. Cada item: { campo, rotulo, motivo }
 *   campo → name do primeiro input a focar (null no item "não revisado").
 * Percorre TERMOS_URC[slug].campos — rótulo e tipo vêm do catálogo, só o
 * valor é lido do DOM — para o critério não depender do HTML gerado.
 * Regras: campo AUTO/AUTO•FOCO nunca conta (CNPJ ausente no FOCO é cliente
 * PF, e os templates já omitem o trecho); campos opcionais também não;
 * nas tabelas Débitos/DASN só conta linha iniciada e não concluída, ou a
 * tabela inteira vazia — célula vazia isolada não é pendência.
 * opcoes.incluirRevisao (padrão true): inclui "formulário não revisado"
 * (nenhuma interação do consultor e sem dados restaurados de registro salvo).
 */
function pendenciasDoDocumento(slug, { incluirRevisao = true } = {}) {
    const termo = TERMOS_URC[slug];
    const form = formDoDocumento(slug);
    if (!termo || !form) return [];

    const el = nome => form.querySelector(`[name="${nome}"]`);
    const valor = nome => el(nome)?.value ?? '';
    const marcado = nome => !!el(nome)?.checked;
    const itens = [];

    if (incluirRevisao) {
        const est = estadoDoc(slug);
        if (!est.tocado && !est.restaurado) {
            itens.push({ campo: null, rotulo: 'Formulário', motivo: 'não revisado — nenhum campo foi conferido' });
        }
    }

    termo.campos.forEach(campo => {
        switch (campo.tipo) {
            case 'check':
            case 'checklist':
                // não marcar é resposta válida
                break;

            case 'radio':
                if (!form.querySelector(`input[name="${campo.id}"]:checked`)) {
                    itens.push({ campo: campo.id, rotulo: campo.label, motivo: 'nenhuma opção selecionada' });
                }
                break;

            case 'debitos': {
                let algum = false;
                campo.opcoes.forEach((op, i) => {
                    if (!marcado(`${campo.id}_${i}_check`)) return;
                    algum = true;
                    if (!temValor(valor(`${campo.id}_${i}_data`))) {
                        itens.push({ campo: `${campo.id}_${i}_data`, rotulo: campo.label, motivo: `"${op}" marcado sem a data` });
                    }
                });
                if (!algum) {
                    itens.push({ campo: `${campo.id}_0_check`, rotulo: campo.label, motivo: 'nenhum débito informado' });
                }
                break;
            }

            case 'dasn': {
                let algum = false;
                for (let i = 0; i < 5; i++) {
                    const ano = valor(`${campo.id}_${i}_ano`), val = valor(`${campo.id}_${i}_valor`),
                          hora = valor(`${campo.id}_${i}_hora`), ret = marcado(`${campo.id}_${i}_ret`);
                    if (!(temValor(ano) || temValor(val) || temValor(hora) || ret)) continue; // linha vazia
                    algum = true;
                    if (!temValor(ano)) {
                        itens.push({ campo: `${campo.id}_${i}_ano`, rotulo: campo.label, motivo: `linha ${i + 1}: ano não informado` });
                    } else if (!temValor(val)) {
                        itens.push({ campo: `${campo.id}_${i}_valor`, rotulo: campo.label, motivo: `linha ${i + 1}: valor não informado` });
                    }
                }
                if (!algum) {
                    itens.push({ campo: `${campo.id}_0_ano`, rotulo: campo.label, motivo: 'nenhuma declaração informada' });
                }
                break;
            }

            default: { // text | textarea
                if (campo.auto || campo.autoFoco || CAMPOS_OPCIONAIS_DOC.includes(campo.id)) break;
                const input = el(campo.id);
                if (!input || input.readOnly || input.tagName === 'SELECT') break;
                if (!temValor(input.value)) {
                    itens.push({ campo: campo.id, rotulo: campo.label, motivo: 'em branco' });
                }
            }
        }
    });

    return itens;
}

/** Pendências de todos os termos do lote: [{ slug, itens }], só quem tem itens */
function pendenciasDoLote() {
    return _docTipos
        .map(slug => ({ slug, itens: pendenciasDoDocumento(slug) }))
        .filter(g => g.itens.length);
}

/** Há pendência de preenchimento nesta aba? (só sinaliza; "não revisado" não pinta ponto) */
function abaPendente(slug) {
    return pendenciasDoDocumento(slug, { incluirRevisao: false }).length > 0;
}

let _pendenciasLote = [];   // grupos exibidos no modal aberto (usados pelo "Revisar")

/** HTML da lista do modal: plana com 1 documento, agrupada por título com 2+ */
function montarListaPendencias(grupos) {
    const linhas = itens => '<ul>' + itens.map(i =>
        `<li>${escHTML(i.rotulo)}: ${escHTML(i.motivo)}</li>`).join('') + '</ul>';
    if (grupos.length === 1 && _docTipos.length === 1) return linhas(grupos[0].itens);
    return '<ul>' + grupos.map(g =>
        `<li><b>${escHTML(TERMOS_URC[g.slug].titulo)}</b>${linhas(g.itens)}</li>`).join('') + '</ul>';
}

/** Abre o modal de confirmação com as pendências do lote */
function abrirModalPendencias(grupos) {
    _pendenciasLote = grupos;
    const modal = document.getElementById('modal-pendencias');
    const lista = document.getElementById('modal-pendencias-lista');
    if (!modal || !lista) { // sem o modal na página, nunca travar o fluxo
        executarGeracao();
        return;
    }
    lista.innerHTML = montarListaPendencias(grupos);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // Foco no "Revisar": Enter jamais dispara a geração
    document.getElementById('btn-pendencias-revisar')?.focus();
}

function fecharModalPendencias() {
    const modal = document.getElementById('modal-pendencias');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

/** "Revisar": fecha, ativa a aba do 1º documento pendente e foca o 1º campo pendente */
function revisarPendencias() {
    const grupo = _pendenciasLote[0];
    fecharModalPendencias();
    if (!grupo) return;
    ativarAbaDocumento(grupo.slug);
    focarCampoDocumento(grupo.slug, grupo.itens.find(i => i.campo)?.campo || null);
}

/** Rola até um campo do formulário e o foca; sem nome, o primeiro editável */
function focarCampoDocumento(slug, nome) {
    const form = formDoDocumento(slug);
    if (!form) return;
    const alvo = nome
        ? form.querySelector(`[name="${nome}"]`)
        : form.querySelector('input:not([readonly]):not([type="hidden"]), textarea, select');
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    alvo.focus({ preventScroll: true });
}

/** "Gerar mesmo assim": segue o fluxo normal de geração */
function gerarMesmoAssim() {
    fecharModalPendencias();
    executarGeracao();
}

// ESC fecha o modal de pendências (o listener de app.js só conhece os modais do cadastro)
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fecharModalPendencias();
});

/** Marca com um ponto âmbar as abas que ainda têm campos em branco */
function marcarAbasPendentes() {
    document.querySelectorAll('#documento-abas .doctab').forEach(botao =>
        botao.classList.toggle('doctab-pendente', abaPendente(botao.dataset.tipo)));
}

// ===== Inicialização =====

/**
 * Slugs válidos vindos da URL: ?tipos=a,b,c (seleção múltipla) ou ?tipo=a
 * (link direto). Duplicados são descartados preservando a ordem escolhida.
 * Com ?doc=<uuid> a retomada é sempre de um único documento.
 */
function normalizarTiposDaURL(params) {
    const bruto = params.get('tipos') || params.get('tipo') || '';
    const tipos = [];
    bruto.split(',').forEach(item => {
        const slug = item.trim();
        if (slug && TERMOS_URC[slug] && !tipos.includes(slug)) tipos.push(slug);
    });
    return params.get('doc') ? tipos.slice(0, 1) : tipos;
}

async function inicializarPaginaDocumento() {
    const container = document.getElementById('documento-forms');
    if (!container) return; // não é a página de documento

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    _docTipos = normalizarTiposDaURL(params);
    _docTipoAtivo = _docTipos[0] || null;

    const tituloEl = document.getElementById('documento-titulo');
    const formTituloEl = document.getElementById('documento-form-titulo');

    if (!id || !_docTipos.length) {
        if (tituloEl) tituloEl.textContent = 'Documento não encontrado';
        container.innerHTML = '<p>Tipo de documento inválido ou cliente não informado.</p>';
        return;
    }

    const varios = _docTipos.length > 1;
    const tituloPagina = varios ? 'Editar e Preencher Documentos' : TERMOS_URC[_docTipoAtivo].titulo;
    if (tituloEl) tituloEl.textContent = tituloPagina;
    if (formTituloEl) formTituloEl.textContent = TERMOS_URC[_docTipoAtivo].titulo;
    document.title = `SEBRAE - TERMOS URC - ${tituloPagina}`;

    // Botões de navegação
    document.getElementById('btn-trocar-documento').href = `detalhe?id=${encodeURIComponent(id)}`;
    if (varios) {
        document.getElementById('btn-trocar-documento').innerHTML =
            '<i class="fas fa-arrow-left"></i> Trocar seleção';
        document.getElementById('btn-gerar-documento').querySelector('.btn-text').innerHTML =
            '<i class="fas fa-file-pdf"></i> Gerar todos e prosseguir';
    }
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

    // Um formulário e uma pré-visualização por termo; só o da aba ativa aparece
    _docTipos.forEach(slug => renderFormularioDocumento(slug));
    montarAbasDocumentos();
    ativarAbaDocumento(_docTipoAtivo);

    if (focoCache?.contatos) aplicarCnpjDoFoco(cnpjsDosContatos(focoCache.contatos));

    // Retomada: documento já gerado (?doc=<id>) ou rascunhos existentes
    const existentes = await carregarDocumentosExistentes(params.get('doc'));
    const retomados = [];
    Object.keys(existentes).forEach(slug => {
        const registro = existentes[slug];
        const est = estadoDoc(slug);
        est.registroStatus = registro.status || null;
        est.cnpjSalvo = registro.dados_formulario?.cnpj || '';
        // Dados vindos de um formulário já preenchido: não conta como "não revisado"
        est.restaurado = !!registro.dados_formulario && Object.keys(registro.dados_formulario).length > 0;
        aplicarDadosNoFormulario(slug, registro.dados_formulario);
        if (registro.case_number && !_docContexto.interacao) {
            _docContexto.interacao = {
                Id: registro.case_id_salesforce,
                CaseNumber: registro.case_number
            };
        }
        retomados.push({ slug, registro });
    });

    if (retomados.length) {
        const aviso = document.getElementById('documento-aviso');
        if (aviso) {
            const quando = r => r.registro.status === 'enviado'
                ? `já <b>enviado</b> em ${formatarDataHora(r.registro.data_envio)}`
                : `<b>gerado</b> em ${formatarDataHora(r.registro.created_at)}`;
            aviso.className = 'documento-aviso';
            aviso.innerHTML = retomados.length > 1
                ? 'Documentos recuperados com os dados já preenchidos:<ul>' +
                  retomados.map(r => `<li>${escHTML(TERMOS_URC[r.slug].titulo)} — ${quando(r)}</li>`).join('') +
                  '</ul>'
                : (retomados[0].registro.status === 'enviado'
                    ? `Documento ${quando(retomados[0])}. Revise os dados e use "Gerar e prosseguir" para reenviar.`
                    : `Retomando documento ${quando(retomados[0])}. Os dados preenchidos foram recuperados.`);
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
            // Preenche campos que dependem do FOCO (e-mail, Account ID) se ainda
            // estiverem vazios — em TODAS as abas, não só na primeira
            if (contato.Email) {
                document.querySelectorAll('#documento-forms input[name="email"]').forEach(inp => {
                    if (!inp.value || inp.value === '—') inp.value = contato.Email;
                });
            }
            if (contato.AccountId) {
                document.querySelectorAll('#documento-forms input[name="account_id"]').forEach(inp => {
                    if (!inp.value || inp.value === '—') inp.value = contato.AccountId;
                });
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
                document.querySelectorAll('#documento-forms input[name="interacao"]')
                    .forEach(inp => { inp.value = interacao.CaseNumber; });
            }
        }
        if (typeof cacheNavSet === 'function' && (contatosFoco.length || _docContexto.interacao)) {
            cacheNavSet(chaveFoco, {
                contato: _docContexto.foco,
                interacao: _docContexto.interacao,
                contatos: contatosFoco
            });
        }
        _docTipos.forEach(slug => atualizarPreviewDocumento(slug));
    } catch (e) {
        // FOCO indisponível: segue com "—" e o CNPJ volta a ser editável
        console.warn('FOCO indisponível para o documento:', e?.message || e);
        aplicarCnpjDoFoco([]);
    }

    marcarAbasPendentes();

    // Botões: "Gerar e prosseguir" → etapa de envio (Tela 4 da POC)
    document.getElementById('btn-gerar-documento').onclick = gerarTodosEProsseguir;
    document.getElementById('btn-envio-cancelar').onclick = voltarParaDetalhe;
    document.getElementById('btn-envio-confirmar').onclick = confirmarEnvioEmLote;
    document.getElementById('btn-salvar-contato').onclick = salvarContatoDoFormulario;
}

/**
 * Cria o formulário e a pré-visualização de um termo (um par por documento
 * selecionado). Chamada UMA vez por slug: trocar de aba não re-renderiza nada,
 * senão os listeners seriam reanexados e o preenchimento se perderia.
 */
function renderFormularioDocumento(slug) {
    const termo = TERMOS_URC[slug];
    if (!termo) return;

    document.getElementById('documento-forms').insertAdjacentHTML('beforeend',
        `<form class="doc-form" data-tipo="${slug}" onsubmit="return false;" hidden>` +
        '<div class="doc-form-grid">' +
        termo.campos.map(c => renderCampoDocumento(c, _docContexto)).join('') +
        '</div></form>');

    document.getElementById('documento-previews').insertAdjacentHTML('beforeend',
        `<div class="doc-preview" data-tipo="${slug}" hidden></div>`);

    // Preview reativo ("change" cobre a lista de CNPJs do FOCO e os checkboxes).
    // Arrow function obrigatória: a referência nua receberia o Event como slug.
    const form = formDoDocumento(slug);
    const aoEditar = (ev) => {
        const nome = ev?.target?.name;
        if (nome && CAMPOS_CLIENTE.includes(nome)) espelharCampoCliente(nome, ev.target.value, slug);
        estadoDoc(slug).tocado = true;
        atualizarPreviewDocumento(slug);
        marcarAbasPendentes();
    };
    form.addEventListener('input', aoEditar);
    form.addEventListener('change', aoEditar);
    // Entrar num campo já conta como revisão — senão "Revisar" → conferir que
    // está tudo certo → "Gerar" repetiria "não revisado" (foco não gera input).
    form.addEventListener('focusin', () => { estadoDoc(slug).tocado = true; });

    atualizarPreviewDocumento(slug);
}

document.addEventListener('DOMContentLoaded', inicializarPaginaDocumento);
