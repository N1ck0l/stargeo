/**
 * Peças de campanha (co-branding) para as folhas: o selo com a logomarca do
 * parceiro e o QR code da página. Mesma linguagem de `desenho.js` — itens em
 * milímetros que a prévia (SVG) e o PDF traduzem.
 *
 * Selo: a logo do parceiro NÃO muda de cor nem de proporção. Sobre a folha
 * escura (azul-marinho, que engoliria o azul da marca) ela vai num cartão
 * claro com filete dourado; na folha clara, direto no papel.
 *
 * QR: quadrados de verdade (não imagem), com a zona de silêncio de 4 módulos
 * exigida pela norma e módulos escuros sobre branco — o contraste que as
 * câmeras de celular leem melhor, impresso em qualquer papel.
 */
// `npm:` porque este arquivo também roda na Edge Function (Deno), via
// `shared/pdf.js`; o site e os testes traduzem o prefixo (alias no Vite/Vitest).
import qrcode from 'npm:qrcode-generator@1.4.4'

/**
 * @typedef {object} Campanha
 * @property {string} parceiro            "PROIMAGEM"
 * @property {{ src: string, proporcao: number } | null} [logo]  só com autorização
 * @property {string} [fraseFinal]
 */

/** Retângulo de cantos arredondados como caminho (o pdf-lib não arredonda `drawRectangle`). */
function retanguloArredondado(l, a, r) {
  return `M${r} 0H${l - r}Q${l} 0 ${l} ${r}V${a - r}Q${l} ${a} ${l - r} ${a}H${r}Q0 ${a} 0 ${a - r}V${r}Q0 0 ${r} 0Z`
}

/**
 * O selo do parceiro com `largura` mm, canto superior esquerdo em (x, y).
 * Sem logo (não autorizada), nada é desenhado.
 *
 * @returns {number} a altura ocupada, em mm (0 sem logo)
 */
export function seloDoParceiro(add, p, { x, y, largura, campanha, claro }) {
  const logo = campanha?.logo
  if (!logo?.src || !(logo.proporcao > 0)) return 0
  const folga = claro ? 0 : 2.6
  const larguraLogo = largura - folga * 2
  const alturaLogo = larguraLogo / logo.proporcao
  const altura = alturaLogo + folga * 2
  if (!claro) {
    add({
      tipo: 'caminho',
      d: retanguloArredondado(largura, altura, 2),
      x,
      y,
      escala: 1,
      preenchimento: '#fbf8f1',
      opacidade: 1,
      traco: p.moldura,
      espessura: 0.25,
    })
  }
  add({ tipo: 'imagem', src: logo.src, x: x + folga, y: y + folga, largura: larguraLogo, altura: alturaLogo })
  return altura
}

/**
 * A matriz do QR (verdadeiro = módulo escuro). Correção de erro "M" (15%):
 * aguenta um risco ou dobra no papel sem crescer demais.
 *
 * @param {string} url
 * @returns {boolean[][]}
 */
export function matrizQr(url) {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** Módulos de silêncio em volta do QR (o mínimo da norma ISO/IEC 18004). */
export const ZONA_SILENCIO = 4

/**
 * O QR de `url` num quadrado branco de `tamanho` mm (com a zona de silêncio
 * dentro), canto superior esquerdo em (x, y). Cada linha vira poucos
 * retângulos (trechos escuros contínuos), não um por módulo.
 */
export function qrDaUrl(add, { x, y, tamanho, url, cor = '#0b0d24' }) {
  const matriz = matrizQr(url)
  const n = matriz.length
  const m = tamanho / (n + ZONA_SILENCIO * 2)
  add({ tipo: 'retangulo', x, y, largura: tamanho, altura: tamanho, preenchimento: '#ffffff', opacidade: 1 })
  matriz.forEach((linha, r) => {
    let inicio = -1
    for (let c = 0; c <= n; c += 1) {
      const escuro = c < n && linha[c]
      if (escuro && inicio < 0) inicio = c
      if (!escuro && inicio >= 0) {
        add({
          tipo: 'retangulo',
          x: x + (ZONA_SILENCIO + inicio) * m,
          y: y + (ZONA_SILENCIO + r) * m,
          largura: (c - inicio) * m,
          altura: m,
          preenchimento: cor,
          opacidade: 1,
        })
        inicio = -1
      }
    }
  })
  return { modulos: n, moduloMm: m }
}
