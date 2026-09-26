// sw.js — Service Worker do JewelMaster
// Estratégia: tenta a rede primeiro; se estiver offline, usa o que tiver
// em cache (mesma lógica já usada com sucesso no app de vendas).
// NUNCA guarda em cache chamadas ao Firebase/Firestore/Authentication —
// só os arquivos do próprio site (o "esqueleto" do app).

// Aumente este número (ex: 'jewelmaster-v2') sempre que publicar uma
// mudança de arquivos e quiser forçar os celulares/navegadores a
// buscarem a versão nova em vez de continuar usando o cache antigo.
const VERSAO_CACHE = 'jewelmaster-v1';

// Arquivos do "esqueleto" do app, guardados em cache na instalação para
// o app abrir mesmo sem internet depois da primeira visita.
const ARQUIVOS_ESQUELETO = [
  './index.html',
  './manifest.json',
  './core/firebase-config.js',
  './core/auth.js',
  './core/permissions.js',
  './core/tokens.css',
  './core/components.css',
  './core/components.js',
  './core/utils.js',
  './core/navegacao.js',
  './core/navegacao.css',
  './telas/00-login/login.html',
  './telas/00-login/login.js',
  './telas/00-login/login.css',
  './telas/01-inicio/inicio.html',
  './telas/01-inicio/inicio.js',
  './telas/01-inicio/inicio.css',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/logos/logo-completo.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO_CACHE).then((cache) => cache.addAll(ARQUIVOS_ESQUELETO))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== VERSAO_CACHE)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

// Nunca cachear nada que vá para o Firebase (Auth/Firestore/etc.) — os
// dados precisam ser sempre atuais, e o próprio Firestore já cuida do
// funcionamento offline dos dados (não é papel do Service Worker).
function ehRequisicaoDoFirebase(url) {
  return (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('cloudfunctions.net')
  );
}

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  if (evento.request.method !== 'GET' || ehRequisicaoDoFirebase(url)) {
    return; // deixa passar direto pra rede, sem interceptar
  }

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(VERSAO_CACHE).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
