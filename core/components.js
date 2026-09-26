// core/components.js
// Funções JS reutilizáveis por qualquer tela: toast de confirmação/erro,
// tela de carregando, e a lógica do tema claro/escuro (incluindo o botão
// seletor de tema, pronto para ser colocado em qualquer tela).

const CHAVE_TEMA_LOCAL = 'joias-app-tema';

// ---------- Toast ----------

// Garante que existe uma <div id="area-toast"> no body (cria se faltar) e
// devolve ela. As telas não precisam se preocupar em criar essa área.
function obterAreaToast() {
  let area = document.getElementById('area-toast');
  if (!area) {
    area = document.createElement('div');
    area.id = 'area-toast';
    document.body.appendChild(area);
  }
  return area;
}

// Mostra uma mensagem curta no canto da tela.
// tipo: 'sucesso' | 'erro' | 'info' (padrão)
export function mostrarToast(mensagem, tipo = 'info', duracaoMs = 4000) {
  const area = obterAreaToast();

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (tipo === 'sucesso') toast.classList.add('toast-sucesso');
  if (tipo === 'erro') toast.classList.add('toast-erro');

  const prefixo = tipo === 'sucesso' ? '✅ ' : (tipo === 'erro' ? '⚠️ ' : '');
  toast.textContent = prefixo + mensagem;

  area.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duracaoMs);
}

// ---------- Tela de carregando ----------

// Substitui o conteúdo de um elemento por uma tela de "carregando…"
// simples, com giro. Uso típico: mostrarCarregando(document.body) logo no
// início de uma tela, antes de saber se há sessão ativa.
export function mostrarCarregando(elemento, mensagem = 'Carregando…') {
  elemento.innerHTML = `
    <div class="tela-carregando">
      <span class="giro" aria-hidden="true"></span>
      <span>${mensagem}</span>
    </div>
  `;
}

// ---------- Tema claro/escuro ----------

// Lê o tema salvo no navegador (localStorage), usado antes do login para
// não haver "piscada" de tema errado ao carregar a página.
export function obterTemaSalvoLocalmente() {
  return localStorage.getItem(CHAVE_TEMA_LOCAL) || 'light';
}

// Aplica um tema ('light' | 'dark') no <body> e guarda no localStorage
// (guardar localmente serve para antes do login, ou como cópia rápida
// depois do login — a cópia "oficial" após login é users/{uid}.theme).
export function aplicarTema(tema) {
  document.body.classList.toggle('tema-escuro', tema === 'dark');
  localStorage.setItem(CHAVE_TEMA_LOCAL, tema);
}

// Cria o botão redondo de alternância de tema, já com o ícone certo pro
// tema atual. `aoAlternar(novoTema)` é chamado depois de já ter trocado
// visualmente — a tela decide se também salva em users/{uid}.theme.
export function criarBotaoSeletorTema(aoAlternar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'botao-tema';
  botao.setAttribute('aria-label', 'Alternar tema claro/escuro');
  atualizarIconeBotaoTema(botao);

  botao.addEventListener('click', () => {
    const temaAtual = document.body.classList.contains('tema-escuro') ? 'dark' : 'light';
    const novoTema = temaAtual === 'dark' ? 'light' : 'dark';
    aplicarTema(novoTema);
    atualizarIconeBotaoTema(botao);
    if (typeof aoAlternar === 'function') {
      aoAlternar(novoTema);
    }
  });

  return botao;
}

function atualizarIconeBotaoTema(botao) {
  const escuro = document.body.classList.contains('tema-escuro');
  botao.textContent = escuro ? '☀️' : '🌙';
}

// ---------- Card simples ----------

// Cria um <div class="card"> com o conteúdo (texto ou nó HTML) passado.
export function criarCard(conteudo) {
  const card = document.createElement('div');
  card.className = 'card';
  if (typeof conteudo === 'string') {
    card.innerHTML = conteudo;
  } else if (conteudo instanceof Node) {
    card.appendChild(conteudo);
  }
  return card;
}
