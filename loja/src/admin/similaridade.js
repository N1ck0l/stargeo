/**
 * Cartas parecidas demais, na mesma campanha.
 *
 * A exclusividade tem de estar no conteúdo, não só no nome: duas cartas que
 * só trocam a saudação são, para quem recebe e compara com a colega, a mesma
 * carta. Medida simples e explicável: trechos de 3 palavras em comum
 * (Jaccard), sem acento, sem pontuação e SEM os nomes próprios das
 * destinatárias e das estrelas — senão o nome diferente disfarçaria um texto
 * igual.
 */

/** Acima disto, "muito parecida" (revise); acima de `PARECIDA`, só um aviso. */
export const MUITO_PARECIDA = 0.45
export const PARECIDA = 0.25

function palavras(texto, ignorar) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !ignorar.has(p))
}

function trechos(texto, ignorar) {
  const p = palavras(texto, ignorar)
  const conjunto = new Set()
  for (let i = 0; i + 2 < p.length; i += 1) conjunto.add(`${p[i]} ${p[i + 1]} ${p[i + 2]}`)
  return conjunto
}

/** 0 (nada em comum) a 1 (o mesmo texto). */
export function semelhanca(a, b, ignorar = new Set()) {
  const ta = trechos(a, ignorar)
  const tb = trechos(b, ignorar)
  if (!ta.size || !tb.size) return 0
  let comum = 0
  for (const t of ta) if (tb.has(t)) comum += 1
  return comum / (ta.size + tb.size - comum)
}

/**
 * Para cada homenagem, a outra cuja carta mais se parece com a dela.
 *
 * @param {Array<{ code: string, nome: string, carta: string, estrela?: { name?: string } }>} homenagens
 * @returns {Map<string, { code: string, nome: string, valor: number }>} só as que passam de `PARECIDA`
 */
export function cartasParecidas(homenagens) {
  const ignorar = new Set(
    homenagens.flatMap((h) => palavras(`${h.nome} ${h.nomePreferido ?? ''} ${h.estrela?.name ?? ''}`, new Set())),
  )
  const resultado = new Map()
  for (const a of homenagens) {
    for (const b of homenagens) {
      if (a.code === b.code || !a.carta || !b.carta) continue
      const valor = semelhanca(a.carta, b.carta, ignorar)
      if (valor >= PARECIDA && valor > (resultado.get(a.code)?.valor ?? 0)) {
        resultado.set(a.code, { code: b.code, nome: b.nomePreferido || b.nome, valor })
      }
    }
  }
  return resultado
}
