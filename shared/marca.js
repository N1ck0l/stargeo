/**
 * Geometria da marca Stellara — fonte da verdade do símbolo.
 *
 * Usada por `scripts/gerar-marca.mjs` (SVGs da marca, favicon, PNGs) e pelo
 * desenho do certificado (`shared/certificado/`), que roda no navegador e na
 * Edge Function. Por isso aqui só há matemática e strings de path — nada de
 * Node, DOM ou fonte.
 *
 * Coordenadas do símbolo: centro da estrela em (0,0), y para baixo (como no
 * SVG), em "unidades de símbolo" (~215 de largura). Quem desenha escala.
 */

// ---------------------------------------------------------------------------
// Paleta (a mesma do tema da loja)
// ---------------------------------------------------------------------------
export const COR = {
  noite: '#090B20',
  dourado: '#D8B66A',
  douradoClaro: '#ECD7A3', // faceta iluminada da estrela
  douradoEscuro: '#B8944E', // faceta na sombra
  marfim: '#F6F1E7',
}

const n = (v) => Number(v.toFixed(2))

// ---------------------------------------------------------------------------
// Símbolo — estrela de quatro pontas com a órbita
// ---------------------------------------------------------------------------
/*
 * Coordenadas com o centro da estrela em (0,0). Proporções da prancha: o eixo
 * vertical é mais longo que o horizontal (a estrela "aponta" para cima e para
 * baixo, como uma estrela-guia), e a ponta de baixo é um pouco maior que a de
 * cima. Os lados são côncavos e a cintura é fina.
 */
export const PONTAS = { n: [0, -96], l: [64, 0], s: [0, 104], o: [-64, 0] }
export const CINTURA = 11 // meia-largura da estrela no centro
export const ORBITA = { rx: 114, ry: 45, giro: -20, traco: 2.8, folga: 2.6 }
export const PONTO = { angulo: -16, raio: 6 }
/** Quanto o lado da ponta se curva para dentro: 0 = muito côncavo, 1 = reto. */
export const CONCAVO = 0.62 // posição na órbita (graus, no plano da elipse)

/** Ponto de controle que deixa o lado côncavo: perto do eixo, a 1/3 da ponta. */
function lado(ponta, interno) {
  const [px, py] = ponta
  const [ix, iy] = interno
  const cx = px + (ix - px) * 0.62 * (px === 0 ? CONCAVO : 1)
  const cy = py + (iy - py) * 0.62 * (py === 0 ? CONCAVO : 1)
  return `Q${n(cx)} ${n(cy)} ${n(ix)} ${n(iy)}`
}

/** As oito facetas: cada braço dividido no eixo em metade clara e escura. */
export function facetas() {
  const c = CINTURA
  const internos = { no: [-c, -c], ne: [c, -c], se: [c, c], so: [-c, c] }
  // [ponta, canto interno, tom] — luz vindo do alto à esquerda.
  const partes = [
    ['n', 'no', 'claro'], ['n', 'ne', 'escuro'],
    ['l', 'ne', 'claro'], ['l', 'se', 'escuro'],
    ['s', 'so', 'claro'], ['s', 'se', 'escuro'],
    ['o', 'no', 'claro'], ['o', 'so', 'escuro'],
  ]
  return partes.map(([p, i, tom]) => {
    const [px, py] = PONTAS[p]
    const interno = internos[i]
    return { tom, d: `M${px} ${py}${lado(PONTAS[p], interno)}L0 0Z` }
  })
}

/** Contorno inteiro da estrela (para as versões de uma cor). */
export function contornoEstrela(c = CINTURA) {
  const ordem = [['n', [c, -c]], ['l', [c, c]], ['s', [-c, c]], ['o', [-c, -c]]]
  let d = `M${PONTAS.n[0]} ${PONTAS.n[1]}`
  ordem.forEach(([p, interno], i) => {
    d += lado(PONTAS[p], interno)
    const proxima = PONTAS[ordem[(i + 1) % 4][0]]
    // Do canto interno até a próxima ponta: o mesmo lado côncavo, espelhado.
    const [px, py] = proxima
    const [ix, iy] = interno
    const cx = px + (ix - px) * 0.62 * (px === 0 ? CONCAVO : 1)
    const cy = py + (iy - py) * 0.62 * (py === 0 ? CONCAVO : 1)
    d += `Q${n(cx)} ${n(cy)} ${px} ${py}`
  })
  return d + 'Z'
}

/** Ponto da elipse girada, a partir do ângulo no plano dela. */
export function naOrbita(graus) {
  const t = (graus * Math.PI) / 180
  const g = (ORBITA.giro * Math.PI) / 180
  const x = ORBITA.rx * Math.cos(t)
  const y = ORBITA.ry * Math.sin(t)
  return [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g)]
}

/** Metade da órbita: `frente` é a de baixo, que passa NA FRENTE da estrela. */
export function arco(frente) {
  const [ax, ay] = naOrbita(0)
  const [bx, by] = naOrbita(180)
  // De 0° a 180° pelo lado positivo (baixo) ou negativo (cima) da elipse.
  return frente
    ? `M${n(ax)} ${n(ay)}A${ORBITA.rx} ${ORBITA.ry} ${ORBITA.giro} 0 1 ${n(bx)} ${n(by)}`
    : `M${n(bx)} ${n(by)}A${ORBITA.rx} ${ORBITA.ry} ${ORBITA.giro} 0 1 ${n(ax)} ${n(ay)}`
}

/** Caixa do símbolo, calculada da geometria (elipse girada + pontas + ponto). */
export function caixaSimbolo() {
  const g = (ORBITA.giro * Math.PI) / 180
  const ex = Math.sqrt((ORBITA.rx * Math.cos(g)) ** 2 + (ORBITA.ry * Math.sin(g)) ** 2) + ORBITA.traco / 2
  const ey = Math.sqrt((ORBITA.rx * Math.sin(g)) ** 2 + (ORBITA.ry * Math.cos(g)) ** 2) + ORBITA.traco / 2
  const [px, py] = naOrbita(PONTO.angulo)
  const minX = Math.min(-ex, PONTAS.o[0])
  const maxX = Math.max(ex, px + PONTO.raio, PONTAS.l[0])
  const minY = Math.min(-ey, PONTAS.n[1], py - PONTO.raio)
  const maxY = Math.max(ey, PONTAS.s[1])
  return { minX, maxX, minY, maxY, largura: maxX - minX, altura: maxY - minY }
}

/**
 * O símbolo como grupo SVG, centrado em (0,0).
 *
 * A metade de baixo da órbita passa NA FRENTE da estrela, com uma folga
 * recortada (máscara) dos dois lados do traço — é o que dá a profundidade de
 * "órbita em volta da estrela" sem gradiente nem sombra.
 *
 * `cor` null = versão dourada com facetas; uma cor = versão monocromática.
 */
export function simbolo(id, cor) {
  const [px, py] = naOrbita(PONTO.angulo)
  const largo = ORBITA.traco + ORBITA.folga * 2
  const tom = (t) => ({ claro: COR.douradoClaro, escuro: COR.douradoEscuro })[t]
  const corOrbita = cor ?? COR.dourado

  const estrela = cor
    ? `<path d="${contornoEstrela()}" fill="${cor}"/>`
    : facetas().map((f) => `<path d="${f.d}" fill="${tom(f.tom)}"/>`).join('')

  return `<defs><mask id="${id}-folga" maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">` +
    `<rect x="-200" y="-200" width="400" height="400" fill="#fff"/>` +
    `<path d="${arco(true)}" fill="none" stroke="#000" stroke-width="${largo}"/></mask></defs>` +
    `<path d="${arco(false)}" fill="none" stroke="${corOrbita}" stroke-width="${ORBITA.traco}" stroke-linecap="round"/>` +
    `<g mask="url(#${id}-folga)">${estrela}</g>` +
    `<path d="${arco(true)}" fill="none" stroke="${corOrbita}" stroke-width="${ORBITA.traco}" stroke-linecap="round"/>` +
    `<circle cx="${n(px)}" cy="${n(py)}" r="${PONTO.raio}" fill="${corOrbita}"/>`
}

