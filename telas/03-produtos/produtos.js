// telas/03-produtos/produtos.js
// Tela de Cadastro de Produtos (Admin). Sessão 3 — JewelMaster.
//
// Segue o mesmo padrão de "duas visões" já usado em telas/02-vendedoras:
// uma <section> de lista e uma <section> de formulário, alternadas via
// atributo "hidden", dentro da mesma página (sem trocar de URL).

import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from '../../core/firebase-config.js';

import {
  observarSessao,
  buscarPerfilUsuarioLogado,
  sair,
  salvarTemaDoUsuario
} from '../../core/auth.js';

import { ehAdmin, caminhoInicialPara } from '../../core/permissions.js';

import {
  mostrarToast,
  mostrarCarregando,
  obterTemaSalvoLocalmente,
  aplicarTema,
  criarBotaoSeletorTema
} from '../../core/components.js';

import { formatarCentavosParaReais, gerarBarcodeId } from '../../core/utils.js';

import { criarCabecalho, criarMenuLateralAdmin } from '../../core/navegacao.js';

// Endereço do Worker de upload de fotos (Cloudflare R2), publicado na
// Sessão 3. Ver workers/upload-foto-produto.js e o relatório da Sessão 3.
const URL_WORKER_UPLOAD_FOTO = 'https://upload-foto-produto.collornewrp.workers.dev';

// core/firebase-config.js ainda não reexporta um helper para pegar o
// token de identidade da usuária logada (só foi usado, até agora, dentro
// dos Workers). Como esta é a primeira tela que precisa chamar um Worker
// autenticado a partir do próprio front-end, importamos aqui só a função
// necessária, do mesmo jeito que core/firebase-config.js já importa o
// restante do SDK — ver "Interfaces assumidas" no relatório desta sessão.
const { getIdToken } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');

// ---------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------
let listaCompletaDeProdutos = [];
let arquivoFotoSelecionado = null;
let urlFotoJaSalva = null; // usada quando edita um produto que já tem foto
let listaDeCategorias = [];
// true quando a pessoa digitou/mexeu no código curto à mão — nesse caso
// trocar a categoria não sobrescreve o que ela escreveu.
let shortCodeEditadoManualmente = false;

// Elementos da visão Categorias
const visaoCategorias = document.getElementById('visao-categorias');
const listaCategoriasElemento = document.getElementById('lista-categorias');
const mensagemCategoriasVazia = document.getElementById('mensagem-categorias-vazia');
const formularioCategoria = document.getElementById('formulario-categoria');
const tituloFormCategoria = document.getElementById('titulo-form-categoria');
const campoIdCategoria = document.getElementById('campo-id-categoria');
const campoNomeCategoria = document.getElementById('campo-nome-categoria');
const campoPrefixoCategoria = document.getElementById('campo-prefixo-categoria');
const avisoPrefixoCategoria = document.getElementById('aviso-prefixo-categoria');
const mensagemErroCategoria = document.getElementById('mensagem-erro-categoria');
const botaoCancelarCategoria = document.getElementById('botao-cancelar-categoria');
const botaoSalvarCategoria = document.getElementById('botao-salvar-categoria');

// Elementos da visão Lista
const visaoLista = document.getElementById('visao-lista');
const visaoFormulario = document.getElementById('visao-formulario');
const elementoListaProdutos = document.getElementById('lista-produtos');
const mensagemListaVazia = document.getElementById('mensagem-lista-vazia');
const campoBusca = document.getElementById('campo-busca');

// Elementos do Formulário
const formularioProduto = document.getElementById('formulario-produto');
const tituloFormulario = document.getElementById('titulo-formulario');
const campoIdProduto = document.getElementById('campo-id-produto');
const campoNome = document.getElementById('campo-nome');
const campoCategoria = document.getElementById('campo-categoria');
const campoCor = document.getElementById('campo-cor');
const campoFormato = document.getElementById('campo-formato');
const campoPrecoVista = document.getElementById('campo-preco-vista');
const campoPrecoPrazo = document.getElementById('campo-preco-prazo');
const campoDescontoMaximo = document.getElementById('campo-desconto-maximo');
const campoEstoque = document.getElementById('campo-estoque');
const campoShortCode = document.getElementById('campo-short-code');
const mensagemSemCategorias = document.getElementById('mensagem-sem-categorias');
const campoBarcode = document.getElementById('campo-barcode');
const campoFoto = document.getElementById('campo-foto');
const previaFoto = document.getElementById('previa-foto');
const mensagemSemFoto = document.getElementById('mensagem-sem-foto');
const statusUploadFoto = document.getElementById('status-upload-foto');
const grupoAtivo = document.getElementById('grupo-ativo');
const campoAtivo = document.getElementById('campo-ativo');
const mensagemErroFormulario = document.getElementById('mensagem-erro-formulario');

// ---------------------------------------------------------------------
// Sessão / permissão
// ---------------------------------------------------------------------
aplicarTema(obterTemaSalvoLocalmente());

observarSessao(async (usuarioAutenticado) => {
  if (!usuarioAutenticado) {
    location.href = '../00-login/login.html';
    return;
  }

  let perfil;
  try {
    perfil = await buscarPerfilUsuarioLogado(usuarioAutenticado.uid);
  } catch (erro) {
    mostrarToast('Não foi possível carregar seu perfil. Tente entrar novamente.', 'erro');
    location.href = '../00-login/login.html';
    return;
  }

  // Só a Admin pode acessar esta tela — Vendedora é redirecionada
  // para a tela dela, mesmo que digite o endereço direto.
  if (!ehAdmin(perfil)) {
    location.href = caminhoInicialPara(perfil);
    return;
  }

  montarCabecalhoEMenu(perfil);
  await Promise.all([carregarProdutos(), carregarCategorias()]);
});

function montarCabecalhoEMenu(perfil) {
  document.body.prepend(
    criarCabecalho({
      nomeUsuario: perfil.name,
      aoSair: async () => {
        await sair();
        location.href = '../00-login/login.html';
      },
      aoAlternarTema: (novoTema) => salvarTemaDoUsuario(perfil.uid, novoTema)
    })
  );

  document
    .getElementById('menu-lateral')
    .appendChild(criarMenuLateralAdmin({ itemAtivo: 'produtos' }));
}

// ---------------------------------------------------------------------
// Carregar e renderizar a lista
// ---------------------------------------------------------------------
async function carregarProdutos() {
  mostrarCarregando(elementoListaProdutos, 'Carregando produtos...');

  try {
    const consulta = query(collection(db, 'products'));
    const resultado = await getDocs(consulta);

    listaCompletaDeProdutos = resultado.docs.map((documentoProduto) => ({
      id: documentoProduto.id,
      ...documentoProduto.data()
    }));

    // Mais recentes primeiro.
    listaCompletaDeProdutos.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    renderizarLista(listaCompletaDeProdutos);
  } catch (erro) {
    elementoListaProdutos.innerHTML = '';
    mostrarToast('Não foi possível carregar os produtos. Confira sua internet e tente de novo.', 'erro');
  }
}

function renderizarLista(lista) {
  elementoListaProdutos.innerHTML = '';

  if (lista.length === 0) {
    mensagemListaVazia.hidden = false;
    return;
  }
  mensagemListaVazia.hidden = true;

  lista.forEach((produto) => {
    const card = document.createElement('div');
    card.className = 'card-produto' + (produto.active === false ? ' card-produto--inativo' : '');
    card.addEventListener('click', () => abrirFormularioEdicao(produto));

    const foto = produto.photoUrl
      ? `<img class="card-produto__foto" src="${produto.photoUrl}" alt="Foto de ${escaparTexto(produto.name)}">`
      : `<div class="card-produto__foto-placeholder">💍</div>`;

    const badge = produto.active === false
      ? '<span class="badge-status badge-status--inativo">Inativo</span>'
      : '<span class="badge-status badge-status--ok">Ativo</span>';

    card.innerHTML = `
      ${foto}
      <span class="card-produto__nome">${escaparTexto(produto.name || '(sem nome)')}</span>
      <span class="card-produto__codigo-curto">${escaparTexto(produto.shortCode || 'Sem código curto')}</span>
      <span class="card-produto__codigo">${escaparTexto(produto.barcodeId || '')}</span>
      <div class="card-produto__linha-inferior">
        <span class="card-produto__preco">${formatarCentavosParaReais(produto.priceCash || 0)}</span>
        <span class="card-produto__estoque">Estoque: ${produto.stockQuantity ?? 0}</span>
      </div>
      ${badge}
    `;

    elementoListaProdutos.appendChild(card);
  });
}

// Busca em memória (catálogo ainda pequeno neste início do projeto —
// ver decisão registrada no relatório desta sessão).
campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.trim().toLowerCase();

  if (!termo) {
    renderizarLista(listaCompletaDeProdutos);
    return;
  }

  const filtrada = listaCompletaDeProdutos.filter((produto) => {
    return (
      (produto.name || '').toLowerCase().includes(termo) ||
      (produto.barcodeId || '').toLowerCase().includes(termo) ||
      (produto.shortCode || '').toLowerCase().includes(termo) ||
      (produto.category || '').toLowerCase().includes(termo)
    );
  });

  renderizarLista(filtrada);
});

// ---------------------------------------------------------------------
// Alternar entre as duas visões
// ---------------------------------------------------------------------
function mostrarVisaoLista() {
  visaoFormulario.hidden = true;
  visaoCategorias.hidden = true;
  visaoLista.hidden = false;
}

function mostrarVisaoFormulario() {
  visaoLista.hidden = true;
  visaoCategorias.hidden = true;
  visaoFormulario.hidden = false;
}

function mostrarVisaoCategorias() {
  visaoLista.hidden = true;
  visaoFormulario.hidden = true;
  visaoCategorias.hidden = false;
}

document.getElementById('botao-novo-produto').addEventListener('click', abrirFormularioNovo);
document.getElementById('botao-voltar-lista').addEventListener('click', mostrarVisaoLista);
document.getElementById('botao-cancelar-formulario').addEventListener('click', mostrarVisaoLista);

// ---------------------------------------------------------------------
// Abrir formulário — novo produto
// ---------------------------------------------------------------------
function abrirFormularioNovo() {
  formularioProduto.reset();
  campoIdProduto.value = '';
  tituloFormulario.textContent = 'Novo Produto';
  grupoAtivo.hidden = true; // só existe produto inativo depois de criado
  campoDescontoMaximo.value = 0;
  preencherSelectCategorias('');
  campoShortCode.value = '';
  shortCodeEditadoManualmente = false;

  // O código de barras de um produto novo é gerado agora, na abertura
  // do formulário, e mostrado somente leitura — a pessoa não digita.
  campoBarcode.value = gerarBarcodeId();

  limparEstadoFoto();
  esconderErroFormulario();
  mostrarVisaoFormulario();
}

// ---------------------------------------------------------------------
// Abrir formulário — editar produto existente
// ---------------------------------------------------------------------
function abrirFormularioEdicao(produto) {
  formularioProduto.reset();
  tituloFormulario.textContent = 'Editar Produto';
  campoIdProduto.value = produto.id;

  campoNome.value = produto.name || '';
  preencherSelectCategorias(produto.category || '');
  campoShortCode.value = produto.shortCode || '';
  // Se o produto já tem código, ele é respeitado (não é trocado ao mexer na categoria).
  shortCodeEditadoManualmente = Boolean(produto.shortCode);
  campoCor.value = produto.color || '';
  campoFormato.value = produto.shape || '';
  campoPrecoVista.value = ((produto.priceCash || 0) / 100).toFixed(2);
  campoPrecoPrazo.value = produto.priceInstallment ? (produto.priceInstallment / 100).toFixed(2) : '';
  campoDescontoMaximo.value = produto.maxDiscountPercent || 0;
  campoEstoque.value = produto.stockQuantity ?? 0;
  campoBarcode.value = produto.barcodeId || '';

  grupoAtivo.hidden = false;
  campoAtivo.checked = produto.active !== false;

  limparEstadoFoto();
  if (produto.photoUrl) {
    urlFotoJaSalva = produto.photoUrl;
    previaFoto.src = produto.photoUrl;
    previaFoto.hidden = false;
    mensagemSemFoto.hidden = true;
  }

  esconderErroFormulario();
  mostrarVisaoFormulario();
}

// ---------------------------------------------------------------------
// Prévia da foto escolhida
// ---------------------------------------------------------------------
campoFoto.addEventListener('change', () => {
  const arquivo = campoFoto.files[0];
  if (!arquivo) return;

  const tiposAceitos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposAceitos.includes(arquivo.type)) {
    mostrarToast('Formato de imagem não suportado. Escolha um arquivo JPG, PNG ou WEBP.', 'erro');
    campoFoto.value = '';
    return;
  }

  arquivoFotoSelecionado = arquivo;

  const leitor = new FileReader();
  leitor.onload = (evento) => {
    previaFoto.src = evento.target.result;
    previaFoto.hidden = false;
    mensagemSemFoto.hidden = true;
  };
  leitor.readAsDataURL(arquivo);
});

function limparEstadoFoto() {
  arquivoFotoSelecionado = null;
  urlFotoJaSalva = null;
  campoFoto.value = '';
  previaFoto.hidden = true;
  previaFoto.src = '';
  mensagemSemFoto.hidden = false;
  statusUploadFoto.hidden = true;
}

// ---------------------------------------------------------------------
// Salvar (criar ou atualizar)
// ---------------------------------------------------------------------
formularioProduto.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  esconderErroFormulario();

  const erroValidacao = validarFormulario();
  if (erroValidacao) {
    mostrarErroFormulario(erroValidacao);
    return;
  }

  const idProduto = campoIdProduto.value;
  const ehNovo = !idProduto;

  const botaoSalvar = document.getElementById('botao-salvar-produto');
  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Salvando...';

  try {
    // Confere no Firestore se o código curto já é de outro produto —
    // antes de enviar a foto, para não subir imagem à toa.
    const codigoCurto = campoShortCode.value.trim().toUpperCase();
    if (await shortCodeJaExiste(codigoCurto, idProduto)) {
      mostrarErroFormulario(`O código curto ${codigoCurto} já está em uso por outro produto. Escolha outro.`);
      return;
    }

    let urlFoto = urlFotoJaSalva; // mantém a foto já existente se não trocou

    // Se a pessoa escolheu uma foto nova, envia primeiro para o Worker.
    if (arquivoFotoSelecionado) {
      urlFoto = await enviarFotoParaWorker(arquivoFotoSelecionado, campoBarcode.value);
    }

    const dadosProduto = {
      name: campoNome.value.trim(),
      category: campoCategoria.value,
      shortCode: codigoCurto,
      color: campoCor.value.trim(),
      shape: campoFormato.value.trim(),
      priceCash: Math.round(parseFloat(campoPrecoVista.value) * 100),
      priceInstallment: campoPrecoPrazo.value ? Math.round(parseFloat(campoPrecoPrazo.value) * 100) : 0,
      maxDiscountPercent: Number(campoDescontoMaximo.value) || 0,
      stockQuantity: Number(campoEstoque.value) || 0,
      barcodeId: campoBarcode.value,
      photoUrl: urlFoto || ''
    };

    if (ehNovo) {
      dadosProduto.active = true;
      dadosProduto.createdAt = serverTimestamp();
      const novoDocumento = doc(collection(db, 'products'));
      await setDoc(novoDocumento, dadosProduto);
    } else {
      dadosProduto.active = campoAtivo.checked;
      await updateDoc(doc(db, 'products', idProduto), dadosProduto);
    }

    mostrarToast('✅ Produto salvo com sucesso!', 'sucesso');
    mostrarVisaoLista();
    await carregarProdutos();
  } catch (erro) {
    mostrarErroFormulario(
      'Não foi possível salvar o produto. Confira sua internet e tente novamente. ' +
      'Se o problema continuar, é possível que a regra do Firestore ainda não tenha sido publicada.'
    );
  } finally {
    botaoSalvar.disabled = false;
    botaoSalvar.textContent = 'Salvar Produto';
  }
});

function validarFormulario() {
  if (!campoNome.value.trim()) return 'O nome do produto é obrigatório.';

  if (!campoCategoria.value) {
    return listaDeCategorias.length === 0
      ? 'Cadastre uma categoria primeiro (botão "Gerenciar categorias" na lista de produtos).'
      : 'Escolha a categoria do produto.';
  }

  const codigoCurto = campoShortCode.value.trim().toUpperCase();
  if (!codigoCurto) return 'O código curto é obrigatório.';
  if (!/^[A-Z0-9]{2,12}$/.test(codigoCurto)) return 'O código curto deve ter de 2 a 12 letras ou números, sem espaços (ex.: AN105).';

  const precoVista = parseFloat(campoPrecoVista.value);
  if (isNaN(precoVista) || precoVista < 0) return 'O preço à vista precisa ser um valor válido, maior ou igual a zero.';

  if (campoPrecoPrazo.value) {
    const precoPrazo = parseFloat(campoPrecoPrazo.value);
    if (isNaN(precoPrazo) || precoPrazo < 0) return 'O preço a prazo precisa ser um valor válido, maior ou igual a zero.';
  }

  const desconto = Number(campoDescontoMaximo.value);
  if (isNaN(desconto) || desconto < 0 || desconto > 100) return 'O desconto máximo precisa estar entre 0 e 100.';

  const estoque = Number(campoEstoque.value);
  if (isNaN(estoque) || estoque < 0) return 'A quantidade em estoque precisa ser um número válido, maior ou igual a zero.';

  return null;
}

function mostrarErroFormulario(mensagem) {
  mensagemErroFormulario.textContent = mensagem;
  mensagemErroFormulario.hidden = false;
}

function esconderErroFormulario() {
  mensagemErroFormulario.hidden = true;
  mensagemErroFormulario.textContent = '';
}

// ---------------------------------------------------------------------
// Envio da foto para o Worker (Cloudflare R2)
// ---------------------------------------------------------------------
async function enviarFotoParaWorker(arquivo, barcodeId) {
  statusUploadFoto.hidden = false;
  statusUploadFoto.className = 'status-upload status-upload--carregando';
  statusUploadFoto.textContent = 'Enviando foto...';

  if (!URL_WORKER_UPLOAD_FOTO || URL_WORKER_UPLOAD_FOTO.startsWith('COLE_AQUI')) {
    statusUploadFoto.className = 'status-upload status-upload--erro';
    statusUploadFoto.textContent = 'O endereço do Worker de fotos ainda não foi configurado nesta tela.';
    throw new Error('URL_WORKER_UPLOAD_FOTO não configurada.');
  }

  try {
    const idToken = await getIdToken(auth.currentUser);

    const dadosFormulario = new FormData();
    dadosFormulario.append('foto', arquivo);
    dadosFormulario.append('barcodeId', barcodeId);

    const resposta = await fetch(URL_WORKER_UPLOAD_FOTO, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: dadosFormulario
    });

    const dados = await resposta.json();

    if (!resposta.ok || !dados.ok) {
      throw new Error(dados.erro || 'O servidor de fotos não respondeu corretamente.');
    }

    statusUploadFoto.className = 'status-upload status-upload--ok';
    statusUploadFoto.textContent = '✅ Foto enviada.';
    return dados.photoUrl;

  } catch (erro) {
    statusUploadFoto.className = 'status-upload status-upload--erro';
    statusUploadFoto.textContent = 'Não foi possível enviar a foto (sem internet ou servidor não respondeu). O produto não foi salvo — tente novamente.';
    throw erro;
  }
}

// ---------------------------------------------------------------------
// Código curto (shortCode)
// ---------------------------------------------------------------------

// Sugere o próximo número depois do maior já usado com esse prefixo
// (começa em 101). Ex.: AN101, AN102, AN105 já usados → sugere AN106.
// Escolhi "depois do maior" (e não preencher lacunas) por ser mais
// simples e não reaproveitar códigos de produtos antigos.
function sugerirProximoShortCode(prefixo) {
  const padrao = new RegExp(`^${prefixo}(\\d+)$`);
  let maior = 100;

  listaCompletaDeProdutos.forEach((produto) => {
    const encontrado = (produto.shortCode || '').toUpperCase().match(padrao);
    if (encontrado) maior = Math.max(maior, parseInt(encontrado[1], 10));
  });

  return `${prefixo}${maior + 1}`;
}

campoCategoria.addEventListener('change', () => {
  const categoria = listaDeCategorias.find((c) => c.name === campoCategoria.value);
  if (!categoria) return;

  // Só sugere se o campo está vazio ou se a pessoa ainda não mexeu nele.
  if (!campoShortCode.value.trim() || !shortCodeEditadoManualmente) {
    campoShortCode.value = sugerirProximoShortCode(categoria.prefix);
    shortCodeEditadoManualmente = false;
  }
});

campoShortCode.addEventListener('input', () => {
  campoShortCode.value = campoShortCode.value.toUpperCase().replace(/\s/g, '');
  shortCodeEditadoManualmente = true;
});

// Confere no Firestore (não só na lista em memória) se o código já
// pertence a OUTRO produto.
async function shortCodeJaExiste(codigo, idProdutoAtual) {
  const resultado = await getDocs(
    query(collection(db, 'products'), where('shortCode', '==', codigo))
  );
  return resultado.docs.some((d) => d.id !== idProdutoAtual);
}

// ---------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------
async function carregarCategorias() {
  try {
    const resultado = await getDocs(query(collection(db, 'categories')));
    listaDeCategorias = resultado.docs.map((d) => ({ id: d.id, ...d.data() }));
    listaDeCategorias.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    renderizarListaCategorias();
  } catch (erro) {
    mostrarToast('Não foi possível carregar as categorias. Confira a internet e se o firestore.rules novo foi publicado.', 'erro');
  }
}

// Monta a lista suspensa do formulário de produto.
function preencherSelectCategorias(valorSelecionado) {
  campoCategoria.innerHTML = '';
  campoCategoria.appendChild(new Option('Selecione uma categoria...', ''));

  listaDeCategorias.forEach((c) => {
    campoCategoria.appendChild(new Option(`${c.name} (${c.prefix})`, c.name));
  });

  // Produto antigo com categoria em texto livre que não existe no cadastro:
  // mantém o valor visível para não perder a informação ao editar.
  if (valorSelecionado && !listaDeCategorias.some((c) => c.name === valorSelecionado)) {
    campoCategoria.appendChild(new Option(`${valorSelecionado} (sem cadastro)`, valorSelecionado));
  }

  campoCategoria.value = valorSelecionado || '';
  mensagemSemCategorias.hidden = listaDeCategorias.length > 0;
}

function renderizarListaCategorias() {
  listaCategoriasElemento.innerHTML = '';
  mensagemCategoriasVazia.hidden = listaDeCategorias.length > 0;

  listaDeCategorias.forEach((categoria) => {
    const item = document.createElement('li');
    item.className = 'item-categoria';
    item.innerHTML = `
      <span class="item-categoria__nome">
        ${escaparTexto(categoria.name)}
        <span class="item-categoria__prefixo">${escaparTexto(categoria.prefix)}</span>
      </span>
    `;
    const botaoEditar = document.createElement('button');
    botaoEditar.type = 'button';
    botaoEditar.className = 'botao botao-secundario';
    botaoEditar.textContent = 'Editar';
    botaoEditar.addEventListener('click', () => abrirEdicaoCategoria(categoria));
    item.appendChild(botaoEditar);
    listaCategoriasElemento.appendChild(item);
  });
}

function prepararFormularioCategoriaNova() {
  formularioCategoria.reset();
  campoIdCategoria.value = '';
  tituloFormCategoria.textContent = 'Nova categoria';
  campoPrefixoCategoria.readOnly = false;
  avisoPrefixoCategoria.hidden = true;
  botaoCancelarCategoria.hidden = true;
  mensagemErroCategoria.hidden = true;
}

function abrirEdicaoCategoria(categoria) {
  prepararFormularioCategoriaNova();
  campoIdCategoria.value = categoria.id;
  tituloFormCategoria.textContent = 'Editar categoria';
  campoNomeCategoria.value = categoria.name;
  campoPrefixoCategoria.value = categoria.prefix;
  // O prefixo fica travado na edição: os códigos dos produtos já usam ele.
  campoPrefixoCategoria.readOnly = true;
  avisoPrefixoCategoria.hidden = false;
  botaoCancelarCategoria.hidden = false;
}

campoPrefixoCategoria.addEventListener('input', () => {
  campoPrefixoCategoria.value = campoPrefixoCategoria.value.toUpperCase().replace(/[^A-Z]/g, '');
});

document.getElementById('botao-gerenciar-categorias').addEventListener('click', () => {
  prepararFormularioCategoriaNova();
  mostrarVisaoCategorias();
});
document.getElementById('botao-voltar-produtos').addEventListener('click', mostrarVisaoLista);
botaoCancelarCategoria.addEventListener('click', prepararFormularioCategoriaNova);

formularioCategoria.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mensagemErroCategoria.hidden = true;

  const idCategoria = campoIdCategoria.value;
  const nome = campoNomeCategoria.value.trim();
  const prefixo = campoPrefixoCategoria.value.trim().toUpperCase();

  const mostrarErro = (texto) => {
    mensagemErroCategoria.textContent = texto;
    mensagemErroCategoria.hidden = false;
  };

  if (!nome) return mostrarErro('Digite o nome da categoria.');
  if (!/^[A-Z]{2}$/.test(prefixo)) return mostrarErro('O prefixo precisa ter exatamente 2 letras (ex.: AN).');

  if (listaDeCategorias.some((c) => c.id !== idCategoria && c.name.toLowerCase() === nome.toLowerCase())) {
    return mostrarErro('Já existe uma categoria com esse nome.');
  }

  botaoSalvarCategoria.disabled = true;
  botaoSalvarCategoria.textContent = 'Salvando...';

  try {
    // Confere o prefixo direto no Firestore (não só na lista em memória).
    const mesmoPrefixo = await getDocs(
      query(collection(db, 'categories'), where('prefix', '==', prefixo))
    );
    if (mesmoPrefixo.docs.some((d) => d.id !== idCategoria)) {
      return mostrarErro(`O prefixo ${prefixo} já é usado por outra categoria. Escolha outro.`);
    }

    if (!idCategoria) {
      await setDoc(doc(collection(db, 'categories')), {
        name: nome,
        prefix: prefixo,
        createdAt: serverTimestamp()
      });
    } else {
      const nomeAntigo = listaDeCategorias.find((c) => c.id === idCategoria)?.name;
      await updateDoc(doc(db, 'categories', idCategoria), { name: nome });

      // Os produtos guardam o NOME da categoria; se o nome mudou,
      // atualiza os produtos dessa categoria para não ficarem "órfãos".
      if (nomeAntigo && nomeAntigo !== nome) {
        const produtosDaCategoria = await getDocs(
          query(collection(db, 'products'), where('category', '==', nomeAntigo))
        );
        await Promise.all(produtosDaCategoria.docs.map((d) => updateDoc(d.ref, { category: nome })));
        await carregarProdutos();
      }
    }

    mostrarToast('✅ Categoria salva!', 'sucesso');
    prepararFormularioCategoriaNova();
    await carregarCategorias();
  } catch (erro) {
    mostrarErro('Não foi possível salvar a categoria. Confira a internet e se o firestore.rules novo foi publicado.');
  } finally {
    botaoSalvarCategoria.disabled = false;
    botaoSalvarCategoria.textContent = 'Salvar categoria';
  }
});

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function escaparTexto(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
