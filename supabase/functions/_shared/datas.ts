/**
 * Data em português, sem depender do fuso do servidor.
 *
 * Separado de `certificado.ts` para que `pagina.ts` consiga formatar a data
 * da dedicação SEM importar o módulo de PDF — e puxar `pdf-lib` para dentro
 * de uma função que só lê texto custa frieza de boot à toa.
 */

// Minúsculas de propósito: a função monta "11 de outubro de 2026" — o mês
// nunca aparece sozinho no meio de uma frase, então não há por que capitalizar.
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * `2026-10-11` → `11 de outubro de 2026`.
 *
 * @param iso data no formato `AAAA-MM-DD` (como a coluna `date` devolve)
 * @returns a data em português, ou `undefined` quando a entrada está vazia ou
 *          não é data — quem chama decide o que mostrar no lugar
 */
export function dataEmPortugues(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  // `T00:00:00Z` evita que o fuso do servidor empurre a data para o dia anterior.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/** Hoje no calendário de Brasília, `AAAA-MM-DD` (o servidor roda em UTC). */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

/** Teto da revelação: um ano e um dia a partir de hoje. */
const REVELACAO_MAX_DIAS = 366

/**
 * Valida a data de revelação da página (`reveal_on`, migration 0019).
 *
 * @returns a data normalizada, `null` (revela na hora) ou a mensagem de erro
 */
export function validarRevelacao(valor: unknown, agora: Date = new Date()): { data: string | null } | { erro: string } {
  if (valor === undefined || valor === null || valor === '') return { data: null }
  const texto = String(valor).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(new Date(`${texto}T00:00:00Z`).getTime())) {
    return { erro: 'A data de revelação está inválida.' }
  }
  const hoje = hojeEmBrasilia(agora)
  // Hoje ou antes: revelar "no passado" é revelar já.
  if (texto <= hoje) return { data: null }
  const limite = new Date(`${hoje}T00:00:00Z`)
  limite.setUTCDate(limite.getUTCDate() + REVELACAO_MAX_DIAS)
  if (texto > limite.toISOString().slice(0, 10)) {
    return { erro: 'A revelação pode ser marcada para até um ano depois de hoje.' }
  }
  return { data: texto }
}

/** A página ainda está guardada (a data de revelação não chegou)? */
export function aindaGuardada(revealOn: string | null | undefined, agora: Date = new Date()): boolean {
  return Boolean(revealOn) && String(revealOn) > hojeEmBrasilia(agora)
}
