/**
 * Cria o pedido e a preferência de pagamento.
 *
 * Chamada pelo site no momento em que a pessoa fecha a compra. Ela faz três
 * coisas, nesta ordem, e a ordem importa:
 *
 * 1. Valida o texto (moderação).
 * 2. Lê o preço do BANCO — nunca do corpo da requisição.
 * 3. Grava o pedido e devolve o link de pagamento.
 *
 * O passo 2 é o que impede a fraude clássica de editar um campo no navegador
 * e pagar R$ 0,01: o cliente manda o `productSlug` e pronto, o valor é o que a
 * loja definiu.
 *
 * Endereço: `https://<ref>.supabase.co/functions/v1/create-checkout`,
 * publicada com `--no-verify-jwt` (ver `LOJA.md`) — quem compra não tem
 * sessão nenhuma, e a proteção é o preço no servidor, não o token.
 *
 * Efeitos colaterais: INSERT em `orders` (nascido `pending`, com o código de
 * rastreio vindo do `default` do banco) e a criação da preferência no Mercado
 * Pago. Não cobra nada: o que cobra é o link devolvido.
 *
 * Invariante: nada é gravado antes do texto passar pela moderação; e se a
 * preferência falhar depois do INSERT, o pedido fica `pending` — que é a
 * verdade (o pagamento nunca chegou a ser oferecido).
 */
import { comHandler, ErroApp, idRequisicao, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { limitarPorIp } from '../_shared/limite.ts'
import { criarPreferencia } from '../_shared/mercadoPago.ts'
import { explicarErros, limpar, validarPedido } from '../../../shared/moderation.js'

interface Entrada {
  productSlug?: string
  starSlug?: string
  honoreeName?: string
  dedicationDate?: string | null
  fromName?: string
  message?: string
  customerEmail?: string
  customerName?: string
  customerDoc?: string
}

Deno.serve(
  comHandler(async (request) => {
    const id = idRequisicao()
    const db = admin()

    // 10 pedidos a cada 10 minutos por IP: folga para quem erra e refaz,
    // aperto para quem cria pedido em laço.
    await limitarPorIp(db, request, 'checkout', { maximo: 10, janelaSegundos: 600 })

    const corpo = (await lerJson(request)) as Entrada

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
      message: corpo.message,
      customerName: corpo.customerName,
      customerEmail: corpo.customerEmail,
    })

    if (!pedidoTexto.ok) {
      console.warn(`[checkout ${id}] texto bloqueado:`, pedidoTexto.erros)
      throw new ErroApp('texto_nao_permitido', explicarErros(pedidoTexto.erros), 422)
    }

    // --- 3. Produto e preço, lidos do banco ----------------------------
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

    // A estrela precisa existir E estar na lista do produto. Sem essa segunda
    // condição, daria para comprar o kit básico e pedir Sirius nele.
    // Sem `starSlug` no corpo, cai na primeira estrela do produto (a lista é a
    // ordem de sugestão da vitrine). O último `??` é defesa contra produto
    // cadastrado com `star_slugs` vazio — o gatilho de 0001 confere os slugs
    // que existem, mas não obriga a lista a ter um.
    let starSlug = corpo.starSlug ?? produto.star_slugs[0] ?? 'kaus-australis'

    const { data: estrela } = await db
      .from('stars')
      .select('slug, name, constellation')
      .eq('slug', starSlug)
      .eq('active', true)
      .maybeSingle()

    if (!estrela) {
      throw new ErroApp('estrela_inexistente', 'Essa estrela não está disponível.', 404)
    }
    if (!produto.star_slugs.includes(estrela.slug)) {
      throw new ErroApp('estrela_fora_do_produto', 'Esse produto não inclui essa estrela.', 422)
    }
    starSlug = estrela.slug

    // --- 4. Grava o pedido ---------------------------------------------
    const insercao = {
      product_id: produto.id,
      // Snapshot do nome e do preço: se o produto mudar de nome ou de preço
      // depois, o pedido antigo continua dizendo o que foi comprado.
      product_name: produto.name,
      amount_cents: produto.price_cents,
      customer_email: String(corpo.customerEmail).trim().toLowerCase(),
      customer_name: limpar(corpo.customerName ?? ''),
      // CPF só com dígitos: máscara é coisa de formulário, e o banco guarda o
      // número como ele é usado (emissão de nota).
      customer_doc: corpo.customerDoc ? String(corpo.customerDoc).replace(/\D/g, '') : null,
      star_slug: estrela.slug,
      honoree_name: limpar(corpo.honoreeName),
      from_name: corpo.fromName ? limpar(corpo.fromName) : null,
      message: corpo.message ? limpar(corpo.message) : null,
      dedication_date: normalizarData(corpo.dedicationDate),
    }

    const { data: pedido, error: erroPedido } = await db
      .from('orders')
      .insert(insercao)
      // Só o que a resposta e a preferência pedem. O `code` vem do
      // `gen_order_code()` (default da coluna) — gerado pelo banco, não aqui.
      .select('id, code, amount_cents')
      .single()

    if (erroPedido || !pedido) {
      throw new ErroApp('pedido_falhou', 'Não foi possível registrar seu pedido.', 500, erroPedido?.message)
    }

    // --- 5. Preferência de pagamento ------------------------------------
    try {
      const preferencia = await criarPreferencia({
        itens: [
          {
            titulo: `Certificado de ${estrela.name}`,
            descricao: produto.name,
            quantidade: 1,
            precoUnitario: produto.price_cents,
          },
        ],
        // O e-mail vem do objeto já normalizado que foi inserido: ler de
        // `pedido` traria null, porque ele não está entre os campos do select.
        payerEmail: insercao.customer_email,
        payerName: insercao.customer_name,
        externalReference: pedido.id,
      })

      return json(request, {
        orderId: pedido.id,
        code: pedido.code,
        amountCents: pedido.amount_cents,
        preferenceId: preferencia.id,
        initPoint: preferencia.init_point,
        sandboxInitPoint: preferencia.sandbox_init_point,
      })
    } catch (erro) {
      // A preferência falhou, mas o pedido já está gravado. Deixá-lo como
      // `pending` é correto: o pagamento nunca vai acontecer, e a limpeza
      // automática de pendentes pega depois.
      console.error(`[checkout ${id}] preferência falhou para o pedido ${pedido.id}:`, erro)
      throw erro
    }
  }, 'create-checkout'),
)

/**
 * Valida uma data em ISO (YYYY-MM-DD).
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
