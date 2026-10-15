/**
 * Prévia social da página dedicada (`/p/SG-XXXX-XXXX`).
 *
 * É o link que mais circula: quem compra manda a página para quem recebe o
 * presente, quase sempre pelo WhatsApp. Os robôs de prévia leem o HTML cru e
 * não executam JavaScript, então numa SPA todo `/p/…` mostraria o cartão
 * genérico da loja. Esta edge function troca, no HTML servido, o título e a
 * descrição pelos da página — "Uma estrela para Geovanna · Kaus Australis".
 *
 * Fala com a Edge Function pública `get-page` do Supabase (a mesma que a SPA
 * usa, que só devolve página publicada e nunca o e-mail de quem comprou), em
 * `VITE_FUNCTIONS_URL` — a variável que a loja já tem na Netlify.
 *
 * Nunca derruba a página: sem configuração, código inválido, página que não
 * existe, `get-page` lento (orçamento de 1,5 s) ou fora do ar — devolve o HTML
 * original, com o cartão genérico. A prévia é um extra, a página não.
 */

declare const Netlify: { env: { get(nome: string): string | undefined } }

interface Contexto {
  next(): Promise<Response>
}

const RE_CODIGO = /^\/p\/(SG-[A-Z0-9]{4}-[A-Z0-9]{4})\/?$/i

export default async function paginaOg(request: Request, contexto: Contexto): Promise<Response> {
  const resposta = await contexto.next()

  const codigo = new URL(request.url).pathname.match(RE_CODIGO)?.[1]?.toUpperCase()
  const base = Netlify.env.get('VITE_FUNCTIONS_URL')
  if (!codigo || !base || !resposta.headers.get('content-type')?.includes('text/html')) {
    return resposta
  }

  let titulo: string
  let descricao: string
  try {
    const consulta = await fetch(`${base.replace(/\/$/, '')}/get-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codigo }),
      signal: AbortSignal.timeout(1500),
    })
    if (!consulta.ok) return resposta

    const dados = await consulta.json()
    // Página guardada até a data (0019): a prévia não entrega a surpresa.
    const guardada = dados?.guardada
    if (guardada?.para) {
      titulo = `Uma surpresa nas estrelas para ${guardada.para}`
      descricao = 'Esta estrela se revela em breve. Guarde este link.'
    } else {
      const nome = String(dados?.pagina?.conteudo?.nome ?? '').trim()
      const estrela = String(dados?.estrela?.commonName ?? '').trim()
      const constelacao = String(dados?.estrela?.constellation ?? '').trim()
      if (!nome) return resposta

      titulo = estrela ? `Uma estrela para ${nome} · ${estrela}` : `Uma estrela para ${nome}`
      descricao = estrela && constelacao
        ? `${estrela}, em ${constelacao}, agora tem o nome de ${nome}. Veja onde ela está no céu.`
        : `Uma estrela no céu agora tem o nome de ${nome}. Veja onde ela está.`
    }
  } catch {
    return resposta
  }

  const html = (await resposta.text())
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapar(titulo)}</title>`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escapar(descricao)}$2`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapar(descricao)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapar(request.url)}$2`)

  const cabecalhos = new Headers(resposta.headers)
  cabecalhos.delete('content-length')
  return new Response(html, { status: resposta.status, headers: cabecalhos })
}

/** Nome vem do cliente: escapado antes de entrar em atributo e em `<title>`. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// `/p/CODE/editar` fica de fora: é tela de login, não tem o que pré-visualizar.
export const config = { path: '/p/*', excludedPath: '/p/*/editar' }
