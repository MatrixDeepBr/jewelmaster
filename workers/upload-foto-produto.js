// workers/upload-foto-produto.js
// Worker da Cloudflare: recebe uma foto de produto (enviada pela tela
// "Produtos" do Admin) e salva no bucket R2, devolvendo a URL pública
// final para ser gravada no campo "photoUrl" do produto, no Firestore.
//
// Por que isso é um Worker, e não upload direto do navegador para o R2:
// fazer o upload direto exigiria colocar uma chave de acesso secreta
// dentro do código do site — qualquer visitante conseguiria ver essa
// chave abrindo o navegador. Aqui, em vez disso, o bucket é "ligado"
// a este Worker por uma R2 Bucket Binding, configurada pelo painel da
// Cloudflare (sem chave nenhuma para guardar/copiar). O Worker só grava
// a foto depois de confirmar que quem está pedindo é realmente a Admin
// logada — mesmo padrão de verificação já usado no Worker de criação de
// login de vendedora (Sessão 2).
//
// ⚠️ ANTES DE PUBLICAR, preencha as duas constantes abaixo.
// ⚠️ DEPOIS DE PUBLICAR, é preciso ligar o bucket R2 a este Worker pela
//    aba "Settings" > "Bindings" > "Add" > "R2 Bucket", usando o nome
//    de variável BUCKET_FOTOS_PRODUTOS (ver passo a passo no relatório
//    desta sessão).

const FIREBASE_API_KEY = 'COLE_AQUI_A_MESMA_APIKEY_DO_FIREBASE_CONFIG';
const FIREBASE_PROJECT_ID = 'joias-app-d295e';

// Endereço público do bucket, gerado pela Cloudflare quando você liga
// "Public Development URL" nas configurações do bucket R2
// (algo como "https://pub-XXXXXXXXXXXXXXXX.r2.dev").
const URL_PUBLICA_BUCKET = 'COLE_AQUI_O_ENDERECO_PUBLICO_DO_BUCKET';

// Único endereço de onde aceitamos chamadas (o site publicado).
const ORIGEM_PERMITIDA = 'https://collornewrp-beep.github.io';

const CABECALHOS_CORS = {
  'Access-Control-Allow-Origin': ORIGEM_PERMITIDA,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export default {
  async fetch(request, env) {
    // Requisição de "pré-voo" do navegador (parte do funcionamento de
    // CORS) — o navegador manda isso antes do POST de verdade, só para
    // perguntar se pode. Aqui só respondemos "pode".
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CABECALHOS_CORS });
    }

    if (request.method !== 'POST') {
      return respostaErro('Método não permitido.', 405);
    }

    try {
      // 1) Confere quem está chamando: precisa ser a Admin logada.
      const cabecalhoAutorizacao = request.headers.get('Authorization') || '';
      const idToken = cabecalhoAutorizacao.replace('Bearer ', '');

      if (!idToken) {
        return respostaErro('Não autenticado.', 401);
      }

      const uid = await validarTokenEDevolverUid(idToken);
      if (!uid) {
        return respostaErro('Sessão inválida ou expirada. Saia e entre novamente.', 401);
      }

      const chamadaEhDeAdmin = await confirmarQueEhAdmin(uid, idToken);
      if (!chamadaEhDeAdmin) {
        return respostaErro('Apenas a Admin pode enviar fotos de produto.', 403);
      }

      // 2) Lê os dados enviados pela tela: o arquivo da imagem + o
      //    barcodeId do produto (usado como nome do arquivo salvo).
      const dadosFormulario = await request.formData();
      const arquivo = dadosFormulario.get('foto');
      const barcodeId = dadosFormulario.get('barcodeId');

      if (!arquivo || typeof arquivo === 'string') {
        return respostaErro('Nenhuma foto foi recebida.', 400);
      }
      if (!barcodeId) {
        return respostaErro('Faltou o código do produto (barcodeId).', 400);
      }

      const tiposAceitos = ['image/jpeg', 'image/png', 'image/webp'];
      if (!tiposAceitos.includes(arquivo.type)) {
        return respostaErro('Formato de imagem não suportado. Use JPG, PNG ou WEBP.', 400);
      }

      // 3) Salva no bucket R2, usando a ligação (binding) configurada
      //    pelo painel — env.BUCKET_FOTOS_PRODUTOS só existe depois
      //    desse passo ser feito.
      if (!env.BUCKET_FOTOS_PRODUTOS) {
        return respostaErro('O bucket de fotos ainda não foi ligado a este Worker (falta configurar o Binding).', 500);
      }

      const extensao = arquivo.type === 'image/png' ? 'png' : (arquivo.type === 'image/webp' ? 'webp' : 'jpg');
      const nomeArquivo = `produtos/${barcodeId}.${extensao}`;

      await env.BUCKET_FOTOS_PRODUTOS.put(nomeArquivo, arquivo.stream(), {
        httpMetadata: { contentType: arquivo.type }
      });

      const urlFinalDaFoto = `${URL_PUBLICA_BUCKET}/${nomeArquivo}`;

      return new Response(JSON.stringify({ ok: true, photoUrl: urlFinalDaFoto }), {
        status: 200,
        headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json' }
      });

    } catch (erro) {
      return respostaErro('Erro inesperado no servidor: ' + erro.message, 500);
    }
  }
};

// Confirma que o token é válido e devolve o uid de quem está logada.
// Usa a mesma API pública do Identity Toolkit já usada no Worker de
// criação de login de vendedora (Sessão 2).
async function validarTokenEDevolverUid(idToken) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    }
  );
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  return dados.users?.[0]?.localId || null;
}

// Lê users/{uid} pela API REST do Firestore (usando o mesmo token de
// quem está chamando) e confere se o campo role é "admin".
async function confirmarQueEhAdmin(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (!resposta.ok) return false;
  const documento = await resposta.json();
  const role = documento.fields?.role?.stringValue;
  return role === 'admin';
}

function respostaErro(mensagem, status) {
  return new Response(JSON.stringify({ ok: false, erro: mensagem }), {
    status,
    headers: { ...CABECALHOS_CORS, 'Content-Type': 'application/json' }
  });
}
