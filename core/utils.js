// core/utils.js
// Helpers genéricos usados por várias telas.

// Converte um valor em centavos (número inteiro, ex: 1050) para o texto
// "R$ 10,50" pronto para mostrar na tela.
export function formatarCentavosParaReais(centavos) {
  const valor = (Number(centavos) || 0) / 100;
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// Converte um Timestamp do Firestore (ou uma Date) para o texto
// "dd/mm/aaaa" em português.
export function formatarData(timestampOuData) {
  if (!timestampOuData) return '';
  const data = typeof timestampOuData.toDate === 'function'
    ? timestampOuData.toDate()
    : timestampOuData;
  return data.toLocaleDateString('pt-BR');
}

// Converte um Timestamp do Firestore (ou uma Date) para o texto
// "dd/mm/aaaa às hh:mm".
export function formatarDataHora(timestampOuData) {
  if (!timestampOuData) return '';
  const data = typeof timestampOuData.toDate === 'function'
    ? timestampOuData.toDate()
    : timestampOuData;
  const dataTexto = data.toLocaleDateString('pt-BR');
  const horaTexto = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dataTexto} às ${horaTexto}`;
}

// Gera um código de barras (barcodeId) simples e único para um produto,
// no padrão Code128 (aceita letras e números, sem caracteres especiais).
//
// Regra escolhida nesta sessão (documentar/registrar no relatório):
// prefixo fixo "JM" (JewelMaster) + timestamp atual em base 36 (garante
// ordem crescente e unicidade por instante) + 3 caracteres aleatórios
// (evita colisão em cadastros muito próximos no tempo, ex: dois cliques
// rápidos). Resultado tem por volta de 15 caracteres, só maiúsculas e
// números — fácil de ler e de gerar etiqueta em Code128.
// Exemplo: "JMLXQ2K9F-A3D"
// A Sessão 3 (Cadastro de Produtos) é quem efetivamente vai usar esta
// função ao salvar um produto novo.
export function gerarBarcodeId() {
  const agora = Date.now().toString(36).toUpperCase();
  const aleatorio = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `JM${agora}-${aleatorio}`;
}
