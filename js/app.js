/* ============================================
   SEBRAE - Aceite LGPD - JavaScript Principal
   Integração com Supabase
   ============================================ */

// ===== Funções Utilitárias =====

/**
 * Formata data para dd/mm/aaaa
 */
function formatarData(dataStr) {
    const d = new Date(dataStr);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

/**
 * Verifica se o PDF do termo existe no bucket do Supabase
 */
async function verificarTermoPDF(cpf) {
    const cpfNumeros = cpf.replace(/\D/g, '');
    const nomeArquivo = `TermosAceite_${cpfNumeros}.pdf`;

    const { data, error } = await supabaseClient
        .storage
        .from('TermosAceite')
        .list('', { search: nomeArquivo });

    if (error || !data || data.length === 0) {
        return false;
    }

    return data.some(f => f.name === nomeArquivo);
}

/**
 * Abre o PDF do termo aceite no Storage do Supabase
 */
async function abrirTermoPDF(cpf) {
    const cpfNumeros = cpf.replace(/\D/g, '');
    const nomeArquivo = `TermosAceite_${cpfNumeros}.pdf`;

    const { data, error } = await supabaseClient
        .storage
        .from('TermosAceite')
        .createSignedUrl(nomeArquivo, 3600);

    if (error || !data?.signedUrl) {
        alert('Documento não encontrado ou erro ao gerar link.');
        console.error('Erro ao gerar URL do PDF:', error?.message);
        return;
    }

    window.open(data.signedUrl, '_blank');
}

// ===== Funções de Acesso ao Banco (Supabase) =====

/**
 * Busca todos os parceiros do banco de dados
 */
async function carregarParceiros() {
    const tbody = document.getElementById('tbody-parceiros');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#999;">Carregando...</td></tr>';

    const { data, error } = await supabaseClient
        .from('parceiros')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao carregar parceiros:', error.message);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#dc3545;">Erro ao carregar dados.</td></tr>';
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#999;">Nenhum parceiro cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const p of data) {
        const tr = await criarLinhaParceiro(p);
        tbody.appendChild(tr);
    }
}

/**
 * Cria uma linha da tabela para um parceiro
 */
async function criarLinhaParceiro(p) {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = function () { window.location = 'detalhe?id=' + p.id; };

    // Termo Aceito - verifica se PDF existe
    let termoBadge = '';
    if (p.termo_aceito) {
        const temPDF = await verificarTermoPDF(p.cpf);
        termoBadge = '<span class="badge-sim"><i class="fas fa-check-circle"></i> Sim</span>';
        if (temPDF) {
            termoBadge += ' <button class="btn-termo-pdf" title="Ver Termo PDF" onclick="event.stopPropagation(); abrirTermoPDF(\'' + p.cpf + '\')"><i class="fas fa-file-pdf"></i></button>';
        }
    } else {
        termoBadge = '<span class="badge-nao"><i class="fas fa-times-circle"></i> Não</span>';
    }

    // Assinatura Digital
    const assinaturaBadge = p.assinatura_digital
        ? '<span class="badge-assinado"><i class="fas fa-file-signature"></i> ' + p.assinatura_digital + '</span>'
        : '<span class="badge-dash">-</span>';

    // Enviado PIIq
    const piiqBadge = p.enviado_piiq
        ? '<span class="badge-sim-check"><i class="fas fa-check"></i> Sim</span>'
        : '<span class="badge-nao-x"><i class="fas fa-times"></i> Não</span>';

    // Data Envio
    const dataEnvio = p.data_envio || '-';

    // Ações
    let acoes = `
        <button class="btn-action btn-action-view" title="Visualizar" onclick="event.stopPropagation(); window.location='detalhe?id=${p.id}'">
            <i class="fas fa-eye"></i>
        </button>`;

    if (p.assinatura_digital) {
        acoes += `
        <button class="btn-action btn-action-doc" title="Documento" onclick="event.stopPropagation();">
            <i class="fas fa-file-alt"></i>
        </button>`;
    }

    // Account ID resumido
    const accountId = p.id.substring(0, 8) + '...';

    tr.innerHTML = `
        <td>${p.cpf}</td>
        <td>${p.nome_razao_social}</td>
        <td>${p.telefone}</td>
        <td title="${p.id}">${accountId}</td>
        <td>${termoBadge}</td>
        <td>${assinaturaBadge}</td>
        <td>${piiqBadge}</td>
        <td>${dataEnvio}</td>
        <td>${acoes}</td>
    `;

    return tr;
}

// ===== Funções da Lista de Parceiros =====

/**
 * Filtra os parceiros na tabela com base nos filtros selecionados
 */
async function filtrarParceiros() {
    const pesquisa = document.getElementById('filtro-pesquisa')?.value.trim().toLowerCase() || '';
    const status = document.getElementById('filtro-status')?.value || '';
    const telefone = document.getElementById('filtro-telefone')?.value || '';

    let query = supabaseClient
        .from('parceiros')
        .select('*')
        .order('created_at', { ascending: false });

    // Filtro de status do termo
    if (status === 'aceito') {
        query = query.eq('termo_aceito', true);
    } else if (status === 'nao_aceito') {
        query = query.eq('termo_aceito', false);
    }

    // Filtro de telefone
    if (telefone === 'sem') {
        query = query.or('telefone.is.null,telefone.eq.');
    }

    const { data, error } = await query;

    if (error) {
        console.error('Erro ao filtrar:', error.message);
        return;
    }

    const tbody = document.getElementById('tbody-parceiros');
    if (!tbody) return;

    // Filtro de pesquisa textual (client-side para flexibilidade)
    let resultados = data || [];
    if (pesquisa) {
        resultados = resultados.filter(p =>
            p.cpf.toLowerCase().includes(pesquisa) ||
            p.nome_razao_social.toLowerCase().includes(pesquisa) ||
            p.telefone.toLowerCase().includes(pesquisa) ||
            p.id.toLowerCase().includes(pesquisa)
        );
    }

    tbody.innerHTML = '';

    if (resultados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px; color:#999;">Nenhum resultado encontrado.</td></tr>';
        return;
    }

    for (const p of resultados) {
        const tr = await criarLinhaParceiro(p);
        tbody.appendChild(tr);
    }
}

// ===== Funções da Página de Detalhe =====

/**
 * Navega para o parceiro anterior ou próximo
 */
async function navegarParceiro(direcao) {
    const urlParams = new URLSearchParams(window.location.search);
    const idAtual = urlParams.get('id');
    if (!idAtual) return;

    // Busca todos os IDs ordenados
    const { data } = await supabaseClient
        .from('parceiros')
        .select('id')
        .order('created_at', { ascending: false });

    if (!data || data.length === 0) return;

    const ids = data.map(p => p.id);
    const indexAtual = ids.indexOf(idAtual);

    let novoIndex;
    if (direcao === 'anterior') {
        novoIndex = indexAtual > 0 ? indexAtual - 1 : ids.length - 1;
    } else {
        novoIndex = indexAtual < ids.length - 1 ? indexAtual + 1 : 0;
    }

    window.location.href = 'detalhe?id=' + ids[novoIndex];
}

/**
 * Abre o modal de confirmação para enviar o termo LGPD
 */
function enviarTermo() {
    if (!parceiroAtual) {
        alert('Erro: dados do parceiro não carregados.');
        return;
    }

    const modal = document.getElementById('modal-enviar-termo');
    if (!modal) return;

    // Preenche os dados do parceiro no modal
    document.getElementById('envio-nome').textContent = parceiroAtual.nome_razao_social;
    document.getElementById('envio-cpf').textContent = parceiroAtual.cpf;
    document.getElementById('envio-telefone').textContent = parceiroAtual.telefone;

    // Limpa mensagens anteriores
    document.getElementById('envio-sucesso').style.display = 'none';
    document.getElementById('envio-erro').style.display = 'none';
    document.getElementById('envio-confirmacao').style.display = 'block';

    // Restaura botão
    const btn = document.getElementById('btn-confirmar-envio');
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'flex';
    btn.querySelector('.spinner').style.display = 'none';

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Fecha o modal de enviar termo
 */
function fecharModalEnviarTermo() {
    const modal = document.getElementById('modal-enviar-termo');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Confirma e envia o termo LGPD via webhook (n8n)
 */
async function confirmarEnvioTermo() {
    const btn = document.getElementById('btn-confirmar-envio');
    const sucessoDiv = document.getElementById('envio-sucesso');
    const erroDiv = document.getElementById('envio-erro');
    const erroMsg = document.getElementById('envio-erro-msg');

    // Esconde mensagens anteriores
    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Loading
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';

    try {
        const response = await fetch('https://n8n.alfredooliveira.com.br/webhook/fba3c3cd-5196-4b1b-be0f-9f47e2705258', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome_razao_social: parceiroAtual.nome_razao_social,
                cpf: parceiroAtual.cpf,
                telefone: parceiroAtual.telefone
            })
        });

        if (response.ok) {
            document.getElementById('envio-sucesso-msg').textContent = 'Termo LGPD enviado com sucesso via WhatsApp!';
            sucessoDiv.style.display = 'flex';

            setTimeout(() => {
                fecharModalEnviarTermo();
            }, 2000);
        } else {
            erroMsg.textContent = 'Erro ao enviar o termo. Tente novamente.';
            erroDiv.style.display = 'flex';
            console.error('Webhook respondeu com status:', response.status);
        }
    } catch (err) {
        erroMsg.textContent = 'Erro de conexão. Verifique sua internet.';
        erroDiv.style.display = 'flex';
        console.error('Erro ao chamar webhook:', err);
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

/**
 * Carrega os dados do parceiro na página de detalhe
 */
async function carregarDetalhe() {
    // Tenta pegar o ID de várias formas (compatibilidade com diferentes servidores)
    let id = new URLSearchParams(window.location.search).get('id');
    
    // Fallback: tenta pegar do hash (caso o servidor redirecione)
    if (!id && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
        id = hashParams.get('id');
    }

    console.log('URL completa:', window.location.href);
    console.log('ID do parceiro:', id);

    if (!id) {
        document.getElementById('parceiro-nome').textContent = 'Parceiro não encontrado';
        return;
    }

    const { data: parceiro, error } = await supabaseClient
        .from('parceiros')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !parceiro) {
        console.error('Erro ao carregar parceiro:', error?.message);
        document.getElementById('parceiro-nome').textContent = 'Erro ao carregar parceiro';
        return;
    }

    // Armazena o parceiro atual para uso na edição
    parceiroAtual = parceiro;

    // Atualiza as informações
    const nomeEl = document.getElementById('parceiro-nome');
    if (nomeEl) nomeEl.textContent = parceiro.nome_razao_social;

    const infoNome = document.getElementById('info-nome');
    if (infoNome) infoNome.textContent = parceiro.nome_razao_social;

    const infoTermo = document.getElementById('info-termo');
    if (infoTermo) {
        if (parceiro.termo_aceito) {
            const temPDF = await verificarTermoPDF(parceiro.cpf);
            let termoHTML = '<span class="badge-sim"><i class="fas fa-check-circle"></i> Sim</span>';
            if (temPDF) {
                termoHTML += ' <button class="btn-termo-pdf" title="Ver Termo PDF" onclick="abrirTermoPDF(\'' + parceiro.cpf + '\')"><i class="fas fa-file-pdf"></i></button>';
            }
            infoTermo.innerHTML = termoHTML;
        } else {
            infoTermo.innerHTML = '<span class="badge-nao"><i class="fas fa-times-circle"></i> Não</span>';
        }
    }

    const infoCpf = document.getElementById('info-cpf');
    if (infoCpf) infoCpf.textContent = parceiro.cpf;

    const infoAccount = document.getElementById('info-account');
    if (infoAccount) infoAccount.textContent = parceiro.id;

    const infoTelefone = document.getElementById('info-telefone');
    if (infoTelefone) infoTelefone.textContent = parceiro.telefone;

    const infoSituacao = document.getElementById('info-situacao');
    if (infoSituacao) {
        const situacao = parceiro.termo_aceito ? 'Ativo' : 'Inativo';
        infoSituacao.textContent = situacao;
        infoSituacao.className = parceiro.termo_aceito
            ? 'badge-situacao-ativo'
            : 'badge-situacao-inativo';
    }

    // Atualiza validações
    const validacoesContainer = document.getElementById('validacoes-container');
    if (validacoesContainer) {
        validacoesContainer.innerHTML = '';

        const cpfValido = parceiro.cpf && parceiro.cpf.length === 14;
        const telefoneValido = parceiro.telefone && parceiro.telefone.length >= 13;
        const nomeValido = parceiro.nome_razao_social && parceiro.nome_razao_social.length > 2;

        const validacoes = [
            { label: 'CPF Válido', valido: cpfValido },
            { label: 'Cadastrado no FOCO', valido: true },
            { label: 'Nome Válido', valido: nomeValido },
            { label: 'Telefone Válido', valido: telefoneValido },
            {
                label: parceiro.termo_aceito ? 'Termo LGPD Aceito' : 'Termo LGPD Não Aceito',
                valido: parceiro.termo_aceito
            }
        ];

        validacoes.forEach(v => {
            const badge = document.createElement('span');
            badge.className = `validacao-badge ${v.valido ? 'validacao-badge-success' : 'validacao-badge-danger'}`;
            badge.innerHTML = `<i class="fas fa-${v.valido ? 'check' : 'times'}"></i> ${v.label}`;
            validacoesContainer.appendChild(badge);
        });
    }

    // Atualiza mensagem informativa
    const infoMessage = document.querySelector('.info-message span');
    if (infoMessage) {
        const telefoneValido = parceiro.telefone && parceiro.telefone.length >= 13;
        if (telefoneValido && !parceiro.termo_aceito) {
            infoMessage.textContent = 'Este parceiro pode receber o termo LGPD via WhatsApp.';
            document.querySelector('.info-message').style.display = 'flex';
        } else if (parceiro.termo_aceito) {
            infoMessage.textContent = 'Este parceiro já aceitou o termo LGPD.';
            document.querySelector('.info-message').style.display = 'flex';
            document.querySelector('.info-message').style.backgroundColor = '#d4edda';
            document.querySelector('.info-message').style.borderColor = '#c3e6cb';
            document.querySelector('.info-message').style.color = '#155724';
            document.querySelector('.info-message i').style.color = '#155724';
        } else {
            document.querySelector('.info-message').style.display = 'none';
        }
    }
}

// ===== Funções do Modal de Edição =====

// Armazena os dados do parceiro carregado para uso na edição
let parceiroAtual = null;

/**
 * Abre o modal de edição preenchido com os dados do parceiro atual
 */
function abrirModalEdicao() {
    const modal = document.getElementById('modal-edicao');
    if (!modal || !parceiroAtual) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Preenche os campos com os dados atuais
    document.getElementById('edit-id').value = parceiroAtual.id;
    document.getElementById('edit-nome').value = parceiroAtual.nome_razao_social;
    document.getElementById('edit-cpf').value = parceiroAtual.cpf;
    document.getElementById('edit-telefone').value = parceiroAtual.telefone;

    // Limpa mensagens
    document.getElementById('edicao-sucesso').style.display = 'none';
    document.getElementById('edicao-erro').style.display = 'none';

    setTimeout(() => document.getElementById('edit-nome')?.focus(), 200);
}

/**
 * Abre o modal de confirmação para excluir o parceiro
 */
function deletarParceiro() {
    if (!parceiroAtual) return;

    const modal = document.getElementById('modal-excluir');
    if (!modal) return;

    // Preenche os dados do parceiro no modal
    document.getElementById('excluir-nome').textContent = parceiroAtual.nome_razao_social;
    document.getElementById('excluir-cpf').textContent = parceiroAtual.cpf;
    document.getElementById('excluir-telefone').textContent = parceiroAtual.telefone;

    // Limpa mensagens anteriores
    document.getElementById('excluir-sucesso').style.display = 'none';
    document.getElementById('excluir-erro').style.display = 'none';
    document.getElementById('excluir-confirmacao').style.display = 'block';

    // Restaura botão
    const btn = document.getElementById('btn-confirmar-excluir');
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'flex';
    btn.querySelector('.spinner').style.display = 'none';

    // Fecha o modal de edição e abre o de exclusão
    fecharModalEdicao();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Fecha o modal de exclusão
 */
function fecharModalExcluir() {
    const modal = document.getElementById('modal-excluir');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Confirma e exclui o parceiro do banco de dados
 */
async function confirmarExclusao() {
    const btn = document.getElementById('btn-confirmar-excluir');
    const sucessoDiv = document.getElementById('excluir-sucesso');
    const erroDiv = document.getElementById('excluir-erro');
    const erroMsg = document.getElementById('excluir-erro-msg');

    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Loading
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { error } = await supabaseClient
            .from('parceiros')
            .delete()
            .eq('id', parceiroAtual.id);

        if (error) {
            erroMsg.textContent = 'Erro ao excluir: ' + error.message;
            erroDiv.style.display = 'flex';
            return;
        }

        document.getElementById('excluir-sucesso-msg').textContent = `Parceiro "${parceiroAtual.nome_razao_social}" excluído com sucesso!`;
        sucessoDiv.style.display = 'flex';

        setTimeout(() => {
            window.location.href = '/';
        }, 1500);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').style.display = 'flex';
        btn.querySelector('.spinner').style.display = 'none';
    }
}

/**
 * Fecha o modal de edição
 */
function fecharModalEdicao() {
    const modal = document.getElementById('modal-edicao');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Salva as alterações do parceiro no Supabase
 */
async function salvarEdicao(event) {
    event.preventDefault();

    const id = document.getElementById('edit-id').value;
    const nome = document.getElementById('edit-nome').value.trim().toUpperCase();
    const cpf = document.getElementById('edit-cpf').value.trim();
    const telefone = document.getElementById('edit-telefone').value.trim();
    const btnSalvar = document.getElementById('btn-salvar-edicao');
    const sucessoDiv = document.getElementById('edicao-sucesso');
    const erroDiv = document.getElementById('edicao-erro');
    const erroMsg = document.getElementById('edicao-erro-msg');

    // Esconde mensagens anteriores
    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Validação do CPF
    if (cpf.length < 14) {
        erroMsg.textContent = 'CPF inválido. Digite o CPF completo.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Validação do telefone
    if (telefone.length < 14) {
        erroMsg.textContent = 'Telefone inválido. Digite o telefone completo.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Loading
    btnSalvar.disabled = true;
    btnSalvar.querySelector('.btn-text').style.display = 'none';
    btnSalvar.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { data, error } = await supabaseClient
            .from('parceiros')
            .update({
                nome_razao_social: nome,
                cpf: cpf,
                telefone: telefone
            })
            .eq('id', id)
            .select();

        if (error) {
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
                erroMsg.textContent = 'CPF já cadastrado para outro parceiro.';
            } else {
                erroMsg.textContent = 'Erro ao atualizar: ' + error.message;
            }
            erroDiv.style.display = 'flex';
            return;
        }

        // Sucesso
        document.getElementById('edicao-sucesso-msg').textContent = 'Parceiro atualizado com sucesso!';
        sucessoDiv.style.display = 'flex';

        // Recarrega os dados na página
        setTimeout(async () => {
            fecharModalEdicao();
            await carregarDetalhe();
        }, 1200);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.querySelector('.btn-text').style.display = 'flex';
        btnSalvar.querySelector('.spinner').style.display = 'none';
    }
}

// ===== Funções do Modal de Cadastro =====

/**
 * Abre o modal de cadastro de novo parceiro
 */
function abrirModalCadastro() {
    const modal = document.getElementById('modal-cadastro');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        document.getElementById('form-cadastro')?.reset();
        document.getElementById('cadastro-sucesso').style.display = 'none';
        document.getElementById('cadastro-erro').style.display = 'none';
        setTimeout(() => document.getElementById('cad-nome')?.focus(), 200);
    }
}

/**
 * Fecha o modal de cadastro
 */
function fecharModalCadastro() {
    const modal = document.getElementById('modal-cadastro');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Máscara de CPF: 000.000.000-00
 */
function mascaraCPF(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
}

/**
 * Máscara de Telefone: (00)00000-0000
 */
function mascaraTelefone(input) {
    let v = input.value.replace(/\D/g, '');
    v = v.substring(0, 11);
    v = v.replace(/^(\d{2})(\d)/g, '($1)$2');
    v = v.replace(/(\d{5})(\d)/, '$1-$2');
    input.value = v;
}

/**
 * Cadastra um novo parceiro no Supabase
 */
async function cadastrarParceiro(event) {
    event.preventDefault();

    const nome = document.getElementById('cad-nome').value.trim().toUpperCase();
    const cpf = document.getElementById('cad-cpf').value.trim();
    const telefone = document.getElementById('cad-telefone').value.trim();
    const btnSalvar = document.getElementById('btn-salvar');
    const sucessoDiv = document.getElementById('cadastro-sucesso');
    const erroDiv = document.getElementById('cadastro-erro');
    const erroMsg = document.getElementById('cadastro-erro-msg');

    // Esconde mensagens anteriores
    sucessoDiv.style.display = 'none';
    erroDiv.style.display = 'none';

    // Validação do CPF
    if (cpf.length < 14) {
        erroMsg.textContent = 'CPF inválido. Digite o CPF completo.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Validação do telefone
    if (telefone.length < 14) {
        erroMsg.textContent = 'Telefone inválido. Digite o telefone completo.';
        erroDiv.style.display = 'flex';
        return;
    }

    // Loading
    btnSalvar.disabled = true;
    btnSalvar.querySelector('.btn-text').style.display = 'none';
    btnSalvar.querySelector('.spinner').style.display = 'inline-block';

    try {
        const { data, error } = await supabaseClient
            .from('parceiros')
            .insert([{
                cpf: cpf,
                nome_razao_social: nome,
                telefone: telefone,
                termo_aceito: false,
                enviado_piiq: false
            }])
            .select();

        if (error) {
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
                erroMsg.textContent = 'CPF já cadastrado no sistema.';
            } else {
                erroMsg.textContent = 'Erro ao cadastrar: ' + error.message;
            }
            erroDiv.style.display = 'flex';
            return;
        }

        // Sucesso
        document.getElementById('cadastro-sucesso-msg').textContent = `Parceiro "${nome}" cadastrado com sucesso!`;
        sucessoDiv.style.display = 'flex';
        document.getElementById('form-cadastro').reset();

        // Recarrega a tabela
        setTimeout(async () => {
            fecharModalCadastro();
            await carregarParceiros();
        }, 1200);

    } catch (err) {
        erroMsg.textContent = 'Erro inesperado. Tente novamente.';
        erroDiv.style.display = 'flex';
    } finally {
        btnSalvar.disabled = false;
        btnSalvar.querySelector('.btn-text').style.display = 'flex';
        btnSalvar.querySelector('.spinner').style.display = 'none';
    }
}

// Fechar modal ao clicar fora
document.addEventListener('click', function (e) {
    const modalCadastro = document.getElementById('modal-cadastro');
    if (modalCadastro && e.target === modalCadastro) {
        fecharModalCadastro();
    }
    const modalEdicao = document.getElementById('modal-edicao');
    if (modalEdicao && e.target === modalEdicao) {
        fecharModalEdicao();
    }
    const modalEnviarTermo = document.getElementById('modal-enviar-termo');
    if (modalEnviarTermo && e.target === modalEnviarTermo) {
        fecharModalEnviarTermo();
    }
    const modalExcluir = document.getElementById('modal-excluir');
    if (modalExcluir && e.target === modalExcluir) {
        fecharModalExcluir();
    }
});

// Fechar modal com ESC
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        fecharModalCadastro();
        fecharModalEdicao();
        fecharModalEnviarTermo();
        fecharModalExcluir();
    }
});

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', async function () {
    // Aguarda a verificação de autenticação antes de carregar dados
    // (auth.js redireciona se não autenticado)
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return; // auth.js vai redirecionar

        // Página de lista: carregar parceiros do banco
        if (document.getElementById('tbody-parceiros')) {
            await carregarParceiros();
        }

        // Página de detalhe: carregar dados do parceiro
        if (document.getElementById('parceiro-nome')) {
            await carregarDetalhe();
        }

        // Enter no campo de pesquisa
        const filtroPesquisa = document.getElementById('filtro-pesquisa');
        if (filtroPesquisa) {
            filtroPesquisa.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    filtrarParceiros();
                }
            });
        }
    } catch (err) {
        console.error('Erro na inicialização:', err);
    }
});
