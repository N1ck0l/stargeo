import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Webhook do Mercado Pago e reenvio do certificado — as duas portas por onde
 * o dinheiro vira e-mail.
 *
 * Os bugs que este arquivo impede de voltar:
 *
 * - Cada evento aprovado (o Mercado Pago manda `payment.created` E
 *   `payment.updated`, além dos reenvios) gerava o PDF e mandava o e-mail de
 *   novo. Dois eventos simultâneos entregavam em paralelo.
 * - Gravação que falhava no banco passava calada: o supabase-js devolve o
 *   erro em vez de lançar, e o webhook respondia 200.
 * - O valor pago não era conferido contra o pedido.
 * - O `resend-certificate` aceitava qualquer JWT do projeto — inclusive a
 *   chave anon, que está no bundle público — e reenviava pedido `in_process`.
 *
 * O banco é um falso em memória que entende só a cadeia que as funções usam
 * (`select/update/upsert` + `eq/is/or` + `maybeSingle/throwOnError`). Cada
 * operação roda inteira num único microtask, como uma instrução SQL: é isso
 * que deixa o teste de concorrência significativo.
 */

const SERVICE_ROLE = 'chave-service-role-de-teste'

const estado = vi.hoisted(() => {
  // `resend-certificate/index.ts` chama `Deno.serve` ao ser importado.
  globalThis.Deno = { env: { get: () => undefined }, serve: () => {} }
  return { banco: null, pagamento: null }
})

vi.mock('../supabase/functions/_shared/supabase.ts', async (original) => ({
  ...(await original()),
  admin: () => estado.banco.db,
}))

vi.mock('../supabase/functions/_shared/mercadoPago.ts', async (original) => ({
  ...(await original()),
  verificarAssinatura: vi.fn(async () => true),
  buscarPagamento: vi.fn(async () => estado.pagamento),
}))

vi.mock('../supabase/functions/_shared/certificado.ts', () => ({
  gerarEGuardar: vi.fn(async (_db, _pedido, _estrela, luz) => ({
    caminho: `pedidos/SG-AB3K-9ZXM-${luz ? 'claro' : 'escuro'}.pdf`,
    hash: 'abc',
  })),
  enviarEmail: vi.fn(async () => {}),
}))

vi.mock('../supabase/functions/_shared/pagina.ts', () => ({
  criarPaginaDoPedido: vi.fn(async () => 'pagina-1'),
}))

const { webhook } = await import('../supabase/functions/mp-webhook/webhook.ts')
const { reenvio } = await import('../supabase/functions/resend-certificate/index.ts')
const { enviarEmail, gerarEGuardar } = await import('../supabase/functions/_shared/certificado.ts')

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------

/** `col.is.null` / `col.lt.valor` — o pedaço de PostgREST que o webhook usa. */
function condicao(texto) {
  const [coluna, op, ...resto] = texto.split('.')
  const valor = resto.join('.')
  if (op === 'is' && valor === 'null') return (linha) => (linha[coluna] ?? null) === null
  if (op === 'lt') return (linha) => linha[coluna] != null && linha[coluna] < valor
  throw new Error(`condição não suportada no falso: ${texto}`)
}

function criarBanco({ pedido, estrela, falharUpdateDe = null, estrelaDeOutro = false }) {
  const tabelas = {
    orders: [{ ...pedido }],
    stars: estrela ? [{ ...estrela }] : [],
    certificate_drafts: [],
  }

  function de(tabela) {
    const q = { op: 'select', filtros: [], valores: null, devolver: false, unico: false, lancar: false }

    function executar() {
      const linhas = tabelas[tabela].filter((linha) => q.filtros.every((f) => f(linha)))
      let resultado

      if (q.op === 'update' && falharUpdateDe && falharUpdateDe in q.valores) {
        resultado = { data: null, error: { message: 'conexão perdida' } }
      } else if (q.op === 'update') {
        for (const linha of linhas) Object.assign(linha, q.valores)
        resultado = { data: q.devolver ? linhas.map((l) => ({ id: l.id })) : null, error: null }
      } else if (q.op === 'upsert') {
        tabelas[tabela].push({ ...q.valores })
        resultado = { data: null, error: null }
      } else if (q.unico) {
        resultado = { data: linhas[0] ? { ...linhas[0] } : null, error: null }
      } else {
        resultado = { data: linhas, error: null }
      }

      if (q.lancar && resultado.error) throw new Error(resultado.error.message)
      return resultado
    }

    const construtor = {
      select() {
        if (q.op !== 'select') q.devolver = true
        return construtor
      },
      update(valores) {
        q.op = 'update'
        q.valores = valores
        return construtor
      },
      upsert(valores) {
        q.op = 'upsert'
        q.valores = valores
        return construtor
      },
      eq(coluna, valor) {
        q.filtros.push((linha) => linha[coluna] === valor)
        return construtor
      },
      is(coluna, valor) {
        q.filtros.push((linha) => (linha[coluna] ?? null) === valor)
        return construtor
      },
      or(expressao) {
        const conds = expressao.split(',').map(condicao)
        q.filtros.push((linha) => conds.some((c) => c(linha)))
        return construtor
      },
      maybeSingle() {
        q.unico = true
        return construtor
      },
      throwOnError() {
        q.lancar = true
        return construtor
      },
      then(ok, falha) {
        return Promise.resolve().then(executar).then(ok, falha)
      },
    }
    return construtor
  }

  /*
   * As funções de exclusividade (migration 0010). `estrelaDeOutro` simula a
   * reserva que venceu e outra pessoa comprou a mesma estrela no meio tempo.
   */
  const chamadas = []
  const rpc = (nome, args) => {
    chamadas.push({ nome, args })
    const resultado = { data: nome === 'dedicar_estrela' ? !estrelaDeOutro : null, error: null }
    const r = { throwOnError: () => r, then: (ok, falha) => Promise.resolve(resultado).then(ok, falha) }
    return r
  }

  return { db: { from: de, rpc }, pedido: () => tabelas.orders[0], tabelas, chamadas }
}

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const PEDIDO = {
  id: 'pedido-1',
  code: 'SG-AB3K-9ZXM',
  status: 'pending',
  amount_cents: 4900,
  customer_email: 'ana@exemplo.com',
  customer_name: 'Ana Paula',
  honoree_name: 'Geovanna',
  from_name: null,
  message: null,
  dedication_date: null,
  star_slug: 'kaus-australis',
  product_name: 'Certificado Digital',
  delivered_at: null,
  delivery_started_at: null,
  email_error: null,
  certificate_path: null,
}

const ESTRELA = { slug: 'kaus-australis', name: 'Kaus Australis', constellation: 'Sagitário' }

function pagamento(extra = {}) {
  return {
    id: 123,
    status: 'approved',
    external_reference: 'pedido-1',
    transaction_amount: 49,
    currency_id: 'BRL',
    payment_method_id: 'pix',
    date_approved: '2026-10-14T12:00:00Z',
    ...extra,
  }
}

function evento() {
  return new Request('https://x.test/functions/v1/mp-webhook', {
    method: 'POST',
    body: JSON.stringify({ type: 'payment', data: { id: '123' } }),
  })
}

function pedidoDeReenvio(token, orderId = 'pedido-1') {
  return new Request('https://x.test/functions/v1/resend-certificate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId }),
  })
}

beforeEach(() => {
  globalThis.Deno.env.get = (nome) => ({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE })[nome]
  estado.banco = criarBanco({ pedido: PEDIDO, estrela: ESTRELA })
  estado.pagamento = pagamento()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

describe('mp-webhook', () => {
  it('entrega o pedido aprovado: dois PDFs, um e-mail, delivered_at gravado', async () => {
    const resposta = await webhook(evento())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ entregue: true })
    expect(gerarEGuardar).toHaveBeenCalledTimes(2)
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    expect(estado.banco.pedido()).toMatchObject({ status: 'approved', email_error: null })
    expect(estado.banco.pedido().delivered_at).toBeTruthy()
    expect(estado.banco.pedido().certificate_path).toContain('SG-AB3K-9ZXM')
    // A reserva sai no fim — ela não pode sobrar num pedido entregue.
    expect(estado.banco.pedido().delivery_started_at).toBeNull()
  })

  it('não reenvia o e-mail no segundo evento do mesmo pagamento', async () => {
    await webhook(evento())
    const segunda = await webhook(evento())

    expect(segunda.status).toBe(200)
    expect(await segunda.json()).toMatchObject({ repetido: true })
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    expect(gerarEGuardar).toHaveBeenCalledTimes(2)
  })

  it('dois eventos simultâneos entregam uma vez só', async () => {
    const respostas = await Promise.all([webhook(evento()), webhook(evento()), webhook(evento())])

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200])
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    expect(gerarEGuardar).toHaveBeenCalledTimes(2)
  })

  it('reserva vencida (função que morreu no meio) não trava o pedido', async () => {
    estado.banco = criarBanco({
      pedido: { ...PEDIDO, delivery_started_at: new Date(Date.now() - 10 * 60_000).toISOString() },
      estrela: ESTRELA,
    })

    await webhook(evento())

    expect(enviarEmail).toHaveBeenCalledTimes(1)
  })

  it('não entrega quando o valor pago é menor que o do pedido', async () => {
    estado.pagamento = pagamento({ transaction_amount: 1 })

    const resposta = await webhook(evento())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ entregue: false, motivo: 'valor_divergente' })
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(estado.banco.pedido().email_error).toMatch(/Valor pago diverge/)
  })

  it('não entrega quando a moeda não é real', async () => {
    estado.pagamento = pagamento({ currency_id: 'USD' })

    await webhook(evento())

    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('responde 500 (para o Mercado Pago reenviar) quando a gravação do status falha', async () => {
    estado.banco = criarBanco({ pedido: PEDIDO, estrela: ESTRELA, falharUpdateDe: 'status' })

    const resposta = await webhook(evento())

    expect(resposta.status).toBe(500)
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('estrela exclusiva: aprovado dedica a estrela a ESTE pedido antes de entregar', async () => {
    await webhook(evento())
    expect(estado.banco.chamadas).toContainEqual({ nome: 'dedicar_estrela', args: { p_slug: 'kaus-australis', p_order: 'pedido-1' } })
  })

  it('estrela que já é de outro pedido: não entrega e deixa a pendência para o admin', async () => {
    estado.banco = criarBanco({ pedido: PEDIDO, estrela: ESTRELA, estrelaDeOutro: true })

    const resposta = await webhook(evento())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ entregue: false, motivo: 'estrela_ja_dedicada' })
    expect(enviarEmail).not.toHaveBeenCalled()
    expect(estado.banco.pedido().email_error).toMatch(/já dedicada a outro pedido/)
  })

  it('pagamento recusado devolve a estrela ao catálogo', async () => {
    estado.pagamento = pagamento({ status: 'rejected' })

    await webhook(evento())

    expect(estado.banco.pedido().status).toBe('cancelled')
    expect(estado.banco.chamadas).toContainEqual({ nome: 'liberar_estrela', args: { p_slug: 'kaus-australis', p_order: 'pedido-1' } })
  })

  it('pagamento pendente grava o status e não entrega', async () => {
    estado.pagamento = pagamento({ status: 'in_process' })

    const resposta = await webhook(evento())

    expect(await resposta.json()).toMatchObject({ entregue: false, status: 'in_process' })
    expect(estado.banco.pedido().status).toBe('in_process')
    expect(gerarEGuardar).not.toHaveBeenCalled()
  })

  it('e-mail falho fica registrado, guarda o PDF e libera o próximo evento para tentar', async () => {
    enviarEmail.mockRejectedValueOnce(new Error('Resend fora'))

    const primeira = await webhook(evento())
    expect(await primeira.json()).toMatchObject({ motivo: 'email_falhou', pdfPronto: true })
    expect(estado.banco.pedido().email_error).toBeTruthy()
    expect(estado.banco.pedido().certificate_path).toBeTruthy()
    expect(estado.banco.pedido().delivered_at).toBeNull()
    expect(estado.banco.pedido().delivery_started_at).toBeNull()

    const segunda = await webhook(evento())
    expect(await segunda.json()).toMatchObject({ entregue: true })
    expect(estado.banco.pedido().email_error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Reenvio
// ---------------------------------------------------------------------------

describe('resend-certificate', () => {
  const PAGO_COM_ERRO = {
    ...PEDIDO,
    status: 'approved',
    certificate_path: 'pedidos/SG-AB3K-9ZXM-claro.pdf',
    email_error: 'Não foi possível enviar o e-mail.',
  }

  it('recusa quem não é a service_role — a chave anon também é um JWT válido', async () => {
    estado.banco = criarBanco({ pedido: PAGO_COM_ERRO, estrela: ESTRELA })

    const resposta = await reenvio(pedidoDeReenvio('eyJ-chave-anon-publica'))

    expect(resposta.status).toBe(403)
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('recusa sem Authorization', async () => {
    const resposta = await reenvio(
      new Request('https://x.test', { method: 'POST', body: JSON.stringify({ orderId: 'pedido-1' }) }),
    )

    expect(resposta.status).toBe(403)
  })

  it('recusa pedido em análise: in_process não é pago', async () => {
    estado.banco = criarBanco({ pedido: { ...PAGO_COM_ERRO, status: 'in_process' }, estrela: ESTRELA })

    const resposta = await reenvio(pedidoDeReenvio(SERVICE_ROLE))

    expect(resposta.status).toBe(409)
    expect(enviarEmail).not.toHaveBeenCalled()
  })

  it('reenvia com a service_role e limpa a pendência', async () => {
    estado.banco = criarBanco({ pedido: PAGO_COM_ERRO, estrela: ESTRELA })

    const resposta = await reenvio(pedidoDeReenvio(SERVICE_ROLE))

    expect(resposta.status).toBe(200)
    expect(enviarEmail).toHaveBeenCalledTimes(1)
    expect(estado.banco.pedido().email_error).toBeNull()
    expect(estado.banco.pedido().delivered_at).toBeTruthy()
  })
})
