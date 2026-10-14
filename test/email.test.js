import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enviarEmail } from '../supabase/functions/_shared/certificado.ts'

/**
 * O bug que este arquivo impede de voltar.
 *
 * O e-mail do certificado lê o nome da estrela de um lado e a linha do pedido
 * de outro. `orders` guarda só `star_slug` — não tem `star_name` nem
 * `constellation`. Quando a função lia esses campos do pedido, o e-mail saía
 * como "O certificado de , dedicado a Ana": sem erro, sem exceção, só vazio.
 *
 * Nenhum teste de unidade pegava, porque a falha só existia entre a consulta
 * ao banco e o texto do e-mail. Este teste fecha essa costura.
 */

const PEDIDO = {
  code: 'SG-AB3K-9ZXM',
  customer_email: 'ana@exemplo.com',
  customer_name: 'Ana Paula',
  honoree_name: 'Geovanna',
  star_slug: 'kaus-australis',
}

const ESTRELA = {
  name: 'Kaus Australis',
  constellation: 'Sagitário',
}

/**
 * Página dedicada publicada para este pedido — ou null.
 *
 * `enviarEmail` confere se a página existe antes de botar o link: página
 * inexistente ou em rascunho não pode virar link morto no e-mail.
 */
let paginaPublicada = null

/** Banco falso: só o que `enviarEmail` toca. */
const db = {
  storage: {
    from: () => ({
      createSignedUrl: async () => ({
        data: { signedUrl: 'https://exemplo.test/certificado.pdf' },
        error: null,
      }),
    }),
  },
  from: (tabela) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: tabela === 'pages' ? paginaPublicada : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}

let enviado

beforeEach(() => {
  // `variavel()` lê do ambiente do Deno, que não existe no Node.
  globalThis.Deno = {
    env: {
      get: (nome) =>
        ({ RESEND_API_KEY: 'chave-de-teste', EMAIL_FROM: 'StarGeo <x@y.test>' })[nome],
    },
  }

  paginaPublicada = null
  enviado = null
  globalThis.fetch = vi.fn(async (url, opcoes) => {
    enviado = { url, corpo: JSON.parse(opcoes.body) }
    return { ok: true, text: async () => '' }
  })
})

afterEach(() => {
  delete globalThis.Deno
  vi.restoreAllMocks()
})

describe('enviarEmail', () => {
  it('põe o nome da estrela e a constelação no corpo', async () => {
    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    expect(enviado.corpo.html).toContain('Kaus Australis')
    expect(enviado.corpo.html).toContain('Sagitário')
    expect(enviado.corpo.html).not.toContain('undefined')
  })

  it('saúda quem comprou e nomeia quem recebe', async () => {
    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    // `${nomeComprador}` é só o primeiro nome; o destinatário é o nome inteiro.
    expect(enviado.corpo.html).toContain('Ana')
    expect(enviado.corpo.html).toContain('Geovanna')
  })

  it('abre o assunto com o nome de quem recebe', async () => {
    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    expect(enviado.corpo.subject).toContain('Geovanna')
  })

  it('usa o link assinado como destino do botão', async () => {
    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    expect(enviado.corpo.html).toContain('https://exemplo.test/certificado.pdf')
  })

  it('escapa HTML do nome, que é texto do cliente', async () => {
    await enviarEmail(
      db,
      { ...PEDIDO, honoree_name: '<script>alert(1)</script>' },
      ESTRELA,
      'caminho/certificado.pdf',
    )

    expect(enviado.corpo.html).not.toContain('<script>alert(1)</script>')
    expect(enviado.corpo.html).toContain('&lt;script&gt;')
  })

  it('publica o link da página dedicada quando ela está no ar', async () => {
    paginaPublicada = { code: PEDIDO.code }

    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    expect(enviado.corpo.html).toContain('Ver a página dedicada')
    expect(enviado.corpo.html).toContain('/p/SG-AB3K-9ZXM')
    expect(enviado.corpo.html).toContain('editar o texto dela')
  })

  it('não mostra a página quando ela não existe (ou está em rascunho)', async () => {
    await enviarEmail(db, PEDIDO, ESTRELA, 'caminho/certificado.pdf')

    expect(enviado.corpo.html).not.toContain('Ver a página dedicada')
    expect(enviado.corpo.html).not.toContain('/p/SG-')
  })
})
