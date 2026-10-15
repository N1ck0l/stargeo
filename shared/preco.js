/**
 * Preço do par de estrelas — a MESMA conta no site (o que se mostra) e no
 * servidor (o que se cobra, `create-checkout`).
 *
 * Regra: 10% de desconto sobre a soma das duas faixas, arredondado PARA
 * BAIXO até o real inteiro (o arredondamento sempre favorece quem compra, e o
 * valor sai limpo: R$ 498 → R$ 448). A estrela avulsa não muda de preço.
 *
 * O desconto é repartido entre os dois pedidos na proporção do preço de cada
 * um: a soma dos dois `amount_cents` é exatamente o que o Mercado Pago cobra
 * (o webhook confere), e o reembolso de cada um é o que ele custou de fato.
 */

/** Desconto do par, em %. Mudou aqui, muda no site e na cobrança. */
export const DESCONTO_PAR_PERCENTUAL = 10

/**
 * @param {number} centavos1 preço da faixa da primeira estrela
 * @param {number} centavos2 preço da faixa da segunda estrela
 * @returns {{ cheio: number, total: number, desconto: number, partes: [number, number] }} tudo em centavos
 */
export function precoDoPar(centavos1, centavos2) {
  const cheio = centavos1 + centavos2
  const total = Math.floor((cheio * (100 - DESCONTO_PAR_PERCENTUAL)) / 100 / 100) * 100
  const parte1 = Math.round((centavos1 * total) / cheio)
  return { cheio, total, desconto: cheio - total, partes: [parte1, total - parte1] }
}
