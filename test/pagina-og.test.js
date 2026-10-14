import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import paginaOg from '../netlify/edge-functions/pagina-og.ts'

/**
 * Prévia social da página dedicada (edge function da Netlify).
 *
 * Roda contra o `loja/index.html` de verdade: as tags de lá quebram linha no
 * meio (`<meta\n property=… \n content=…>`), e a troca precisa pegar mesmo
 * assim — um regex que só funcionasse em uma linha passaria num HTML de
 * brinquedo e falharia em produção, sem erro nenhum.
 */

const HTML = readFileSync(resolve(import.meta.dirname, '../loja/index.html'), 'utf8')

const PAGINA = {
  pagina: { code: 'SG-AB3K-9ZXM', conteudo: { nome: 'Geovanna <3' } },
  estrela: { commonName: 'Kaus Australis', constellation: 'Sagitário' },
}

const contexto = {
  next: async () => new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
}

let respostaGetPage

beforeEach(() => {
  globalThis.Netlify = { env: { get: (nome) => ({ VITE_FUNCTIONS_URL: 'https://ref.supabase.co/functions/v1' })[nome] } }
  respostaGetPage = () => new Response(JSON.stringify(PAGINA), { status: 200 })
  globalThis.fetch = vi.fn(async () => respostaGetPage())
})

afterEach(() => {
  delete globalThis.Netlify
  vi.restoreAllMocks()
})

const pedir = (caminho) => paginaOg(new Request(`https://stellara.test${caminho}`), contexto)

describe('pagina-og', () => {
  it('troca título e descrição pelos da página, com o nome escapado', async () => {
    const html = await (await pedir('/p/SG-AB3K-9ZXM')).text()

    expect(html).toContain('<title>Uma estrela para Geovanna &lt;3 · Kaus Australis</title>')
    expect(html).toMatch(/property="og:title"\s+content="Uma estrela para Geovanna &lt;3 · Kaus Australis"/)
    expect(html).toMatch(/property="og:description"\s+content="Kaus Australis, em Sagitário, agora tem o nome de Geovanna &lt;3/)
    expect(html).not.toContain('Geovanna <3')
  })

  it('pergunta ao get-page pelo código da URL', async () => {
    await pedir('/p/sg-ab3k-9zxm')

    expect(fetch).toHaveBeenCalledWith(
      'https://ref.supabase.co/functions/v1/get-page',
      expect.objectContaining({ body: JSON.stringify({ code: 'SG-AB3K-9ZXM' }) }),
    )
  })

  it('devolve o HTML original quando a página não existe', async () => {
    respostaGetPage = () => new Response('{}', { status: 404 })

    const html = await (await pedir('/p/SG-AB3K-9ZXM')).text()

    expect(html).toBe(HTML)
  })

  it('devolve o HTML original quando o get-page cai', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('timeout')
    })

    expect(await (await pedir('/p/SG-AB3K-9ZXM')).text()).toBe(HTML)
  })

  it('não consulta nada fora de /p/CODE', async () => {
    await pedir('/produto/certificado-digital')

    expect(fetch).not.toHaveBeenCalled()
  })
})
