/**
 * `sitemap.xml` e `robots.txt` da loja, montados na hora.
 *
 * Os dois precisam de URL ABSOLUTA, e o domínio só se sabe em produção (hoje
 * stellara-loja.netlify.app, amanhã o domínio próprio): a origem vem da
 * própria requisição, então nada muda quando o domínio mudar.
 *
 * O sitemap lista as telas públicas e as páginas das estrelas com nome
 * próprio (~600, da função `star-public`) — são as que alguém procura pelo
 * nome. As ~117 mil estrelas sem nome continuam acessíveis, só não são
 * empurradas para o índice. Páginas dedicadas (`/p/…`) NUNCA entram: são
 * presentes de pessoas, não conteúdo da loja.
 */

declare const Netlify: { env: { get(nome: string): string | undefined } }

const FIXAS = ['/', '/estrelas', '/produto/certificado-digital', '/politicas']

export default async function sitemap(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origem = url.origin

  if (url.pathname === '/robots.txt') {
    const corpo = [
      'User-agent: *',
      'Allow: /',
      '',
      '# Painel e edição não são conteúdo; páginas dedicadas são presentes pessoais.',
      'Disallow: /admin',
      'Disallow: /p/',
      'Disallow: /g/',
      'Disallow: /editar',
      'Disallow: /rastrear',
      'Disallow: /obrigado',
      '',
      `Sitemap: ${origem}/sitemap.xml`,
      '',
    ].join('\n')
    return new Response(corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
  }

  let slugs: string[] = []
  const base = Netlify.env.get('VITE_FUNCTIONS_URL')
  if (base) {
    try {
      const consulta = await fetch(`${base.replace(/\/$/, '')}/star-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lista: 'sitemap' }),
        // Robô de busca não tem pressa: folga para a função acordar (partida a
        // frio passava de 3 s e o sitemap saía só com as telas fixas).
        signal: AbortSignal.timeout(8000),
      })
      if (consulta.ok) slugs = ((await consulta.json())?.slugs ?? []).filter((s: unknown) => typeof s === 'string')
    } catch {
      // Sem catálogo, o sitemap sai só com as telas fixas.
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...FIXAS, ...slugs.map((s) => `/estrelas/${encodeURIComponent(s)}`)]
      .map((caminho) => `  <url><loc>${origem}${caminho}</loc></url>`)
      .join('\n') +
    '\n</urlset>\n'

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Incompleto (catálogo fora do ar) não pode ficar guardado um dia.
      'Cache-Control': slugs.length ? 'public, max-age=86400' : 'no-store',
    },
  })
}

export const config = { path: ['/sitemap.xml', '/robots.txt'] }
