/**
 * Cliente do Mercado Pago.
 *
 * Fala com a API v1 por `fetch`, sem SDK: o SDK oficial é enorme para o que
 * usamos (uma preferência, uma consulta e uma assinatura) e traz dependências
 * que não funcionam bem no runtime da Edge Function.
 *
 * Quem usa: `create-checkout` (criar a preferência), `mp-webhook` (consultar o
 * pagamento e conferir a assinatura do corpo). Autenticação: Bearer do
 * `MERCADO_PAGO_ACCESS_TOKEN` — segredo que só existe em `supabase secrets`.
 * Nenhum valor daqui volta para o navegador.
 */
import { compararSeguro, ErroApp } from './http.ts'
import { variavel } from './supabase.ts'

const BASE = 'https://api.mercadopago.com'

/**
 * Cabeçalhos comuns a toda chamada: o token da conta e o content-type.
 *
 * `X-Idempotency-Key` fica opcional: quando presente, o Mercado Pago trata a
 * repetição da mesma chave como a mesma operação — é o que evita criar duas
 * preferências idênticas se a rede repetir a chamada.
 */
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
  /** Link de pagamento em produção — é o que vai para o cliente. */
  init_point: string
  /** Mesmo link, no ambiente de teste do Mercado Pago. */
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
  /** Vocabulário do Mercado Pago — ver `ehAprovado` e `traduzirStatus`. */
  status: string
  status_detail?: string
  /** `external_reference` é o que amarra o pagamento ao nosso `orders.id`. */
  external_reference?: string
  date_approved?: string
  date_last_updated?: string
  payment_method_id?: string
  /** Em REAIS (a API não fala em centavos). */
  transaction_amount: number
  /** `BRL` para tudo que a loja vende. */
  currency_id?: string
}

/**
 * Busca um pagamento pelo id.
 *
 * É a FONTE DA VERDADE do webhook: o corpo que chega é forjável por qualquer
 * um que descubra a URL, então o status que decide a entrega é este — lido
 * direto na API, com o token da conta.
 */
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

/**
 * `approved` é o único status que autoriza entregar.
 *
 * `in_process` (Pix caindo, cartão em análise), `rejected` e companhia
 * continuam o ciclo normal do Mercado Pago — o webhook grava o status no
 * pedido e espera o próximo evento.
 */
export function ehAprovado(status: string | undefined): boolean {
  return status === 'approved'
}

/**
 * O pagamento cobriu o pedido? Valor em centavos e moeda precisam bater.
 *
 * O status `approved` diz que ALGUM dinheiro entrou, não que foi o preço do
 * pedido. A preferência é criada no servidor com o valor do banco, então hoje
 * não há caminho conhecido para pagar menos — esta conferência é a última
 * linha de defesa para quando surgir um (preferência reaproveitada, pagamento
 * criado por fora com o mesmo `external_reference`, erro de configuração).
 */
export function valorConfere(pagamento: Pick<Pagamento, 'transaction_amount' | 'currency_id'>, centavos: number): boolean {
  if (pagamento.currency_id && pagamento.currency_id !== 'BRL') return false
  return Math.round(Number(pagamento.transaction_amount) * 100) >= centavos
}
