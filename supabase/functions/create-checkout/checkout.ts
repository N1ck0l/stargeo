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
 * Várias estrelas (migrations 0020 e 0021): com `outras` no corpo (até 5,
 * além da primeira), nasce um GRUPO (`grupos`, com nome opcional e a página
 * `/g/CODE`) e um pedido por pessoa — cada um com a sua estrela e o seu nome —
 * numa preferência só, com o desconto progressivo (`shared/preco.js`)
 * repartido entre eles. `par` é o formato antigo, de duas. O primeiro pedido
 * é o `external_reference`; o webhook trata o grupo inteiro.
 *
 * Endereço: `https://<ref>.supabase.co/functions/v1/create-checkout`,
 * publicada com `--no-verify-jwt` (ver `LOJA.md`) — quem compra não tem
 * sessão nenhuma, e a proteção é o preço no servidor, não o token.
 *
 * Invariante: nada é gravado antes do texto passar pela moderação; e se a
 * preferência falhar depois do INSERT, os pedidos ficam `pending` e as
 * estrelas voltam ao catálogo.
 */
import { comHandler, ErroApp, idRequisicao, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { limitarPorIp } from '../_shared/limite.ts'
import { criarPreferencia } from '../_shared/mercadoPago.ts'
import { explicarErros, limpar, validarPedido, validarTexto } from '../../../shared/moderation.js'
import { validarRevelacao } from '../_shared/datas.ts'
import { MAX_ESTRELAS, aplicarCupom, precoDoGrupo } from '../../../shared/preco.js'

interface Pessoa {
  starSlug?: string
  honoreeName?: string
  starNickname?: string
  /** A carta DESTA pessoa, quando `cartaPorPessoa` (0023). */
  letter?: string
}

interface Entrada {
  productSlug?: string
  starSlug?: string
  honoreeName?: string
  dedicationDate?: string | null
  fromName?: string
  starNickname?: string
  revealOn?: string
  message?: string
  /** A carta que acompanha o certificado (0023), opcional. */
  letter?: string
  /**
   * Compra de várias estrelas: `true` = uma carta para cada pessoa (`letter`
   * é a da primeira, `outras[i].letter` a das outras); senão, `letter` vale
   * para todas. Quem decide é quem compra.
   */
  cartaPorPessoa?: boolean
  customerEmail?: string
  customerName?: string
  customerDoc?: string
  /** Mais estrelas na mesma compra (0021): uma por pessoa, até 5 além da primeira. */
  outras?: Pessoa[] | null
  /** Nome do grupo, opcional ("Família Souza"): vai no certificado de 3+. */
  nomeGrupo?: string | null
  /** Cupom de desconto (0022), opcional. */
  cupom?: string | null
  /** Formato antigo do par (0020) — o mesmo que `outras: [par]`. */
  par?: Pessoa | null
}

type Db = ReturnType<typeof admin>

/**
 * Minutos para pagar. Curto de propósito: a estrela fica RESERVADA nesse
 * tempo e some da vitrine — um prazo longo prenderia estrelas de quem desistiu.
 * É também por isso que o boleto (dias para compensar) sai do checkout.
 */
const PRAZO_PAGAMENTO_MIN = 30

/** Carta limpa, ou nula quando não há. */
const cartaDe = (texto?: string) => (texto ? limpar(texto) || null : null)

const ESTRELA_INDISPONIVEL = 'Essa estrela acabou de ser escolhida por outra pessoa. Escolha outra — são milhares esperando.'

export const checkout = comHandler(async (request) => {
  const id = idRequisicao()
  const db = admin()

  // 10 pedidos a cada 10 minutos por IP: folga para quem erra e refaz,
  // aperto para quem cria pedido em laço.
  await limitarPorIp(db, request, 'checkout', { maximo: 10, janelaSegundos: 600 })

  const corpo = (await lerJson(request)) as Entrada
  const outras: Pessoa[] = Array.isArray(corpo.outras)
    ? corpo.outras.filter((o) => o && typeof o === 'object')
    : corpo.par && typeof corpo.par === 'object'
      ? [corpo.par]
      : []
  const pessoas: Pessoa[] = [
    { starSlug: corpo.starSlug, honoreeName: corpo.honoreeName, starNickname: corpo.starNickname },
    ...outras,
  ]
  const emGrupo = pessoas.length > 1

  // --- 1. Campos obrigatórios ---------------------------------------
  if (!corpo.productSlug) {
    throw new ErroApp('produto_ausente', 'Escolha um produto para continuar.')
  }
  if (!corpo.customerEmail) {
    throw new ErroApp('email_ausente', 'Precisamos do seu e-mail para entregar o certificado.')
  }
  if (pessoas.length > MAX_ESTRELAS) {
    throw new ErroApp('estrelas_demais', `Cada compra leva até ${MAX_ESTRELAS} estrelas.`, 422)
  }

  // --- 2. Moderação do texto ----------------------------------------
  const erros = [
    ...validarPedido({
      honoreeName: corpo.honoreeName,
      fromName: corpo.fromName,
      starNickname: corpo.starNickname,
      message: corpo.message,
      letter: corpo.letter,
      customerName: corpo.customerName,
      customerEmail: corpo.customerEmail,
    }).erros,
    ...outras.flatMap(
      (o) =>
        validarPedido({
          honoreeName: o.honoreeName,
          starNickname: o.starNickname,
          letter: corpo.cartaPorPessoa ? o.letter : undefined,
          customerName: corpo.customerName,
          customerEmail: corpo.customerEmail,
        }).erros,
    ),
  ]
  const nomeGrupo = emGrupo ? limpar(corpo.nomeGrupo ?? '') : ''
  if (nomeGrupo) {
    const erro = validarTexto('groupName', nomeGrupo)
    if (erro) erros.push({ campo: 'groupName', motivo: erro })
  }
  if (erros.length) {
    console.warn(`[checkout ${id}] texto bloqueado:`, erros)
    throw new ErroApp('texto_nao_permitido', explicarErros(erros), 422)
  }

  // Revelação da página numa data (0019): opcional, até um ano. No grupo,
  // vale para todas as páginas.
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

  if (pessoas.some((p) => !p.starSlug)) {
    throw new ErroApp('estrela_ausente', emGrupo ? 'Escolha a estrela de cada pessoa.' : 'Escolha uma estrela para continuar.')
  }
  if (new Set(pessoas.map((p) => p.starSlug)).size !== pessoas.length) {
    throw new ErroApp('estrelas_iguais', 'Cada pessoa precisa de uma estrela diferente.', 422)
  }

  const estrelas: EstrelaDoPedido[] = []
  for (const p of pessoas) estrelas.push(await carregarEstrela(db, produto, String(p.starSlug)))

  // Desconto progressivo do grupo (10%/15%/20%), repartido na proporção de
  // cada estrela. A conta é a mesma que o site mostra (`shared/preco.js`), e
  // roda AQUI com os preços do banco.
  const precoDoGrupoSemCupom = precoDoGrupo(estrelas.map((e) => e.precoCentavos))

  // Cupom (0022): consultado AQUI, no banco, e aplicado sobre o total do
  // grupo. Inválido, vencido ou esgotado é recusado com a mesma mensagem —
  // sem cupom silenciosamente ignorado, que cobraria mais do que a pessoa viu.
  let cupom: { codigo: string; tipo: string; valor: number } | null = null
  const codigoCupom = String(corpo.cupom ?? '').trim().toUpperCase()
  if (codigoCupom) {
    const { data: encontrados } = await db.rpc('consultar_cupom', { p_codigo: codigoCupom })
    const encontrado = Array.isArray(encontrados) ? encontrados[0] : null
    if (!encontrado) throw new ErroApp('cupom_invalido', 'Esse cupom não é válido (ou já venceu). Confira o código ou siga sem ele.', 422)
    cupom = { codigo: encontrado.codigo, tipo: encontrado.tipo, valor: Number(encontrado.valor) }
  }
  const preco = aplicarCupom(precoDoGrupoSemCupom, cupom)

  // --- 4. Grava o grupo e os pedidos ------------------------------------
  let groupId: string | null = null
  let codigoGrupo: string | null = null
  if (emGrupo) {
    const { data: grupo, error: erroGrupo } = await db
      .from('grupos')
      .insert({ nome: nomeGrupo || null })
      .select('id, code')
      .single()
    if (erroGrupo || !grupo) {
      throw new ErroApp('pedido_falhou', 'Não foi possível registrar seu pedido.', 500, erroGrupo?.message)
    }
    groupId = grupo.id
    codigoGrupo = grupo.code
  }

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

  const insercoes = pessoas.map((p, i) => ({
    ...comum,
    amount_cents: preco.partes[i],
    cupom: cupom?.codigo ?? null,
    // Quanto o cupom tirou DESTE pedido (relatório para o contador).
    desconto_cupom_cents: precoDoGrupoSemCupom.partes[i] - preco.partes[i],
    star_slug: estrelas[i].slug,
    honoree_name: limpar(p.honoreeName),
    star_nickname: p.starNickname ? limpar(p.starNickname) || null : null,
    // A carta: a mesma para todas, ou uma por pessoa — escolha de quem compra.
    letter: cartaDe(corpo.cartaPorPessoa && i > 0 ? p.letter : corpo.letter),
  }))

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
  // minuto ainda encontrar a estrela guardada. No grupo é tudo ou nada: se
  // uma não reservar, as outras voltam ao catálogo.
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
      itens: estrelas.map((e, i) => ({
        titulo: `Certificado de ${e.name}`,
        descricao: [
          produto.name,
          emGrupo ? `${pessoas.length} estrelas (${preco.percentual}% off)` : null,
          cupom ? `cupom ${cupom.codigo}` : null,
        ].filter(Boolean).join(' · '),
        quantidade: 1,
        precoUnitario: preco.partes[i],
      })),
      payerEmail: comum.customer_email,
      payerName: comum.customer_name,
      externalReference: pedidos[0].id,
      expiraEmMinutos: PRAZO_PAGAMENTO_MIN,
    })

    return json(request, {
      orderId: pedidos[0].id,
      code: pedidos[0].code,
      codes: pedidos.map((p) => p.code),
      codePar: pedidos[1]?.code ?? null,
      grupo: codigoGrupo,
      amountCents: pedidos.reduce((soma, p) => soma + Number(p.amount_cents), 0),
      cupom: cupom?.codigo ?? null,
      descontoCupomCents: preco.descontoCupom,
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
