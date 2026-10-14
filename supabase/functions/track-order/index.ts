/**
 * Rastreamento de pedido por código + e-mail.
 *
 * Por que dois fatores: o código sozinho (`SG-AB3K-9ZXM`) tem 8 caracteres de
 * um alfabeto de 31 — cerca de 40 bits. Daria para testar todas as combinações
 * em minutos num hardware comum, e o resultado seria ver o nome e o e-mail de
 * quem comprou um presente. Exigir o e-mail junto derruba isso para um espaço
 * que precisa de um e-mail válido.
 *
 * A tabela `orders` não é pública por RLS justamente para esta função ser o
 * único caminho de leitura.
 *
 * URL: `https://<ref>.supabase.co/functions/v1/track-order`, chamada pelo
 * rastreio da loja. Publicada com `--no-verify-jwt` (ver `LOJA.md`) — não há
 * sessão de ninguém: o par (código, e-mail) É a credencial.
 *
 * Sem efeitos colaterais: leitura pura. E o retorno é montado campo a campo
 * (ver `CAMPOS`), porque a service_role enxerga a linha inteira — é o mapa de
 * saída, não o RLS, que decide o que o cliente vê.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'

/**
 * O que volta para o cliente.
 *
 * Deliberadamente incompleto: sem CPF, sem `customer_doc` e sem o endereço
 * completo. O suficiente para a pessoa se reconhecer, sem transformar o
 * rastreamento em um dossiê de quem comprou o quê.
 */
const CAMPOS = [
  'code',
  'status',
  'product_name',
  'star_slug',
  'honoree_name',
  'dedication_date',
  'amount_cents',
  'created_at',
  'delivered_at',
  'email_error',
]

/**
 * A linha do pedido, como existe em `migrations/0001_loja.sql`.
 *
 * Declarada aqui porque o SDK não tem tipos gerados para este projeto; com
 * `supabase gen types typescript`, o cast de baixo sai.
 */
interface PedidoRastreio {
  code: string
  status: string
  product_name: string
  star_slug: string
  honoree_name: string
  dedication_date: string | null
  amount_cents: number
  created_at: string
  delivered_at: string | null
  email_error: string | null
}

Deno.serve(
  comHandler(async (request) => {
    const { code, email } = (await lerJson(request)) as { code?: string; email?: string }

    if (!code || !email) {
      throw new ErroApp('campos_ausentes', 'Informe o código e o e-mail do pedido.')
    }

    const codigo = String(code).trim().toUpperCase()
    const endereco = String(email).trim().toLowerCase()

    // Validação de formato ANTES de consultar: evita gastar uma consulta do
    // banco com lixo, e a resposta é a mesma para código e e-mail inválidos.
    if (!/^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
      throw new ErroApp('codigo_invalido', 'Código de pedido inválido. O formato é SG-XXXX-XXXX.', 422)
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(endereco)) {
      throw new ErroApp('email_invalido', 'Endereço de e-mail inválido.', 422)
    }

    const db = admin()
    const { data, error } = await db
      .from('orders')
      .select(CAMPOS.join(','))
      .eq('code', codigo)
      .eq('customer_email', endereco)
      .maybeSingle()

    if (error) {
      throw new ErroApp('consulta_falhou', 'Não foi possível consultar o pedido.', 500, error.message)
    }

    const pedido = data as unknown as PedidoRastreio | null

    if (!pedido) {
      /*
       * Mesma resposta para "não existe" e "e-mail não bate". Distinguir os
       * dois entregaria a quem tem o código a confirmação de que ele existe.
       */
      throw new ErroApp('nao_encontrado', 'Não encontramos pedido com esse código e e-mail.', 404)
    }

    // Estrela em join leve: uma consulta só, em vez do nome cru do slug.
    const { data: estrela } = await db
      .from('stars')
      .select('name, constellation')
      .eq('slug', pedido.star_slug)
      .maybeSingle()

    return json(request, {
      pedido: {
        code: pedido.code,
        status: pedido.status,
        statusLabel: rotularStatus(pedido.status),
        produto: pedido.product_name,
        estrela: estrela?.name ?? pedido.star_slug,
        constelacao: estrela?.constellation ?? null,
        paraQuem: pedido.honoree_name,
        data: pedido.dedication_date,
        valorCentavos: pedido.amount_cents,
        criadoEm: pedido.created_at,
        entregueEm: pedido.delivered_at,
        pendencia: pedido.email_error ?? null,
      },
    })
  }, 'track-order'),
)

/** Rótulo em português, porque o código do banco vaza para a tela. */
function rotularStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Aguardando pagamento'
    case 'approved':
      return 'Pagamento aprovado'
    case 'in_process':
      return 'Pagamento em análise'
    case 'rejected':
      return 'Pagamento recusado'
    case 'cancelled':
      return 'Pedido cancelado'
    case 'refunded':
      return 'Pagamento estornado'
    case 'charged_back':
      return 'Pagamento devolvido'
    default:
      return 'Em processamento'
  }
}
