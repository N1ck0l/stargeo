/**
 * O céu em volta de uma estrela, projetado num círculo — o mapa da folha do
 * certificado e o mini mapa da escolha da estrela, na loja.
 *
 * Projeção gnomônica (a dos atlas celestes), norte para cima e leste à
 * esquerda: como se vê olhando para o céu. Os dados (Hipparcos, via
 * d3-celestial) estão em `shared/ceu.js`: o céu INTEIRO até magnitude 5 e as
 * linhas das 88 constelações — serve para qualquer uma das ~118 mil estrelas
 * do catálogo, não só para uma lista pré-calculada.
 */
import { ESTRELAS, LINHAS, RAIO_CEU_GRAUS } from '../ceu.js'

const G = Math.PI / 180

/** Distância angular aproximada em graus (para descartar o que está longe). */
function longe(ra, dec, ra0, dec0, limite) {
  const c =
    Math.sin(dec * G) * Math.sin(dec0 * G) + Math.cos(dec * G) * Math.cos(dec0 * G) * Math.cos((ra - ra0) * 15 * G)
  return c < Math.cos(limite * G)
}

/**
 * Estrelas e linhas da constelação já em coordenadas do círculo.
 *
 * @param {{ ra?: number, dec?: number, sigla?: string }} estrela
 *   `sigla` = constelação da estrela ("Sgr"): as linhas dela saem em destaque.
 * @param {{ cx: number, cy: number, r: number }} circulo  na unidade de quem desenha
 * @returns {{ estrelas: Array<{ x: number, y: number, mag: number }>, linhas: Array<number[]>, linhasVizinhas: Array<number[]> }}
 *   segmentos [x1, y1, x2, y2] já cortados na borda do círculo: `linhas` da
 *   constelação da estrela, `linhasVizinhas` das outras que entram no campo.
 */
export function projetarCeu(estrela, { cx, cy, r }) {
  const ra0 = Number(estrela.ra)
  const dec0 = Number(estrela.dec)
  if (!Number.isFinite(ra0) || !Number.isFinite(dec0)) return { estrelas: [], linhas: [], linhasVizinhas: [] }

  const g = G
  const escala = r / Math.tan(RAIO_CEU_GRAUS * g)
  const projetar = (ra, dec) => {
    let dRa = (ra - ra0) * 15
    if (dRa > 180) dRa -= 360
    if (dRa < -180) dRa += 360
    const a = dRa * g
    const d = dec * g
    const d0 = dec0 * g
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a)
    if (cosc <= 0.05) return null
    const xi = (Math.cos(d) * Math.sin(a)) / cosc
    const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / cosc
    return [cx - xi * escala, cy - eta * escala]
  }

  const linhas = []
  const linhasVizinhas = []
  for (const [sigla, tracos] of Object.entries(LINHAS)) {
    const destino = sigla === estrela.sigla ? linhas : linhasVizinhas
    for (const traco of tracos) {
      for (let i = 0; i < traco.length - 1; i += 1) {
        // Segmento com as duas pontas longe do campo nem entra na conta.
        if (longe(...traco[i], ra0, dec0, RAIO_CEU_GRAUS * 1.6) && longe(...traco[i + 1], ra0, dec0, RAIO_CEU_GRAUS * 1.6)) continue
        const a = projetar(...traco[i])
        const b = projetar(...traco[i + 1])
        if (!a || !b) continue
        const seg = recortar(a, b, cx, cy, r)
        if (seg) destino.push([seg[0][0], seg[0][1], seg[1][0], seg[1][1]])
      }
    }
  }

  const estrelas = []
  for (const [ra, dec, mag] of ESTRELAS) {
    if (longe(ra, dec, ra0, dec0, RAIO_CEU_GRAUS * 1.5)) continue
    const p = projetar(ra, dec)
    // A própria estrela é desenhada à parte, com destaque.
    if (!p || (p[0] - cx) ** 2 + (p[1] - cy) ** 2 < (r * 0.01) ** 2) continue
    if ((p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r) estrelas.push({ x: p[0], y: p[1], mag })
  }
  return { estrelas, linhas, linhasVizinhas }
}

/** Raio do ponto de uma estrela, pela magnitude, numa escala `unidade` (1 = mm da folha). */
export function raioDaEstrela(mag, unidade = 1) {
  return Math.min(1.05, Math.max(0.16, 0.95 - mag * 0.16)) * unidade
}

/** Segmento AB recortado ao círculo (centro c, raio r); null se ficar fora. */
function recortar([ax, ay], [bx, by], cx, cy, r) {
  const dx = bx - ax
  const dy = by - ay
  const fx = ax - cx
  const fy = ay - cy
  const A = dx * dx + dy * dy
  const B = 2 * (fx * dx + fy * dy)
  const C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C
  if (A === 0 || disc < 0) return null
  const raiz = Math.sqrt(disc)
  const t1 = Math.max(0, (-B - raiz) / (2 * A))
  const t2 = Math.min(1, (-B + raiz) / (2 * A))
  if (t1 >= t2) return null
  return [
    [ax + dx * t1, ay + dy * t1],
    [ax + dx * t2, ay + dy * t2],
  ]
}
