// telas/01-inicio/inicio.js

import {
  buscarPerfilUsuarioLogado,
  observarSessao,
  sair,
  salvarTemaDoUsuario
} from '../../core/auth.js';
import { ehAdmin, ehVendedora } from '../../core/permissions.js';
import { aplicarTema, obterTemaSalvoLocalmente, mostrarCarregando, mostrarToast } from '../../core/components.js';
import { criarCabecalho } from '../../core/navegacao.js';

const raiz = document.getElementById('raiz-inicio');

// Aplica o tema salvo localmente já de cara, para não piscar enquanto
// carrega o perfil (que trará o tema "oficial" salvo em users.theme).
aplicarTema(obterTemaSalvoLocalmente());
mostrarCarregando(raiz, 'Carregando sua conta…');

// Registra o service worker (mesma lógica de telas/00-login/login.js).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../../sw.js', { scope: '../../' }).catch(() => {});
}

observarSessao(async (usuarioFirebase) => {
  if (!usuarioFirebase) {
    // Sem sessão ativa: volta para o login.
    window.location.href = '../00-login/login.html';
    return;
  }

  let perfil;
  try {
    perfil = await buscarPerfilUsuarioLogado(usuarioFirebase.uid);
  } catch (erro) {
    console.error(erro);
    mostrarErroDeCarregamento(
      'Não foi possível carregar seu perfil. As regras do Firestore provavelmente não foram publicadas ainda (ver passo a passo da Sessão 1).'
    );
    return;
  }

  if (!perfil) {
    mostrarErroDeCarregamento('Este login não tem um cadastro correspondente em "users". Fale com a administradora do sistema.');
    return;
  }

  if (!ehAdmin(perfil) && !ehVendedora(perfil)) {
    mostrarErroDeCarregamento('Este usuário não tem um perfil (role) válido configurado.');
    return;
  }

  // Aplica o tema "oficial" salvo no perfil (pode diferir do que estava
  // só no localStorage, ex: primeiro acesso deste navegador).
  aplicarTema(perfil.theme === 'dark' ? 'dark' : 'light');

  montarTelaInicial(perfil);
});

function mostrarErroDeCarregamento(mensagem) {
  raiz.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'tela-carregando';
  container.innerHTML = `<span>⚠️ ${mensagem}</span>`;
  raiz.appendChild(container);
  mostrarToast(mensagem, 'erro', 8000);
}

function montarTelaInicial(perfil) {
  raiz.innerHTML = '';

  const cabecalho = criarCabecalho({
    nomeUsuario: perfil.name || perfil.email,
    aoSair: async () => {
      await sair();
      window.location.href = '../00-login/login.html';
    },
    aoAlternarTema: (novoTema) => {
      salvarTemaDoUsuario(perfil.uid, novoTema).catch((erro) => {
        console.error(erro);
        mostrarToast('Não deu pra salvar sua preferência de tema agora, mas ela continua aplicada nesta sessão.', 'erro');
      });
    }
  });

  const conteudo = document.createElement('main');
  conteudo.className = 'conteudo-inicio';

  if (ehAdmin(perfil)) {
    conteudo.innerHTML = `
      <div class="boas-vindas">
        <h1>Login funcionando — bem-vinda, ${escaparTexto(perfil.name || '')}</h1>
        <p>Este é o painel da administradora. Os indicadores abaixo serão preenchidos nas próximas sessões.</p>
      </div>
      <div class="grade-kpis-placeholder">
        <div class="kpi-placeholder">Vendas do mês</div>
        <div class="kpi-placeholder">Maletas em campo</div>
        <div class="kpi-placeholder">Fiado em aberto</div>
        <div class="kpi-placeholder">Estoque total</div>
      </div>
    `;
  } else {
    conteudo.innerHTML = `
      <div class="boas-vindas">
        <h1>Login funcionando — bem-vinda, ${escaparTexto(perfil.name || '')}</h1>
        <p>Esta é a sua tela inicial. Os botões abaixo serão ativados nas próximas sessões.</p>
      </div>
      <div class="botoes-vendedora-placeholder">
        <button type="button" class="botao botao-principal botao-grande" disabled>Nova Venda</button>
        <button type="button" class="botao botao-secundario botao-grande" disabled>Minha Maleta</button>
      </div>
    `;
  }

  raiz.append(cabecalho, conteudo);
}

function escaparTexto(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
