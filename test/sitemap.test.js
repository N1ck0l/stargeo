import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `sitemap.xml` e `robots.txt` (edge function da Netlify): endereços
 * absolutos a partir do domínio da própria requisição, e páginas de presente
 * (`/p/…`) nunca indexadas.
 */
globalThis.Netlify = { env: { get: () => 'https://exemplo.supabase.co/functions/v1' } }
const { default: sitemap } = await import('../netlify/edge-functions/sitemap.ts')

afterEach(() => vi.unstubAllGlobals())

describe('sitemap e robots', () => {
  it('robots aponta o sitemap do domínio atual e bloqueia as páginas de presente', async () => {
    const texto = await (await sitemap(new Request('https://stellara.com.br/robots.txt'))).text()
    expect(texto).toContain('Sitemap: https://stellara.com.br/sitemap.xml')
    expect(texto).toContain('Disallow: /p/')
    expect(texto).toContain('Disallow: /admin')
  })

  it('sitemap traz as telas fixas e as estrelas com nome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ slugs: ['sirius', 'antares'] }))))
    const xml = await (await sitemap(new Request('https://stellara.com.br/sitemap.xml'))).text()
    expect(xml).toContain('<loc>https://stellara.com.br/</loc>')
    expect(xml).toContain('<loc>https://stellara.com.br/estrelas/antares</loc>')
    expect(xml).not.toContain('/p/')
  })

  it('sem catálogo, sai só com as telas fixas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fora do ar') }))
    const xml = await (await sitemap(new Request('https://stellara.com.br/sitemap.xml'))).text()
    expect(xml).toContain('<loc>https://stellara.com.br/estrelas</loc>')
    expect(xml).not.toContain('/estrelas/')
  })

  it('sitemap incompleto não fica em cache; o completo fica um dia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fora do ar') }))
    expect((await sitemap(new Request('https://stellara.com.br/sitemap.xml'))).headers.get('Cache-Control')).toBe('no-store')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ slugs: ['vega'] }))))
    expect((await sitemap(new Request('https://stellara.com.br/sitemap.xml'))).headers.get('Cache-Control')).toBe('public, max-age=86400')
  })
})
