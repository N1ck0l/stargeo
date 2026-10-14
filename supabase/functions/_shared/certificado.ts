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
    // `slug`, `ra` e `dec` ligam o mapa do céu da folha (`shared/ceu.js`).
    slug: String(estrela.slug ?? ''),
    sigla: String(estrela.sigla ?? ''),
    ra: Number(estrela.ra_hours),
    dec: Number(estrela.dec_degrees),
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

/** Paleta do e-mail — a mesma da marca (`shared/marca.js`). */
const EMAIL = {
  noite: '#090b20',
  folha: '#11153a',
  dourado: '#d8b66a',
  douradoSuave: '#eadfb6',
  marfim: '#f6f1e7',
  apagado: '#a9a6b8',
  serif: "'Playfair Display',Georgia,'Times New Roman',serif",
  sans: "Montserrat,'Segoe UI',Arial,sans-serif",
}

/**
 * Moldura comum dos e-mails: fundo azul-noite, logo oficial no topo, rodapé.
 *
 * Tabelas e estilo inline, de propósito: é o HTML que o Gmail, o Outlook e o
 * Apple Mail desenham igual. A logo é PNG (`loja/public/email/`, de
 * `npm run marca`) — cliente de e-mail não mostra SVG. O `alt` em texto
 * garante a marca quando a imagem vem bloqueada.
 */
function moldura(conteudo: string, rodape: string): string {
  return `
<div style="margin:0;padding:0;background:${EMAIL.noite}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL.noite}">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td align="center" style="padding:8px 0 28px">
          <img src="${urlDoSite()}/email/stellara-horizontal.png" width="240" alt="STELLARA — A star of your own."
               style="display:block;width:240px;max-width:100%;height:auto;border:0;color:${EMAIL.dourado};font-family:${EMAIL.serif};font-size:22px;letter-spacing:4px">
        </td></tr>
        <tr><td style="font-family:${EMAIL.sans};color:${EMAIL.marfim}">
          ${conteudo}
        </td></tr>
        <tr><td style="padding:28px 8px 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.7;color:${EMAIL.apagado};text-align:center">
          ${rodape}
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`
}

/** Botão "pílula", com o `href` já pronto. `principal` = dourado cheio. */
function botao(href: string, texto: string, principal = false): string {
  const estilo = principal
    ? `background:${EMAIL.dourado};color:${EMAIL.noite};border:1.5px solid ${EMAIL.dourado}`
    : `background:transparent;color:${EMAIL.douradoSuave};border:1.5px solid ${EMAIL.dourado}`
  return `<a href="${href}" style="display:inline-block;${estilo};text-decoration:none;padding:13px 26px;border-radius:999px;font-family:${EMAIL.sans};font-weight:600;font-size:14px;margin:4px">${texto}</a>`
}

/**
 * Envia o e-mail de entrega: a "miniatura" do certificado em HTML, a página
 * dedicada e os dois PDFs.
 *
 * Efeito colateral: uma mensagem real na caixa de entrada de quem comprou
 * (Resend). Em caso de falha lança `ErroApp` — nada é gravado como entregue,
 * e é o chamador quem decide se tenta de novo.
 *
 * A estrela chega por parâmetro porque `orders` guarda só `star_slug`, não o
 * nome nem a constelação — ler `pedido.star_name` daria `undefined` e o
 * e-mail sairia como "O certificado de , dedicado a Ana".
 *
 * `caminho` pode ser o de qualquer uma das duas versões: os dois links saem
 * dele. Antes ia só UM link — o do último PDF gerado, que é o CLARO —, e a
 * versão escura, a original, não chegava a ninguém.
 *
 * Os links são assinados e têm prazo: o PDF fica num bucket privado. Link
 * permanente em bucket público transformaria qualquer estouro de rede em
 * vazamento de quem comprou o quê.
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
  const bayer = String(estrela.bayer ?? '')
  const ra = Number(estrela.ra_hours)
  const dec = Number(estrela.dec_degrees)
  const coordenadas =
    estrela.ra_hours != null && estrela.dec_degrees != null && Number.isFinite(ra) && Number.isFinite(dec)
      ? `${formatRa(ra)} · ${formatDec(dec)}`
      : ''

  const escuro = caminho.replace(/-claro\.pdf$/, '.pdf')
  const claro = escuro.replace(/\.pdf$/, '-claro.pdf')
  const assinar = async (arquivo: string) => {
    const { data, error } = await db.storage.from('certificados').createSignedUrl(arquivo, 60 * 60 * 24 * 30)
    if (error || !data) {
      throw new ErroApp('link_falhou', 'Não foi possível gerar o link de download.', 500, error?.message)
    }
    return data.signedUrl
  }
  const [linkEscuro, linkClaro] = await Promise.all([assinar(escuro), assinar(claro)])

  /*
   * A página dedicada, se existir e estiver publicada. A conferência é aqui
   * dentro porque o mesmo `enviarEmail` roda no webhook (página recém-criada),
   * no reenvio do painel e em pedidos anteriores às páginas (sem botão, sem
   * link morto). Rascunho também fica de fora: não é público.
   */
  const { data: pagina } = await db
    .from('pages')
    .select('code')
    .eq('code', codigo)
    .eq('status', 'published')
    .maybeSingle()

  const urlPagina = `${urlDoSite()}/p/${escapeHtml(codigo)}`

  // A "miniatura": a folha resumida em HTML, com a mesma hierarquia do PDF.
  const miniatura = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${EMAIL.folha};border:1px solid ${EMAIL.dourado};border-radius:6px">
      <tr><td style="padding:6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(216,182,106,0.45);border-radius:3px">
          <tr><td align="center" style="padding:30px 20px 28px">
            <p style="margin:0;font-family:${EMAIL.serif};font-size:13px;letter-spacing:3px;color:${EMAIL.dourado}">CERTIFICADO DE DEDICAÇÃO</p>
            <p style="margin:4px 0 22px;font-size:9px;letter-spacing:3px;color:${EMAIL.douradoSuave}">DE UMA ESTRELA</p>
            <p style="margin:0;font-size:12px;color:${EMAIL.apagado}">Certificamos que a estrela</p>
            <p style="margin:6px 0 2px;font-family:${EMAIL.serif};font-size:26px;color:${EMAIL.dourado}">${escapeHtml(nomeEstrela)}</p>
            <p style="margin:0 0 16px;font-family:${EMAIL.serif};font-style:italic;font-size:14px;color:${EMAIL.apagado}">${escapeHtml(bayer)}${bayer && constelacao ? ' · ' : ''}${escapeHtml(constelacao)}</p>
            <p style="margin:0;font-size:12px;color:${EMAIL.apagado}">foi dedicada a</p>
            <p style="margin:8px 0 0;font-family:${EMAIL.serif};font-style:italic;font-size:28px;line-height:1.25;color:${EMAIL.marfim}">${escapeHtml(destino)}</p>
            ${coordenadas ? `<p style="margin:18px 0 0;font-size:11px;letter-spacing:1px;color:${EMAIL.douradoSuave}">${escapeHtml(coordenadas)}</p>` : ''}
            <p style="margin:6px 0 0;font-size:11px;letter-spacing:2px;color:${EMAIL.apagado}">REGISTRO ${escapeHtml(codigo)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>`

  const assunto = `${destino}, a sua estrela está pronta`

  const conteudo = `
    <h1 style="margin:0 0 12px;font-family:${EMAIL.serif};font-weight:normal;font-size:28px;color:${EMAIL.marfim};text-align:center">A sua estrela está pronta</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.7;color:${EMAIL.marfim};text-align:center">
      Olá, ${escapeHtml(nomeComprador)}. O certificado de <strong style="color:${EMAIL.dourado}">${escapeHtml(nomeEstrela)}</strong>,
      dedicado a <strong>${escapeHtml(destino)}</strong>, já está pronto.
    </p>
    ${miniatura}
    <p style="margin:28px 0 0;text-align:center">
      ${pagina ? botao(urlPagina, 'Ver a página dedicada', true) : ''}
      ${botao(linkEscuro, 'Baixar o certificado (PDF)', !pagina)}
    </p>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:${EMAIL.apagado};text-align:center">
      Vai imprimir? Use a <a href="${linkClaro}" style="color:${EMAIL.douradoSuave}">versão clara</a>, que gasta muito menos tinta.
      Os links valem por 30 dias — guarde os arquivos.
    </p>
    ${pagina ? `
    <p style="margin:22px 0 0;font-size:13px;line-height:1.7;color:${EMAIL.apagado};text-align:center">
      A página fica no ar em <a href="${urlPagina}" style="color:${EMAIL.douradoSuave}">${escapeHtml(urlPagina.replace(/^https?:\/\//, ''))}</a> —
      é o link para mandar a quem vai receber. Com o código <strong style="color:${EMAIL.marfim}">${escapeHtml(codigo)}</strong>
      e o seu e-mail, você também pode editar o texto dela quando quiser.
    </p>` : ''}`

  const rodape = `
    Documento simbólico de afeto. As coordenadas foram conferidas com o SIMBAD.<br>
    Precisa de ajuda? Responda este e-mail informando o registro <strong style="color:${EMAIL.marfim}">${escapeHtml(codigo)}</strong>.`

  await enviarPorResend({ para: email, assunto, html: moldura(conteudo, rodape), referencia: codigo })
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

  const html = moldura(
    `
    <h1 style="margin:0 0 16px;font-family:${EMAIL.serif};font-weight:normal;font-size:26px;color:${EMAIL.marfim};text-align:center">Editar a sua página</h1>
    <p style="margin:0;font-size:15px;line-height:1.7;color:${EMAIL.marfim};text-align:center">
      Recebemos um pedido para editar a página <strong style="color:${EMAIL.dourado}">${escapeHtml(opcoes.codigo)}</strong>.
      O botão abaixo abre a edição direto, sem senha, e vale por ${opcoes.validadeDias} dias.
    </p>
    <p style="margin:28px 0 0;text-align:center">${botao(link, 'Editar minha página', true)}</p>`,
    'Se não foi você, ignore este e-mail: sem o link, ninguém entra na edição.',
  )

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
