/**
 * Registro de erros do site — sem serviço de terceiro e sem dado pessoal.
 *
 * Quando algo quebra no navegador de um cliente (erro de script, promessa
 * rejeitada, tela branca, função do servidor falhando), vai para o próprio
 * banco (`registrar_erro`, migration 0022) e aparece no painel. Sai só a
 * mensagem técnica, a tela e o navegador — e ANTES de sair, e-mails, códigos
 * de pedido/grupo e números longos são apagados (o banco limpa de novo).
 *
 * No máximo 10 registros por carregamento de página, e o mesmo erro só uma
 * vez: um laço não vira enxurrada. Falha ao registrar é silenciosa.
 */
const URL_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY
// Fora do site publicado (localhost, rede local) não registra: erro de teste no
// computador de quem desenvolve não pode aparecer no painel como erro do site.
const local = typeof window !== 'undefined' && /^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(window.location.hostname)
const ativo = Boolean(URL_BASE && CHAVE) && import.meta.env.MODE !== 'test' && !local

const vistos = new Set()
let enviados = 0

/** Apaga o que poderia identificar alguém. Exportada para o teste. */
export function limparTexto(texto, max) {
  return String(texto ?? '')
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/\b(SG|GR)-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi, ':codigo')
    .replace(/\d{6,}/g, '[n]')
    // Querystring e fragmento de URLs (cupom, token de edição): fora.
    .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')
    .slice(0, max)
}

/** A tela, sem códigos: `/p/SG-AB12-CD34/editar` → `/p/:codigo/editar`. */
export function rotaAtual() {
  if (typeof window === 'undefined') return ''
  return limparTexto(window.location.pathname, 120)
}

function navegador() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const nome = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Outro'
  const sistema = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return `${nome}${sistema ? ` · ${sistema}` : ''}`
}

/**
 * @param {unknown} erro  Error, texto ou qualquer coisa que foi lançada
 * @param {string} [contexto]  de onde veio ("tela", "api:create-checkout"…)
 */
export function registrarErro(erro, contexto = '') {
  if (!ativo || enviados >= 10) return
  const mensagem = limparTexto(
    `${contexto ? `[${contexto}] ` : ''}${erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro)}`,
    300,
  )
  if (!mensagem || vistos.has(mensagem)) return
  vistos.add(mensagem)
  enviados += 1
  const pilha = erro instanceof Error ? limparTexto(erro.stack ?? '', 1500) : ''
  try {
    fetch(`${URL_BASE}/rest/v1/rpc/registrar_erro`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_mensagem: mensagem, p_rota: rotaAtual(), p_pilha: pilha, p_navegador: navegador() }),
    }).catch(() => {})
  } catch {
    // Sem fetch, sem registro.
  }
}

/** Liga a captura global (uma vez, no `main.jsx`). */
export function vigiarErros() {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (evento) => {
    // Recurso que não carregou (imagem, script de extensão) chega sem `error`.
    if (evento.error || evento.message) registrarErro(evento.error ?? evento.message, 'script')
  })
  window.addEventListener('unhandledrejection', (evento) => registrarErro(evento.reason, 'promessa'))
}
