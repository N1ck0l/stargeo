/**
 * Utilidades astronômicas usadas pelo mapa do céu.
 *
 * Importado pelo site pessoal através do re-export em `src/lib/astro.js`
 * (usado por `SkyMap.jsx`). Vive em `shared/` porque a matemática celeste é a
 * mesma em qualquer fronte — se um dia a loja desenhar o próprio mapa, é
 * deste arquivo que ela lê, e não de uma segunda cópia.
 *
 * A projeção adotada é a **gnomônica** (plano tangente ao centro visível),
 * a mesma usada nos atlas celestes impressos: preserva os ângulos reais entre
 * as estrelas e não distorce a figura do bule de chá de Sagitário.
 *
 * Convenções do canvas (iguais às de um atlas celeste segurado no céu):
 * - norte (declinação crescente) aponta para cima;
 * - leste (ascensão reta crescente) aponta para a ESQUERDA;
 * - ascensão reta em horas, declinação em graus, época J2000.
 */

export const DEG = Math.PI / 180

/** Radianos por hora de ascensão reta (360° ÷ 24h). */
export const RAD_PER_HOUR = 15 * DEG

/** Escala inicial e limites de zoom, em pixels por radiano. */
export const SCALE_DEFAULT = 1150
export const SCALE_MIN = 180
export const SCALE_MAX = 4200

/** Largura angular da figura do bule de chá, em radianos (≈ 20°). */
export const SKY_SPAN = (20 * Math.PI) / 180

/**
 * Escala que faz o bule de chá caber na tela com uma folga.
 *
 * Sem isso, um zoom fixo deixaria a constelação cortada no celular e
 * pequena demais no monitor grande.
 */
export function fitScale(width, height) {
  if (!width || !height) return SCALE_DEFAULT
  return clamp((0.72 * Math.min(width, height)) / SKY_SPAN, SCALE_MIN, SCALE_MAX)
}

/** Completa com zeros à esquerda: `pad(4)` → `'04'`. */
function pad(value) {
  return String(Math.trunc(value)).padStart(2, '0')
}

/**
 * Reduz uma diferença de ascensão reta ao intervalo (-12h, +12h],
 * para que o mapa não “quebre” ao cruzar a linha das 0h.
 */
export function normalizeRaDelta(deltaHours) {
  let value = deltaHours % 24
  if (value > 12) value -= 24
  if (value <= -12) value += 24
  return value
}

/**
 * Reduz uma ascensão reta ABSOLUTA ao intervalo [0h, 24h).
 *
 * Não confunda com `normalizeRaDelta`: aplicar a variante de delta a um valor
 * absoluto jogaria 19,6h para −4,4h, porque ela assume um intervalo centrado
 * em zero.
 */
export function normalizeRa(raHours) {
  return ((raHours % 24) + 24) % 24
}

/**
 * Projeta ascensão reta/declinação para pixels da tela.
 *
 * @returns {{x: number, y: number} | null} `null` quando o ponto está atrás do
 * plano tangente (oculto pela esfera celeste), situação em que a projeção
 * gnomônica simplesmente não existe.
 */
export function project(raHours, decDeg, view, width, height) {
  const dec0 = view.dec * DEG
  const dec = decDeg * DEG
  // Atenção: a diferença de AR chega em HORAS e precisa virar radianos por 15°/h.
  const dRa = normalizeRaDelta(raHours - view.ra) * RAD_PER_HOUR

  const sinDec = Math.sin(dec)
  const cosDec = Math.cos(dec)
  const cosDec0 = Math.cos(dec0)
  const sinDec0 = Math.sin(dec0)
  const cosDra = cosDec * Math.cos(dRa)

  // Componentes no sistema do plano tangente.
  const a = cosDec * Math.sin(dRa)
  const b = cosDec0 * sinDec - sinDec0 * cosDra
  const c = sinDec0 * sinDec + cosDec0 * cosDra

  // Atrás da esfera visível: fora do alcance da projeção. A folga de 0,05
  // (em vez de 0) também protege os pontos quase no limbo, onde a/c explode
  // e a estrela voaria para fora da tela em um único quadro.
  if (c <= 0.05) return null

  return {
    x: width / 2 - (a / c) * view.scale,
    y: height / 2 - (b / c) * view.scale,
  }
}

/**
 * Projeção inversa: devolve (AR, Dec) do ponto do céu que aparece no deslocamento
 * (dx, dy) em pixels a partir do centro do canvas.
 *
 * É o passo que torna `panBy` e `zoomAt` exatos — usar aproximações de primeiro
 * ordem fazia o ponto sob o cursor escapar alguns pixels a cada gesto.
 *
 * A inversão é feita em vetores: parte-se de `p ∝ T + ξ·e₁ + η·e₂`, onde T é o
 * ponto tangente e e₁/e₂ são as direções de leste e norte no seu plano.
 */
export function unproject(dx, dy, view) {
  // Coordenadas padrão (ξ, η) do ponto: o sinal é o oposto do de `project`.
  const xi = -dx / view.scale
  const eta = -dy / view.scale

  const dec0 = view.dec * DEG
  const ra0 = view.ra * RAD_PER_HOUR
  const cosDec0 = Math.cos(dec0)
  const sinDec0 = Math.sin(dec0)
  const cosRa0 = Math.cos(ra0)
  const sinRa0 = Math.sin(ra0)

  const px = cosDec0 * cosRa0 - xi * sinRa0 - eta * sinDec0 * cosRa0
  const py = cosDec0 * sinRa0 + xi * cosRa0 - eta * sinDec0 * sinRa0
  const pz = sinDec0 + eta * cosDec0

  return {
    ra: normalizeRa(Math.atan2(py, px) / RAD_PER_HOUR),
    dec: Math.atan2(pz, Math.hypot(px, py)) / DEG,
  }
}

/** Move o centro da projeção proporcionalmente a um arrasto em pixels. */
export function panBy(view, dx, dy) {
  // Ao arrastar, o céu sob o cursor fica sob o cursor. O novo centro é,
  // portanto, o ponto que antes estava no deslocamento oposto.
  const sky = unproject(-dx, -dy, view)
  return { ...view, ra: sky.ra, dec: clamp(sky.dec, -89, 89) }
}

/**
 * Aplica zoom mantendo fixo o ponto do céu que está sob o cursor
 * (dx, dy são deslocamentos em pixels a partir do centro do canvas).
 *
 * O centro é refinado por algumas iterações de Newton: um único passo
 * linear deixaria o alvo alguns pixels fora do cursor.
 */
export function zoomAt(view, dx, dy, factor) {
  const scale = clamp(view.scale * factor, SCALE_MIN, SCALE_MAX)
  const target = unproject(dx, dy, view)

  let ra = normalizeRa(target.ra + dx / (RAD_PER_HOUR * scale))
  let dec = clamp(target.dec - dy / (DEG * scale), -89, 89)

  // Newton sobre o centro. A taxa de convergência é ~0,07 por iteração, então
  // 32 passos alcançam precisão de máquina — e o custo é irrelevante, já que
  // isto só roda durante um gesto de zoom, não a cada quadro.
  for (let i = 0; i < 32; i += 1) {
    const offset = project(target.ra, target.dec, { ra, dec, scale }, 0, 0)
    ra = normalizeRa(ra + (dx - offset.x) / (RAD_PER_HOUR * scale))
    dec = clamp(dec + (dy - offset.y) / (DEG * scale), -89, 89)
  }

  return { ra, dec, scale }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Formata ascensão reta decimal (horas) como `18h 24m 10.3s`. */
export function formatRa(raHours) {
  const total = ((raHours % 24) + 24) % 24
  const hours = Math.floor(total)
  const minutesExact = (total - hours) * 60
  const minutes = Math.floor(minutesExact)
  const seconds = (minutesExact - minutes) * 60
  // Vírgula decimal, como no certificado e na ficha da estrela.
  return `${pad(hours)}h ${pad(minutes)}m ${seconds.toFixed(1).padStart(4, '0').replace('.', ',')}s`
}

/** Formata declinação decimal (graus) como `−34° 23′ 04.6″`. */
export function formatDec(decDeg) {
  const sign = decDeg < 0 ? '−' : '+'
  const absolute = Math.abs(decDeg)

  const totalMinutes = absolute * 60
  let degrees = Math.floor(totalMinutes / 60)
  let arcmin = Math.floor(totalMinutes % 60)
  // Mantém uma casa decimal: arredondar para inteiro perderia a precisão do catálogo.
  let arcsec = Math.round((totalMinutes * 60 - degrees * 3600 - arcmin * 60) * 10) / 10

  // Carry quando o arredondamento estoura o limite da unidade seguinte.
  if (arcsec >= 60) {
    arcsec = 0
    arcmin += 1
  }
  if (arcmin >= 60) {
    arcmin = 0
    degrees += 1
  }

  return `${sign}${degrees}° ${pad(arcmin)}′ ${arcsec.toFixed(1).padStart(4, '0').replace('.', ',')}″`
}

/**
 * Raio do disco da estrela a partir da magnitude (quanto menor, maior e mais brilhante).
 *
 * Reta linear 6,2 − 1,15×mag, recortada em [1,6 ; 5] px: as mais brilhantes
 * (mag ≤ ~1) todas saturam no teto de 5 px — Sirius não precisa ser um buraco
 * na tela —, e as mais fracas batem no piso de 1,6 px para continuarem
 * visíveis sem virarem ruído.
 */
export function magnitudeRadius(mag) {
  return clamp(6.2 - 1.15 * mag, 1.6, 5)
}

/** Converte um ponto do céu para coordenadas locais do canvas (para cliques). */
export function toCanvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}