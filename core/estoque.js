// core/estoque.js — Cálculo de estoque do JewelMaster.
//
// MODELO DE ESTOQUE (ver DECISOES_TOMADAS.md → "Modelo de estoque com maletas"):
//  1. products.stockQuantity = total da empresa daquele produto (físicas + em maletas).
//     Nada é abatido ao montar ou entregar uma maleta.
//  2. Em maletas = bagItems com status "inBag" (ou sem status) de maletas "montando" ou "open".
//  3. Vendidas   = bagItems com status "sold" (em qualquer maleta que exista).
//  4. Na empresa = total − em maletas − vendidas (pode ficar negativo; isso é um alerta, não é escondido).
//  5. bagItems cuja maleta não existe (sobra de gravação interrompida) são ignorados.
//
// Tudo é calculado na hora, a partir das peças — nunca subtraindo um contador.

import { db, collection, getDocs } from './firebase-config.js';

// Valores possíveis do campo bagItems.status (a Sessão 5 reutiliza).
export const STATUS_ITEM_MALETA = {
  NA_MALETA: 'inBag',
  VENDIDO: 'sold',
  TRANSFERIDO: 'transferred'
};

const STATUS_MALETAS_ATIVAS = ['montando', 'open'];

// Recebe a lista de produtos ({ id, stockQuantity, ... }) e devolve um Map
// productId -> { total, emMaletas, vendidas, naEmpresa, porVendedora }.
export async function calcularEstoque(listaDeProdutos) {
  const [resultadoMaletas, resultadoItens] = await Promise.all([
    getDocs(collection(db, 'bags')),
    getDocs(collection(db, 'bagItems'))
  ]);

  const maletas = new Map();
  resultadoMaletas.forEach((d) => maletas.set(d.id, d.data()));

  const estoque = new Map();
  const porVendedoraTemp = new Map(); // productId -> Map(sellerId -> { sellerId, sellerName, quantidade })

  listaDeProdutos.forEach((produto) => {
    estoque.set(produto.id, {
      total: Number.isFinite(produto.stockQuantity) ? produto.stockQuantity : 0,
      emMaletas: 0,
      vendidas: 0,
      naEmpresa: 0,
      porVendedora: []
    });
  });

  resultadoItens.forEach((d) => {
    const item = d.data();
    const registro = estoque.get(item.productId);
    if (!registro) return; // produto fora da lista recebida

    const maleta = maletas.get(item.bagId);
    if (!maleta) return; // item órfão: ignorado

    const statusItem = item.status || STATUS_ITEM_MALETA.NA_MALETA;

    if (statusItem === STATUS_ITEM_MALETA.VENDIDO) {
      registro.vendidas += 1;
      return;
    }

    if (statusItem === STATUS_ITEM_MALETA.NA_MALETA && STATUS_MALETAS_ATIVAS.includes(maleta.status)) {
      registro.emMaletas += 1;

      const sellerId = item.sellerId || maleta.sellerId || '';
      if (!porVendedoraTemp.has(item.productId)) porVendedoraTemp.set(item.productId, new Map());
      const mapaVendedoras = porVendedoraTemp.get(item.productId);
      if (!mapaVendedoras.has(sellerId)) {
        mapaVendedoras.set(sellerId, { sellerId, sellerName: maleta.sellerName || '', quantidade: 0 });
      }
      mapaVendedoras.get(sellerId).quantidade += 1;
    }
  });

  estoque.forEach((registro, productId) => {
    registro.naEmpresa = registro.total - registro.emMaletas - registro.vendidas;
    const mapaVendedoras = porVendedoraTemp.get(productId);
    if (mapaVendedoras) {
      registro.porVendedora = [...mapaVendedoras.values()]
        .sort((a, b) => (a.sellerName || '').localeCompare(b.sellerName || '', 'pt-BR'));
    }
  });

  return estoque;
}
