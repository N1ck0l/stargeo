import { formatDec, formatRa } from '../../../shared/stars.js'

/**
 * Props da folha (estrela do catálogo + textos) → dados do desenho.
 *
 * Um lugar só para a prévia (`CertificadoPreview`) e o "Baixar PDF"
 * (`baixarPdf`): se cada um montasse os dados, o PDF baixado poderia sair
 * diferente da folha que a pessoa está vendo.
 */
export function dadosDaFolha({ estrela, honoreeName, message, fromName, dedicationDate, code, starNickname, par, grupoLinha }) {
  return {
    honoreeName,
    starNickname,
    // Par de estrelas: `{ estrela, nome }` do outro pedido.
    parEstrela: par?.estrela,
    parNome: par?.nome,
    // Grupo de 3+: a linha pronta (`shared/grupo.js`).
    grupoLinha,
    starName: estrela.name,
    slug: estrela.slug,
    sigla: estrela.sigla,
    ra: estrela.ra,
    dec: estrela.dec,
    bayer: estrela.bayer,
    constellation: estrela.constellation,
    constellationLatin: estrela.constellationLatin,
    spectralType: estrela.spectralType,
    raFormatted: formatRa(estrela.ra),
    decFormatted: formatDec(estrela.dec),
    magnitude: estrela.magnitude,
    distanceLy: estrela.distanceLy,
    code,
    dedicationDate,
    fromName,
    message,
  }
}

/**
 * "certificado-geovanna-kaus-australis.pdf": legível na pasta de downloads.
 * Acentos e letras gregas saem (o registro da Geovanna começa com "ε", e o
 * nome do arquivo virava "certificado---SGR…").
 */
export function nomeDoArquivo({ honoreeName, estrela }, sufixo, extensao) {
  const limpo = (texto) =>
    String(texto ?? '')
      // Letras que não se decompõem em base + acento.
      .replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').replace(/[đĐ]/g, 'd').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  const primeiroNome = limpo(String(honoreeName ?? '').trim().split(/\s+/)[0])
  const partes = ['certificado', primeiroNome, limpo(estrela?.name), sufixo].filter(Boolean)
  return `${partes.join('-')}.${extensao}`
}

/**
 * Gera o PDF da folha NO NAVEGADOR e baixa o arquivo.
 *
 * É o mesmo gerador do servidor (`shared/pdf.js`), carregado só no clique —
 * pdf-lib e fontkit são pesados e quem só olha a página não precisa deles. As
 * fontes vão em TTF (`/fonts/pdf/*.ttf`), sem descompressor de woff2.
 *
 * @param {Parameters<typeof dadosDaFolha>[0]} props
 * @param {{ claro?: boolean, campanha?: object | null }} [opcoes]
 */
export async function baixarPdf(props, { claro = false, campanha = null } = {}) {
  const { buildCertificatePdf } = await import('../../../shared/pdf.js')
  const bytes = await buildCertificatePdf(dadosDaFolha(props), {
    light: claro,
    campanha,
    fontBaseUrl: '',
    formatoFonte: 'ttf',
  })

  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeDoArquivo(props, claro ? 'claro' : '', 'pdf')
  document.body.appendChild(link)
  link.click()
  link.remove()
  // O clique já entregou o arquivo ao navegador; o objeto pode ir embora.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
