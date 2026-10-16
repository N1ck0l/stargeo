/**
 * A folha do certificado como TEXTO SVG — o mesmo que a prévia
 * (`loja/src/components/CertificadoPreview.jsx`) monta em React, sem React.
 *
 * Usado fora do navegador: a prévia social (`npm run marca` → `og-image.png`)
 * mostra a folha de exemplo desenhada pelo gerador de verdade, não um
 * desenho à parte que poderia divergir dela.
 */
import { MM_POR_PT } from './desenho.js'

/** Fonte do desenho → família, estilo e peso (as mesmas do PDF e da prévia). */
const FONTES = {
  sans: { family: 'Montserrat', style: 'normal', weight: 400 },
  sansMedio: { family: 'Montserrat', style: 'normal', weight: 500 },
  sansItalico: { family: 'Montserrat', style: 'italic', weight: 400 },
  serif: { family: 'Playfair Display', style: 'normal', weight: 400 },
  serifItalico: { family: 'Playfair Display', style: 'italic', weight: 400 },
  grego: { family: 'EB Garamond', style: 'italic', weight: 400 },
}

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (v) => Number(Number(v).toFixed(3))

/**
 * @param {{ largura: number, altura: number, itens: object[] }} folha  saída de `desenharCertificado`
 * @param {string} [id]  sufixo dos ids internos (vários SVGs no mesmo documento)
 * @returns {string} os elementos da folha, em mm, para ir dentro de um `<svg>` ou `<g>`
 */
export function itensEmSvg(folha, id = 'f') {
  return folha.itens.map((item) => itemEmSvg(item, id)).join('')
}

function itemEmSvg(item, id) {
  switch (item.tipo) {
    case 'degrade':
      return (
        `<defs><linearGradient id="fundo-${id}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${item.topo}"/><stop offset="1" stop-color="${item.base}"/></linearGradient></defs>` +
        `<rect width="210" height="297" fill="url(#fundo-${id})"/>`
      )
    case 'linha':
      return `<line x1="${num(item.x1)}" y1="${num(item.y1)}" x2="${num(item.x2)}" y2="${num(item.y2)}" stroke="${item.cor}" stroke-width="${num(item.espessura)}" stroke-opacity="${num(item.opacidade)}"/>`
    case 'retangulo': {
      // Contorno (moldura) ou preenchido (módulos do QR, fundo branco dele).
      const preenche = item.preenchimento ? `fill="${item.preenchimento}" fill-opacity="${num(item.opacidade)}"` : 'fill="none"'
      const traco = item.traco ? ` stroke="${item.traco}" stroke-width="${num(item.espessura)}" stroke-opacity="${num(item.opacidade)}"` : ''
      return `<rect x="${num(item.x)}" y="${num(item.y)}" width="${num(item.largura)}" height="${num(item.altura)}" ${preenche}${traco}/>`
    }
    case 'imagem':
      return `<image href="${escapar(item.src)}" x="${num(item.x)}" y="${num(item.y)}" width="${num(item.largura)}" height="${num(item.altura)}" preserveAspectRatio="xMidYMid meet"/>`
    case 'circulo': {
      const preenche = item.preenchimento ? `fill="${item.preenchimento}" fill-opacity="${num(item.opacidade)}"` : 'fill="none"'
      const traco = item.traco ? ` stroke="${item.traco}" stroke-width="${num(item.espessura)}" stroke-opacity="${num(item.opacidade)}"` : ''
      return `<circle cx="${num(item.cx)}" cy="${num(item.cy)}" r="${num(item.r)}" ${preenche}${traco}/>`
    }
    case 'caminho': {
      const preenche = item.preenchimento ? `fill="${item.preenchimento}" fill-opacity="${num(item.opacidade)}"` : 'fill="none"'
      // O traço vem em mm; dentro do grupo escalado ele seria escalado de novo.
      const traco = item.traco
        ? ` stroke="${item.traco}" stroke-width="${num(item.espessura / item.escala)}" stroke-opacity="${num(item.opacidade)}"${item.ponta === 'redonda' ? ' stroke-linecap="round"' : ''}`
        : ''
      return `<path d="${item.d}" transform="translate(${num(item.x)} ${num(item.y)}) scale(${num(item.escala)})" ${preenche}${traco}/>`
    }
    case 'texto': {
      const f = FONTES[item.fonte]
      const espaco = item.espaco ? ` letter-spacing="${num(item.espaco * MM_POR_PT)}"` : ''
      return (
        `<text x="${num(item.x)}" y="${num(item.y)}" fill="${item.cor}" fill-opacity="${num(item.opacidade)}" ` +
        `font-family="${f.family}" font-style="${f.style}" font-weight="${f.weight}" font-size="${num(item.pt * MM_POR_PT)}"${espaco} ` +
        `font-kerning="none" xml:space="preserve">${escapar(item.texto)}</text>`
      )
    }
    default:
      return ''
  }
}
