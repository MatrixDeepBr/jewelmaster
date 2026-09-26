// telas/00-login/login.js

import { db, doc, getDoc } from '../../core/firebase-config.js';
import {
  entrarComEmailSenha,
  observarSessao,
  traduzirErroAuth,
  PerfilNaoEncontradoError
} from '../../core/auth.js';
import { caminhoInicialPara } from '../../core/permissions.js';
import { aplicarTema, obterTemaSalvoLocalmente, criarBotaoSeletorTema } from '../../core/components.js';

// Aplica o tema salvo no navegador imediatamente, antes de qualquer outra
// coisa, para a tela não "piscar" com o tema errado ao carregar.
aplicarTema(obterTemaSalvoLocalmente());

// Registra o service worker (funcionamento offline do "esqueleto" do
// app). Feito aqui e também em inicio.js, para o SW ficar registrado
// independente de qual tela a pessoa abrir primeiro.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../../sw.js', { scope: '../../' }).catch(() => {
    // Falha silenciosa: se o navegador não conseguir registrar (ex: modo
    // privado), o app continua funcionando normalmente, só sem cache offline.
  });
}

// Substitui o botão de tema fixo do HTML por um botão funcional (mantém
// o mesmo lugar/estilo, mas agora clicável).
const botaoTemaOriginal = document.getElementById('botao-tema-canto');
const botaoTemaFuncional = criarBotaoSeletorTema();
botaoTemaFuncional.className = 'botao-tema botao-tema--canto';
botaoTemaOriginal.replaceWith(botaoTemaFuncional);

const formulario = document.getElementById('form-login');
const campoEmail = document.getElementById('campo-email');
const campoSenha = document.getElementById('campo-senha');
const mensagemErro = document.getElementById('mensagem-erro');
const botaoEntrar = document.getElementById('botao-entrar');

function mostrarErro(texto) {
  mensagemErro.textContent = texto;
  mensagemErro.hidden = false;
}

function esconderErro() {
  mensagemErro.hidden = true;
  mensagemErro.textContent = '';
}

function definirCarregando(carregando) {
  botaoEntrar.disabled = carregando;
  botaoEntrar.textContent = carregando ? 'Entrando…' : 'Entrar';
}

// Se já existir uma sessão ativa, pula direto pra tela inicial — não
// precisa logar de novo toda vez que abrir o app.
observarSessao(async (usuarioFirebase) => {
  if (!usuarioFirebase) return;

  try {
    const referencia = doc(db, 'users', usuarioFirebase.uid);
    const instantaneo = await getDoc(referencia);
    if (instantaneo.exists()) {
      window.location.href = caminhoInicialPara(instantaneo.data());
    }
    // Se não existir perfil, deixa a pessoa na tela de login — o próximo
    // envio do formulário (ou uma nova tentativa) vai mostrar o erro
    // adequado através de entrarComEmailSenha.
  } catch (erro) {
    // Se der erro (ex: permission-denied) só ao verificar sessão
    // existente, não trava a tela — deixa a pessoa tentar logar de novo.
    console.error(erro);
  }
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  esconderErro();

  const email = campoEmail.value.trim();
  const senha = campoSenha.value;

  if (!email || !senha) {
    mostrarErro('Preencha e-mail e senha.');
    return;
  }

  definirCarregando(true);

  try {
    const perfil = await entrarComEmailSenha(email, senha);

    if (!perfil.role || (perfil.role !== 'admin' && perfil.role !== 'seller')) {
      mostrarErro('Este usuário não tem um perfil (role) válido configurado. Fale com a administradora do sistema.');
      definirCarregando(false);
      return;
    }

    window.location.href = caminhoInicialPara(perfil);
  } catch (erro) {
    if (erro instanceof PerfilNaoEncontradoError) {
      mostrarErro('Este login existe, mas não tem um cadastro correspondente em "users". Fale com a administradora do sistema.');
    } else {
      mostrarErro(traduzirErroAuth(erro));
    }
    definirCarregando(false);
  }
});
