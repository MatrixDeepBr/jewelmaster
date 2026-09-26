// criar-login-vendedora.js
// Worker da Cloudflare — cria o login (Firebase Authentication) de uma nova vendedora.
//
// Por que isso existe num "Worker" (servidor) e não direto no navegador:
// se a tela da Admin criasse o login da vendedora chamando o Firebase direto do navegador,
// isso trocaria a sessão logada e a própria Admin seria deslogada no processo.
// Este Worker roda separado, confere que quem está pedindo é mesmo a Admin, e só então cria o login.
//
// COMO PUBLICAR (sem terminal, sem npm): ver passo a passo no relatório da Sessão 2.

// ⚠️ PREENCHER: cole aqui a mesma "apiKey" que já está em core/firebase-config.js
// (é uma chave pública do projeto Firebase, não é segredo).
const FIREBASE_API_KEY = "AIzaSyBgcOyFrDLZi7GT25gPpDB-GjxzHO2WGRY";

// Projeto Firebase do JewelMaster (já usado desde a Sessão 1)
const FIREBASE_PROJECT_ID = "joias-app-d295e";

// Endereço do site publicado no GitHub Pages — só chamadas vindas daqui são aceitas.
const ORIGEM_PERMITIDA = "https://collornewrp-beep.github.io";

export default {
  async fetch(request) {
    // Trata a checagem prévia de CORS que o navegador faz antes do POST de verdade.
    if (request.method === "OPTIONS") {
      return respostaComCors(new Response(null, { status: 204 }));
    }

    if (request.method !== "POST") {
      return respostaComCors(
        new Response(JSON.stringify({ erro: "Método não permitido." }), { status: 405 })
      );
    }

    try {
      const corpo = await request.json();
      const { email, senha, nome } = corpo;

      if (!email || !senha || !nome) {
        return erroJson("Faltam dados: e-mail, senha e nome são obrigatórios.", 400);
      }

      // 1) Pega o token de identidade da Admin, enviado no cabeçalho Authorization.
      const cabecalhoAuth = request.headers.get("Authorization") || "";
      const idToken = cabecalhoAuth.replace("Bearer ", "").trim();
      if (!idToken) {
        return erroJson("Token de identidade não enviado.", 401);
      }

      // 2) Confere se o token é válido, perguntando ao próprio Google/Firebase.
      //    (evita ter que implementar verificação de assinatura JWT manualmente)
      const uidDeQuemChamou = await validarTokenEDevolverUid(idToken);
      if (!uidDeQuemChamou) {
        return erroJson("Token de identidade inválido ou expirado.", 401);
      }

      // 3) Confere se quem chamou é realmente Admin, lendo o próprio documento
      //    dela em users/{uid} pela API REST do Firestore (usando o mesmo token —
      //    as regras do Firestore já permitem que qualquer usuário leia o próprio documento).
      const ehAdmin = await confirmarQueEhAdmin(uidDeQuemChamou, idToken);
      if (!ehAdmin) {
        return erroJson("Só uma administradora pode criar login de vendedora.", 403);
      }

      // 4) Cria o novo usuário no Firebase Authentication (API pública do Identity Toolkit).
      const resultadoCriacao = await criarUsuarioNoFirebaseAuth(email, senha);
      if (resultadoCriacao.erro) {
        return erroJson(resultadoCriacao.erro, 400);
      }

      return respostaComCors(
        new Response(JSON.stringify({ uid: resultadoCriacao.uid }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    } catch (erroGeral) {
      return erroJson("Erro inesperado no servidor: " + erroGeral.message, 500);
    }
  }
};

// --- Funções auxiliares ---

async function validarTokenEDevolverUid(idToken) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    }
  );
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  return dados.users?.[0]?.localId || null;
}

async function confirmarQueEhAdmin(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (!resposta.ok) return false;
  const documento = await resposta.json();
  const role = documento?.fields?.role?.stringValue;
  return role === "admin";
}

async function criarUsuarioNoFirebaseAuth(email, senha) {
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha, returnSecureToken: false })
    }
  );
  const dados = await resposta.json();
  if (!resposta.ok) {
    const codigo = dados.error?.message || "";
    if (codigo.includes("EMAIL_EXISTS")) {
      return { erro: "Já existe um login com esse e-mail." };
    }
    if (codigo.includes("WEAK_PASSWORD")) {
      return { erro: "A senha é muito fraca (mínimo 6 caracteres)." };
    }
    return { erro: "Não foi possível criar o login: " + codigo };
  }
  return { uid: dados.localId };
}

function erroJson(mensagem, status) {
  return respostaComCors(
    new Response(JSON.stringify({ erro: mensagem }), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}

function respostaComCors(resposta) {
  const novaResposta = new Response(resposta.body, resposta);
  novaResposta.headers.set("Access-Control-Allow-Origin", ORIGEM_PERMITIDA);
  novaResposta.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  novaResposta.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return novaResposta;
}
