import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O fluxo inteiro da compra, com o código REAL das funções: checkout →
 * pagamento aprovado (webhook) → estrela dedicada → certificado → página
 * publicada → leitura pública da página.
 *
 * Simulados só os três de fora: o Mercado Pago (preferência e consulta do
 * pagamento), a geração do PDF (registrada, não desenhada — o desenho tem
 * teste próprio) e o envio do e-mail (que falha, como hoje, sem domínio: o
 * presente tem de chegar pela página mesmo assim).
 *
 * O banco é um falso em memória que entende a cadeia que as funções usam e
 * as funções de exclusividade da migration 0010 com a semântica de verdade.
 */

const estado = vi.hoisted(() => {
  globalThis.Deno = { env: { get: () => undefined }, serve: () => {} }
  return { banco: null, pagamento: null, preferencias: [] }
})

vi.mock('../supabase/functions/_shared/supabase.ts', async (original) => ({
  ...(await original()),
  admin: () => estado.banco.db,
}))

vi.mock('../supabase/functions/_shared/mercadoPago.ts', async (original) => ({
  ...(await original()),
  criarPreferencia: vi.fn(async (opcoes) => {
    estado.preferencias.push(opcoes)
    return { id: 'pref-1', init_point: 'https://mp.test/pagar', sandbox_init_point: null }
  }),
  verificarAssinatura: vi.fn(async () => true),
  buscarPagamento: vi.fn(async () => estado.pagamento),
}))

vi.mock('../supabase/functions/_shared/certificado.ts', () => ({
  gerarEGuardar: vi.fn(async (_db, pedido, _estrela, luz) => ({
    caminho: `${pedido.id}/certificado${luz ? '-claro' : ''}.pdf`,
    hash: 'h',
  })),
  enviarEmail: vi.fn(async () => {
    throw new Error('domínio não verificado')
  }),
}))

const { checkout } = await import('../supabase/functions/create-checkout/checkout.ts')
const { webhook } = await import('../supabase/functions/mp-webhook/webhook.ts')
const { paginaPublica } = await import('../supabase/functions/get-page/handler.ts')
const { paginaDoGrupo } = await import('../supabase/functions/get-group/handler.ts')
const { gerarEGuardar } = await import('../supabase/functions/_shared/certificado.ts')

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------

function criarBanco() {
  let seq = 0
  const tabelas = {
    products: [{ id: 'prod-1', slug: 'certificado-digital', name: 'Certificado Digital', price_cents: 4900, active: true, star_slugs: [] }],
    stars: [
      { slug: 'vega', name: 'Vega', bayer: 'α Lyrae', constellation: 'Lira', constellation_latin: 'Lyra', ra_hours: 18.6, dec_degrees: 38.8, magnitude: 0.03, distance_ly: 25, story: 'x', active: true, status: 'disponivel', order_id: null, faixas: { price_cents: 24900 } },
      { slug: 'altair', name: 'Altair', bayer: 'α Aquilae', constellation: 'Águia', constellation_latin: 'Aquila', ra_hours: 19.8, dec_degrees: 8.9, magnitude: 0.76, distance_ly: 17, story: 'y', active: true, status: 'disponivel', order_id: null, faixas: { price_cents: 24900 } },
      { slug: 'hip-1', name: 'HD 224700', bayer: 'HIP 1', constellation: 'Peixes', constellation_latin: 'Pisces', ra_hours: 0, dec_degrees: 1, magnitude: 9.1, distance_ly: null, story: 'z', active: true, status: 'disponivel', order_id: null, faixas: { price_cents: 4900 } },
    ],
    orders: [],
    grupos: [],
    pages: [],
    certificate_drafts: [],
  }

  function de(tabela) {
    const q = { op: 'select', filtros: [], valores: null, unico: false, obrigatorio: false, lancar: false }
    const executar = () => {
      let resultado
      if (q.op === 'insert') {
        seq += 1
        // `created_at` crescente: a ordem da compra é a ordem de inserção.
        const criado = new Date(Date.UTC(2026, 9, 15, 12, 0, seq)).toISOString()
        const linha =
          tabela === 'orders'
            ? { id: `pedido-${seq}`, code: `SG-TST${seq}-AAAA`, status: 'pending', delivered_at: null, delivery_started_at: null, created_at: criado, ...q.valores }
            : tabela === 'grupos'
              ? { id: `grupo-${seq}`, code: `GR-TST${seq}-AAAA`, created_at: criado, ...q.valores }
              : { id: `${tabela}-${seq}`, status: 'published', created_at: criado, ...q.valores }
        tabelas[tabela].push(linha)
        resultado = { data: { ...linha }, error: null }
      } else {
        const linhas = tabelas[tabela].filter((l) => q.filtros.every((f) => f(l)))
        if (q.op === 'update') {
          for (const l of linhas) Object.assign(l, q.valores)
          resultado = { data: linhas.map((l) => ({ ...l })), error: null }
        } else if (q.op === 'upsert') {
          tabelas[tabela].push({ ...q.valores })
          resultado = { data: null, error: null }
        } else if (q.unico) {
          resultado = q.obrigatorio && !linhas[0]
            ? { data: null, error: { message: 'nenhuma linha' } }
            : { data: linhas[0] ? { ...linhas[0] } : null, error: null }
        } else {
          resultado = { data: linhas.map((l) => ({ ...l })), error: null }
        }
      }
      if (q.lancar && resultado.error) throw new Error(resultado.error.message)
      return resultado
    }
    const c = {
      select: () => c,
      insert: (v) => ((q.op = 'insert'), (q.valores = v), c),
      update: (v) => ((q.op = 'update'), (q.valores = v), c),
      upsert: (v) => ((q.op = 'upsert'), (q.valores = v), c),
      eq: (col, v) => (q.filtros.push((l) => l[col] === v), c),
      is: (col, v) => (q.filtros.push((l) => (l[col] ?? null) === v), c),
      or: (expr) => {
        const conds = expr.split(',').map((t) => {
          const [col, op, ...resto] = t.split('.')
          const v = resto.join('.')
          return op === 'is' ? (l) => (l[col] ?? null) === null : (l) => l[col] != null && l[col] < v
        })
        q.filtros.push((l) => conds.some((f) => f(l)))
        return c
      },
      maybeSingle: () => ((q.unico = true), c),
      single: () => ((q.unico = true), (q.obrigatorio = true), c),
      throwOnError: () => ((q.lancar = true), c),
      then: (ok, falha) => Promise.resolve().then(executar).then(ok, falha),
    }
    return c
  }

  // As funções da migration 0010, com a mesma regra do SQL.
  const estrela = (slug) => tabelas.stars.find((s) => s.slug === slug)
  const funcoes = {
    consumir_limite: () => true,
    reservar_estrela: ({ p_slug, p_order }) => {
      const s = estrela(p_slug)
      if (s?.status !== 'disponivel') return false
      Object.assign(s, { status: 'reservada', order_id: p_order })
      return true
    },
    dedicar_estrela: ({ p_slug, p_order }) => {
      const s = estrela(p_slug)
      const pode = s && (s.status === 'disponivel' || (['reservada', 'dedicada'].includes(s.status) && s.order_id === p_order))
      if (pode) Object.assign(s, { status: 'dedicada', order_id: p_order })
      return Boolean(pode)
    },
    liberar_estrela: ({ p_slug, p_order }) => {
      const s = estrela(p_slug)
      if (s?.status === 'reservada' && s.order_id === p_order) Object.assign(s, { status: 'disponivel', order_id: null })
      return null
    },
    devolver_estrela: ({ p_slug, p_order }) => {
      const s = estrela(p_slug)
      if (s?.status === 'dedicada' && s.order_id === p_order) Object.assign(s, { status: 'disponivel', order_id: null })
      return null
    },
  }
  const rpc = (nome, args) => {
    const resultado = { data: funcoes[nome](args), error: null }
    const r = { throwOnError: () => r, then: (ok, falha) => Promise.resolve(resultado).then(ok, falha) }
    return r
  }

  return { db: { from: de, rpc }, tabelas, estrela }
}

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

const comprar = (corpo) =>
  checkout(
    new Request('https://x.test/functions/v1/create-checkout', {
      method: 'POST',
      body: JSON.stringify({
        productSlug: 'certificado-digital',
        customerEmail: 'ana@exemplo.com',
        customerName: 'Ana Paula',
        ...corpo,
      }),
    }),
  )

/** O Mercado Pago aprova o pagamento da preferência e avisa o webhook. */
function aprovar(orderId, valorReais, status = 'approved') {
  estado.pagamento = {
    id: 777,
    status,
    external_reference: orderId,
    transaction_amount: valorReais,
    currency_id: 'BRL',
    payment_method_id: 'pix',
    date_approved: '2026-10-15T12:00:00Z',
  }
  return webhook(
    new Request('https://x.test/functions/v1/mp-webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'payment', data: { id: '777' } }),
    }),
  )
}

const abrirPagina = (code) =>
  paginaPublica(new Request('https://x.test/functions/v1/get-page', { method: 'POST', body: JSON.stringify({ code }) }))

beforeEach(() => {
  estado.banco = criarBanco()
  estado.preferencias = []
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ---------------------------------------------------------------------------
// O fluxo
// ---------------------------------------------------------------------------

describe('compra de ponta a ponta', () => {
  it('uma estrela: checkout → pago → dedicada → certificado → página pública', async () => {
    const r = await comprar({ starSlug: 'vega', honoreeName: 'Helena Martins', starNickname: 'Nossa Luz' })
    expect(r.status).toBe(200)
    const pedido = await r.json()
    // Preço da faixa, lido do banco — não do corpo.
    expect(pedido.amountCents).toBe(24900)
    expect(estado.preferencias[0].itens).toHaveLength(1)
    expect(estado.banco.estrela('vega').status).toBe('reservada')

    const entrega = await aprovar(pedido.orderId, 249)
    expect(entrega.status).toBe(200)
    // O e-mail falha (sem domínio), mas o presente chega: estrela, PDF e página.
    expect(await entrega.json()).toMatchObject({ entregue: false, motivo: 'email_falhou', pdfPronto: true })
    expect(estado.banco.estrela('vega')).toMatchObject({ status: 'dedicada', order_id: pedido.orderId })
    expect(gerarEGuardar).toHaveBeenCalledTimes(2)
    expect(gerarEGuardar.mock.calls[0][1].star_nickname).toBe('Nossa Luz')

    const pagina = await (await abrirPagina(pedido.code)).json()
    expect(pagina.pagina.conteudo).toMatchObject({ nome: 'Helena Martins', apelidoEstrela: 'Nossa Luz' })
    expect(pagina.estrela.commonName).toBe('Vega')
    expect(pagina.grupo).toBeNull()
  })

  it('par de estrelas: um pagamento, dois pedidos entregues, cada página aponta para a outra', async () => {
    const r = await comprar({
      starSlug: 'vega',
      honoreeName: 'Helena Martins',
      par: { starSlug: 'altair', honoreeName: 'Pedro Lima' },
    })
    const pedido = await r.json()
    // 10% de desconto no par: R$ 498 → R$ 448, repartido entre os dois pedidos.
    expect(pedido.amountCents).toBe(44800)
    expect(pedido.codePar).toBeTruthy()
    expect(estado.preferencias[0].itens.map((i) => i.precoUnitario)).toEqual([22400, 22400])

    await aprovar(pedido.orderId, 448)
    expect(estado.banco.estrela('vega').status).toBe('dedicada')
    expect(estado.banco.estrela('altair').status).toBe('dedicada')
    expect(estado.banco.tabelas.pages).toHaveLength(2)
    // Cada certificado sai com a linha "Em par com …" da outra estrela.
    const linhas = gerarEGuardar.mock.calls.map(([, p]) => `${p.star_slug}→${p.grupo_linha}`)
    expect(linhas).toContain('vega→Em par com Altair, dedicada a Pedro Lima')
    expect(linhas).toContain('altair→Em par com Vega, dedicada a Helena Martins')

    const daHelena = await (await abrirPagina(pedido.code)).json()
    expect(daHelena.grupo).toMatchObject({ total: 2, outras: [{ pagina: pedido.codePar, para: 'Pedro', estrela: 'Altair' }] })
  })

  it('três estrelas com nome do grupo: 15%, a linha do grupo nas folhas e a página do grupo com as três', async () => {
    const r = await comprar({
      starSlug: 'vega',
      honoreeName: 'Helena Souza',
      outras: [
        { starSlug: 'altair', honoreeName: 'Pedro Souza' },
        { starSlug: 'hip-1', honoreeName: 'Lia Souza', starNickname: 'Caçula' },
      ],
      nomeGrupo: 'Família Souza',
    })
    const pedido = await r.json()
    // 249 + 249 + 49 = R$ 547, com 15%: R$ 464.
    expect(pedido.amountCents).toBe(46400)
    expect(pedido.codes).toHaveLength(3)
    expect(pedido.grupo).toMatch(/^GR-/)
    expect(estado.preferencias[0].itens.reduce((s, i) => s + i.precoUnitario, 0)).toBe(46400)

    await aprovar(pedido.orderId, 464)
    expect(['vega', 'altair', 'hip-1'].map((s) => estado.banco.estrela(s).status)).toEqual(['dedicada', 'dedicada', 'dedicada'])
    expect(new Set(gerarEGuardar.mock.calls.map(([, p]) => p.grupo_linha))).toEqual(new Set(['Uma das três estrelas · Família Souza']))

    const grupo = await (
      await paginaDoGrupo(new Request('https://x.test/functions/v1/get-group', { method: 'POST', body: JSON.stringify({ code: pedido.grupo }) }))
    ).json()
    expect(grupo.nome).toBe('Família Souza')
    expect(grupo.estrelas.map((e) => `${e.para}:${e.estrela}`)).toEqual(['Helena:Vega', 'Pedro:Altair', 'Lia:HD 224700'])
  })

  it('grupo: mais de seis estrelas é recusado, e estrela repetida também', async () => {
    const sete = Array.from({ length: 6 }, (_, i) => ({ starSlug: `x-${i}`, honoreeName: 'Ana Lima' }))
    expect((await comprar({ starSlug: 'vega', honoreeName: 'Helena', outras: sete })).status).toBe(422)
    const repetida = await comprar({ starSlug: 'vega', honoreeName: 'Helena', outras: [{ starSlug: 'vega', honoreeName: 'Pedro' }] })
    expect(await repetida.json()).toMatchObject({ erro: 'estrelas_iguais' })
  })

  it('par: pagar o preço cheio de uma estrela só não entrega nenhum dos dois', async () => {
    const pedido = await (
      await comprar({ starSlug: 'vega', honoreeName: 'Helena', par: { starSlug: 'altair', honoreeName: 'Pedro' } })
    ).json()
    const r = await aprovar(pedido.orderId, 249)
    expect(await r.json()).toMatchObject({ entregue: false, motivo: 'valor_divergente' })
    expect(estado.banco.tabelas.pages).toHaveLength(0)
  })

  it('par: se a segunda estrela já tem dono, nada fica reservado', async () => {
    estado.banco.estrela('altair').status = 'dedicada'
    const r = await comprar({ starSlug: 'vega', honoreeName: 'Helena', par: { starSlug: 'altair', honoreeName: 'Pedro' } })
    expect(r.status).toBe(409)
    expect(estado.banco.estrela('vega').status).toBe('disponivel')
  })

  it('revelação na data: a página fica guardada para quem abre o link', async () => {
    const pedido = await (await comprar({ starSlug: 'hip-1', honoreeName: 'Lívia Souza', revealOn: '2099-01-01' })).json()
    // Data além de um ano é recusada no checkout…
    expect(pedido.erro).toBe('data_invalida')
    const valido = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const ok = await (await comprar({ starSlug: 'hip-1', honoreeName: 'Lívia Souza', revealOn: valido })).json()
    await aprovar(ok.orderId, 49)
    // …e com data válida, a página nasce guardada: sem estrela, sem carta.
    const pagina = await (await abrirPagina(ok.code)).json()
    expect(pagina).toEqual({ guardada: { revelaEm: valido, para: 'Lívia' } })
  })

  it('estorno devolve as duas estrelas do par ao catálogo e tira as páginas do ar', async () => {
    const pedido = await (
      await comprar({ starSlug: 'vega', honoreeName: 'Helena', par: { starSlug: 'altair', honoreeName: 'Pedro' } })
    ).json()
    await aprovar(pedido.orderId, 448)
    await aprovar(pedido.orderId, 448, 'refunded')
    expect(estado.banco.estrela('vega').status).toBe('disponivel')
    expect(estado.banco.estrela('altair').status).toBe('disponivel')
    expect(estado.banco.tabelas.pages.every((p) => p.status === 'draft')).toBe(true)
  })
})
