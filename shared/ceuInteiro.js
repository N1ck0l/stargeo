/**
 * O céu INTEIRO num plano — projeção de Hammer (a dos mapas do céu completo):
 * a esfera vira uma elipse 2:1 de área preservada, com o norte em cima e o
 * leste à ESQUERDA, como se vê olhando para o céu (a mesma convenção do mapa
 * do certificado, `certificado/mapa.js`).
 *
 * Existe para o grupo de estrelas (`/g/CODE`): as estrelas de uma família
 * podem estar em lados opostos do céu (Vega no norte, Canopus no sul), e o
 * recorte gnomônico do certificado — que só mostra ~20° em volta de UMA
 * estrela — não serve para várias.
 */

const RAD = Math.PI / 180
const RAIZ2 = Math.SQRT2

/**
 * Ascensão reta (h) e declinação (°) → x, y em unidades da elipse
 * (x de −2√2 a 2√2, y de −√2 a √2, y para CIMA).
 */
export function hammer(raHoras, decGraus) {
  // Longitude centrada em AR 12h, crescendo para a esquerda (leste).
  let l = 180 - raHoras * 15
  if (l > 180) l -= 360
  if (l < -180) l += 360
  const lam = l * RAD
  const phi = decGraus * RAD
  const z = Math.sqrt(1 + Math.cos(phi) * Math.cos(lam / 2))
  return {
    x: (2 * RAIZ2 * Math.cos(phi) * Math.sin(lam / 2)) / z,
    y: (RAIZ2 * Math.sin(phi)) / z,
    l,
  }
}

/**
 * Projeta o céu (`shared/ceu.js`) e as estrelas marcadas numa caixa de
 * `largura` (a altura é a metade). Coordenadas de tela: y para BAIXO.
 *
 * @param {{ ESTRELAS: number[][], LINHAS: Record<string, number[][][]> }} ceu
 * @param {Array<{ ra: number, dec: number }>} marcadas
 * @param {number} largura
 */
export function projetarCeuInteiro(ceu, marcadas, largura = 720) {
  const escala = largura / (4 * RAIZ2)
  const altura = largura / 2
  const tela = (ra, dec) => {
    const p = hammer(ra, dec)
    return { x: largura / 2 + p.x * escala, y: altura / 2 - p.y * escala, l: p.l }
  }

  const estrelas = ceu.ESTRELAS.map(([ra, dec, mag]) => ({ ...tela(ra, dec), mag }))

  // Traços das constelações; o segmento que atravessa a "costura" da
  // elipse (AR 0h, nas bordas esquerda/direita) é cortado em vez de riscar
  // o mapa de um lado ao outro.
  const linhas = []
  for (const tracos of Object.values(ceu.LINHAS)) {
    for (const traco of tracos) {
      for (let i = 1; i < traco.length; i += 1) {
        const a = tela(traco[i - 1][0], traco[i - 1][1])
        const b = tela(traco[i][0], traco[i][1])
        if (Math.abs(a.l - b.l) < 90) linhas.push([a.x, a.y, b.x, b.y])
      }
    }
  }

  // Paralelos de 30 em 30° e meridianos de 2 em 2 h, bem apagados.
  const grade = []
  for (const dec of [-60, -30, 0, 30, 60]) {
    const pontos = []
    for (let ra = 0; ra <= 24.001; ra += 0.25) pontos.push(tela(ra === 24 ? 23.999 : ra, dec))
    grade.push(pontos.map((p) => [p.x, p.y]))
  }
  for (let ra = 0; ra < 24; ra += 2) {
    const pontos = []
    for (let dec = -90; dec <= 90; dec += 5) pontos.push(tela(ra === 0 ? 0.0001 : ra, dec))
    grade.push(pontos.map((p) => [p.x, p.y]))
  }

  return {
    largura,
    altura,
    estrelas,
    linhas,
    grade,
    marcadas: marcadas.map((m) => ({ ...m, ...tela(m.ra, m.dec) })),
  }
}
