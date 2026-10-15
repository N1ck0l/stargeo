/**
 * Preço de várias estrelas numa compra — a MESMA conta no site (o que se
 * mostra) e no servidor (o que se cobra, `create-checkout`).
 *
 * Desconto progressivo sobre a soma das faixas, arredondado PARA BAIXO até o
 * real inteiro (o arredondamento sempre favorece quem compra, e o valor sai
 * limpo): 2 estrelas, 10%; 3, 15%; 4 a 6, 20% (teto). A estrela avulsa não
 * muda de preço.
 *
 * O desconto é repartido entre os pedidos na proporção do preço de cada um:
 * a soma dos `amount_cents` é exatamente o que o Mercado Pago cobra (o
 * webhook confere), e o reembolso de cada um é o que ele custou de fato.
 */

/** Quantas estrelas cabem numa compra (formulário, reserva, preferência). */
export const MAX_ESTRELAS = 6

/** Desconto, em %, para `n` estrelas numa compra. */
export function descontoPara(n) {
  if (n >= 4) return 20
  if (n === 3) return 15
  if (n === 2) return 10
  return 0
}

/** O desconto do par — mantido para quem fala só de duas. */
export const DESCONTO_PAR_PERCENTUAL = descontoPara(2)

/**
 * @param {number[]} centavos preço da faixa de cada estrela, na ordem da compra
 * @returns {{ cheio: number, total: number, desconto: number, percentual: number, partes: number[] }} em centavos
 */
export function precoDoGrupo(centavos) {
  const cheio = centavos.reduce((soma, c) => soma + c, 0)
  const percentual = descontoPara(centavos.length)
  if (!percentual) return { cheio, total: cheio, desconto: 0, percentual, partes: [...centavos] }

  const total = Math.floor((cheio * (100 - percentual)) / 100 / 100) * 100
  // Proporcional, e a última leva o resto do arredondamento: a soma é exata.
  const partes = centavos.map((c) => Math.round((c * total) / cheio))
  partes[partes.length - 1] = total - partes.slice(0, -1).reduce((soma, c) => soma + c, 0)
  return { cheio, total, desconto: cheio - total, percentual, partes }
}

/** Atalho para duas estrelas. */
export function precoDoPar(centavos1, centavos2) {
  return precoDoGrupo([centavos1, centavos2])
}

/** Nenhuma estrela sai por menos que isto, com qualquer cupom (centavos). */
export const PISO_POR_ESTRELA = 100

/**
 * Aplica um cupom (`{ tipo: 'percentual' | 'valor', valor }`) sobre o preço
 * já calculado (`precoDoGrupo`). O cupom vale sobre o TOTAL — depois do
 * desconto de grupo — e o resultado continua em real inteiro, arredondado a
 * favor de quem compra. Nenhuma estrela fica abaixo de `PISO_POR_ESTRELA`.
 *
 * O total novo é repartido de novo entre os pedidos, na proporção do preço de
 * cada estrela: a soma continua sendo exatamente o que se cobra.
 *
 * @param {{ cheio: number, total: number, desconto: number, percentual: number, partes: number[] }} preco
 * @param {{ tipo: string, valor: number } | null} cupom
 */
export function aplicarCupom(preco, cupom) {
  if (!cupom) return { ...preco, descontoCupom: 0 }
  const n = preco.partes.length
  const piso = PISO_POR_ESTRELA * n
  let total =
    cupom.tipo === 'percentual'
      ? Math.floor((preco.total * (100 - Math.min(50, cupom.valor))) / 100 / 100) * 100
      : Math.floor((preco.total - cupom.valor) / 100) * 100
  total = Math.max(total, piso)
  if (total >= preco.total) return { ...preco, descontoCupom: 0 }

  // Proporcional ao que cada pedido custava; a última leva o resto.
  const partes = preco.partes.map((c) => Math.max(PISO_POR_ESTRELA, Math.round((c * total) / preco.total)))
  partes[n - 1] = total - partes.slice(0, -1).reduce((soma, c) => soma + c, 0)
  return { ...preco, total, partes, descontoCupom: preco.total - total }
}
