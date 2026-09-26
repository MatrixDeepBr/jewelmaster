// core/permissions.js
// Funções pequenas de permissão, usadas por qualquer tela para decidir o
// que mostrar conforme o perfil (role) da pessoa logada. As próximas
// sessões podem estender este arquivo com regras mais específicas
// (ex: vendedora poder ver estoque geral ou maleta de outra vendedora).

// Recebe o perfil (documento de `users`, já carregado por core/auth.js) e
// devolve true se for Admin.
export function ehAdmin(perfil) {
  return !!perfil && perfil.role === 'admin';
}

// Recebe o perfil e devolve true se for Vendedora.
export function ehVendedora(perfil) {
  return !!perfil && perfil.role === 'seller';
}

// Devolve o caminho da tela inicial correta conforme o role do perfil.
// Usado pelo login e pelo index.html da raiz para redirecionar.
export function caminhoInicialPara(perfil) {
  // Caminho relativo à raiz do site (usado a partir do index.html da raiz
  // e da tela de login, que também fica na raiz de /telas/00-login/).
  return '../01-inicio/inicio.html';
}
