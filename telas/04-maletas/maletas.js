// telas/04-maletas/maletas.js
// Sessão 4 — Lista de maletas, montagem (Nova Maleta), conferência de
// entrega e emissão em A4. Só Admin acessa.
// Patch de Estoque (01/10/2026): estoque "na empresa" x "em maletas",
// campo bagItems.status, botão "Mostrar fotos" e dois relatórios A4.

import {
  db, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, serverTimestamp
} from '../../core/firebase-config.js';
import { observarSessao, buscarPerfilUsuarioLogado, sair, salvarTemaDoUsuario } from '../../core/auth.js';
import { ehAdmin } from '../../core/permissions.js';
import { mostrarToast, aplicarTema, obterTemaSalvoLocalmente } from '../../core/components.js';
import { criarCabecalho, criarMenuLateralAdmin } from '../../core/navegacao.js';
import { formatarCentavosParaReais } from '../../core/utils.js';
import { calcularEstoque, STATUS_ITEM_MALETA } from '../../core/estoque.js';

// Estados da maleta:
//  "montando" = rascunho salvo, ainda em conferência (não entregue)
//  "open"     = conferida e entregue à vendedora
//  "closed"   = fechada (será usada na Sessão 7)
const STATUS_MALETA = { MONTANDO: 'montando', ABERTA: 'open', FECHADA: 'closed' };
const ROTULO_STATUS = { montando: 'Montando', open: 'Aberta', closed: 'Fechada' };

const CHAVE_MOSTRAR_FOTOS = 'jewelmaster-mostrar-fotos';

const conteudo = document.getElementById('conteudo');

const estado = {
  produtos: [],          // produtos ativos (para busca)
  mapaProdutos: new Map(), // todos os produtos por id
  vendedoras: [],        // { uid, nome }
  maletas: [],
  estoque: null,         // Map productId -> { total, emMaletas, vendidas, naEmpresa, porVendedora }
  mostrarFotos: false,   // alternador "Mostrar fotos"
  rascunho: null,        // { sellerId, itens: [productId] }
  aberta: null           // { bag, itens }
};

// ---------- utilitários ----------
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function codigoDe(p) { return p ? (p.shortCode || p.barcodeId || '—') : '—'; }
function dataTexto(valor) {
  if (valor && typeof valor.toDate === 'function') return valor.toDate().toLocaleDateString('pt-BR');
  if (valor instanceof Date) return valor.toLocaleDateString('pt-BR');
  return '—';
}
function milis(valor) {
  return valor && typeof valor.toMillis === 'function' ? valor.toMillis() : 0;
}
function normalizar(texto) {
  return String(texto ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function badge(status) {
  return `<span class="maleta-badge maleta-badge-${esc(status)}">${esc(ROTULO_STATUS[status] || status)}</span>`;
}

// ---------- preferência "Mostrar fotos" ----------
function lerPreferenciaFotos() {
  try { return localStorage.getItem(CHAVE_MOSTRAR_FOTOS) === '1'; } catch (erro) { return false; }
}
function gravarPreferenciaFotos(valor) {
  try { localStorage.setItem(CHAVE_MOSTRAR_FOTOS, valor ? '1' : '0'); } catch (erro) { /* sem localStorage: segue sem lembrar */ }
}

function botaoFotosHtml() {
  const ligado = estado.mostrarFotos;
  return `<button type="button" class="maleta-botao-sec maleta-botao-fotos ${ligado ? 'maleta-botao-fotos-ligado' : ''}"
    data-acao="alternar-fotos" aria-pressed="${ligado}">
    📷 Mostrar fotos: ${ligado ? 'ligado' : 'desligado'}
  </button>`;
}

function atualizarBotoesFotos() {
  const ligado = estado.mostrarFotos;
  document.querySelectorAll('[data-acao="alternar-fotos"]').forEach((b) => {
    b.classList.toggle('maleta-botao-fotos-ligado', ligado);
    b.setAttribute('aria-pressed', String(ligado));
    b.textContent = `📷 Mostrar fotos: ${ligado ? 'ligado' : 'desligado'}`;
  });
}

// Miniatura ~48x48 (só quando "Mostrar fotos" está ligado).
function miniaturaHtml(p) {
  if (!estado.mostrarFotos) return '';
  if (p && p.photoUrl) {
    return `<img class="maleta-miniatura" src="${esc(p.photoUrl)}" alt="" loading="lazy">`;
  }
  return '<div class="maleta-miniatura maleta-miniatura-vazia">💍</div>';
}

// ---------- estoque ----------
async function carregarEstoque() {
  try {
    estado.estoque = await calcularEstoque([...estado.mapaProdutos.values()]);
  } catch (erro) {
    console.error(erro);
    estado.estoque = null;
    mostrarToast('Não foi possível calcular o estoque agora. Verifique a conexão.', 'erro');
  }
}

// Peças que a empresa ainda tem fisicamente (sem contar o rascunho atual).
function saldoNaEmpresa(p) {
  const e = estado.estoque ? estado.estoque.get(p.id) : null;
  if (e) return e.naEmpresa;
  return Number.isFinite(p.stockQuantity) ? p.stockQuantity : 0; // sem cálculo: usa o total cadastrado
}

// ---------- carregamento de dados ----------
async function carregarProdutos() {
  const snap = await getDocs(collection(db, 'products'));
  estado.mapaProdutos = new Map();
  snap.forEach((d) => estado.mapaProdutos.set(d.id, { id: d.id, ...d.data() }));
  estado.produtos = [...estado.mapaProdutos.values()]
    .filter((p) => p.active !== false)
    .sort((a, b) => codigoDe(a).localeCompare(codigoDe(b)));
}

async function carregarVendedoras() {
  const snap = await getDocs(query(collection(db, 'sellers'), where('active', '==', true)));
  const lista = [];
  for (const d of snap.docs) {
    const s = d.data();
    if (!s.userId) continue;
    const u = await getDoc(doc(db, 'users', s.userId));
    if (u.exists()) lista.push({ uid: s.userId, nome: u.data().name || '(sem nome)' });
  }
  estado.vendedoras = lista.sort((a, b) => a.nome.localeCompare(b.nome));
}

async function carregarMaletas() {
  const snap = await getDocs(collection(db, 'bags'));
  estado.maletas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => milis(b.createdAt) - milis(a.createdAt));
}

// ---------- LISTA ----------
function renderLista() {
  estado.rascunho = null;
  estado.aberta = null;
  const linhas = estado.maletas.map((m) => `
    <div class="maleta-linha">
      <div class="maleta-linha-info">
        <span class="maleta-linha-nome">${esc(m.sellerName || 'Vendedora')} ${badge(m.status)}</span>
        <span class="maleta-linha-detalhe">
          ${esc(m.totalItems ?? 0)} peça(s) · ${formatarCentavosParaReais(m.totalValue || 0)} · criada em ${dataTexto(m.createdAt)}
        </span>
      </div>
      <div class="maleta-linha-acoes">
        <button type="button" class="maleta-botao-sec" data-acao="abrir" data-id="${esc(m.id)}">
          ${m.status === STATUS_MALETA.MONTANDO ? 'Conferir' : 'Ver'}
        </button>
      </div>
    </div>`).join('');

  conteudo.innerHTML = `
    <div class="maleta-topo">
      <div>
        <h1 class="maleta-titulo">Maletas</h1>
        <p class="maleta-subtitulo">Monte, confira e imprima a maleta de cada vendedora.</p>
      </div>
      <button type="button" class="maleta-botao" data-acao="nova">+ Nova Maleta</button>
    </div>
    <div class="maleta-lista">
      ${linhas || '<p class="maleta-vazio">Nenhuma maleta montada ainda.</p>'}
    </div>`;
}

// ---------- NOVA MALETA ----------
function renderNova() {
  estado.rascunho = { sellerId: '', itens: [] };
  const opcoes = estado.vendedoras
    .map((v) => `<option value="${esc(v.uid)}">${esc(v.nome)}</option>`).join('');

  conteudo.innerHTML = `
    <div class="maleta-topo">
      <div>
        <h1 class="maleta-titulo">Nova Maleta</h1>
        <p class="maleta-subtitulo">Escolha a vendedora e adicione as peças.</p>
      </div>
      <button type="button" class="maleta-botao-sec" data-acao="voltar">← Voltar</button>
    </div>

    <div class="maleta-card">
      <div class="maleta-campo">
        <label for="campo-vendedora">Vendedora</label>
        <select id="campo-vendedora">
          <option value="">Selecione...</option>
          ${opcoes}
        </select>
      </div>
      <div class="maleta-linha-campo">
        <div class="maleta-campo">
          <label for="campo-busca">Buscar produto (nome, código curto ou código de barras)</label>
          <input id="campo-busca" type="search" autocomplete="off" placeholder="Ex.: AN105">
        </div>
        <button type="button" class="maleta-botao-sec" disabled title="Leitura por câmera chega em uma sessão futura">
          Ler código (em breve)
        </button>
        ${botaoFotosHtml()}
      </div>
      <div class="maleta-lista" id="resultados-busca"></div>
    </div>

    <div class="maleta-card">
      <h2 class="maleta-titulo">Peças da maleta</h2>
      <div class="maleta-lista" id="itens-rascunho"></div>
      <div class="maleta-resumo" id="resumo-rascunho"></div>
      <div class="maleta-barra-acoes">
        <button type="button" class="maleta-botao" id="botao-salvar-maleta" data-acao="salvar-maleta">
          Salvar e ir para a conferência
        </button>
        <button type="button" class="maleta-botao-sec" data-acao="voltar">Cancelar</button>
      </div>
    </div>`;

  document.getElementById('campo-vendedora').addEventListener('change', (e) => {
    estado.rascunho.sellerId = e.target.value;
  });
  document.getElementById('campo-busca').addEventListener('input', atualizarResultados);
  atualizarResultados();
  atualizarItensRascunho();
}

function qtdNoRascunho(productId) {
  return estado.rascunho.itens.filter((id) => id === productId).length;
}

function atualizarResultados() {
  const termo = normalizar(document.getElementById('campo-busca').value.trim());
  const alvo = document.getElementById('resultados-busca');
  const achados = estado.produtos.filter((p) => {
    if (!termo) return true;
    return [p.name, p.shortCode, p.barcodeId, p.category].some((c) => normalizar(c).includes(termo));
  }).slice(0, 30);

  if (!achados.length) {
    alvo.innerHTML = '<p class="maleta-vazio">Nenhum produto encontrado.</p>';
    return;
  }
  alvo.innerHTML = achados.map((p) => {
    const naEmpresa = saldoNaEmpresa(p);
    const e = estado.estoque ? estado.estoque.get(p.id) : null;
    const textoEstoque = e
      ? `na empresa: ${e.naEmpresa} · em maletas: ${e.emMaletas}`
      : `estoque: ${Number.isFinite(p.stockQuantity) ? p.stockQuantity : 0}`;
    const disponivel = naEmpresa - qtdNoRascunho(p.id);
    return `
      <div class="maleta-linha">
        <div class="maleta-linha-esquerda">
          ${miniaturaHtml(p)}
          <div class="maleta-linha-info">
            <span class="maleta-linha-nome">${esc(codigoDe(p))} — ${esc(p.name)}</span>
            <span class="maleta-linha-detalhe">
              ${esc(p.category || '')} · ${esc(p.color || '')} · ${esc(p.shape || '')} ·
              ${formatarCentavosParaReais(p.priceCash || 0)} · ${textoEstoque}
            </span>
          </div>
        </div>
        <div class="maleta-linha-acoes">
          <button type="button" class="maleta-botao-sec" data-acao="adicionar" data-id="${esc(p.id)}"
            ${disponivel <= 0 ? 'disabled' : ''}>
            ${disponivel <= 0 ? 'Sem estoque' : 'Adicionar'}
          </button>
        </div>
      </div>`;
  }).join('');
}

function atualizarItensRascunho() {
  const alvo = document.getElementById('itens-rascunho');
  const itens = estado.rascunho.itens;
  alvo.innerHTML = itens.length
    ? itens.map((id, i) => {
        const p = estado.mapaProdutos.get(id);
        return `
          <div class="maleta-linha">
            <div class="maleta-linha-esquerda">
              ${miniaturaHtml(p)}
              <div class="maleta-linha-info">
                <span class="maleta-linha-nome">${esc(codigoDe(p))} — ${esc(p?.name)}</span>
                <span class="maleta-linha-detalhe">${formatarCentavosParaReais(p?.priceCash || 0)}</span>
              </div>
            </div>
            <div class="maleta-linha-acoes">
              <button type="button" class="maleta-botao-perigo" data-acao="remover" data-indice="${i}">Remover</button>
            </div>
          </div>`;
      }).join('')
    : '<p class="maleta-vazio">Nenhuma peça adicionada.</p>';

  const total = itens.reduce((soma, id) => soma + (estado.mapaProdutos.get(id)?.priceCash || 0), 0);
  document.getElementById('resumo-rascunho').innerHTML = `
    <div class="maleta-resumo-item"><span class="maleta-resumo-valor">${itens.length}</span><span class="maleta-resumo-rotulo">peças</span></div>
    <div class="maleta-resumo-item"><span class="maleta-resumo-valor">${formatarCentavosParaReais(total)}</span><span class="maleta-resumo-rotulo">valor total (à vista)</span></div>`;
  atualizarResultados();
}

async function salvarMaleta() {
  const r = estado.rascunho;
  if (!r.sellerId) { mostrarToast('Escolha a vendedora antes de salvar.', 'erro'); return; }
  if (!r.itens.length) { mostrarToast('Adicione pelo menos uma peça à maleta.', 'erro'); return; }

  const botao = document.getElementById('botao-salvar-maleta');
  botao.disabled = true;
  try {
    // Recalcula o estoque na hora (dados frescos) e confere cada produto do rascunho.
    const estoqueFresco = await calcularEstoque([...estado.mapaProdutos.values()]);
    estado.estoque = estoqueFresco;

    const quantidades = new Map();
    r.itens.forEach((id) => quantidades.set(id, (quantidades.get(id) || 0) + 1));
    for (const [productId, quantidade] of quantidades) {
      const p = estado.mapaProdutos.get(productId);
      const naEmpresa = estoqueFresco.get(productId)?.naEmpresa ?? 0;
      if (quantidade > naEmpresa) {
        mostrarToast(`${codigoDe(p)} — só há ${Math.max(0, naEmpresa)} na empresa agora (a maleta pede ${quantidade}).`, 'erro', 5000);
        atualizarResultados();
        botao.disabled = false;
        return;
      }
    }

    const vendedora = estado.vendedoras.find((v) => v.uid === r.sellerId);
    const bagRef = doc(collection(db, 'bags'));
    let total = 0;

    // Primeiro grava as peças; a maleta só é gravada por último. Se algo
    // falhar no meio, não aparece maleta pela metade na lista.
    for (const productId of r.itens) {
      const p = estado.mapaProdutos.get(productId);
      const preco = p?.priceCash || 0;
      total += preco;
      await setDoc(doc(collection(db, 'bagItems')), {
        bagId: bagRef.id,
        sellerId: r.sellerId,
        productId,
        unitPrice: preco,
        status: STATUS_ITEM_MALETA.NA_MALETA,
        confirmedAt: null,
        createdAt: serverTimestamp()
      });
    }
    await setDoc(bagRef, {
      sellerId: r.sellerId,
      sellerName: vendedora ? vendedora.nome : '',
      status: STATUS_MALETA.MONTANDO,
      totalItems: r.itens.length,
      totalValue: total,
      deliveredAt: null,
      createdAt: serverTimestamp()
    });

    mostrarToast('✅ Maleta salva. Agora confira as peças.', 'sucesso');
    await carregarMaletas();
    await carregarEstoque();
    await abrirMaleta(bagRef.id);
  } catch (erro) {
    console.error(erro);
    mostrarToast('Não foi possível salvar a maleta. Verifique a conexão e tente de novo.', 'erro');
    botao.disabled = false;
  }
}

// ---------- CONFERÊNCIA / DETALHE ----------
async function abrirMaleta(bagId) {
  try {
    const bag = estado.maletas.find((m) => m.id === bagId);
    if (!bag) { mostrarToast('Maleta não encontrada.', 'erro'); return; }
    const snap = await getDocs(query(collection(db, 'bagItems'), where('bagId', '==', bagId)));
    const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => codigoDe(estado.mapaProdutos.get(a.productId))
        .localeCompare(codigoDe(estado.mapaProdutos.get(b.productId))));
    estado.aberta = { bag, itens };
    renderConferencia();
  } catch (erro) {
    console.error(erro);
    mostrarToast('Não foi possível abrir a maleta. Verifique a conexão.', 'erro');
  }
}

function renderConferencia(focarCodigo = false) {
  const { bag, itens } = estado.aberta;
  const emConferencia = bag.status === STATUS_MALETA.MONTANDO;
  const conferidos = itens.filter((i) => i.confirmedAt).length;
  const completo = itens.length > 0 && conferidos === itens.length;
  const total = itens.reduce((s, i) => s + (i.unitPrice ?? estado.mapaProdutos.get(i.productId)?.priceCash ?? 0), 0);

  const linhas = itens.map((i) => {
    const p = estado.mapaProdutos.get(i.productId);
    const ok = !!i.confirmedAt;
    return `
      <div class="maleta-linha ${ok ? 'maleta-linha-conferida' : ''}">
        <div class="maleta-linha-esquerda">
          ${miniaturaHtml(p)}
          <div class="maleta-linha-info">
            <span class="maleta-linha-nome">${ok ? '✅ ' : ''}${esc(codigoDe(p))} — ${esc(p?.name || 'Produto removido')}</span>
            <span class="maleta-linha-detalhe">
              ${esc(p?.color || '')} · ${esc(p?.shape || '')} · ${formatarCentavosParaReais(i.unitPrice || 0)}
            </span>
          </div>
        </div>
        ${emConferencia ? `
        <div class="maleta-linha-acoes">
          <button type="button" class="${ok ? 'maleta-botao-sec' : 'maleta-botao'}"
            data-acao="alternar-item" data-id="${esc(i.id)}">${ok ? 'Desfazer' : 'Conferir'}</button>
        </div>` : ''}
      </div>`;
  }).join('');

  conteudo.innerHTML = `
    <div class="maleta-topo">
      <div>
        <h1 class="maleta-titulo">Maleta de ${esc(bag.sellerName || 'Vendedora')} ${badge(bag.status)}</h1>
        <p class="maleta-subtitulo">Criada em ${dataTexto(bag.createdAt)}${bag.deliveredAt ? ' · entregue em ' + dataTexto(bag.deliveredAt) : ''}</p>
      </div>
      <button type="button" class="maleta-botao-sec" data-acao="voltar">← Voltar</button>
    </div>

    <div class="maleta-card">
      <div class="maleta-resumo">
        ${emConferencia ? `
        <div class="maleta-resumo-item">
          <span class="maleta-contador ${completo ? 'maleta-contador-completo' : ''}">${conferidos} de ${itens.length}</span>
          <span class="maleta-resumo-rotulo">conferidos</span>
        </div>` : ''}
        <div class="maleta-resumo-item"><span class="maleta-resumo-valor">${itens.length}</span><span class="maleta-resumo-rotulo">peças no total</span></div>
        <div class="maleta-resumo-item"><span class="maleta-resumo-valor">${formatarCentavosParaReais(total)}</span><span class="maleta-resumo-rotulo">valor total (à vista)</span></div>
      </div>
      ${emConferencia ? `
      <div class="maleta-linha-campo">
        <div class="maleta-campo">
          <label for="campo-codigo">Digite ou leia o código (curto ou de barras) e tecle Enter</label>
          <input id="campo-codigo" type="text" autocomplete="off" placeholder="Ex.: AN105">
        </div>
        <button type="button" class="maleta-botao-sec" disabled title="Leitura por câmera chega em uma sessão futura">
          Ler código (em breve)
        </button>
      </div>` : ''}
      <div class="maleta-barra-acoes">${botaoFotosHtml()}</div>
    </div>

    <div class="maleta-lista">${linhas || '<p class="maleta-vazio">Esta maleta não tem peças.</p>'}</div>

    <div class="maleta-barra-acoes">
      ${emConferencia ? `
        <button type="button" class="maleta-botao" data-acao="entregar" ${completo ? '' : 'disabled'}>
          Entregar maleta (marcar como Aberta)
        </button>` : ''}
      <button type="button" class="maleta-botao-sec" data-acao="imprimir">A4 simples</button>
      <button type="button" class="maleta-botao-sec" data-acao="imprimir-fotos">A4 com fotos</button>
    </div>
    ${emConferencia && !completo ? '<p class="maleta-aviso">A maleta só pode ser entregue depois de todas as peças estarem conferidas.</p>' : ''}`;

  const campo = document.getElementById('campo-codigo');
  if (campo) {
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); conferirPorCodigo(campo.value); }
    });
    if (focarCodigo) campo.focus();
  }
}

async function gravarConferencia(item, conferido) {
  try {
    await updateDoc(doc(db, 'bagItems', item.id), { confirmedAt: conferido ? serverTimestamp() : null });
    item.confirmedAt = conferido ? new Date() : null;
    return true;
  } catch (erro) {
    console.error(erro);
    mostrarToast('Não foi possível gravar a conferência. Verifique a conexão.', 'erro');
    return false;
  }
}

async function conferirPorCodigo(textoDigitado) {
  const codigo = textoDigitado.trim().toUpperCase();
  if (!codigo) return;
  const { itens } = estado.aberta;
  const casa = (i) => {
    const p = estado.mapaProdutos.get(i.productId);
    return p && (String(p.shortCode || '').toUpperCase() === codigo || String(p.barcodeId || '').toUpperCase() === codigo);
  };
  const doCodigo = itens.filter(casa);
  if (!doCodigo.length) { mostrarToast('Esse código não pertence a esta maleta.', 'erro'); renderConferencia(true); return; }
  const pendente = doCodigo.find((i) => !i.confirmedAt);
  if (!pendente) { mostrarToast('Todas as peças com esse código já foram conferidas.', 'info'); renderConferencia(true); return; }
  if (await gravarConferencia(pendente, true)) mostrarToast('✅ Peça conferida.', 'sucesso', 1200);
  renderConferencia(true);
}

async function alternarItem(itemId) {
  const item = estado.aberta.itens.find((i) => i.id === itemId);
  if (!item) return;
  await gravarConferencia(item, !item.confirmedAt);
  renderConferencia();
}

async function entregarMaleta() {
  const { bag, itens } = estado.aberta;
  if (!itens.length || itens.some((i) => !i.confirmedAt)) {
    mostrarToast('Confira todas as peças antes de entregar.', 'erro');
    return;
  }
  try {
    await updateDoc(doc(db, 'bags', bag.id), { status: STATUS_MALETA.ABERTA, deliveredAt: serverTimestamp() });
    mostrarToast('✅ Maleta entregue e marcada como Aberta.', 'sucesso');
    await carregarMaletas();
    await carregarEstoque();
    await abrirMaleta(bag.id);
  } catch (erro) {
    console.error(erro);
    mostrarToast('Não foi possível entregar a maleta. Verifique a conexão.', 'erro');
  }
}

// ---------- EMISSÃO A4 ----------
// Abre uma nova aba com uma página simples e chama a impressão do navegador.
// comFotos = false → "A4 simples" (igual ao anterior).
// comFotos = true  → "A4 com fotos" (coluna extra com miniatura de cada peça).
function imprimirA4(comFotos = false) {
  const { bag, itens } = estado.aberta;
  const total = itens.reduce((s, i) => s + (i.unitPrice || 0), 0);
  const linhas = itens.map((i, n) => {
    const p = estado.mapaProdutos.get(i.productId);
    const celulaFoto = comFotos
      ? `<td class="celula-foto">${p && p.photoUrl ? `<img class="foto" src="${esc(p.photoUrl)}" alt="">` : ''}</td>`
      : '';
    return `<tr>
      <td>${n + 1}</td>${celulaFoto}<td>${esc(codigoDe(p))}</td><td>${esc(p?.name || '')}</td>
      <td>${esc(p?.color || '')}</td><td>${esc(p?.shape || '')}</td>
      <td class="valor">${formatarCentavosParaReais(i.unitPrice || 0)}</td></tr>`;
  }).join('');

  const cabecalhoFoto = comFotos ? '<th>Foto</th>' : '';
  const estiloFoto = comFotos
    ? `
  .celula-foto { width: 18mm; }
  .foto { width: 16mm; height: 16mm; object-fit: cover; display: block; }`
    : '';
  const tituloAba = comFotos ? `Maleta — ${esc(bag.sellerName)} (com fotos)` : `Maleta — ${esc(bag.sellerName)}`;
  const scriptImpressao = comFotos
    ? `window.onload = function () {
    var imagens = document.images;
    for (var k = 0; k < imagens.length; k++) {
      if (!imagens[k].naturalWidth) { imagens[k].style.display = 'none'; }
    }
    window.print();
  };`
    : 'window.onload = function () { window.print(); };';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${tituloAba}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .cabecalho { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .cabecalho p { margin: 2px 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  .valor { text-align: right; white-space: nowrap; }
  tr { page-break-inside: avoid; }${estiloFoto}
</style></head><body>
<div class="cabecalho">
  <h1>JewelMaster — Lista da Maleta</h1>
  <p><strong>Vendedora:</strong> ${esc(bag.sellerName)}</p>
  <p><strong>Data:</strong> ${esc(dataTexto(bag.deliveredAt || bag.createdAt || new Date()))}
     &nbsp;·&nbsp; <strong>Total de peças:</strong> ${itens.length}
     &nbsp;·&nbsp; <strong>Valor total:</strong> ${formatarCentavosParaReais(total)}</p>
</div>
<table><thead><tr><th>#</th>${cabecalhoFoto}<th>Código</th><th>Produto</th><th>Cor</th><th>Formato</th><th class="valor">Valor à vista</th></tr></thead>
<tbody>${linhas}</tbody></table>
<script>${scriptImpressao}<\/script>
</body></html>`;

  const janela = window.open('', '_blank');
  if (!janela) { mostrarToast('O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.', 'erro'); return; }
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
}

// ---------- eventos (delegação) ----------
conteudo.addEventListener('click', async (e) => {
  const botao = e.target.closest('[data-acao]');
  if (!botao) return;
  const { acao, id, indice } = botao.dataset;

  if (acao === 'nova') renderNova();
  else if (acao === 'voltar') { await carregarMaletas().catch(() => {}); renderLista(); }
  else if (acao === 'abrir') await abrirMaleta(id);
  else if (acao === 'adicionar') {
    const p = estado.mapaProdutos.get(id);
    if (p && qtdNoRascunho(id) < saldoNaEmpresa(p)) {
      estado.rascunho.itens.push(id);
      atualizarItensRascunho();
    }
  }
  else if (acao === 'remover') { estado.rascunho.itens.splice(Number(indice), 1); atualizarItensRascunho(); }
  else if (acao === 'salvar-maleta') await salvarMaleta();
  else if (acao === 'alternar-item') await alternarItem(id);
  else if (acao === 'entregar') await entregarMaleta();
  else if (acao === 'imprimir') imprimirA4(false);
  else if (acao === 'imprimir-fotos') imprimirA4(true);
  else if (acao === 'alternar-fotos') {
    estado.mostrarFotos = !estado.mostrarFotos;
    gravarPreferenciaFotos(estado.mostrarFotos);
    if (estado.rascunho) { atualizarItensRascunho(); atualizarBotoesFotos(); }   // só re-renderiza as listas
    else if (estado.aberta) renderConferencia();
  }
});

// ---------- inicialização ----------
let iniciou = false;
observarSessao(async (user) => {
  if (iniciou) return;
  if (!user) { location.href = '../00-login/login.html'; return; }
  try {
    const perfil = await buscarPerfilUsuarioLogado(user.uid);
    if (!perfil || !ehAdmin(perfil)) { location.href = '../01-inicio/inicio.html'; return; }
    iniciou = true;

    aplicarTema(perfil.theme || obterTemaSalvoLocalmente());
    document.body.prepend(criarCabecalho({
      nomeUsuario: perfil.name,
      aoSair: async () => { await sair(); location.href = '../00-login/login.html'; },
      aoAlternarTema: (novoTema) => salvarTemaDoUsuario(user.uid, novoTema)
    }));
    document.getElementById('menu-lateral').appendChild(criarMenuLateralAdmin({ itemAtivo: 'maletas' }));

    estado.mostrarFotos = lerPreferenciaFotos();

    conteudo.innerHTML = '<p class="maleta-vazio">Carregando...</p>';
    await Promise.all([carregarProdutos(), carregarVendedoras(), carregarMaletas()]);
    await carregarEstoque();
    renderLista();
  } catch (erro) {
    console.error(erro);
    conteudo.innerHTML = '<p class="maleta-vazio">Não foi possível carregar as maletas. Verifique a conexão e recarregue a página.</p>';
  }
});
