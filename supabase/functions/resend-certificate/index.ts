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
 * A autenticação é pela service_role no header `Authorization`, CONFERIDA
 * AQUI DENTRO (`ehServiceRole`). O `verify_jwt` do gateway não basta: ele só
 * prova que o JWT é do projeto, e a chave anon — que está no bundle público da
 * loja — também é. Quem chama é o `admin-api` (que põe a service_role no
 * header) ou um `curl` do operador.
 *
 * URL: `https://<ref>.supabase.co/functions/v1/resend-certificate`.
 *
 * Efeitos colaterais: envia e-mail de verdade (Resend) e grava `delivered_at`
 * / `email_error` em `orders`.
 *
 * Idempotência: o reenvio só passa quando há pendência. Pedido entregue com
 * sucesso (`delivered_at` e sem `email_error`) responde 409 — o segundo clique
 * depois de um envio bom não manda cópia nova; ele volta a valer se o envio
 * anterior tiver falhado.
 */
import { comHandler, compararSeguro, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin, variavel } from '../_shared/supabase.ts'
import { lerToken } from '../_shared/token.ts'
import { enviarEmail } from '../_shared/certificado.ts'

/** O Bearer é a própria service_role? Comparação em tempo constante. */
function ehServiceRole(request: Request): boolean {
  const token = lerToken(request)
  return token !== null && compararSeguro(token, variavel('SUPABASE_SERVICE_ROLE_KEY'))
}

export const reenvio = comHandler(async (request) => {
  if (!ehServiceRole(request)) {
    throw new ErroApp('sem_permissao', 'Acesso negado.', 403)
  }

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
  // `in_process` NÃO é pago: é Pix ou cartão ainda em análise.
  if (pedido.status !== 'approved') {
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
    .select('name, constellation, bayer, ra_hours, dec_degrees')
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
    .throwOnError()

  return json(request, { reenviado: true, pedido: pedido.code, para: pedido.customer_email })
}, 'resend-certificate')

Deno.serve(reenvio)
