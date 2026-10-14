/**
 * Webhook do Mercado Pago.
 *
 * É aqui que o dinheiro vira entrega. A sequência é deliberadamente
 * conservadora: qualquer passo que possa falhar de novo tem chance de ser
 * repetido sem cobrar duas vezes.
 *
 *   1. Confere a ASSINATURA do corpo.
 *   2. Busca o pagamento direto na API do Mercado Pago (nunca confia no corpo).
 *   3. Se estiver aprovado, valida o texto de novo e gera o PDF.
 *   4. Grava o PDF, atualiza o pedido, envia o e-mail.
 *
 * Passo 2 é o mais importante e o mais ignorado: o corpo do webhook é algo que
 * *qualquer um* pode forjar com a URL certa. Consultar a API garante que o
 * pagamento exista de verdade, mesmo que a assinatura esteja correta.
 *
 * Idempotência: o Mercado Pago reenvia quando não recebe 200 em 5 segundos.
 * Como os passos 3 e 4 são repetíveis (upsert no Storage, update no banco), o
 * reenvio apenas refaz o trabalho.
 */
import { comHandler, ErroApp, idRequisicao, json } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { buscarPagamento, ehAprovado, verificarAssinatura } from '../_shared/mercadoPago.ts'
import { enviarEmail, gerarEGuardar } from '../_shared/certificado.ts'
import { criarPaginaDoPedido } from '../_shared/pagina.ts'
import { validarPedido } from '../../../shared/moderation.js'

/** Campos que a entrega precisa. Estão na lista porque `select *` num pedido
 *  traz dado de pagamento que não tem por que sair daqui. */
const CAMPOS_PEDIDO = [
  'id', 'code', 'status', 'customer_email', 'customer_name', 'honoree_name',
  'from_name', 'message', 'dedication_date', 'star_slug', 'product_name',
]

Deno.serve(
  comHandler(async (request) => {
    const id = idRequisicao()

    // O corpo precisa ser lido como TEXTO: a assinatura é HMAC sobre os bytes
    // exatos, e `request.json()` já teria reinterpretado o corpo.
    const corpoCru = await request.text()

    let corpo: Record<string, unknown>
    try {
      corpo = JSON.parse(corpoCru || '{}')
    } catch {
      throw new ErroApp('json_invalido', 'Corpo inválido.', 400)
    }

    // O Mercado Pago manda `type: payment` para pagamento e `subscription`
    // para assinatura. A loja só vende pagamento avulso.
    if (corpo.type !== 'payment' && corpo.action !== 'payment.updated') {
      return json(request, { recebido: true, ignorado: 'tipo sem tratamento' })
    }

    const data = (corpo.data ?? {}) as { id?: string | number }
    const paymentId = data.id
    if (paymentId === undefined || paymentId === null) {
      throw new ErroApp('pagamento_ausente', 'Webhook sem id de pagamento.', 400)
    }

    // --- 1. Assinatura --------------------------------------------------
    const assinaturaOk = await verificarAssinatura(request.headers, String(paymentId))
    if (!assinaturaOk) {
      console.warn(`[webhook ${id}] assinatura inválida para o pagamento ${paymentId}`)
      // 401, e não 200: o Mercado Pago deve parar de reenviar. Responder 200
      // aqui significaria aceitar o webhook sem conferir nada.
      throw new ErroApp('assinatura_invalida', 'Assinatura inválida.', 401)
    }

    // --- 2. Confirma direto com o Mercado Pago --------------------------
    const pagamento = await buscarPagamento(paymentId)
    console.log(`[webhook ${id}] pagamento ${pagamento.id} status=${pagamento.status}`)

    const pedidoId = pagamento.external_reference
    if (!pedidoId) {
      throw new ErroApp('referencia_ausente', 'Pagamento sem referência de pedido.', 422)
    }

    const db = admin()
    const { data: pedido, error: erroPedido } = await db
      .from('orders')
      .select(CAMPOS_PEDIDO.join(','))
      .eq('id', pedidoId)
      .maybeSingle()

    if (erroPedido || !pedido) {
      throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
    }

    // --- 3. Registra o status do pagamento ------------------------------
    const novoStatus = traduzirStatus(pagamento.status)
    await db
      .from('orders')
      .update({
        status: novoStatus,
        payment_id: String(pagamento.id),
        payment_method: pagamento.payment_method_id ?? null,
        paid_at: pagamento.date_approved ?? null,
      })
      .eq('id', pedidoId)

    if (!ehAprovado(pagamento.status)) {
      // Pix pendente, boleto não pago, cartão recusado: nada a entregar ainda.
      // 200 porque o evento foi tratado, só não exige ação.
      console.log(`[webhook ${id}] pagamento ${pagamento.id} em ${pagamento.status}; sem entrega`)
      return json(request, { recebido: true, entregue: false, status: novoStatus })
    }

    // --- 4. Entrega ------------------------------------------------------
    // O tipo da linha vem do schema em `migrations/0001_loja.sql`. Num projeto
    // com tipos gerados (`supabase gen types`), este cast sai.
    return entregar(request, db, pedido as unknown as Record<string, unknown>, id, String(pedidoId))
  }, 'mp-webhook'),
)

/**
 * Gera, guarda e envia. Separado do handler porque é o caminho que roda
 * novamente a cada reenvio do webhook.
 */
async function entregar(
  request: Request,
  db: ReturnType<typeof admin>,
  pedido: Record<string, unknown>,
  idLog: string,
  pedidoId: string,
): Promise<Response> {
  /*
   * Valida o texto DE NOVO.
   *
   * A validação do checkout impede a maior parte, mas o pedido é uma linha no
   * banco: ele pode ter sido criado antes da regra existir, ou alterado por
   * alguém com acesso. Barrar aqui significa que o problema é registrado com o
   * pedido pago, e o admin resolve — em vez de um PDF impróprio indo para o
   * e-mail de uma pessoa que já pagou.
   */
  const checagem = validarPedido({
    honoreeName: pedido.honoree_name,
    fromName: pedido.from_name,
    message: pedido.message,
    customerName: pedido.customer_name,
    customerEmail: pedido.customer_email,
  })

  if (!checagem.ok) {
    console.error(`[webhook ${idLog}] pedido ${pedidoId} PAGO com texto não permitido:`, checagem.erros)
    await db.from('orders').update({
      status: 'approved',
      email_error: `Texto bloqueado na entrega: ${checagem.erros.map((e) => e.campo).join(', ')}`,
    }).eq('id', pedidoId)

    // 200 de propósito: o pedido foi pago e o texto precisa de decisão humana.
    // Devolver erro faria o Mercado Pago reenviar para sempre sem resolver.
    return json(request, {
      recebido: true,
      entregue: false,
      motivo: 'texto_nao_permitido',
      suporte: 'revisar pedido',
    })
  }

  // --- Estrela ---------------------------------------------------------
  // `*` porque a página dedicada monta o conteúdo com `story` e `best_month`,
  // que não estão na lista curta de antes — e a linha inteira serve o PDF e o
  // e-mail do mesmo jeito.
  const { data: estrela, error: erroEstrela } = await db
    .from('stars')
    .select('*')
    .eq('slug', pedido.star_slug)
    .maybeSingle()

  if (erroEstrela || !estrela) {
    // A estrela sumiu do catálogo entre a compra e a entrega. O pedido foi
    // pago: marca para o admin e não quebra.
    console.error(`[webhook ${idLog}] estrela ${pedido.star_slug} não encontrada para o pedido ${pedidoId}`)
    await db.from('orders').update({ email_error: 'Estrela não encontrada no catálogo' }).eq('id', pedidoId)
    return json(request, { recebido: true, entregue: false, motivo: 'estrela_inexistente' })
  }

  // --- PDF -------------------------------------------------------------
  // Duas versões: a escura é a original, a clara economiza tinta na impressora.
  let caminho = ''
  let hash = ''
  for (const luz of [false, true]) {
    try {
      const gerado = await gerarEGuardar(db, pedido, estrela as Record<string, unknown>, luz)
      caminho = gerado.caminho
      hash = gerado.hash
    } catch (erro) {
      console.error(`[webhook ${idLog}] falha ao gerar o PDF (${luz ? 'claro' : 'escuro'}):`, erro)
      await db.from('orders').update({ email_error: 'Falha ao gerar o PDF' }).eq('id', pedidoId)
      // 500 para o Mercado Pago reenviar: é uma falha transitória de infra,
      // e o passo é idempotente.
      throw erro
    }
  }

  await db.from('certificate_drafts').upsert({
    order_id: pedidoId,
    storage_path: caminho,
    content_hash: hash,
    page_count: 1,
  })

  // --- Página dedicada --------------------------------------------------
  // ANTES do e-mail, porque o link vai no corpo. Idempotente pelo pedido
  // (unique em `pages`), então o reenvio do webhook não reescreve o que o
  // cliente ou o admin já editou. E nunca derruba a entrega: falha aqui vira
  // log, e a página pode ser criada pelo painel depois.
  try {
    const paginaId = await criarPaginaDoPedido(db, pedido, estrela as Record<string, unknown>)
    if (paginaId) console.log(`[webhook ${idLog}] página criada para o pedido ${pedidoId}`)
  } catch (erro) {
    console.error(`[webhook ${idLog}] página não criada para ${pedidoId}:`, erro)
  }

  // --- E-mail ----------------------------------------------------------
  try {
    // A estrela vem junto porque o e-mail mostra o nome e a constelação, e
    // esses campos não existem em `orders` — só o `star_slug`.
    await enviarEmail(db, pedido, estrela, caminho)
    await db
      .from('orders')
      .update({
        certificate_path: caminho,
        certificate_url: caminho,
        delivered_at: new Date().toISOString(),
        email_error: null,
      })
      .eq('id', pedidoId)

    console.log(`[webhook ${idLog}] pedido ${pedidoId} entregue para ${pedido.customer_email}`)
    return json(request, { recebido: true, entregue: true, pedido: pedidoId })
  } catch (erro) {
    /*
     * O PDF está no Storage e o pedido está pago: só o e-mail falhou.
     *
     * O `email_error` é o que permite ao admin reenviar sem gerar tudo de
     * novo, e a resposta é 200 para o Mercado Pago parar de reenviar — o
     * reenvio não resolveria uma falha do Resend, e cada tentativa custaria
     * uma nova geração de PDF.
     */
    console.error(`[webhook ${idLog}] e-mail falhou para o pedido ${pedidoId}:`, erro)
    await db
      .from('orders')
      .update({
        certificate_path: caminho,
        certificate_url: caminho,
        email_error: erro instanceof ErroApp ? erro.message : 'Falha desconhecida no e-mail',
      })
      .eq('id', pedidoId)

    return json(request, { recebido: true, entregue: false, motivo: 'email_falhou', pdfPronto: true })
  }
}

/**
 * Vocabulário do Mercado Pago para o nosso.
 *
 * O `chargeback` precisa de coluna própria: é o caso em que o banco estornou,
 * e o pedido continua `approved` para sempre se ninguém olhar.
 */
function traduzirStatus(status: string): string {
  switch (status) {
    case 'approved':
      return 'approved'
    case 'in_process':
    case 'pending':
    case 'authorized':
      return 'in_process'
    case 'rejected':
    case 'cancelled':
      return 'cancelled'
    case 'charged_back':
      return 'charged_back'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}
