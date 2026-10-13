/**
 * Geração do PDF e entrega por e-mail.
 *
 * Junta as duas pontas da entrega porque elas sempre andam juntas: o PDF só é
 * útil se chegar no e-mail, e o e-mail só serve se o PDF for o que a pessoa
 * comprou.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { buildCertificatePdf } from '../../../shared/pdf.js'
import { formatDec, formatRa } from '../../../shared/stars.js'
import { baseDasFontes, variavel } from './supabase.ts'
import { ErroApp } from './http.ts'

/** DATA em português, sem depender do fuso do servidor. */
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function dataEmPortugues(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  // `T00:00:00Z` evita que o fuso do servidor empurre a data para o dia anterior.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/**
 * Gera o PDF do pedido e grava no Storage.
 *
 * O caminho usa o ID do pedido e não o código de rastreio: o ID é um UUID
 * gerado pelo banco, então não pode colidir nem ser adivinhado. O código
 * curto fica só para a pessoa.
 *
 * @returns o caminho no Storage
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
  const chave = variavel('RESEND_API_KEY')
  const de = variavel('EMAIL_FROM')

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

  const assunto = `${destino}, a sua estrela está pronta`

  const corpo = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#2b2342;max-width:560px;margin:0 auto;padding:32px">
      <p style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8a6a1c;margin:0 0 24px">
        StarGeo · certificado de dedicação celeste
      </p>

      <h1 style="font-size:26px;margin:0 0 20px">A sua estrela está pronta</h1>

      <p style="font-size:16px;line-height:1.7;margin:0 0 20px">
        Olá, ${escapeHtml(nomeComprador)}. O certificado de
        <strong>${escapeHtml(nomeEstrela)}</strong>,
        dedicado a <strong>${escapeHtml(destino)}</strong>, já está pronto.
      </p>

      <p style="margin:0 0 28px">
        <a href="${assinado.signedUrl}"
           style="display:inline-block;background:#e8c872;color:#07061a;text-decoration:none;
                  padding:14px 28px;border-radius:999px;font-family:system-ui,sans-serif;
                  font-weight:600;font-size:15px">
          Baixar o certificado (PDF)
        </a>
      </p>

      <p style="font-size:14px;line-height:1.7;color:#5a5170;margin:0 0 24px">
        O link vale por 30 dias. Guarde o arquivo: ele fica em uma pasta só sua.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#5a5170;margin:0 0 28px">
        <tr><td style="padding:4px 0">Registro</td>
            <td style="text-align:right;font-family:monospace">${escapeHtml(codigo)}</td></tr>
        <tr><td style="padding:4px 0">Estrela</td>
            <td style="text-align:right">${escapeHtml(nomeEstrela)}</td></tr>
        <tr><td style="padding:4px 0">Constelação</td>
            <td style="text-align:right">${escapeHtml(constelacao)}</td></tr>
      </table>

      <p style="font-size:12px;color:#8a8296;border-top:1px solid #e5e0d5;padding-top:16px;margin:0">
        Documento simbólico de afeto. As coordenadas foram conferidas com o SIMBAD.
        Se precisar de ajuda, responda este e-mail quoting o registro
        <strong>${escapeHtml(codigo)}</strong>.
      </p>
    </div>
  `

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: de,
      to: [email],
      subject: assunto,
      html: corpo,
      // O e-mail transacional não deve ficar na caixa de entrada principal.
      headers: { 'X-Entity-Ref-ID': codigo },
    }),
  })

  if (!resposta.ok) {
    // O pedido está pago e o PDF já está no Storage: o e-mail pode ser
    // reenviado. Por isso o erro é registrado, mas o webhook responde 200 —
    // devolver erro faria o Mercado Pago reenviar para sempre.
    throw new ErroApp('email_falhou', 'Não foi possível enviar o e-mail.', 502, await resposta.text())
  }
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
