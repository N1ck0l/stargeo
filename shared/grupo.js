/**
 * A linha que liga as folhas de um grupo de estrelas — a MESMA na prévia, no
 * PDF e no painel.
 *
 * - Duas pessoas: "Em par com Altair, dedicada a Pedro" (cita a outra).
 * - Três a seis: "Uma das quatro estrelas · Família Souza" — com tanta gente,
 *   os nomes não cabem numa linha; o nome do grupo (opcional) faz o elo, e a
 *   página do grupo mostra todas juntas.
 */

const POR_EXTENSO = { 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis' }

/**
 * @param {{ total: number, nome?: string | null, outros: Array<{ estrela: string, nome: string }> }} grupo
 * @returns {string} a linha, ou '' fora de um grupo
 */
export function linhaDoGrupo({ total, nome, outros }) {
  if (!total || total < 2) return ''
  if (total === 2) {
    const outro = outros[0]
    return outro ? `Em par com ${outro.estrela}, dedicada a ${outro.nome}` : ''
  }
  const quantas = `Uma das ${POR_EXTENSO[total] ?? total} estrelas`
  const limpo = String(nome ?? '').trim()
  return limpo ? `${quantas} · ${limpo}` : `${quantas} dedicadas juntas`
}
