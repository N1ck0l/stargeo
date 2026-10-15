/**
 * Cria o pedido e a preferência de pagamento — o handler. `index.ts` só o
 * publica com `Deno.serve`; separado para o teste do fluxo inteiro
 * (`test/fluxo.test.js`) chamá-lo sem subir servidor.
 *
 * Chamada pelo site no momento em que a pessoa fecha a compra. Ela faz três
 * coisas, nesta ordem, e a ordem importa:
 *
 * 1. Valida o texto (moderação).
 * 2. Lê o preço do BANCO — nunca do corpo da requisição.
 * 3. Grava o pedido, reserva a estrela e devolve o link de pagamento.
 *
 * O passo 2 é o que impede a fraude clássica de editar um campo no navegador
 * e pagar R$ 0,01: o cliente manda o `productSlug` e a estrela, e o valor é o
 * que a loja definiu para a faixa dela.
 *
 * Par de estrelas (migration 0020): com `par` no corpo, nascem DOIS pedidos
 * ligados por `group_id` — cada um com a sua estrela e o seu nome — numa
 * preferência só, com o desconto do par (`shared/preco.js`) repartido entre
 * os dois. O primeiro é o `external_reference`; o
 * webhook trata o grupo inteiro.
 *
 * Endereço: `https://<ref>.supabase.co/functions/v1/create-checkout`,
 * publicada com `--no-verify-jwt` (ver `LOJA.md`) — quem compra não tem
 * sessão nenhuma, e a proteção é o preço no servidor, não o token.
 *
 * Invariante: nada é gravado antes do texto passar pela moderação; e se a
 * preferência falhar depois do INSERT, o pedido fica `pending` e as estrelas
 * voltam ao catálogo.
 */
import { comHandler, ErroApp, idRequisicao, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { limitarPorIp } from '../_shared/limite.ts'
import { criarPreferencia } from '../_shared/mercadoPago.ts'
import { explicarErros, limpar, validarPedido } from '../../../shared/moderation.js'
import { validarRevelacao } from '../_shared/datas.ts'
import { DESCONTO_PAR_PERCENTUAL, precoDoPar } from '../../../shared/preco.js'

interface Entrada {
  productSlug?: string
  starSlug?: string
  honoreeName?: string
  dedicationDate?: string | null
  fromName?: string
  starNickname?: string
  revealOn?: string
  message?: string
  customerEmail?: string
  customerName?: string
  customerDoc?: string
  /** Par de estrelas: a segunda pessoa e a segunda estrela. */
  par?: { starSlug?: string; honoreeName?: string; starNickname?: string } | null
}

type Db = ReturnType<typeof admin>

/**
 * Minutos para pagar. Curto de propósito: a estrela fica RESERVADA nesse
 * tempo e some da vitrine — um prazo longo prenderia estrelas de quem desistiu.
 * É também por isso que o boleto (dias para compensar) sai do checkout.
 */
const PRAZO_PAGAMENTO_MIN = 30

const ESTRELA_INDISPONIVEL = 'Essa estrela acabou de ser escolhida por outra pessoa. Escolha outra — são milhares esperando.'

export const checkout = comHandler(async (request) => {
  const id = idRequisicao()
  const db = admin()

  // 10 pedidos a cada 10 minutos por IP: folga para quem erra e refaz,
  // aperto para quem cria pedido em laço.
  await limitarPorIp(db, request, 'checkout', { maximo: 10, janelaSegundos: 600 })

  const corpo = (await lerJson(request)) as Entrada
  const par = corpo.par && typeof corpo.par === 'object' ? corpo.par : null

  // --- 1. Campos obrigatórios ---------------------------------------
  if (!corpo.productSlug) {
    throw new ErroApp('produto_ausente', 'Escolha um produto para continuar.')
  }
  if (!corpo.customerEmail) {
    throw new ErroApp('email_ausente', 'Precisamos do seu e-mail para entregar o certificado.')
  }

  // --- 2. Moderação do texto ----------------------------------------
  const pedidoTexto = validarPedido({
    honoreeName: corpo.honoreeName,
    fromName: corpo.fromName,
    starNickname: corpo.starNickname,
    message: corpo.message,
    customerName: corpo.customerName,
    customerEmail: corpo.customerEmail,
  })
  const parTexto = par
    ? validarPedido({
        honoreeName: par.honoreeName,
        starNickname: par.starNickname,
        customerName: corpo.customerName,
        customerEmail: corpo.customerEmail,
      })
    : { ok: true, erros: [] }

  if (!pedidoTexto.ok || !parTexto.ok) {
    const erros = [...pedidoTexto.erros, ...parTexto.erros]
    console.warn(`[checkout ${id}] texto bloqueado:`, erros)
    throw new ErroApp('texto_nao_permitido', explicarErros(erros), 422)
  }

  // Revelação da página numa data (0019): opcional, até um ano. No par, vale
  // para as duas páginas.
  const revelacao = validarRevelacao(corpo.revealOn)
  if ('erro' in revelacao) throw new ErroApp('data_invalida', revelacao.erro, 422)

  // --- 3. Produto, estrelas e preço, lidos do banco --------------------
  const { data: produto, error: erroProduto } = await db
    .from('products')
    .select('id, slug, name, price_cents, compare_at_cents, active, star_slugs, features')
    .eq('slug', corpo.productSlug)
    .maybeSingle()

  if (erroProduto) {
    throw new ErroApp('produto_erro', 'Não foi possível carregar o produto.', 500, erroProduto.message)
  }
  if (!produto || !produto.active) {
    throw new ErroApp('produto_inexistente', 'Esse produto não está disponível.', 404)
  }

  if (!corpo.starSlug) {
    throw new ErroApp('estrela_ausente', 'Escolha uma estrela para continuar.')
  }
  if (par && !par.starSlug) {
    throw new ErroApp('estrela_ausente', 'Escolha a segunda estrela do par.')
  }
  if (par && par.starSlug === corpo.starSlug) {
    throw new ErroApp('estrelas_iguais', 'O par precisa de duas estrelas diferentes.', 422)
  }

  const estrela = await carregarEstrela(db, produto, String(corpo.starSlug))
  const estrela2 = par ? await carregarEstrela(db, produto, String(par.starSlug)) : null

  // --- 4. Grava o(s) pedido(s) -------------------------------------------
  const groupId = par ? crypto.randomUUID() : null
  // Par: 10% sobre a soma, repartido na proporção de cada estrela. A conta é
  // a mesma que o site mostra, e roda AQUI com os preços do banco.
  const precos = estrela2
    ? precoDoPar(estrela.precoCentavos, estrela2.precoCentavos).partes
    : [estrela.precoCentavos]
  const comum = {
    product_id: produto.id,
    // Snapshot do nome: se o produto mudar de nome depois, o pedido antigo
    // continua dizendo o que foi comprado.
    product_name: produto.name,
    customer_email: String(corpo.customerEmail).trim().toLowerCase(),
    customer_name: limpar(corpo.customerName ?? ''),
    // CPF só com dígitos: máscara é coisa de formulário, e o banco guarda o
    // número como ele é usado (emissão de nota).
    customer_doc: corpo.customerDoc ? String(corpo.customerDoc).replace(/\D/g, '') : null,
    from_name: corpo.fromName ? limpar(corpo.fromName) : null,
    message: corpo.message ? limpar(corpo.message) : null,
    dedication_date: normalizarData(corpo.dedicationDate),
    reveal_on: revelacao.data,
    group_id: groupId,
  }

  const insercoes = [
    {
      ...comum,
      amount_cents: precos[0],
      star_slug: estrela.slug,
      honoree_name: limpar(corpo.honoreeName),
      star_nickname: corpo.starNickname ? limpar(corpo.starNickname) || null : null,
    },
  ]
  if (par && estrela2) {
    insercoes.push({
      ...comum,
      amount_cents: precos[1],
      star_slug: estrela2.slug,
      honoree_name: limpar(par.honoreeName),
      star_nickname: par.starNickname ? limpar(par.starNickname) || null : null,
    })
  }

  const pedidos: Array<{ id: string; code: string; amount_cents: number }> = []
  for (const insercao of insercoes) {
    const { data: pedido, error: erroPedido } = await db
      .from('orders')
      .insert(insercao)
      // O `code` vem do `gen_order_code()` (default da coluna) — gerado pelo banco.
      .select('id, code, amount_cents')
      .single()
    if (erroPedido || !pedido) {
      throw new ErroApp('pedido_falhou', 'Não foi possível registrar seu pedido.', 500, erroPedido?.message)
    }
    pedidos.push(pedido)
  }

  // --- 5. Reserva as estrelas ------------------------------------------
  // Atômica no banco (`reservar_estrela`, migration 0010): entre duas
  // compras simultâneas da mesma estrela, só uma reserva vence. A reserva
  // dura um pouco mais que o prazo do pagamento, para o Pix pago no último
  // minuto ainda encontrar a estrela guardada. No par, se a segunda não
  // reservar, a primeira volta ao catálogo — é tudo ou nada.
  const reservadas: Array<{ slug: string; order: string }> = []
  for (const [i, pedido] of pedidos.entries()) {
    const slug = insercoes[i].star_slug
    const { data: reservou, error: erroReserva } = await db.rpc('reservar_estrela', {
      p_slug: slug,
      p_order: pedido.id,
      p_minutos: PRAZO_PAGAMENTO_MIN + 10,
    })
    if (erroReserva || !reservou) {
      await desfazer(db, reservadas, pedidos)
      if (erroReserva) {
        throw new ErroApp('reserva_falhou', 'Não foi possível reservar a estrela.', 500, erroReserva.message)
      }
      throw new ErroApp('estrela_indisponivel', ESTRELA_INDISPONIVEL, 409)
    }
    reservadas.push({ slug, order: pedido.id })
  }

  // --- 6. Preferência de pagamento ------------------------------------
  try {
    const preferencia = await criarPreferencia({
      itens: [estrela, estrela2].filter((e): e is EstrelaDoPedido => Boolean(e)).map((e, i) => ({
        titulo: `Certificado de ${e.name}`,
        descricao: estrela2 ? `${produto.name} · par de estrelas (${DESCONTO_PAR_PERCENTUAL}% off)` : produto.name,
        quantidade: 1,
        precoUnitario: precos[i],
      })),
      payerEmail: comum.customer_email,
      payerName: comum.customer_name,
      externalReference: pedidos[0].id,
      expiraEmMinutos: PRAZO_PAGAMENTO_MIN,
    })

    return json(request, {
      orderId: pedidos[0].id,
      code: pedidos[0].code,
      codePar: pedidos[1]?.code ?? null,
      amountCents: pedidos.reduce((soma, p) => soma + Number(p.amount_cents), 0),
      preferenceId: preferencia.id,
      initPoint: preferencia.init_point,
      sandboxInitPoint: preferencia.sandbox_init_point,
    })
  } catch (erro) {
    // A preferência falhou, mas os pedidos já estão gravados: ficam
    // `pending` (o pagamento nunca vai acontecer), e as estrelas não podem
    // ficar presas na reserva.
    console.error(`[checkout ${id}] preferência falhou para o pedido ${pedidos[0].id}:`, erro)
    for (const r of reservadas) await db.rpc('liberar_estrela', { p_slug: r.slug, p_order: r.order })
    throw erro
  }
}, 'create-checkout')

interface EstrelaDoPedido {
  slug: string
  name: string
  precoCentavos: number
}

/**
 * Uma estrela do pedido, com o preço da FAIXA dela. Com o catálogo completo
 * (0010), o produto vale para todas (`star_slugs` vazio); uma lista não vazia
 * ainda restringe, para um kit futuro de estrelas escolhidas.
 */
async function carregarEstrela(db: Db, produto: Record<string, unknown>, slug: string): Promise<EstrelaDoPedido> {
  const { data: estrela, error } = await db
    .from('stars')
    .select('slug, name, constellation, status, reserved_until, faixas(price_cents)')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle()

  if (error) throw new ErroApp('estrela_erro', 'Não foi possível carregar a estrela.', 500, error.message)
  if (!estrela) throw new ErroApp('estrela_inexistente', 'Essa estrela não está disponível.', 404)

  const listaDoProduto = (produto.star_slugs as string[] | null) ?? []
  if (listaDoProduto.length > 0 && !listaDoProduto.includes(estrela.slug)) {
    throw new ErroApp('estrela_fora_do_produto', 'Esse produto não inclui essa estrela.', 422)
  }
  const reservaVencida = estrela.status === 'reservada' && new Date(String(estrela.reserved_until)).getTime() < Date.now()
  if (estrela.status !== 'disponivel' && !reservaVencida) {
    throw new ErroApp('estrela_indisponivel', ESTRELA_INDISPONIVEL, 409)
  }
  const faixa = estrela.faixas as unknown as { price_cents: number } | null
  return { slug: estrela.slug, name: estrela.name, precoCentavos: faixa?.price_cents ?? Number(produto.price_cents) }
}

/** Reserva que não fechou: solta o que foi reservado e cancela os pedidos. */
async function desfazer(db: Db, reservadas: Array<{ slug: string; order: string }>, pedidos: Array<{ id: string }>) {
  for (const r of reservadas) await db.rpc('liberar_estrela', { p_slug: r.slug, p_order: r.order })
  for (const p of pedidos) await db.from('orders').update({ status: 'cancelled' }).eq('id', p.id)
}

/**
 * Data no formato `YYYY-MM-DD`, ou `null`.
 *
 * Sem isso, `dedication_date` viraria `new Date('qualquer coisa')`, que no
 * Postgres gera um erro de tipo — e o cliente veria "erro interno" em vez de
 * "data inválida".
 */
function normalizarData(valor: string | null | undefined): string | null {
  if (!valor) return null
  const texto = String(valor).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new ErroApp('data_invalida', 'A data da dedicação está inválida.', 422)
  }
  const d = new Date(`${texto}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) {
    throw new ErroApp('data_invalida', 'A data da dedicação está inválida.', 422)
  }
  return texto
}
