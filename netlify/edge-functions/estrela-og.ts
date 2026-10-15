/**
 * Título, descrição e endereço canônico da página pública de uma estrela
 * (`/estrelas/<slug>`), escritos no HTML servido.
 *
 * Robôs de busca e de prévia (Google, WhatsApp) leem o HTML cru: sem isto,
 * as ~600 páginas de estrela com nome próprio teriam o título da home e o
 * canônico apontando para `/`, e o Google as trataria como cópias dela. Com
 * isto, "Antares, a estrela de Escorpião" é uma página própria, que alguém
 * procurando "estrela Antares" encontra.
 *
 * Os dados vêm da função pública `star-public` do Supabase, em
 * `VITE_FUNCTIONS_URL` (a mesma variável da `pagina-og`). Mesma regra da
 * `pagina-og`: qualquer falha devolve o HTML original — a prévia é extra.
 */

declare const Netlify: { env: { get(nome: string): string | undefined } }

interface Contexto {
  next(): Promise<Response>
}

const RE_SLUG = /^\/estrelas\/([a-z0-9-]{1,80})\/?$/i

export default async function estrelaOg(request: Request, contexto: Contexto): Promise<Response> {
  const resposta = await contexto.next()

  const slug = new URL(request.url).pathname.match(RE_SLUG)?.[1]?.toLowerCase()
  const base = Netlify.env.get('VITE_FUNCTIONS_URL')
  if (!slug || !base || !resposta.headers.get('content-type')?.includes('text/html')) {
    return resposta
  }

  let titulo: string
  let descricao: string
  try {
    const consulta = await fetch(`${base.replace(/\/$/, '')}/star-public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      signal: AbortSignal.timeout(1500),
    })
    if (!consulta.ok) return resposta
    const estrela = (await consulta.json())?.estrela
    if (!estrela?.name) return resposta
    ;({ titulo, descricao } = textosDaEstrela(estrela))
  } catch {
    return resposta
  }

  const url = new URL(request.url)
  const canonico = `${url.origin}/estrelas/${slug}`
  const html = (await resposta.text())
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapar(titulo)}</title>`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escapar(titulo)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escapar(descricao)}$2`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapar(descricao)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${escapar(canonico)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${escapar(canonico)}$2`)

  const cabecalhos = new Headers(resposta.headers)
  cabecalhos.delete('content-length')
  return new Response(html, { status: resposta.status, headers: cabecalhos })
}

/** "Antares, em Escorpião · Stellara" + a história, cortada para caber na busca. */
export function textosDaEstrela(estrela: { name: string; constellation?: string; story?: string; status?: string }) {
  const titulo = estrela.constellation
    ? `${estrela.name}, em ${estrela.constellation} · Dedique esta estrela | Stellara`
    : `${estrela.name} · Dedique esta estrela | Stellara`
  const historia = String(estrela.story ?? '').replace(/\s+/g, ' ').trim()
  const chamada = estrela.status === 'dedicada'
    ? 'Esta estrela já foi dedicada a alguém.'
    : 'Dedique esta estrela real a quem você ama.'
  const base = historia ? `${historia} ${chamada}` : chamada
  const descricao = base.length > 158 ? `${base.slice(0, 155).replace(/\s+\S*$/, '')}…` : base
  return { titulo, descricao }
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const config = { path: '/estrelas/*' }
