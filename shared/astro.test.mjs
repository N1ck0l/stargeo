/**
 * Verificação numérica de src/lib/astro.js.
 *
 * O foco é a projeção gnomônica: ela precisa devolver as coordenadas
 * padrão corretas, mandar grandes circunferências para retas e preservar
 * ângulos. Depois disso, pan/zoom precisam manter o ponto sob o cursor.
 *
 * Rode com `npm test`. Não precisa de framework — só sai com código 0 ou 1.
 */
import {
  project,
  unproject,
  panBy,
  zoomAt,
  formatRa,
  formatDec,
  magnitudeRadius,
  SCALE_DEFAULT,
} from './astro.js'

// Contador de falhas em vez de exceção: o relatório completo interessa mais
// do que parar no primeiro erro. O código de saída (0/1) é o que o CI lê.
const D = Math.PI / 180
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) {
    failures += 1
    console.log(`FALHOU  ${label} ${detail}`)
  } else {
    console.log(`ok      ${label}${detail ? `  (${detail})` : ''}`)
  }
}

const view = { ra: 18.6, dec: -29.8, scale: SCALE_DEFAULT }
const W = 800
const H = 600

console.log('=== 1. projeto bate com a fórmula gnomônica independente ===')
/**
 * Reimplementação independente da projeção gnomônica, escrita direto da
 * fórmula (ξ = A/C, η = B/C) sem reaproveitar nada de `shared/astro.js`.
 * Comparar as duas é o que garante que uma regressão não passe despercebida.
 */
function reference(raHours, decDeg, v) {
  const ra = raHours * 15 * D
  const dec = decDeg * D
  const ra0 = v.ra * 15 * D
  const dec0 = v.dec * D
  let dra = ra - ra0
  while (dra > Math.PI) dra -= 2 * Math.PI
  while (dra <= -Math.PI) dra += 2 * Math.PI
  const A = Math.cos(dec) * Math.sin(dra)
  const B = Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(dra)
  const C = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(dra)
  return { x: (A / C) * v.scale, y: (B / C) * v.scale }
}
let worst = 0
for (const [ra, dec] of [
  [18.402866, -34.384616],
  [18.9211, -26.2967],
  [19.0435, -29.8801],
  [17.2, -40.5],
  [20.8, -21.3],
]) {
  const mine = project(ra, dec, view, W, H)
  const ref = reference(ra, dec, view)
  worst = Math.max(
    worst,
    Math.abs(mine.x - (W / 2 - ref.x)),
    Math.abs(mine.y - (H / 2 - ref.y)),
  )
}
check('coordenadas padrão corretas', worst < 1e-9, `erro máx ${worst.toExponential(2)} px`)

console.log('\n=== 2. grandes circunferências viram retas ===')
function greatCircle(ra1, dec1, ra2, dec2, n) {
  const a1 = ra1 * 15 * D
  const d1 = dec1 * D
  const a2 = ra2 * 15 * D
  const d2 = dec2 * D
  const delta = Math.acos(
    Math.min(1, Math.max(-1, Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2))),
  )
  const out = []
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * delta) / Math.sin(delta)
    const B = Math.sin(f * delta) / Math.sin(delta)
    const x = A * Math.cos(d1) * Math.cos(a1) + B * Math.cos(d2) * Math.cos(a2)
    const y = A * Math.cos(d1) * Math.sin(a1) + B * Math.cos(d2) * Math.sin(a2)
    const z = A * Math.sin(d1) + B * Math.sin(d2)
    out.push([Math.atan2(y, x) / D / 15, Math.atan2(z, Math.hypot(x, y)) / D])
  }
  return out
}
for (const seg of [
  [18.402866, -34.384616, 18.9211, -26.2967],
  [18.3492, -29.8281, 19.1627, -21.0236],
]) {
  const pts = greatCircle(...seg, 40).map(([ra, dec]) => project(ra, dec, view, W, H)).filter(Boolean)
  const p0 = pts[0]
  const pN = pts[pts.length - 1]
  const lineLen = Math.hypot(pN.x - p0.x, pN.y - p0.y)
  let dev = 0
  for (const p of pts) {
    dev = Math.max(
      dev,
      Math.abs((pN.y - p0.y) * p.x - (pN.x - p0.x) * p.y + pN.x * p0.y - pN.y * p0.x) / lineLen,
    )
  }
  check('grande circunferência → reta', dev < 1e-9, `desvio ${dev.toExponential(2)} px`)
}

console.log('\n=== 3. conformidade: ângulo no centro é preservado ===')
function tangentAngle(raA, decA, raB, decB, raV, decV) {
  const v = (ra, dec) => [
    Math.cos(dec * D) * Math.cos(ra * 15 * D),
    Math.cos(dec * D) * Math.sin(ra * 15 * D),
    Math.sin(dec * D),
  ]
  const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2]
  const [a, b, c] = [v(raA, decA), v(raB, decB), v(raV, decV)]
  // Componente tangencial de cada direção no plano do vértice.
  const tangent = (u) => {
    const k = dot(u, c)
    return [u[0] - k * c[0], u[1] - k * c[1], u[2] - k * c[2]]
  }
  const ta = tangent(a)
  const tb = tangent(b)
  const cos = dot(ta, tb) / (Math.hypot(...ta) * Math.hypot(...tb))
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}
const p1 = project(19.1, -31.0, view, W, H)
const p2 = project(17.9, -25.0, view, W, H)
const cxp = W / 2
const cyp = H / 2
const planar = (() => {
  const v1 = [p1.x - cxp, p1.y - cyp]
  const v2 = [p2.x - cxp, p2.y - cyp]
  const d = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))
  return (Math.acos(Math.min(1, Math.max(-1, d))) * 180) / Math.PI
})()
const real = tangentAngle(19.1, -31.0, 17.9, -25.0, view.ra, view.dec)
check('ângulo no centro', Math.abs(planar - real) < 1e-9, `${planar.toFixed(6)}° vs ${real.toFixed(6)}°`)

console.log('\n=== 4. projeto/desprojeto fazem ida e volta ===')
let worstRt = 0
for (const [ra, dec] of [
  [18.402866, -34.384616],
  [17.2, -40.5],
  [20.8, -21.3],
]) {
  const back = unproject(...Object.values(offOf(ra, dec, view)), view)
  worstRt = Math.max(worstRt, Math.abs(back.ra - ra), Math.abs(back.dec - dec))
}
function offOf(ra, dec, v) {
  const p = project(ra, dec, v, 0, 0)
  return [p.x, p.y]
}
check('ida e volta preserva AR/Dec', worstRt < 1e-9, `erro ${worstRt.toExponential(2)}`)

console.log('\n=== 5. arrasto move o céu junto com o cursor ===')
// Arrastar por (dx, dy) tira tudo do lugar: o ponto que estava em (-dx,-dy)
// passa a ocupar o centro. É o mesmo "agarrar o céu" de um mapa deslizante.
for (const [dx, dy] of [[120, -80], [-260, 45], [0, 0], [95, 210]]) {
  const sky = unproject(-dx, -dy, view)
  const after = panBy(view, dx, dy)
  const now = project(sky.ra, sky.dec, after, W, H)
  const err = Math.hypot(now.x - cxp, now.y - cyp)
  check(`arrasto (${dx}, ${dy})`, err < 1e-6, `erro ${err.toExponential(2)} px`)
}

console.log('\n=== 6. zoom ancorado no cursor ===')
for (const factor of [0.5, 0.8, 1.25, 2]) {
  for (const [dx, dy] of [[180, -90], [-140, 60], [0, 0], [40, 300]]) {
    const sky = unproject(dx, dy, view)
    const after = zoomAt(view, dx, dy, factor)
    const now = project(sky.ra, sky.dec, after, W, H)
    const err = Math.hypot(now.x - (cxp + dx), now.y - (cyp + dy))
    check(
      `zoom ${factor} em (${dx}, ${dy})`,
      err < 1e-6,
      `erro ${err.toExponential(2)} px`,
    )
  }
}

console.log('\n=== 7.direção do arrasto (convenção de atlas) ===')
check('arrastar +x move para leste', panBy(view, 200, 0).ra > view.ra)
check('arrastar -y move para sul', panBy(view, 0, -100).dec < view.dec)
check('arrastar +y move para norte', panBy(view, 0, 100).dec > view.dec)
const east = project(view.ra + 1, view.dec, view, W, H)
const north = project(view.ra, view.dec + 1, view, W, H)
check('AR crescente aponta para a esquerda', east.x < cxp)
check('norte aponta para cima', north.y < cyp)

console.log('\n=== 8.AR absoluta não é normalizada como delta ===')
const wrapped = panBy({ ra: 19.5, dec: -30, scale: SCALE_DEFAULT }, 300, 0)
check('não “quebra” ao passar de 19h para 20h', wrapped.ra > 19.5 && wrapped.ra < 24, `ra=${wrapped.ra.toFixed(4)}`)

console.log('\n=== 9. formatação ===')
check('AR', formatRa(18.40286622) === '18h 24m 10.3s', formatRa(18.40286622))
check('Dec mantém a casa decimal', formatDec(-34.38461647) === '−34° 23′ 04.6″', formatDec(-34.38461647))
check('Dec positiva', formatDec(12.5) === '+12° 30′ 00.0″', formatDec(12.5))
check('carry de segundos', !formatDec(-34.9999999).includes('60'), formatDec(-34.9999999))
check('carry de minutos', !formatDec(-35.99999999).includes('60'), formatDec(-35.99999999))

console.log('\n=== 10. tamanho por magnitude ===')
check('mais brilhante = maior', magnitudeRadius(1.85) > magnitudeRadius(3.32),
  `${magnitudeRadius(1.85).toFixed(2)} > ${magnitudeRadius(3.32).toFixed(2)}`)

console.log('\n=== 11. limites do campo visível ===')
check('atrás da esfera devolve null', project(view.ra + 12, view.dec + 15, view, W, H) === null)
check('centro devolve null fora de escala', Number.isFinite(project(view.ra, view.dec, view, W, H).x))

console.log(failures === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : `\n❌ ${failures} FALHA(S)`)
process.exit(failures === 0 ? 0 : 1)