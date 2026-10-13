/**
 * Reenvio do certificado, para o administrador.
 *
 * Existe por causa de uma decisão do webhook: quando o e-mail falha, ele
 * responde 200 e registra o motivo em `email_error`. O pedido está pago, o PDF
 * está no Storage, e a única coisa faltando é o envio. Sem esta função, a
 * pessoa precisaria esperar o suporte responder um e-mail — ou pior, o pedido
 * ficaria "entregue" no banco sem ninguém ter recebido nada.
 *
 * Não regenera o PDF: o arquivo já está no Storage, e regenerar criaria uma
 * divergência entre o que foi pago e o que foi entregue.
 *
 * A autenticação é pela service_role no header `Authorization`, o que na
 * prática significa que esta função NÃO PODE ser chamada do navegador. Ela é
 * chamada por outra Edge Function autenticada, ou por `curl` com o token. É
 * por isso que `verify_jwt` está ligado nas duas.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { enviarEmail } from '../_shared/certificado.ts'

Deno.serve(
  comHandler(async (request) => {
    const { orderId } = (await lerJson(request)) as { orderId?: string }

    if (!orderId) {
      throw new ErroApp('pedido_ausente', 'Informe o id do pedido.')
    }

    const db = admin()

    const { data: pedido, error } = await db
      .from('orders')
      .select('id, code, status, customer_email, customer_name, honoree_name, from_name, message, dedication_date, star_slug, product_name, certificate_path, delivered_at, email_error')
      .eq('id', orderId)
      .maybeSingle()

    if (error || !pedido) {
      throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
    }

    // Reenviar para um pedido não pago seria mandar o certificado de graça.
    if (pedido.status !== 'approved' && pedido.status !== 'in_process') {
      throw new ErroApp('pedido_nao_pago', 'Só é possível reenviar para pedido pago.', 409)
    }

    // Reenviar o que já foi entregue com sucesso é duplicata de e-mail. O
    // `delivered_at` é a prova, e não o caminho do PDF.
    if (pedido.delivered_at && !pedido.email_error) {
      throw new ErroApp('ja_entregue', 'Este pedido já foi entregue com sucesso.', 409)
    }

    if (!pedido.certificate_path) {
      throw new ErroApp(
        'pdf_ausente',
        'Este pedido não tem PDF gerado. Regere pelo webhook ou chame o gerador.',
        409,
      )
    }

    const { data: estrela } = await db
      .from('stars')
      .select('name, constellation')
      .eq('slug', pedido.star_slug)
      .maybeSingle()

    try {
      // Sem a estrela no catálogo, o slug é melhor do que nada no e-mail.
      await enviarEmail(db, pedido, estrela ?? { name: pedido.star_slug }, pedido.certificate_path)
    } catch (erro) {
      await db.from('orders').update({
        email_error: erro instanceof Error ? erro.message : 'Falha desconhecida',
      }).eq('id', pedido.id)
      throw erro
    }

    await db
      .from('orders')
      .update({ delivered_at: new Date().toISOString(), email_error: null })
      .eq('id', pedido.id)

    return json(request, { reenviado: true, pedido: pedido.code, para: pedido.customer_email })
  }, 'resend-certificate'),
)
