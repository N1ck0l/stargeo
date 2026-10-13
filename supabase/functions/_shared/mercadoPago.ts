/**
 * Cliente do Mercado Pago.
 *
 * Fala com a API v1 por `fetch`, sem SDK: o SDK oficial é enorme para o que
 * usamos (uma preferência, uma consulta e uma assinatura) e traz dependências
 * que não funcionam bem no runtime da Edge Function.
 */
import { ErroApp } from './http.ts'
import { variavel } from './supabase.ts'

const BASE = 'https://api.mercadopago.com'

function headers(idempotencyKey?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${variavel('MERCADO_PAGO_ACCESS_TOKEN')}`,
    'Content-Type': 'application/json',
  }
  if (idempotencyKey) h['X-Idempotency-Key'] = idempotencyKey
  return h
}

export interface ItemPreferencia {
  titulo: string
  descricao: string
  /** Quantia em CENTAVOS. */
  quantidade: number
  /** Unitário em centavos. */
  precoUnitario: number
}

export interface Preferencia {
  id: string
  init_point: string
  sandbox_init_point: string
}

/**
 * Cria a preferência de pagamento.
 *
 * `external_reference` é o elo entre o Mercado Pago e o nosso banco: é por ele
 * que o webhook descobre qual pedido é. Por isso ele vai no corpo da
 * preferência, e não num header — header some em redirecionamentos.
 *
 * @param opcoes.externalReference código do pedido (idempotente por natureza)
 * @param opcoes.payerEmail        usado pelo Mercado Pago para lembrar o cartão
 *                                 no retorno; não é confiança de nada
 */
export async function criarPreferencia(opcoes: {
  itens: ItemPreferencia[]
  payerEmail: string
  payerName?: string
  externalReference: string
}): Promise<Preferencia> {
  const payload = {
    items: opcoes.itens.map((item) => ({
      title: item.titulo,
      description: item.descricao,
      quantity: item.quantidade,
      currency_id: 'BRL',
      // `precoUnitario` chega em CENTAVOS; a API do Mercado Pago espera
      // reais. Sem a divisão, R$ 49,00 viraria R$ 4.900,00 na fatura.
      unit_price: Math.round(item.precoUnitario) / 100,
    })),
    payer: {
      email: opcoes.payerEmail,
      ...(opcoes.payerName ? { name: opcoes.payerName } : {}),
    },
    external_reference: opcoes.externalReference,
    //statement_descriptor aparece na fatura do cartão. Sem isso o cliente vê
    // "MERCADOPAGO" e não sabe o que comprou — generate um código curto e
    // reconhecível, dentro do limite do adquirente.
    statement_descriptor: variavel('MP_STATEMENT_DESCRIPTOR'),
    payment_methods: {
      /*
       * Só o marketplace sai. `bank_transfer` NÃO pode entrar nesta lista:
       * no Mercado Pago o tipo de pagamento `bank_transfer` É o Pix (documentação
       * da API: "bank_transfer: Pix, SPEI, PSE e Yape"). Excluí-lo esconderia o
       * Pix do checkout — no Brasil, o meio preferido de pagamento.
       */
      excluded_payment_types: [{ id: 'marketplace' }],
      installments: 1,
      default_installments: 1,
    },
    // Volta para a página de obrigado da loja depois do pagamento.
    back_urls: {
      success: `${variavel('PUBLIC_SITE_URL')}/obrigado`,
      pending: `${variavel('PUBLIC_SITE_URL')}/obrigado`,
      failure: `${variavel('PUBLIC_SITE_URL')}/obrigado`,
    },
    auto_return: 'approved',
    binary_mode: false,
  }

  const resposta = await fetch(`${BASE}/checkout/preferences`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  })

  if (!resposta.ok) {
    const corpo = await resposta.text()
    throw new ErroApp('mp_preferencia_falhou', 'Não foi possível iniciar o pagamento.', 502, corpo)
  }

  const dados = await resposta.json()
  return {
    id: dados.id,
    init_point: dados.init_point,
    sandbox_init_point: dados.sandbox_init_point,
  }
}

export interface Pagamento {
  id: number
  status: string
  status_detail?: string
  external_reference?: string
  date_approved?: string
  date_last_updated?: string
  payment_method_id?: string
  transaction_amount: number
}

/** Busca um pagamento pelo id. */
export async function buscarPagamento(id: string | number): Promise<Pagamento> {
  const resposta = await fetch(`${BASE}/v1/payments/${encodeURIComponent(String(id))}`, {
    headers: headers(),
  })
  if (!resposta.ok) {
    throw new ErroApp('mp_consulta_falhou', 'Não foi possível consultar o pagamento.', 502, await resposta.text())
  }
  return resposta.json()
}

/**
 * Valida a assinatura do webhook.
 *
 * O Mercado Pago manda `x-signature: ts=...;v1=...` e um `x-request-id`. O
 * segredo compartilhado assina a string
 *
 *     id:{dataId};request-id:{x-request-id};ts:{ts};
 *
 * e o resultado precisa bater com o `v1` (SHA-256 em hex). Sem essa checagem,
 * qualquer um que descobrisse a URL da função poderia forjar um "pagamento
 * aprovado" e receberia o certificado de graça.
 *
 * @param cabecalhos    `x-signature` e `x-request-id` da requisição
 * @param dataId        id do pagamento, vindo do corpo já parseado
 *
 * O corpo cru NÃO entra aqui: ele é conferido contra o HMAC antes, no handler,
 * e repassado só o id — que é o que a assinatura cobre.
 */
export async function verificarAssinatura(
  cabecalhos: Headers,
  dataId: string,
): Promise<boolean> {
  const assinatura = cabecalhos.get('x-signature')
  const requestId = cabecalhos.get('x-request-id')
  if (!assinatura || !requestId) return false

  const partes = Object.fromEntries(
    assinatura.split(',').map((parte) => {
      const [chave, valor] = parte.trim().split('=')
      return [chave, valor]
    }),
  )

  if (!partes.ts || !partes.v1) return false

  const manifesto = `id:${dataId};request-id:${requestId};ts:${partes.ts};`
  const segredo = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')
  if (!segredo) return false

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinaturaBytes = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto))
  const esperada = Array.from(new Uint8Array(assinaturaBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparação de tempo constante, para não vazar informação por timing.
  return compararSeguro(esperada, partes.v1)
}

/** Comparação que não retorna cedo — o tempo não pode depender do conteúdo. */
function compararSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** 'approved' | 'in_process' | ... no vocabulário do Mercado Pago. */
export function ehAprovado(status: string | undefined): boolean {
  return status === 'approved'
}
