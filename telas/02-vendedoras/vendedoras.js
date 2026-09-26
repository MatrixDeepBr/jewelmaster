// vendedoras.js — Sessão 2: Cadastro de Vendedoras + Acordo Comercial
// Reaproveita tudo que já existe em /core (não reimplementa auth, tema, nav, etc.)

import {
  auth, db,
  doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs,
  serverTimestamp
} from '../../core/firebase-config.js';

import {
  buscarPerfilUsuarioLogado,
  sair,
  observarSessao,
  salvarTemaDoUsuario
} from '../../core/auth.js';

import { ehAdmin, caminhoInicialPara } from '../../core/permissions.js';

import {
  mostrarToast,
  obterTemaSalvoLocalmente,
  aplicarTema,
  criarBotaoSeletorTema,
  criarCard
} from '../../core/components.js';

import { criarCabecalho, criarMenuLateralAdmin } from '../../core/navegacao.js';

// ⚠️ PREENCHER: depois de publicar o Worker na Cloudflare, cole aqui o endereço dele.
// Exemplo: "https://criar-login-vendedora.SEU-USUARIO.workers.dev"
const URL_WORKER_CRIAR_LOGIN = "https://criar-login-vendedora.collornewrp.workers.dev/";

// Textos amigáveis para o tipo de comissão (tela) <-> valor salvo no Firestore
const ROTULOS_TIPO_COMISSAO = {
  percentual: { rotuloValor: '%', texto: 'Percentual sobre vendas' },
  valorFixoPorPeca: { rotuloValor: 'R$ por peça (centavos serão calculados automaticamente)', texto: 'Valor fixo por peça vendida' },
  descontoPelaVendedora: { rotuloValor: '%', texto: 'Desconto direto pela vendedora' }
};

// Estado local simples da tela
let perfilLogado = null;
let modoFormulario = 'criar'; // 'criar' | 'editar'

// --- Elementos ---
const elCarregando = document.getElementById('tela-carregando');
const elVisaoLista = document.getElementById('visao-lista');
const elVisaoFormulario = document.getElementById('visao-formulario');
const elListaVendedoras = document.getElementById('lista-vendedoras');
const elListaVazia = document.getElementById('lista-vazia');
const elBotaoNovaVendedora = document.getElementById('botao-nova-vendedora');
const elBotaoVoltar = document.getElementById('botao-voltar');
const elTituloFormulario = document.getElementById('titulo-formulario');
const elFormulario = document.getElementById('formulario-vendedora');
const elCampoUid = document.getElementById('campo-uid');
const elCampoSellerId = document.getElementById('campo-seller-id');
const elCampoNome = document.getElementById('campo-nome');
const elCampoContato = document.getElementById('campo-contato');
const elCampoEmail = document.getElementById('campo-email');
const elBlocoSenhaInicial = document.getElementById('bloco-senha-inicial');
const elCampoSenha = document.getElementById('campo-senha');
const elBotaoGerarSenha = document.getElementById('botao-gerar-senha');
const elCampoTipoComissao = document.getElementById('campo-tipo-comissao');
const elRotuloValorComissao = document.getElementById('rotulo-valor-comissao');
const elCampoValorComissao = document.getElementById('campo-valor-comissao');
const elCampoObservacao = document.getElementById('campo-observacao');
const elBlocoStatus = document.getElementById('bloco-status');
const elCampoAtiva = document.getElementById('campo-ativa');
const elAreaMensagemFormulario = document.getElementById('area-mensagem-formulario');
const elBotaoSalvar = document.getElementById('botao-salvar');

// --- Inicialização ---
aplicarTema(obterTemaSalvoLocalmente());

observarSessao(async (usuarioFirebase) => {
  if (!usuarioFirebase) {
    window.location.href = '../00-login/login.html';
    return;
  }

  try {
    perfilLogado = await buscarPerfilUsuarioLogado(usuarioFirebase.uid);
  } catch (erro) {
    console.error('Erro ao buscar perfil:', erro);
    window.location.href = '../00-login/login.html';
    return;
  }

  if (!ehAdmin(perfilLogado)) {
    // Vendedora tentando acessar a tela direto pela URL: manda pra tela dela.
    window.location.href = caminhoInicialPara(perfilLogado);
    return;
  }

  montarCabecalho();
  montarMenuLateral();
  elCarregando.classList.add('oculto');
  mostrarVisaoLista();
  await carregarListaVendedoras();
});

function montarCabecalho() {
  const areaCabecalho = document.getElementById('area-cabecalho');
  const cabecalho = criarCabecalho({
    nomeUsuario: perfilLogado.name || perfilLogado.email,
    aoSair: async () => {
      await sair();
      window.location.href = '../00-login/login.html';
    },
    aoAlternarTema: async (novoTema) => {
      aplicarTema(novoTema);
      if (auth.currentUser) {
        await salvarTemaDoUsuario(auth.currentUser.uid, novoTema);
      }
    }
  });
  areaCabecalho.appendChild(cabecalho);
}

// Acrescentado na Sessão 2: menu lateral do Admin.
// Escrito de forma defensiva — se a página não tiver o elemento esperado
// (id="menu-lateral"), o menu simplesmente não aparece, sem quebrar a tela.
// Confirme com o arquivo vendedoras.html se esse id existe; se não existir,
// crie um <div id="menu-lateral" class="area-menu-lateral"></div> na página
// para o menu passar a aparecer.
function montarMenuLateral() {
  const elMenuLateral = document.getElementById('menu-lateral');
  if (!elMenuLateral) {
    console.warn('Elemento #menu-lateral não encontrado em vendedoras.html — menu lateral não será exibido.');
    return;
  }
  elMenuLateral.appendChild(criarMenuLateralAdmin({ itemAtivo: 'vendedoras' }));
}

// --- Navegação entre visões ---
function mostrarVisaoLista() {
  elVisaoFormulario.classList.add('oculto');
  elVisaoLista.classList.remove('oculto');
}

function mostrarVisaoFormulario() {
  elVisaoLista.classList.add('oculto');
  elVisaoFormulario.classList.remove('oculto');
}

elBotaoVoltar.addEventListener('click', () => {
  mostrarVisaoLista();
});

elBotaoNovaVendedora.addEventListener('click', () => {
  abrirFormularioCriacao();
});

// --- Carregar e renderizar lista ---
async function carregarListaVendedoras() {
  elListaVendedoras.innerHTML = '';
  mostrarToast('Carregando vendedoras...', 'info', 1200);

  const snapshotSellers = await getDocs(collection(db, 'sellers'));

  if (snapshotSellers.empty) {
    elListaVazia.classList.remove('oculto');
    return;
  }
  elListaVazia.classList.add('oculto');

  for (const docSeller of snapshotSellers.docs) {
    const dadosSeller = docSeller.data();
    let dadosUsuario = null;
    try {
      const refUsuario = doc(db, 'users', dadosSeller.userId);
      const snapUsuario = await getDoc(refUsuario);
      if (snapUsuario.exists()) {
        dadosUsuario = snapUsuario.data();
      }
    } catch (erro) {
      console.warn('Não foi possível carregar o usuário da vendedora', dadosSeller.userId, erro);
    }

    elListaVendedoras.appendChild(
      criarLinhaVendedora(docSeller.id, dadosSeller, dadosUsuario)
    );
  }
}

function criarLinhaVendedora(sellerId, dadosSeller, dadosUsuario) {
  const nome = dadosUsuario?.name || '(nome não encontrado)';
  const email = dadosUsuario?.email || '';

  let classeBadge = 'badge-status-ativa';
  let textoBadge = 'Ativa';
  if (!dadosUsuario) {
    classeBadge = 'badge-status-pendente';
    textoBadge = 'Acordo incompleto';
  } else if (dadosSeller.active === false) {
    classeBadge = 'badge-status-inativa';
    textoBadge = 'Inativa';
  }

  const conteudo = document.createElement('div');
  conteudo.className = 'card-vendedora';
  conteudo.innerHTML = `
    <div>
      <div class="info-vendedora-nome">${escaparHtml(nome)}</div>
      <div class="info-vendedora-email">${escaparHtml(email)}</div>
    </div>
    <span class="badge-status ${classeBadge}">${textoBadge}</span>
  `;

  const card = criarCard(conteudo);
  card.classList.add('card-vendedora-wrapper');
  card.addEventListener('click', () => {
    abrirFormularioEdicao(sellerId, dadosSeller, dadosUsuario);
  });
  return card;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// --- Formulário: abrir em modo criação ---
function abrirFormularioCriacao() {
  modoFormulario = 'criar';
  elTituloFormulario.textContent = 'Nova Vendedora';
  elFormulario.reset();
  elCampoUid.value = '';
  elCampoSellerId.value = '';
  elCampoEmail.disabled = false;
  elBlocoSenhaInicial.classList.remove('oculto');
  elCampoSenha.required = true;
  elBlocoStatus.classList.add('oculto');
  elCampoTipoComissao.value = 'percentual';
  atualizarRotuloValorComissao();
  limparMensagemFormulario();
  mostrarVisaoFormulario();
}

// --- Formulário: abrir em modo edição ---
function abrirFormularioEdicao(sellerId, dadosSeller, dadosUsuario) {
  modoFormulario = 'editar';
  elTituloFormulario.textContent = dadosUsuario?.name ? `Editar — ${dadosUsuario.name}` : 'Editar Vendedora';
  elFormulario.reset();

  elCampoSellerId.value = sellerId;
  elCampoUid.value = dadosSeller.userId || '';

  elCampoNome.value = dadosUsuario?.name || '';
  elCampoContato.value = dadosSeller.contact || '';
  elCampoEmail.value = dadosUsuario?.email || '';
  elCampoEmail.disabled = true; // e-mail/login não muda por aqui

  elBlocoSenhaInicial.classList.add('oculto');
  elCampoSenha.required = false;

  elCampoTipoComissao.value = dadosSeller.commissionType || 'percentual';
  elCampoValorComissao.value = dadosSeller.commissionValue ?? '';
  atualizarRotuloValorComissao();
  elCampoObservacao.value = dadosSeller.notes || '';

  elBlocoStatus.classList.remove('oculto');
  elCampoAtiva.checked = dadosSeller.active !== false;

  limparMensagemFormulario();
  mostrarVisaoFormulario();
}

elCampoTipoComissao.addEventListener('change', atualizarRotuloValorComissao);
function atualizarRotuloValorComissao() {
  const tipo = elCampoTipoComissao.value;
  elRotuloValorComissao.textContent = ROTULOS_TIPO_COMISSAO[tipo]?.rotuloValor || 'Valor';
}

elBotaoGerarSenha.addEventListener('click', () => {
  elCampoSenha.value = gerarSenhaAleatoria();
});

function gerarSenhaAleatoria() {
  const caracteres = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 10; i++) {
    senha += caracteres[Math.floor(Math.random() * caracteres.length)];
  }
  return senha;
}

// --- Confirmação ao desativar ---
elCampoAtiva.addEventListener('change', (evento) => {
  if (modoFormulario === 'editar' && !evento.target.checked) {
    const confirmou = window.confirm('Tem certeza que deseja desativar esta vendedora? Ela não conseguirá mais acessar o sistema.');
    if (!confirmou) {
      evento.target.checked = true;
    }
  }
});

// --- Envio do formulário ---
elFormulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limparMensagemFormulario();

  const dados = lerDadosFormulario();
  if (!validarDadosFormulario(dados)) return;

  elBotaoSalvar.disabled = true;
  elBotaoSalvar.textContent = 'Salvando...';

  try {
    if (modoFormulario === 'criar') {
      await criarVendedora(dados);
    } else {
      await salvarEdicaoVendedora(dados);
    }
    mostrarToast('Vendedora salva com sucesso!', 'sucesso', 2500);
    mostrarVisaoLista();
    await carregarListaVendedoras();
  } catch (erro) {
    console.error('Erro ao salvar vendedora:', erro);
    exibirMensagemFormulario(erro.message || 'Não foi possível salvar. Tente novamente.');
  } finally {
    elBotaoSalvar.disabled = false;
    elBotaoSalvar.textContent = 'Salvar';
  }
});

function lerDadosFormulario() {
  return {
    sellerId: elCampoSellerId.value || null,
    uid: elCampoUid.value || null,
    nome: elCampoNome.value.trim(),
    contato: elCampoContato.value.trim(),
    email: elCampoEmail.value.trim(),
    senha: elCampoSenha.value,
    commissionType: elCampoTipoComissao.value,
    commissionValue: Number(elCampoValorComissao.value),
    notes: elCampoObservacao.value.trim(),
    active: elCampoAtiva.checked
  };
}

function validarDadosFormulario(dados) {
  if (!dados.nome) {
    exibirMensagemFormulario('Informe o nome da vendedora.');
    return false;
  }
  if (!validarFormatoEmail(dados.email)) {
    exibirMensagemFormulario('Informe um e-mail válido.');
    return false;
  }
  if (modoFormulario === 'criar' && (!dados.senha || dados.senha.length < 6)) {
    exibirMensagemFormulario('A senha inicial precisa ter pelo menos 6 caracteres.');
    return false;
  }
  if (Number.isNaN(dados.commissionValue) || dados.commissionValue < 0) {
    exibirMensagemFormulario('Informe um valor de comissão válido.');
    return false;
  }
  if (modoFormulario === 'criar' && URL_WORKER_CRIAR_LOGIN.includes('COLE_AQUI')) {
    exibirMensagemFormulario('O endereço do Worker ainda não foi configurado em vendedoras.js (constante URL_WORKER_CRIAR_LOGIN).');
    return false;
  }
  return true;
}

function validarFormatoEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function exibirMensagemFormulario(texto) {
  elAreaMensagemFormulario.textContent = texto;
  elAreaMensagemFormulario.classList.add('mensagem-erro');
}

function limparMensagemFormulario() {
  elAreaMensagemFormulario.textContent = '';
  elAreaMensagemFormulario.classList.remove('mensagem-erro');
}

// --- Criar vendedora nova (chama o Worker, depois grava no Firestore) ---
async function criarVendedora(dados) {
  const idToken = await auth.currentUser.getIdToken();

  let respostaWorker;
  try {
    const resposta = await fetch(URL_WORKER_CRIAR_LOGIN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({
        email: dados.email,
        senha: dados.senha,
        nome: dados.nome
      })
    });
    respostaWorker = await resposta.json();
    if (!resposta.ok) {
      throw new Error(respostaWorker.erro || 'O servidor de criação de login recusou o pedido.');
    }
  } catch (erroRede) {
    if (erroRede instanceof TypeError) {
      throw new Error('Não foi possível falar com o servidor de criação de login. Confira sua internet e tente de novo.');
    }
    throw erroRede;
  }

  const novoUid = respostaWorker.uid;
  if (!novoUid) {
    throw new Error('O servidor não devolveu o login criado. Tente novamente.');
  }

  // Passo 1: criar o documento em users/{uid}
  try {
    await setDoc(doc(db, 'users', novoUid), {
      name: dados.nome,
      email: dados.email,
      role: 'seller',
      theme: 'light',
      createdAt: serverTimestamp()
    });
  } catch (erro) {
    throw new Error('O login foi criado, mas houve um erro ao salvar os dados da vendedora. Abra "Editar" para tentar completar o acordo comercial.');
  }

  // Passo 2: criar o documento em sellers
  try {
    const refSeller = doc(collection(db, 'sellers'));
    await setDoc(refSeller, {
      userId: novoUid,
      contact: dados.contato,
      commissionType: dados.commissionType,
      commissionValue: dados.commissionValue,
      notes: dados.notes,
      active: true,
      createdAt: serverTimestamp()
    });
  } catch (erro) {
    throw new Error('O login foi criado (a vendedora já consegue entrar), mas o acordo comercial não foi salvo. Edite a vendedora na lista para completar essa parte.');
  }
}

// --- Salvar edição de vendedora existente ---
async function salvarEdicaoVendedora(dados) {
  const refSeller = doc(db, 'sellers', dados.sellerId);

  await setDoc(refSeller, {
    userId: dados.uid,
    contact: dados.contato,
    commissionType: dados.commissionType,
    commissionValue: dados.commissionValue,
    notes: dados.notes,
    active: dados.active,
    createdAt: serverTimestamp()
  }, { merge: true });

  // Atualiza o nome na coleção users, se ela já existir (caso de acordo incompleto sendo completado agora)
  if (dados.uid) {
    try {
      await updateDoc(doc(db, 'users', dados.uid), {
        name: dados.nome
      });
    } catch (erro) {
      console.warn('Não foi possível atualizar o nome em users/', dados.uid, erro);
    }
  }
}
