// core/auth.js
// Funções de autenticação: login, logout, observar sessão e buscar o
// perfil da pessoa logada na coleção `users`.

import {
  auth,
  db,
  doc,
  getDoc,
  updateDoc,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './firebase-config.js';

// Traduz os códigos de erro mais comuns do Firebase Authentication para
// mensagens simples em português, para mostrar na tela de login.
export function traduzirErroAuth(erro) {
  const codigo = erro && erro.code ? erro.code : '';

  const mensagens = {
    'auth/invalid-email': 'Esse e-mail não parece válido. Confira e tente de novo.',
    'auth/user-disabled': 'Esse usuário está desativado. Fale com a administradora.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet. Verifique o Wi-Fi ou os dados móveis.',
    'auth/unauthorized-domain': 'Este endereço do site ainda não foi autorizado no Firebase. Peça para adicionar este domínio em Authentication > Configurações > Domínios autorizados.',
    'auth/missing-password': 'Digite a senha.',
    'permission-denied': 'O Firestore recusou o acesso. As regras de segurança (firestore.rules) provavelmente não foram publicadas no Firebase Console ainda.'
  };

  return mensagens[codigo] || `Não foi possível entrar (${codigo || 'erro desconhecido'}). Tente novamente.`;
}

// Erro específico para quando o login funciona, mas não existe documento
// correspondente em `users/{uid}`.
export class PerfilNaoEncontradoError extends Error {
  constructor() {
    super('Perfil não encontrado em users/{uid}.');
    this.name = 'PerfilNaoEncontradoError';
  }
}

// Faz login com e-mail e senha. Devolve o perfil (documento de `users`)
// já carregado, ou lança um erro (Firebase ou PerfilNaoEncontradoError).
export async function entrarComEmailSenha(email, senha) {
  const credencial = await signInWithEmailAndPassword(auth, email, senha);
  const perfil = await buscarPerfilUsuarioLogado(credencial.user.uid);

  if (!perfil) {
    // Usuário existe no Authentication, mas não tem documento em `users`.
    await signOut(auth);
    throw new PerfilNaoEncontradoError();
  }

  return perfil;
}

// Busca o documento users/{uid}. Devolve null se não existir.
// Pode lançar um erro do Firestore com code 'permission-denied' se as
// regras não estiverem publicadas.
export async function buscarPerfilUsuarioLogado(uid) {
  const referencia = doc(db, 'users', uid);
  const instantaneo = await getDoc(referencia);

  if (!instantaneo.exists()) {
    return null;
  }

  return { uid: instantaneo.id, ...instantaneo.data() };
}

// Encerra a sessão atual.
export async function sair() {
  await signOut(auth);
}

// Observa mudanças no estado de login (chamado uma vez ao carregar cada
// tela). `callback` recebe o usuário do Firebase Auth (ou null se
// deslogada) — cada tela decide o que fazer a partir disso.
export function observarSessao(callback) {
  return onAuthStateChanged(auth, callback);
}

// Grava o tema escolhido (light/dark) no documento da usuária logada.
// É a ÚNICA escrita em `users/{uid}` permitida pelas regras desta sessão
// (ver firestore.rules) — por isso só atualiza o campo `theme`.
export async function salvarTemaDoUsuario(uid, tema) {
  const referencia = doc(db, 'users', uid);
  await updateDoc(referencia, { theme: tema });
}
