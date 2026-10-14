/**
 * Data em português, sem depender do fuso do servidor.
 *
 * Separado de `certificado.ts` para que `pagina.ts` consiga formatar a data
 * da dedicação SEM importar o módulo de PDF — e puxar `pdf-lib` para dentro
 * de uma função que só lê texto custa frieza de boot à toa.
 */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function dataEmPortugues(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  // `T00:00:00Z` evita que o fuso do servidor empurre a data para o dia anterior.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}
