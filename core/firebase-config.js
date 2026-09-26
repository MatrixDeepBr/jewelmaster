// core/firebase-config.js
// Inicializa o Firebase (Authentication + Firestore) carregando os módulos
// direto do CDN oficial do Google (gstatic.com), sem precisar instalar nada
// no computador. Qualquer tela do projeto pode importar `auth` e `db` daqui:
//   import { auth, db } from '../../core/firebase-config.js';

const [{ initializeApp }, authMod, fsMod] = await Promise.all([
  import("https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js"),
  import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
  import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
]);

// Configuração do projeto "joias-app" no Firebase.
// Estas chaves identificam o projeto na web e NÃO são segredo — é seguro
// que apareçam no código que roda no navegador (o que protege os dados de
// verdade são as regras do Firestore, em firestore.rules).
const firebaseConfig = {
  apiKey: "AIzaSyBgcOyFrDLZi7GT25gPpDB-GjxzHO2WGRY",
  authDomain: "joias-app-d295e.firebaseapp.com",
  projectId: "joias-app-d295e",
  storageBucket: "joias-app-d295e.firebasestorage.app",
  messagingSenderId: "906217655754",
  appId: "1:906217655754:web:b5da59546ed33cbfd39333"
};

const app = initializeApp(firebaseConfig);

// `auth`: usado para login, logout e saber quem está logada agora.
export const auth = authMod.getAuth(app);

// `db`: usado para ler/gravar documentos no Firestore.
export const db = fsMod.getFirestore(app);

// Reexporta as funções do Firestore e do Auth mais usadas pelas telas,
// para que cada tela não precise importar o SDK do Firebase de novo —
// só importa tudo daqui.
export const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} = fsMod;

export const {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} = authMod;
