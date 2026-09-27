// core/navegacao.js
// Monta o cabeçalho compartilhado por todas as telas logadas: nome do
// app (JewelMaster), nome de quem está logada, botão de tema e botão
// "Sair". Também monta o menu lateral do Admin (usado dentro do
// elemento com classe "area-menu-lateral", reservado no cabeçalho).
//
// Uso típico numa tela:
//   import { criarCabecalho, criarMenuLateralAdmin } from '../../core/navegacao.js';
//   document.body.prepend(criarCabecalho({
//     nomeUsuario: perfil.name,
//     aoSair: async () => { await sair(); location.href = '../00-login/login.html'; },
//     aoAlternarTema: (novoTema) => salvarTemaDoUsuario(perfil.uid, novoTema)
//   }));
//   document.getElementById('menu-lateral')
//     .appendChild(criarMenuLateralAdmin({ itemAtivo: 'vendedoras' }));

import { criarBotaoSeletorTema } from './components.js';

export function criarCabecalho({ nomeUsuario, aoSair, aoAlternarTema }) {
  const cabecalho = document.createElement('header');
  cabecalho.className = 'cabecalho-app';

  const marca = document.createElement('div');
  marca.className = 'cabecalho-app__marca';
  marca.innerHTML = `
    <span class="cabecalho-app__nome-app">JewelMaster</span>
    <span class="cabecalho-app__nome-usuario">${nomeUsuario || ''}</span>
  `;

  const acoes = document.createElement('div');
  acoes.className = 'cabecalho-app__acoes';

  const botaoTema = criarBotaoSeletorTema(aoAlternarTema);

  const botaoSair = document.createElement('button');
  botaoSair.type = 'button';
  botaoSair.className = 'botao botao-secundario';
  botaoSair.textContent = 'Sair';
  botaoSair.addEventListener('click', () => {
    if (typeof aoSair === 'function') aoSair();
  });

  acoes.append(botaoTema, botaoSair);
  cabecalho.append(marca, acoes);

  return cabecalho;
}

// Acrescentado na Sessão 2: menu lateral usado pelas telas do Admin.
// Sessões futuras (Maletas, Vendas, Clientes, Fechamento) devem
// acrescentar seus próprios itens na lista "itens" abaixo, sem
// duplicar este menu em outro arquivo.
export function criarMenuLateralAdmin({ itemAtivo } = {}) {
  const itens = [
    { rotulo: 'Início', href: '../01-inicio/inicio.html', chave: 'inicio' },
    { rotulo: 'Vendedoras', href: '../02-vendedoras/vendedoras.html', chave: 'vendedoras' },
    // Acrescentado na Sessão 3:
    { rotulo: 'Produtos', href: '../03-produtos/produtos.html', chave: 'produtos' }
    // Sessões futuras: acrescentar itens aqui.
  ];

  const nav = document.createElement('div');
  nav.className = 'menu-lateral-conteudo';
  itens.forEach((item) => {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.rotulo;
    link.className = 'item-menu-lateral' + (item.chave === itemAtivo ? ' item-menu-lateral-ativo' : '');
    nav.appendChild(link);
  });
  return nav;
}
