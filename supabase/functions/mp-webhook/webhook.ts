/**
 * Webhook do Mercado Pago — o handler. `index.ts` só o publica com
 * `Deno.serve`; separado para os testes (`test/webhook.test.js`) chamarem o
 * fluxo inteiro sem subir servidor.
 *
 * É aqui que o dinheiro vira entrega. A sequência é deliberadamente
 * conservadora: qualquer passo que possa falhar de novo tem chance de ser
 * repetido sem cobrar nem entregar duas vezes.
 *
 *   1. Confere a ASSINATURA do corpo.
 *   2. Busca o pagamento direto na API do Mercado Pago (nunca confia no corpo).
 *   3. Grava o status. Se aprovado, confere VALOR e moeda contra o pedido.
 *   4. RESERVA a entrega (update condicional) — só um evento entrega.
 *   5. Valida o texto de novo, gera o PDF, cria a página, envia o e-mail.
 *
 * Passo 2 é o mais importante e o mais ignorado: o corpo do webhook é algo que
 * *qualquer um* pode forjar com a URL certa. Consultar a API garante que o
 * pagamento exista de verdade, mesmo que a assinatura esteja correta.
 *
 * Idempotência: o Mercado Pago manda mais de um evento por pagamento
 * (`payment.created`, `payment.updated`) e reenvia quando não recebe 200 em
 * 5 segundos. Pedido com `delivered_at` não é entregue de novo, e a reserva do
 * passo 4 impede dois eventos simultâneos de entregarem em paralelo.
 *
 * Toda escrita no banco usa `throwOnError()`: o supabase-js DEVOLVE o erro em
 * vez de lançar, e uma gravação que falha calada responderia 200 — o Mercado
 * Pago pararia de reenviar sem o pedido ter mudado.
 *
 * URL: `https://<ref>.supabase.co/functions/v1/mp-webhook`, a que se cadastra
 * no painel do Mercado Pago (passo 4 do roteiro em `LOJA.md`). Publicada com
 * `--no-verify-jwt`: o Mercado Pago não tem JWT nosso — o que ele manda é a
 * assinatura HMAC do header `x-signature`, conferida no passo 1.
 *
 * Regra das respostas: 200 quando o evento foi tratado e não há nada a fazer
 * AGORA — pagamento não aprovado, já entregue, valor divergente, texto
 * barrado, estrela sumida ou e-mail falho (marcado em `email_error`, para o
 * painel resolver); 5xx quando o reenvio AJUDA, isto é, em falha transitória
 * de infra (PDF, consulta ao Mercado Pago, banco).
 */
import { comHandler, ErroApp, idRequisicao, json } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { buscarPagamento, ehAprovado, valorConfere, verificarAssinatura } from '../_shared/mercadoPago.ts'
import { enviarEmail, gerarEGuardar } from '../_shared/certificado.ts'
import { criarPaginaDoPedido } from '../_shared/pagina.ts'
import { dadosDoGrupo, linhaParaCertificado } from '../_shared/par.ts'
import { validarPedido } from '../../../shared/moderation.js'

/** Campos que a entrega precisa. Estão na lista porque `select *` num pedido
 *  traz dado de pagamento que não tem por que sair daqui. */
const CAMPOS_PEDIDO = [
  'id', 'code', 'status', 'customer_email', 'customer_name', 'honoree_name',
  'from_name', 'star_nickname', 'message', 'letter', 'dedication_date', 'reveal_on', 'star_slug', 'product_name',
  'amount_cents', 'delivered_at', 'group_id', 'cupom',
]

/** Reserva mais velha que isto é de uma função que morreu no meio. */
const RESERVA_VENCE_MS = 5 * 60_000

type Db = ReturnType<typeof admin>

export const webhook = comHandler(async (request) => {
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
  const { data: linha, error: erroPedido } = await db
    .from('orders')
    .select(CAMPOS_PEDIDO.join(','))
    .eq('id', pedidoId)
    .maybeSingle()

  if (erroPedido) {
    throw new ErroApp('consulta_falhou', 'Não foi possível ler o pedido.', 500, erroPedido.message)
  }
  if (!linha) {
    throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
  }
  // O tipo da linha vem do schema em `migrations/0001_loja.sql`. Num projeto
  // com tipos gerados (`supabase gen types`), este cast sai.
  const pedido = linha as unknown as Record<string, unknown>

  // Par de estrelas (0020): o pagamento cobre o GRUPO inteiro — os dois
  // pedidos mudam de status juntos, o valor é conferido contra a soma e cada
  // um é entregue. Fora de um par, o grupo é só este pedido.
  let grupo: Array<Record<string, unknown>> = [pedido]
  if (pedido.group_id) {
    const { data: doGrupo } = await db
      .from('orders')
      .select(CAMPOS_PEDIDO.join(','))
      .eq('group_id', String(pedido.group_id))
      .throwOnError()
    const linhas = (doGrupo ?? []) as unknown as Array<Record<string, unknown>>
    // O pedido do `external_reference` primeiro, como na compra.
    grupo = [pedido, ...linhas.filter((l) => l.id !== pedido.id)]
  }

  // --- 3. Registra o status do pagamento ------------------------------
  // Se esta gravação falhar, `throwOnError` sobe o erro para o `comHandler`,
  // que responde 500 — e o Mercado Pago reenvia, repetindo este passo.
  const novoStatus = traduzirStatus(pagamento.status)
  for (const p of grupo) {
    await db
      .from('orders')
      .update({
        status: novoStatus,
        payment_id: String(pagamento.id),
        payment_method: pagamento.payment_method_id ?? null,
        paid_at: pagamento.date_approved ?? null,
      })
      .eq('id', String(p.id))
      .throwOnError()
  }

  if (!ehAprovado(pagamento.status)) {
    // Recusado ou cancelado: a estrela reservada por ESTE pedido volta ao
    // catálogo (a função só solta a reserva dele, nunca a de outro).
    for (const p of grupo) {
      const slug = p.star_slug
      const ordem = String(p.id)
      if (novoStatus === 'cancelled') {
        await db.rpc('liberar_estrela', { p_slug: slug, p_order: ordem }).throwOnError()
      }
      // Estornado (desistência em 7 dias, chargeback): a estrela volta ao
      // catálogo e a página sai do ar — é o que a política promete.
      if (novoStatus === 'refunded' || novoStatus === 'charged_back') {
        await db.rpc('devolver_estrela', { p_slug: slug, p_order: ordem }).throwOnError()
        await db.from('pages').update({ status: 'draft' }).eq('order_id', ordem).throwOnError()
        console.log(`[webhook ${id}] pedido ${ordem} estornado: estrela devolvida, página despublicada`)
      }
    }
    // Pix pendente, cartão em análise: nada a entregar ainda.
    // 200 porque o evento foi tratado, só não exige ação.
    console.log(`[webhook ${id}] pagamento ${pagamento.id} em ${pagamento.status}; sem entrega`)
    return json(request, { recebido: true, entregue: false, status: novoStatus })
  }

  if (grupo.every((p) => p.delivered_at)) {
    // Segundo evento do mesmo pagamento: o cliente já recebeu o e-mail.
    console.log(`[webhook ${id}] pedido ${pedidoId} já entregue; evento ignorado`)
    return json(request, { recebido: true, entregue: true, repetido: true })
  }

  const esperado = grupo.reduce((soma, p) => soma + Number(p.amount_cents), 0)
  if (!valorConfere(pagamento, esperado)) {
    console.error(
      `[webhook ${id}] pedido ${pedidoId}: pago ${pagamento.transaction_amount} ${pagamento.currency_id ?? '?'}, ` +
        `esperado ${esperado / 100} BRL`,
    )
    for (const p of grupo) await marcarPendencia(db, String(p.id), 'Valor pago diverge do pedido — conferir no Mercado Pago')
    // 200: reenviar não muda o valor. Decisão humana.
    return json(request, { recebido: true, entregue: false, motivo: 'valor_divergente' })
  }

  // Cupom (0022): o uso conta na compra PAGA, uma vez por compra (pelo pedido
  // principal). Idempotente: o mesmo pagamento chegando de novo não soma.
  if (pedido.cupom) {
    await db
      .from('cupom_usos')
      .upsert({ order_id: pedidoId, codigo: pedido.cupom }, { onConflict: 'order_id', ignoreDuplicates: true })
      .throwOnError()
  }

  if (grupo.length === 1) return await entregarPedido(request, db, pedido, id, String(pedidoId))

  const resultados: Array<Record<string, unknown>> = []
  for (const p of grupo) {
    if (p.delivered_at) {
      resultados.push({ code: p.code, entregue: true, repetido: true })
      continue
    }
    const resposta = await entregarPedido(request, db, p, id, String(p.id))
    resultados.push({ code: p.code, ...(await resposta.json()) })
  }
  return json(request, { recebido: true, entregue: resultados.every((r) => r.entregue), pedidos: resultados })
}, 'mp-webhook')

/**
 * Do passo 4 em diante, para UM pedido: dedica a estrela, reserva a entrega
 * e entrega. No par, roda uma vez para cada pedido do grupo.
 */
async function entregarPedido(
  request: Request,
  db: Db,
  pedidoOriginal: Record<string, unknown>,
  id: string,
  pedidoId: string,
): Promise<Response> {
  // A linha do grupo no certificado (0020/0021): "Em par com …" ou "Uma das …".
  const grupo = await dadosDoGrupo(db, pedidoId, pedidoOriginal.group_id)
  const pedido = grupo ? { ...pedidoOriginal, ...linhaParaCertificado(grupo) } : pedidoOriginal

  // --- 4. A estrela passa a ser DESTE pedido ----------------------------
  // Cada estrela é exclusiva. Se a reserva venceu e outra pessoa comprou a
  // mesma estrela no meio tempo, não há como entregar: fica a pendência para
  // o admin (reembolso ou troca de estrela), e o Mercado Pago recebe 200.
  const { data: dedicou } = await db
    .rpc('dedicar_estrela', { p_slug: pedido.star_slug, p_order: pedidoId })
    .throwOnError()
  if (!dedicou) {
    console.error(`[webhook ${id}] pedido ${pedidoId} pago, mas a estrela ${pedido.star_slug} já é de outro pedido`)
    await marcarPendencia(db, pedidoId, 'Estrela já dedicada a outro pedido — reembolsar ou trocar a estrela')
    return json(request, { recebido: true, entregue: false, motivo: 'estrela_ja_dedicada' })
  }

  // --- 5. Reserva a entrega -------------------------------------------
  if (!(await reservarEntrega(db, pedidoId))) {
    console.log(`[webhook ${id}] pedido ${pedidoId} com entrega em andamento noutro evento`)
    return json(request, { recebido: true, entregue: false, motivo: 'entrega_em_andamento' })
  }

  // --- 6. Entrega ------------------------------------------------------
  try {
    return await entregar(request, db, pedido, id, String(pedidoId))
  } finally {
    // Sucesso grava `delivered_at` (e aí a reserva não importa mais); falha
    // devolve o pedido para o próximo evento tentar sem esperar a reserva vencer.
    await db.from('orders').update({ delivery_started_at: null }).eq('id', pedidoId)
  }
}

/**
 * Update condicional: só grava a reserva se o pedido não foi entregue e não
 * há reserva viva. `select` devolve a linha só para quem gravou — é o que
 * decide, entre dois eventos simultâneos, qual entrega.
 */
async function reservarEntrega(db: Db, pedidoId: string): Promise<boolean> {
  const agora = new Date()
  const vencida = new Date(agora.getTime() - RESERVA_VENCE_MS).toISOString()

  const { data } = await db
    .from('orders')
    .update({ delivery_started_at: agora.toISOString() })
    .eq('id', pedidoId)
    .is('delivered_at', null)
    .or(`delivery_started_at.is.null,delivery_started_at.lt.${vencida}`)
    .select('id')
    .throwOnError()

  return Array.isArray(data) && data.length > 0
}

/** Grava a pendência que o painel mostra. Falha aqui sobe (500 → reenvio). */
async function marcarPendencia(db: Db, pedidoId: string, texto: string) {
  await db.from('orders').update({ email_error: texto }).eq('id', pedidoId).throwOnError()
}

/**
 * Gera, guarda e envia. Separado do handler porque é o caminho que só roda
 * com a reserva na mão.
 */
async function entregar(
  request: Request,
  db: Db,
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
    starNickname: pedido.star_nickname,
    message: pedido.message,
    letter: pedido.letter,
    customerName: pedido.customer_name,
    customerEmail: pedido.customer_email,
  })

  if (!checagem.ok) {
    console.error(`[webhook ${idLog}] pedido ${pedidoId} PAGO com texto não permitido:`, checagem.erros)
    await marcarPendencia(db, pedidoId, `Texto bloqueado na entrega: ${checagem.erros.map((e) => e.campo).join(', ')}`)

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
  // e a linha inteira serve o PDF e o e-mail do mesmo jeito.
  const { data: estrela, error: erroEstrela } = await db
    .from('stars')
    .select('*')
    .eq('slug', pedido.star_slug)
    .maybeSingle()

  if (erroEstrela) {
    throw new ErroApp('consulta_falhou', 'Não foi possível ler a estrela.', 500, erroEstrela.message)
  }
  if (!estrela) {
    // A estrela sumiu do catálogo entre a compra e a entrega. O pedido foi
    // pago: marca para o admin e não quebra.
    console.error(`[webhook ${idLog}] estrela ${pedido.star_slug} não encontrada para o pedido ${pedidoId}`)
    await marcarPendencia(db, pedidoId, 'Estrela não encontrada no catálogo')
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

  // Trilha do arquivo gerado: caminho e hash, um por pedido (`order_id` é
  // unique). Hoje nada lê esta tabela — fica como registro de que o PDF saiu.
  await db
    .from('certificate_drafts')
    .upsert({ order_id: pedidoId, storage_path: caminho, content_hash: hash, page_count: 1 }, { onConflict: 'order_id' })
    .throwOnError()

  // O PDF existe: grava o caminho já, para o reenvio do painel funcionar mesmo
  // que o e-mail falhe abaixo.
  await db
    .from('orders')
    .update({ certificate_path: caminho, certificate_url: caminho })
    .eq('id', pedidoId)
    .throwOnError()

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
    await marcarPendencia(db, pedidoId, erro instanceof ErroApp ? erro.message : 'Falha desconhecida no e-mail')
    return json(request, { recebido: true, entregue: false, motivo: 'email_falhou', pdfPronto: true })
  }

  // Fora do try do e-mail: se ESTA gravação falhar, o e-mail já saiu — não é
  // "e-mail falhou". Sobe como 500; o reenvio do Mercado Pago repete a
  // entrega, o que no pior caso manda o e-mail de novo (melhor que nunca
  // registrar a entrega).
  await db
    .from('orders')
    .update({ delivered_at: new Date().toISOString(), email_error: null })
    .eq('id', pedidoId)
    .throwOnError()

  console.log(`[webhook ${idLog}] pedido ${pedidoId} entregue para ${pedido.customer_email}`)
  return json(request, { recebido: true, entregue: true, pedido: pedidoId })
}

/**
 * Vocabulário do Mercado Pago para o nosso.
 *
 * O `chargeback` precisa de coluna própria: é o caso em que o banco estornou,
 * e o pedido continua `approved` para sempre se ninguém olhar.
 */
export function traduzirStatus(status: string): string {
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
