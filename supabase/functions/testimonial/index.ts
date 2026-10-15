/**
 * Depoimento do comprador — ler o seu e enviar/alterar.
 *
 * Autenticação: o mesmo token de edição do `page-auth` (`Authorization:
 * Bearer …`). O depoimento é preso ao PEDIDO da página da sessão, e só pedido
 * pago escreve: é o que garante que todo depoimento do site é de alguém que
 * comprou de verdade. Página manual (sem pedido) não tem depoimento.
 *
 * Corpo: `{ acao: 'ler' }` ou `{ acao: 'enviar', nome, cidade?, texto,
 * autorizaPublicar }`. Enviar de novo substitui o texto e volta para
 * "pendente" — um depoimento aprovado e depois reescrito passa pela
 * aprovação outra vez.
 *
 * Publicada com `--no-verify-jwt` (o token de edição é a única chave).
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { lerToken, sessaoDe } from '../_shared/token.ts'
import { limpar, validarTextoLivre } from '../../../shared/moderation.js'

/** Mesmos tetos das `check` da migration 0018. */
const LIMITES = { nome: { min: 2, max: 40 }, cidade: { min: 2, max: 40 }, texto: { min: 10, max: 400 } }

Deno.serve(
  comHandler(async (request) => {
    const corpo = await lerJson(request)
    const token = lerToken(request, corpo)
    if (!token) {
      throw new ErroApp('sessao_expirada', 'Sua sessão de edição terminou. Entre de novo.', 401)
    }

    const db = admin()
    const sessao = await sessaoDe(db, token)

    const { data: pagina } = await db.from('pages').select('order_id').eq('id', sessao.pageId).maybeSingle()
    const orderId = pagina?.order_id ? String(pagina.order_id) : null

    // Sem pedido pago por trás, não há depoimento possível.
    let pago = false
    if (orderId) {
      const { data: pedido } = await db.from('orders').select('status').eq('id', orderId).maybeSingle()
      pago = pedido?.status === 'approved'
    }

    if (corpo.acao !== 'enviar') {
      if (!orderId || !pago) return json(request, { disponivel: false, depoimento: null })
      const { data } = await db
        .from('depoimentos')
        .select('nome_exibicao, cidade, texto, autoriza_publicar, status')
        .eq('order_id', orderId)
        .maybeSingle()
      return json(request, { disponivel: true, depoimento: data ?? null })
    }

    if (!orderId || !pago) {
      throw new ErroApp('sem_pedido', 'Depoimentos são só para páginas de pedidos pagos.', 403)
    }

    const nome = limpar(String(corpo.nome ?? ''))
    const cidade = limpar(String(corpo.cidade ?? ''))
    const texto = limpar(String(corpo.texto ?? ''))
    const erros = [
      ['o nome', validarTextoLivre(nome, LIMITES.nome)],
      ['a cidade', cidade ? validarTextoLivre(cidade, LIMITES.cidade) : null],
      ['o depoimento', validarTextoLivre(texto, LIMITES.texto)],
    ].filter(([, erro]) => erro)
    if (erros.length) {
      throw new ErroApp(
        'texto_nao_permitido',
        `Revise ${erros.map(([campo]) => campo).join(', ')}: ${erros.map(([, erro]) => erro).join('; ')}.`,
        422,
      )
    }
    if (corpo.autorizaPublicar !== true) {
      throw new ErroApp('sem_autorizacao', 'Marque a autorização para podermos publicar o depoimento.', 422)
    }

    const { data, error } = await db
      .from('depoimentos')
      .upsert(
        {
          order_id: orderId,
          nome_exibicao: nome,
          cidade: cidade || null,
          texto,
          autoriza_publicar: true,
          status: 'pendente',
          decidido_em: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' },
      )
      .select('nome_exibicao, cidade, texto, autoriza_publicar, status')
      .single()

    if (error) throw new ErroApp('grava_falhou', 'Não foi possível enviar agora. Tente de novo.', 500, error.message)

    return json(request, { disponivel: true, depoimento: data })
  }, 'testimonial'),
)
