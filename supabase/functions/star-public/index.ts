/**
 * Dados PÚBLICOS do catálogo para as edge functions da Netlify — a prévia
 * social de `/estrelas/<slug>` (`netlify/edge-functions/estrela-og.ts`) e o
 * `sitemap.xml` (`sitemap.ts`).
 *
 * Elas só conhecem `VITE_FUNCTIONS_URL` (a mesma da `pagina-og`), não a chave
 * do banco; por isso este atalho. Só devolve o que a loja já mostra a qualquer
 * visitante pelo Data API — nome, constelação, história, brilho e se está
 * livre. Nada de pedido, comprador ou página.
 *
 * Corpo: `{ slug }` → `{ estrela }` (ou `null`); `{ lista: 'sitemap' }` →
 * `{ slugs }`, as estrelas com nome próprio (curadas, lendárias e nomeadas),
 * que são as que alguém procura pelo nome.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'

const RE_SLUG = /^[a-z0-9-]{1,80}$/

Deno.serve(
  comHandler(async (request) => {
    const corpo = await lerJson(request)
    const db = admin()

    if (corpo.lista === 'sitemap') {
      const { data, error } = await db
        .from('stars')
        .select('slug')
        .or('curada.eq.true,faixa.in.(lendaria,nomeada)')
        .order('magnitude', { ascending: true })
        .limit(2000)
      if (error) throw new ErroApp('consulta_falhou', 'Catálogo indisponível.', 500, error.message)
      return json(request, { slugs: (data ?? []).map((l) => l.slug) })
    }

    const slug = String(corpo.slug ?? '').toLowerCase()
    if (!RE_SLUG.test(slug)) throw new ErroApp('slug_invalido', 'Estrela inválida.', 422)

    const { data, error } = await db
      .from('stars')
      .select('slug, name, bayer, constellation, story, magnitude, distance_ly, best_month, status, faixa')
      .eq('slug', slug)
      .maybeSingle()
    if (error) throw new ErroApp('consulta_falhou', 'Catálogo indisponível.', 500, error.message)
    return json(request, { estrela: data ?? null })
  }, 'star-public'),
)
