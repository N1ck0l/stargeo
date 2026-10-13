/**
 * Matemática para a "Mira celeste": onde uma estrela está no céu, agora, a
 * partir de um lugar, e para onde o celular está apontando.
 *
 * Tudo em graus ou radianos de forma explícita, e as convenções seguem a
 * astronomia de posição:
 *  - AR em horas, declinação em graus (J2000);
 *  - altura (`alt`) em graus, medida do horizonte para cima;
 *  - azimute (`az`) em graus, de 0 = norte, 90 = leste, crescendo no sentido
 *    horário — como uma bússola.
 */

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/**
 * Envolve um ângulo em (-180, 180].
 *
 * O `%` do JavaScript devolve o resto com o sinal do dividendo, então a forma
 * ingênua `((d + 180) % 360) - 180` devolve a entrada sem alterar quando ela é
 * negativa — e foi exatamente o que invertia a seta da Mira celeste. Somar um
 * múltiplo de 360 antes do segundo `%` resolve os dois sentidos.
 */
export function wrap180(degrees) {
  let value = (((degrees % 360) + 540) % 360) - 180
  if (value === -180) value = 180
  return value
}

/** Envolve um ângulo em [0, 360). */
export function wrap360(degrees) {
  return ((degrees % 360) + 360) % 360
}

/**
 * Tempo sideral local (em graus), para uma data e longitude.
 *
 * Baseia-se no GMST do_epochs J2000 mais o deslocamento em longitude. É o
 * que converte "posição no céu" em "posição no céu de agora, daqui".
 */
export function localSiderealTime(date, longitudeDeg) {
  // Dia Juliano.
  const jd = date.getTime() / 86400000 + 2440587.5
  const d = jd - 2451545.0
  const t = d / 36525

  const gmst =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000

  return wrap360(gmst + longitudeDeg)
}

/**
 * Converte ascensão reta/declinação em altura e azimute para um observador.
 *
 * @param raHours  ascensão reta, em horas
 * @param decDeg   declinação, em graus
 * @param latDeg   latitude do observador (negativo no hemisfério sul)
 * @param lonDeg   longitude do observador (negativo a oeste de Greenwich)
 * @param date     instante da observação
 * @returns {{altitude: number, azimuth: number}} em graus
 */
export function equatorialToHorizontal(raHours, decDeg, latDeg, lonDeg, date) {
  const lst = localSiderealTime(date, lonDeg)
  // Ângulo horário: quanto a estrela já passou do meridiano. `wrap180` é
  // documentada em graus e `lst` também vem em graus, então o envelope é feito
  // na mesma unidade; só a trigonometria adiante é em radianos.
  const hourAngle = wrap180(lst - raHours * 15) * D2R
  const dec = decDeg * D2R
  const lat = latDeg * D2R

  const sinAlt =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)))

  const azimuth = Math.atan2(
    -Math.cos(dec) * Math.sin(hourAngle),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle),
  )

  return { altitude: altitude * R2D, azimuth: wrap360(azimuth * R2D) }
}

/**
 * Direção para onde o aparelho aponta, a partir dos sensores de orientação.
 *
 * Constrói a rotação Z-X'-Y'' da especificação e aplica ao eixo -Z do
 * aparelho (a câmera traseira). O resultado é a direção da câmera no mundo,
 * com a mesma convenção de altura/azimute usada acima.
 *
 * @param alpha rotação em Z (0 quando o topo do aparelho aponta ao norte)
 * @param beta  rotação em X (0 com o aparelho deitado)
 * @param gamma rotação em Y
 * @returns {{altitude: number, azimuth: number}} em graus
 */
export function devicePointing(alpha, beta, gamma) {
  const a = alpha * D2R
  const b = beta * D2R
  const g = gamma * D2R

  const sa = Math.sin(a)
  const ca = Math.cos(a)
  const sb = Math.sin(b)
  const cb = Math.cos(b)
  const sg = Math.sin(g)
  const cg = Math.cos(g)

  // R · (0, 0, -1), onde R = Rz(α) · Rx(β) · Ry(γ).
  const east = -ca * sg - sa * sb * cg
  const north = -sa * sg + ca * sb * cg
  const up = -cb * cg

  return {
    altitude: Math.asin(Math.max(-1, Math.min(1, up))) * R2D,
    azimuth: wrap360(Math.atan2(east, north) * R2D),
  }
}

/**
 * Onde a estrela está em relação ao que o aparelho está apontando.
 *
 * Devolve quanto falta girar para a esquerda/direita e para cima/baixo, o que
 * é o que a interface desenha na tela.
 */
export function guidance(target, pointing) {
  // Diferença em azimute: negativo = a estrela está à esquerda.
  const bearing = wrap180(target.azimuth - pointing.azimuth)
  const elevation = target.altitude - pointing.altitude
  return { bearing, elevation, aligned: Math.abs(bearing) < 6 && Math.abs(elevation) < 6 }
}

/** Separação angular entre duas direções de horizonte, em graus. */
export function angularDistance(a, b) {
  const alt = a.altitude - b.altitude
  const az = wrap180(a.azimuth - b.azimuth)
  return Math.hypot(alt, az)
}

/**
 * Quando a estrela está visível.
 *
 * Varre as próximas 24 horas em passos curtos e procura as travessias do
 * horizonte. Devolve o que importa na prática: se está visível agora, quando
 * vai nascer e se pôr, e qual é a melhor janela da noite.
 *
 * @param horizon  altura mínima para contar como visível (graus). O padrão,
 *                 0°, ignora a atmosfera; 10° é mais honesto a olho nu.
 */
export function visibility(raHours, decDeg, latDeg, lonDeg, date, horizon = 8) {
  const stepMinutes = 4
  const samples = []
  const start = new Date(date.getTime())

  for (let i = 0; i <= 360; i += 1) {
    const at = new Date(start.getTime() + i * stepMinutes * 60000)
    const pos = equatorialToHorizontal(raHours, decDeg, latDeg, lonDeg, at)
    samples.push({ at, altitude: pos.altitude, azimuth: pos.azimuth })
  }

  const nowAltitude = samples[0].altitude
  const visible = nowAltitude >= horizon

  // Encontra o próximo arco acima do horizonte.
  let arcStart = visible ? 0 : -1
  if (arcStart === -1) {
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].altitude >= horizon) {
        arcStart = i
        break
      }
    }
  }

  if (arcStart === -1) {
    return {
      visible: false,
      nowAltitude,
      risesAt: null,
      setsAt: null,
      maxAltitude: Math.max(...samples.map((s) => s.altitude)),
      bestWindow: null,
    }
  }

  let arcEnd = arcStart
  while (arcEnd + 1 < samples.length && samples[arcEnd + 1].altitude >= horizon) arcEnd += 1

  // Altura máxima dentro do arco.
  let peak = samples[arcStart]
  for (let i = arcStart; i <= arcEnd; i += 1) {
    if (samples[i].altitude > peak.altitude) peak = samples[i]
  }

  // Melhor janela: os momentos mais altos do arco.
  const good = samples.slice(arcStart, arcEnd + 1).filter((s) => s.altitude >= Math.max(15, peak.altitude - 20))
  const bestWindow = good.length
    ? { start: good[0].at, end: good[good.length - 1].at }
    : null

  return {
    visible,
    nowAltitude,
    nowAzimuth: samples[0].azimuth,
    risesAt: samples[arcStart].at,
    setsAt: arcEnd + 1 < samples.length ? samples[arcEnd + 1].at : null,
    peakAltitude: peak.altitude,
    peakAt: peak.at,
    peakAzimuth: peak.azimuth,
    bestWindow,
  }
}

/** "22h15" a partir de um Date, no fuso do aparelho. */
export function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Frase pronta sobre a visibilidade, em português.
 */
export function visibilityMessage(info) {
  if (!info) return ''
  if (info.visible && info.bestWindow) {
    const dentro = info.nowAltitude >= info.peakAltitude - 20
    return dentro
      ? `Está no ponto mais alto agora — altura ${info.nowAltitude.toFixed(0)}°. Saia e olhe para ${cardinal(info.nowAzimuth)}.`
      : `Visível agora, a ${info.nowAltitude.toFixed(0)}° de altura. O melhor é entre ${formatTime(info.bestWindow.start)} e ${formatTime(info.bestWindow.end)}.`
  }
  if (info.visible) {
    return `Visível agora, a ${info.nowAltitude.toFixed(0)}° de altura.`
  }
  if (!info.risesAt) return 'Hoje ela não passa do horizonte.'
  return `Agora ela está abaixo do horizonte. Nasce às ${formatTime(info.risesAt)} e fica mais alta às ${formatTime(info.peakAt)}, a ${info.peakAltitude.toFixed(0)}° — olhe para ${cardinal(info.peakAzimuth)}.`
}

/** Nome da direção mais próxima, em português. */
export function cardinal(azimuth) {
  const names = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste']
  return names[Math.round(wrap360(azimuth) / 45) % 8]
}