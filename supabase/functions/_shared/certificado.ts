/**
 * Geração do PDF e entrega por e-mail.
 *
 * Junta as duas pontas da entrega porque elas sempre andam juntas: o PDF só é
 * útil se chegar no e-mail, e o e-mail só serve se o PDF for o que a pessoa
 * comprou.
 *
 * Não tem rota própria — é código compartilhado, chamado por `mp-webhook`
 * (entrega do pedido pago) e por `resend-certificate` (reenvio pelo painel).
 * Nenhuma das duas expõe este módulo ao navegador: quem chega aqui já passou
 * pela autenticação de quem a chama (assinatura do webhook / service_role).
 *
 * Efeitos colaterais, os dois mais caros do projeto: grava o PDF no bucket
 * PRIVADO `certificados` e dispara e-mail pelo Resend. Nada aqui lê corpo de
 * requisição nem decide dono de nada — a identidade de quem entrega vem de
 * quem chamou.
 *
 * Invariantes: o pedido sai sempre com as duas versões do arquivo (escura e
 * clara), o link do e-mail vale 30 dias e morre depois, e reentregar é seguro
 * — o Storage leva `upsert`, e o e-mail é reenviado só quando o admin manda.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { buildCertificatePdf } from '../../../shared/pdf.js'
import { formatDec, formatRa } from '../../../shared/stars.js'
import { baseDasFontes, urlDoSite, variavel } from './supabase.ts'
import { ErroApp } from './http.ts'

// A função vive em `datas.ts` (para `pagina.ts` não importar o PDF junto), e é
// re-exportada aqui porque é parte da API de quem gera o certificado.
export { dataEmPortugues } from './datas.ts'
import { dataEmPortugues } from './datas.ts'

/**
 * Gera o PDF do pedido e grava no Storage.
 *
 * O caminho usa o ID do pedido e não o código de rastreio: o ID é um UUID
 * gerado pelo banco, então não pode colidir nem ser adivinhado. O código
 * curto fica só para a pessoa.
 *
 * O mesmo pedido pode ser processado mais de uma vez (webhook reenviado,
 * reenvio do painel) — por isso o upload é `upsert` e o hash devolvido serve
 * para conferir se o arquivo mudou.
 *
 * @param luz    `false` = versão escura (a original); `true` = clara, que
 *               economiza tinta na impressão. As duas convivem no mesmo pedido.
 * @returns o caminho no Storage, o hash SHA-256 em hex e o tamanho em bytes
 */
export async function gerarEGuardar(
  db: SupabaseClient,
  pedido: Record<string, unknown>,
  estrela: Record<string, unknown>,
  luz: boolean,
): Promise<{ caminho: string; hash: string; bytes: number }> {
  // `honoreeName` etc. chegam do banco já validados; o `pedido` vem do webhook.
  const dados = {
    honoreeName: String(pedido.honoree_name ?? ''),
    starName: String(estrela.name ?? ''),
    bayer: String(estrela.bayer ?? ''),
    constellation: String(estrela.constellation ?? ''),
    constellationLatin: String(estrela.constellation_latin ?? ''),
    spectralType: String(estrela.spectral_type ?? ''),
    raFormatted: formatRa(Number(estrela.ra_hours)),
    decFormatted: formatDec(Number(estrela.dec_degrees)),
    magnitude: Number(estrela.magnitude),
    distanceLy: Number(estrela.distance_ly),
    story: String(estrela.story ?? ''),
    code: String(pedido.code ?? ''),
    dedicationDate: dataEmPortugues(
      typeof pedido.dedication_date === 'string' ? pedido.dedication_date : null,
    ),
    fromName: pedido.from_name ? String(pedido.from_name) : undefined,
    message: pedido.message ? String(pedido.message) : undefined,
  }

  let bytes: Uint8Array
  try {
    bytes = await buildCertificatePdf(dados, { light: luz, fontBaseUrl: baseDasFontes() })
  } catch (erro) {
    // Falha de geração é infra, não cliente: o pedido já foi pago e precisa de
    // uma segunda chance (o admin reenvia).
    throw new ErroApp(
      'pdf_falhou',
      'Não foi possível gerar o certificado.',
      500,
      erro instanceof Error ? erro.message : String(erro),
    )
  }

  // Duas entradas no bucket para o mesmo pedido: `certificado.pdf` (escura) e
  // `certificado-claro.pdf` (clara). O sufixo é o único que as separa.
  const caminho = `${pedido.id}/certificado${luz ? '-claro' : ''}.pdf`

  // `upsert` e não `insert`: o Mercado Pago reenvia o webhook quando não recebe
  // o 200, e o mesmo pedido pode chegar duas vezes.
  const { error } = await db.storage
    .from('certificados')
    .upload(caminho, bytes, { contentType: 'application/pdf', upsert: true })

  if (error) {
    throw new ErroApp('storage_falhou', 'Não foi possível guardar o certificado.', 500, error.message)
  }

  /*
   * O `crypto.subtle` do Web Crypto exige um `ArrayBuffer` de verdade, e o
   * `Uint8Array` devolvido pelo pdf-lib pode estar apoiado num `SharedArrayBuffer`
   * (é o que o WASM produz). Copiar num array próprio resolve, e são ~24 KB.
   */
  const paraHash = Uint8Array.from(bytes)

  // O hash serve para provar que o arquivo não mudou e para evitar regerar o
  // mesmo PDF quando o webhook chega repetido.
  const hash = await crypto.subtle.digest('SHA-256', paraHash.buffer)
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return { caminho, hash: hashHex, bytes: bytes.byteLength }
}

/**
 * Envia o e-mail com o link para baixar o certificado.
 *
 * Efeito colateral: uma mensagem real na caixa de entrada de quem comprou
 * (Resend). Em caso de falha lança `ErroApp` — nada é gravado como entregue,
 * e é o chamador quem decide se tenta de novo.
 *
 * A estrela chega por parâmetro porque `orders` guarda só `star_slug`, não o
 * nome nem a constelação. O webhook já busca a estrela para gerar o PDF, e o
 * e-mail usa a mesma linha — ler `pedido.star_name` daria `undefined` e o
 * e-mail sairia como "O certificado de , dedicado a Ana".
 *
 * O link é assinado e tem prazo: o PDF fica num bucket privado, e o link é a
 * única forma de chegar nele. Link permanente em bucket público transformaria
 * qualquer estouro de rede em vazamento de quem comprou o quê.
 */
export async function enviarEmail(
  db: SupabaseClient,
  pedido: Record<string, unknown>,
  estrela: Record<string, unknown>,
  caminho: string,
): Promise<void> {
  const codigo = String(pedido.code ?? '')
  const email = String(pedido.customer_email ?? '')
  const nomeComprador = String(pedido.customer_name ?? '').split(' ')[0]
  const destino = String(pedido.honoree_name ?? '')
  const nomeEstrela = String(estrela.name ?? '')
  const constelacao = String(estrela.constellation ?? '')

  /*
   * O PDF fica num bucket PRIVADO, e o link assinado é a única forma de chegar
   * nele. Link permanente em bucket público transformaria qualquer estouro de
   * rede em vazamento de quem comprou o quê.
   */
  const { data: assinado, error: erroLink } = await db.storage
    .from('certificados')
    .createSignedUrl(caminho, 60 * 60 * 24 * 30)

  if (erroLink || !assinado) {
    throw new ErroApp('link_falhou', 'Não foi possível gerar o link de download.', 500, erroLink?.message)
  }

  /*
   * A página dedicada, se existir e estiver publicada.
   *
   * A conferência é aqui dentro porque o mesmo `enviarEmail` roda no webhook
   * (página recém-criada), no reenvio do painel (página pode existir) e em
   * pedidos anteriores às páginas (não existe — sem botão, sem link morto).
   * Página em rascunho também fica de fora: o rascunho não é público.
   */
  const { data: pagina } = await db
    .from('pages')
    .select('code')
    .eq('code', codigo)
    .eq('status', 'published')
    .maybeSingle()

  const botaoPagina = pagina
    ? `
      <p style="margin:0 0 28px">
        <a href="${urlDoSite()}/p/${escapeHtml(codigo)}"
           style="display:inline-block;border:1.5px solid #1b1d33;color:#1b1d33;text-decoration:none;
                  padding:14px 28px;border-radius:999px;font-family:'Segoe UI',system-ui,sans-serif;
                  font-weight:600;font-size:15px">
          Ver a página dedicada
        </a>
      </p>

      <p style="font-size:14px;line-height:1.7;color:#565a75;margin:0 0 24px">
        A página fica no ar nesse endereço. Com o código
        <strong>${escapeHtml(codigo)}</strong> e o seu e-mail, você também pode
        editar o texto dela quando quiser.
      </p>
    `
    : ''

  const assunto = `${destino}, a sua estrela está pronta`

  const corpo = `
    <div style="font-family:'Segoe UI',Montserrat,system-ui,sans-serif;color:#1b1d33;max-width:560px;margin:0 auto;padding:32px">
      <p style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8f6f1f;margin:0 0 24px">
        Stellara · certificado de dedicação celeste
      </p>

      <h1 style="font-size:26px;margin:0 0 20px">A sua estrela está pronta</h1>

      <p style="font-size:16px;line-height:1.7;margin:0 0 20px">
        Olá, ${escapeHtml(nomeComprador)}. O certificado de
        <strong>${escapeHtml(nomeEstrela)}</strong>,
        dedicado a <strong>${escapeHtml(destino)}</strong>, já está pronto.
      </p>

      <p style="margin:0 0 28px">
        <a href="${assinado.signedUrl}"
           style="display:inline-block;background:#d8b66a;color:#090b20;text-decoration:none;
                  padding:14px 28px;border-radius:999px;font-family:'Segoe UI',system-ui,sans-serif;
                  font-weight:600;font-size:15px">
          Baixar o certificado (PDF)
        </a>
      </p>
      ${botaoPagina}
      <p style="font-size:14px;line-height:1.7;color:#565a75;margin:0 0 24px">
        O link vale por 30 dias. Guarde o arquivo: ele fica em uma pasta só sua.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#565a75;margin:0 0 28px">
        <tr><td style="padding:4px 0">Registro</td>
            <td style="text-align:right;font-family:monospace">${escapeHtml(codigo)}</td></tr>
        <tr><td style="padding:4px 0">Estrela</td>
            <td style="text-align:right">${escapeHtml(nomeEstrela)}</td></tr>
        <tr><td style="padding:4px 0">Constelação</td>
            <td style="text-align:right">${escapeHtml(constelacao)}</td></tr>
      </table>

      <p style="font-size:12px;color:#565a75;border-top:1px solid #efe9db;padding-top:16px;margin:0">
        Documento simbólico de afeto. As coordenadas foram conferidas com o SIMBAD.
        Se precisar de ajuda, responda este e-mail quoting o registro
        <strong>${escapeHtml(codigo)}</strong>.
      </p>
    </div>
  `

  await enviarPorResend({ para: email, assunto, html: corpo, referencia: codigo })
}

/**
 * Manda um e-mail pelo Resend. Único lugar que fala com a API dele: o
 * certificado (`enviarEmail`) e o link de edição (`enviarLinkDeEdicao`)
 * passam por aqui.
 *
 * Falha vira `ErroApp('email_falhou')` com o corpo do Resend só no log. Quem
 * chama decide o que isso significa — no webhook, o pedido está pago e o PDF
 * já está no Storage, então o erro é registrado e o reenvio fica com o painel.
 */
export async function enviarPorResend(opcoes: {
  para: string
  assunto: string
  html: string
  referencia: string
}): Promise<void> {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${variavel('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: variavel('EMAIL_FROM'),
      to: [opcoes.para],
      subject: opcoes.assunto,
      html: opcoes.html,
      // Agrupa as mensagens do mesmo pedido no cliente de e-mail.
      headers: { 'X-Entity-Ref-ID': opcoes.referencia },
    }),
  })

  if (!resposta.ok) {
    throw new ErroApp('email_falhou', 'Não foi possível enviar o e-mail.', 502, await resposta.text())
  }
}

/**
 * Link de acesso à edição da página, mandado para o e-mail de quem comprou.
 *
 * O link leva o token no FRAGMENTO (`#acesso=`), não na query: fragmento não
 * vai para o servidor, não fica em log de acesso nem no `Referer` de quem a
 * página chamar depois.
 */
export async function enviarLinkDeEdicao(opcoes: {
  para: string
  codigo: string
  token: string
  validadeDias: number
}): Promise<void> {
  const link = `${urlDoSite()}/p/${encodeURIComponent(opcoes.codigo)}/editar#acesso=${opcoes.token}`

  const html = `
    <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#090b20;color:#f6f1e7">
      <h1 style="font-weight:normal;color:#d8b66a;font-size:24px;margin:0 0 16px">Editar a sua página</h1>
      <p style="line-height:1.6">
        Recebemos um pedido para editar a página <strong>${escapeHtml(opcoes.codigo)}</strong>.
        O botão abaixo abre a edição direto, sem senha, e vale por ${opcoes.validadeDias} dias.
      </p>
      <p style="margin:28px 0">
        <a href="${link}"
           style="display:inline-block;padding:12px 24px;background:#d8b66a;color:#090b20;text-decoration:none;border-radius:999px">
          Editar minha página
        </a>
      </p>
      <p style="line-height:1.6;font-size:13px;color:#b9b3a6">
        Se não foi você, ignore este e-mail: sem o link, ninguém entra na edição.
      </p>
    </div>
  `

  await enviarPorResend({
    para: opcoes.para,
    assunto: 'Seu link para editar a página · Stellara',
    html,
    referencia: `${opcoes.codigo}-edicao`,
  })
}

/**
 * Escapa HTML.
 *
 * O nome e a mensagem passam pelo filtro de moderação, mas mesmo assim não
 * entram em HTML sem escape: o filtro bloqueia padrões conhecidos, não
 * transforma texto em HTML.
 */
export function escapeHtml(texto: string): string {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
