/**
 * Medição do funil — anônima, sem cookie, sem armazenamento no navegador.
 *
 * Cada chamada só soma 1 num contador do dia no banco (`registrar_evento`,
 * migration 0017). Não vai nada que identifique a pessoa: nem id, nem IP
 * guardado, nem a página de onde veio — o evento (de uma lista fechada) e, às
 * vezes, a faixa de preço da estrela. Não precisa de banner de consentimento
 * porque não há dado pessoal.
 *
 * Mesmo assim, quem pediu "não rastrear" (Do Not Track / Global Privacy
 * Control) não é contado. Cada evento conta no máximo uma vez por
 * carregamento da página, para re-render não inflar o número.
 *
 * Falha é silenciosa: medir nunca pode atrapalhar a compra.
 */
const URL_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY
const ativo = Boolean(URL_BASE && CHAVE) && import.meta.env.MODE !== 'test'

const jaContados = new Set()

function pediuParaNaoRastrear() {
  if (typeof navigator === 'undefined') return true
  return navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true
}

/**
 * @param {'visita'|'ver_produto'|'escolher_estrela'|'personalizar'|'iniciar_checkout'} evento
 * @param {string} [faixa]  faixa de preço da estrela, quando houver
 */
export function registrar(evento, faixa = '') {
  if (!ativo || pediuParaNaoRastrear() || jaContados.has(evento)) return
  jaContados.add(evento)
  try {
    fetch(`${URL_BASE}/rest/v1/rpc/registrar_evento`, {
      method: 'POST',
      // `keepalive`: o "foi ao pagamento" é registrado logo antes de sair da
      // página para o Mercado Pago, e a requisição precisa sobreviver a isso.
      keepalive: true,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_evento: evento, p_detalhe: faixa || '' }),
    }).catch(() => {})
  } catch {
    // Sem fetch, sem medição.
  }
}
