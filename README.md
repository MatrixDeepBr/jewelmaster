# JewelMaster — Gestor de Vendas de Joias

Sistema de gestão para revenda de joias com equipe de vendedoras
("sacoleiras"): estoque, montagem/conferência de maletas por código de
barras, vendas (com suporte offline), clientes e fiado, fechamento
financeiro por comissão, e painel administrativo.

## Tecnologia

- **HTML + CSS + JavaScript puro**, sem processo de build (sem Node.js,
  sem `npm`, sem terminal no dia a dia). Os arquivos rodam direto no
  navegador.
- **Firebase** (Authentication + Firestore), carregado por importação
  direta do CDN oficial (`gstatic.com`) — ver `core/firebase-config.js`.
- **Cloudflare R2** para fotos de produto (a partir da Sessão 3).
- **GitHub Pages** para hospedar o site.

## Estrutura de pastas

```
/joias-app
  /core          núcleo compartilhado por todas as telas
  /telas         uma pasta por tela (numeradas na ordem de construção)
  /assets        ícones do PWA e logos
  /workers       peças de servidor (Cloudflare Workers)
  manifest.json  configuração do PWA
  sw.js          service worker (funcionamento offline)
  firestore.rules  regras de segurança do banco de dados
  index.html     porta de entrada (redireciona pro login ou pro início)
```

Ver `core/tokens.css` para a paleta de cores e demais variáveis visuais.

## ⚠️ Antes de usar: publicar as regras do Firestore

O arquivo `firestore.rules` deste projeto **não vale nada sozinho** — ele
precisa ser colado manualmente no Firebase Console (Firestore Database >
aba "Regras" > Publicar) toda vez que for alterado. Sem isso, o Firestore
bloqueia tudo e o app não funciona, mesmo com o código certo.

O passo a passo completo de configuração (Firebase, publicação no GitHub
Pages, instalação como app no celular) está no relatório entregue junto
com esta sessão de código.

## Atualizando o site depois de publicado

Se você mudar algum arquivo e publicar de novo, mas o celular/navegador
continuar mostrando a versão antiga:

- **No computador:** recarregue forçado (Ctrl + Shift + R).
- **No celular:** feche o app/aba completamente e abra de novo; se
  persistir, aumente o número em `VERSAO_CACHE` no início do arquivo
  `sw.js` antes de publicar — isso força todo mundo a buscar os arquivos
  novos.

## Convenção de commits (GitHub)

```
feat: tela de cadastro de vendedoras
fix: comissão calculada errado no tipo valorFixoPorPeca
style: ajusta espaçamento dos cards de produto
docs: atualiza README
```
