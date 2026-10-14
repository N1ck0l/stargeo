/**
 * Verificação da matemática da Mira celeste (src/lib/sky.js).
 *
 * O teste decisivo é a Estrela Polar: de qualquer lugar do hemisfério norte
 * ela aponta para o polo norte celeste, então o azimute dela tem de ser ~0° e
 * a altura tem de ser igual à latitude do observador. Se a fórmula estiver
 * errada, isso falha de forma óbvia e independente de qualquer fonte externa.
 */
import {
  localSiderealTime,
  equatorialToHorizontal,
  devicePointing,
  guidance,
  visibility,
  visibilityMessage,
  cardinal,
  formatTime,
  wrap180,
  wrap360,
} from './sky.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) {
    failures += 1
    console.log(`FALHOU  ${label} ${detail}`)
  } else {
    console.log(`ok      ${label}${detail ? `  (${detail})` : ''}`)
  }
}

// Polaris: AR 2h31m49s, Dec +89°15'51" (quase o polo norte celeste).
const POLARIS = { ra: (2 + 31 / 60 + 49 / 3600) / 1, dec: 89 + 15 / 60 + 51 / 3600 }
POLARIS.ra = 2 + 31 / 60 + 49 / 3600

// Kaus Australis (ε Sgr).
const KAUS = { ra: 18 + 24 / 60 + 10.3184 / 3600, dec: -(34 + 23 / 60 + 4.6193 / 3600) }

console.log('=== 1. tempo sideral local ===')
// J2000.0 é 2000-01-01 12:00 TT = JD 2451545.0, e o GMST nesse instante vale
// 280,460618° por definição.
const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0))
const gmst = localSiderealTime(j2000, 0)
check('GMST em J2000.0 = 280,4606°', Math.abs(gmst - 280.46061837) < 1e-6, `${gmst.toFixed(6)}° = ${(gmst / 15).toFixed(4)}h`)

// Doze horas antes, o tempo sideral é meio turno a menos.
const meiaNoite = new Date(Date.UTC(2000, 0, 1, 0, 0, 0))
const gmstMeia = localSiderealTime(meiaNoite, 0)
check('12h antes recua ~180,49°', Math.abs(gmstMeia - (gmst - 180.4928)) < 0.001, `${gmstMeia.toFixed(4)}°`)

const lstSP = localSiderealTime(j2000, -46.6333)
check('a longitude oeste subtrai', Math.abs(lstSP - (gmst - 46.6333)) < 1e-6, `${lstSP.toFixed(4)}°`)

console.log('\n=== 2. Estrela Polar: o teste decisivo ===')
// Polaris fica a 0,74° do polo celeste. Por isso ela NUNCA se afasta mais que
// isso da latitude do observador — em qualquer horário, para cima ou para baixo.
const desvioPolo = 90 - POLARIS.dec
for (const [name, lat, lon] of [
  ['São Paulo', -23.5505, -46.6333],
  ['Rio de Janeiro', -22.9068, -43.1729],
  ['Belo Horizonte', -19.9167, -43.9345],
  ['Manaus', -3.119, -60.0217],
  ['Florianópolis', -27.5954, -48.548],
]) {
  for (const quando of [j2000, new Date(Date.UTC(2026, 7, 21, 6, 0, 0)), new Date(Date.UTC(2026, 2, 14, 18, 0, 0))]) {
    const p = equatorialToHorizontal(POLARIS.ra, POLARIS.dec, lat, lon, quando)
    check(
      `${name}: Polaris ~ ao norte`,
      p.azimuth < 0.5 || p.azimuth > 359.5,
      `az=${p.azimuth.toFixed(3)}°`,
    )
    check(
      `${name}: altura dentro do desvio do polo`,
      Math.abs(p.altitude - lat) <= desvioPolo + 1e-6,
      `alt−lat=${(p.altitude - lat).toFixed(3)}° (limite ±${desvioPolo.toFixed(3)}°)`,
    )
  }
}

console.log('\n=== 3. culminação de Kaus Australis ===')
// Achamos a hora em que Kaus passa pelo meridiano e conferimos a altura máxima.
// Teoria: alt_max = 90 − |lat − dec|.
for (const [name, lat, lon] of [
  ['São Paulo', -23.5505, -46.6333],
  ['Recife', -8.0476, -34.877],
  ['Porto Alegre', -30.0346, -51.2177],
]) {
  // Varre um dia inteiro em passos de 1 minuto.
  let best = -Infinity
  for (let m = 0; m < 1440; m += 1) {
    const t = new Date(Date.UTC(2026, 7, 21, 0, 0, 0) + m * 60000)
    const p = equatorialToHorizontal(KAUS.ra, KAUS.dec, lat, lon, t)
    if (p.altitude > best) best = p.altitude
  }
  const expected = 90 - Math.abs(lat - KAUS.dec)
  check(
    `${name}: altura na culminação`,
    Math.abs(best - expected) < 0.15,
    `medido ${best.toFixed(2)}° · teórico ${expected.toFixed(2)}°`,
  )
}

console.log('\n=== 4. Kaus Australis no fim de tarde do inverno austral ===')
// 21 de agosto, 22h em São Paulo (horário local ≈ UTC−3).
const spAug = new Date(Date.UTC(2026, 7, 22, 1, 0, 0)) // 22h BRT ≈ 01h UTC do dia 22
const kausAug = equatorialToHorizontal(KAUS.ra, KAUS.dec, -23.5505, -46.6333, spAug)
check('altura alta no inverno', kausAug.altitude > 50, `alt=${kausAug.altitude.toFixed(1)}°`)
// Passou do meridiano (que fica ao sul) e já está a caminho do oeste.
check('azimute entre sul e oeste', kausAug.azimuth > 170 && kausAug.azimuth < 290, `az=${kausAug.azimuth.toFixed(1)}°`)

// Três horas depois tem de estar mais a oeste e mais baixo.
const depois = equatorialToHorizontal(KAUS.ra, KAUS.dec, -23.5505, -46.6333, new Date(spAug.getTime() + 3 * 3600e3))
check('3h depois: mais oeste', depois.azimuth > kausAug.azimuth, `${kausAug.azimuth.toFixed(1)}° → ${depois.azimuth.toFixed(1)}°`)
check('3h depois: mais baixo', depois.altitude < kausAug.altitude, `${kausAug.altitude.toFixed(1)}° → ${depois.altitude.toFixed(1)}°`)

console.log('\n=== 5. sentido dos sensores ===')
// Celular em pé, virado para o norte: α=0, β=90°, γ=0.
const north = devicePointing(0, 90, 0)
check('aparelho para o norte → az≈0', Math.abs(north.azimuth) < 0.01, `az=${north.azimuth.toFixed(3)}°`)
check('aparelho na vertical → alt≈0', Math.abs(north.altitude) < 0.01, `alt=${north.altitude.toFixed(3)}°`)

// Virado 90° para leste.
const east = devicePointing(-90, 90, 0)
check('girado 90° → leste', Math.abs(east.azimuth - 90) < 0.01, `az=${east.azimuth.toFixed(3)}°`)

// A câmera fica virada para BAIXO quando o aparelho é deitado (β=0): ela
// aponta para a mesa, não para o zênite.
const flat = devicePointing(0, 0, 0)
check('deitado → câmera olha para baixo', Math.abs(flat.altitude + 90) < 0.01, `alt=${flat.altitude.toFixed(3)}°`)

// Girar o aparelho no eixo vertical (α) muda o azimute, mas a câmera continua
// apontando para baixo: é β = 180° que vira a câmera para cima.
const flatRotated = devicePointing(180, 0, 0)
check('deitado e girado continua olhando para baixo', Math.abs(flatRotated.altitude + 90) < 0.01, `alt=${flatRotated.altitude.toFixed(3)}°`)

const virado = devicePointing(0, 180, 0)
check('com β=180 a câmera olha para cima', Math.abs(virado.altitude - 90) < 0.01, `alt=${virado.altitude.toFixed(3)}°`)

// β=135° é o aparelho inclinado a 45° olhando para cima.
const tiltedUp = devicePointing(0, 135, 0)
check('inclinado 45° para cima', Math.abs(tiltedUp.altitude - 45) < 0.01, `alt=${tiltedUp.altitude.toFixed(3)}°`)

console.log('\n=== 6. guia de direção ===')
const target = { altitude: 40, azimuth: 30 }
const facing = { altitude: 40, azimuth: 0 }
const g = guidance(target, facing)
check('estrela à direita quando azimute é maior', g.bearing > 0, `bearing=${g.bearing.toFixed(1)}°`)

const g2 = guidance(target, { altitude: 20, azimuth: 30 })
check('pede levantar o aparelho', g2.elevation > 0, `elevation=${g2.elevation.toFixed(1)}°`)

const g3 = guidance(target, { altitude: 40, azimuth: 30 })
check('alinha quando já está apontando', g3.aligned, `bearing=${g3.bearing.toFixed(2)}°`)

// Sem o WRAP quebrando: estrela a 350° e aparelho a 10° → 20° à esquerda.
const g4 = guidance({ altitude: 0, azimuth: 350 }, { altitude: 0, azimuth: 10 })
check('atravessa o norte sem errar', Math.abs(g4.bearing + 20) < 0.01, `bearing=${g4.bearing.toFixed(2)}°`)

// O mesmo caso pelo outro lado do norte: a diferença bruta é -340°, e é
// exatamente aí que um `%` com sinal erraria a direção da seta.
const g5 = guidance({ altitude: 0, azimuth: 10 }, { altitude: 0, azimuth: 350 })
check('atravessa o norte no sentido inverso', Math.abs(g5.bearing - 20) < 0.01, `bearing=${g5.bearing.toFixed(2)}°`)

// Diferença bruta grande e negativa é o caso real: Kaus Australis nascendo a
// leste-sudeste (azimute ~120°) e o aparelho olhando para ~320°.
const g6 = guidance({ altitude: 10, azimuth: 120 }, { altitude: 10, azimuth: 320 })
check('diferença bruta negativa vira ângulo curto', Math.abs(g6.bearing - 160) < 0.01, `bearing=${g6.bearing.toFixed(2)}°`)
check('aponta sempre no intervalo (-180, 180]', g6.bearing > -180 && g6.bearing <= 180, `${g6.bearing.toFixed(2)}°`)

// Alinhamento precisa continuar alcançável quando a diferença cruza o norte.
// Aqui a diferença bruta é -356°, e o wrap correto devolve 4°.
const g7 = guidance({ altitude: 30, azimuth: 2 }, { altitude: 30, azimuth: 358 })
check('alinha atravessando o norte', g7.aligned, `bearing=${g7.bearing.toFixed(2)}°`)

// E a orientação tem de ser coerente nos dois sentidos: se pedir a direita
// num par, o par invertido tem de pedir a esquerda pelo mesmo ângulo.
const par = [{ altitude: 25, azimuth: 75 }, { altitude: 25, azimuth: 20 }]
check('sentidos opostos são simétricos', Math.abs(guidance(...par).bearing + guidance(par[1], par[0]).bearing) < 1e-9,
  `${guidance(...par).bearing.toFixed(2)}° / ${guidance(par[1], par[0]).bearing.toFixed(2)}°`)

console.log('\n=== 7. visibilidade ===')
const SAO_PAULO = { lat: -23.5505, lon: -46.6333 }
// Fim de tarde de inverno austral: Kaus Australis está alto.
const invernoSP = new Date(Date.UTC(2026, 7, 21, 23, 0, 0)) // 20h BRT
const visInverno = visibility(KAUS.ra, KAUS.dec, SAO_PAULO.lat, SAO_PAULO.lon, invernoSP)
check('inverno: visível', visInverno.visible, `alt=${visInverno.nowAltitude.toFixed(1)}°`)
check('inverno: passa alto', visInverno.peakAltitude > 45, `pico=${visInverno.peakAltitude.toFixed(1)}°`)
check('inverno: tem janela de observação', Boolean(visInverno.bestWindow), visInverno.bestWindow ? `${formatTime(visInverno.bestWindow.start)}–${formatTime(visInverno.bestWindow.end)}` : '')
check('inverno: fica mais que 2h no alto', visInverno.bestWindow && (visInverno.bestWindow.end - visInverno.bestWindow.start) / 3.6e6 > 2, visInverno.bestWindow ? `${((visInverno.bestWindow.end - visInverno.bestWindow.start) / 3.6e6).toFixed(1)}h` : '')
console.log(`  → ${visibilityMessage(visInverno)}`)

// Meio-dia de inverno: a estrela já passou, abaixo do horizonte de novo.
const visMeioDia = visibility(KAUS.ra, KAUS.dec, SAO_PAULO.lat, SAO_PAULO.lon, new Date(Date.UTC(2026, 7, 21, 15, 0, 0)))
check('meio-dia de inverno: não está no céu', !visMeioDia.visible, `alt=${visMeioDia.nowAltitude.toFixed(1)}°`)
check('meio-dia: ainda informa quando nasce', Boolean(visMeioDia.risesAt), visMeioDia.risesAt ? formatTime(visMeioDia.risesAt) : 'sem hora')
console.log(`  → ${visibilityMessage(visMeioDia)}`)

// Verão austral: o arqueiro está de dia. A altura de culminação é a mesma o
// ano inteiro — o que muda é a HORA: em agosto ao anoitecer, em dezembro ao
// meio-dia. Então a estrela está ausente do céu noturno de dezembro.
const veraoSP = new Date(Date.UTC(2025, 11, 15, 23, 0, 0)) // 20h BRT de dezembro
const visVerao = visibility(KAUS.ra, KAUS.dec, SAO_PAULO.lat, SAO_PAULO.lon, veraoSP)
const picoUtc = (d) => d.getUTCHours() + d.getUTCMinutes() / 60
// Meio-dia solar em UTC: 12h corrigido pela longitude (a oeste, mais tarde).
const solarNoonUtc = 12 - SAO_PAULO.lon / 15
check(
  'verão: culumina de dia, perto do meio-dia solar',
  Math.abs(picoUtc(visVerao.peakAt) - solarNoonUtc) < 2,
  `${picoUtc(visVerao.peakAt).toFixed(1)}h UTC · meio-dia solar ${solarNoonUtc.toFixed(1)}h UTC`,
)
// No inverno a mesma estrela culmina ~8h depois — já de noite. A diferença
// vem da AR do Sol: em agosto vale ~9,7h contra 18,4h da estrela.
check(
  'inverno: culmina ~8h depois do meio-dia solar',
  Math.abs(picoUtc(visInverno.peakAt) - (solarNoonUtc + 8)) < 1,
  `${picoUtc(visInverno.peakAt).toFixed(1)}h UTC`,
)
check(
  'verão: ausente do céu à noite',
  !visVerao.visible,
  `alt=${visVerao.nowAltitude.toFixed(1)}°`,
)
check(
  'verão: ausente do céu à noite',
  !visVerao.visible,
  `alt=${visVerao.nowAltitude.toFixed(1)}°`,
)
console.log(`  verão  → ${visibilityMessage(visVerao)}`)
console.log(`  inverno→ ${visibilityMessage(visInverno)}`)

// Porto Alegre, mais ao sul: no inverno ela passa quase a pino.
const visPOA = visibility(KAUS.ra, KAUS.dec, -30.0346, -51.2177, invernoSP)
check('Porto Alegre: pico mais alto que em SP', visPOA.peakAltitude > visInverno.peakAltitude, `${visPOA.peakAltitude.toFixed(1)}° vs ${visInverno.peakAltitude.toFixed(1)}°`)

// Coerência interna: se está visível, a altura tem de bater com a posição.
const direta = equatorialToHorizontal(KAUS.ra, KAUS.dec, SAO_PAULO.lat, SAO_PAULO.lon, invernoSP)
check('altura da visibilidade = altura direta', Math.abs(visInverno.nowAltitude - direta.altitude) < 1e-9, `${visInverno.nowAltitude.toFixed(4)} vs ${direta.altitude.toFixed(4)}`)

console.log('\n=== 8. direções cardeais ===')
check('0 = norte', cardinal(0) === 'norte' && cardinal(359) === 'norte')
check('90 = leste', cardinal(90) === 'leste')
check('244 = sudoeste', cardinal(244) === 'sudoeste', cardinal(244))
check('180 = sul', cardinal(180) === 'sul')

console.log('\n=== 9. utilidades ===')
check('wrap180(190) = -170', Math.abs(wrap180(190) - -170) < 1e-9, String(wrap180(190)))
check('wrap180(-350) = 10', Math.abs(wrap180(-350) - 10) < 1e-9, String(wrap180(-350)))
check('wrap180(-200) = 160', Math.abs(wrap180(-200) - 160) < 1e-9, String(wrap180(-200)))
check('wrap180(-180) = 180', wrap180(-180) === 180, String(wrap180(-180)))
check('wrap180(180) = 180', wrap180(180) === 180, String(wrap180(180)))
check('wrap180(0) = 0', wrap180(0) === 0, String(wrap180(0)))
check('wrap180(720) = 0', wrap180(720) === 0, String(wrap180(720)))
check('wrap180(-720) = 0', wrap180(-720) === 0, String(wrap180(-720)))
check('wrap180 sempre em (-180, 180]', [-540, -359.85, -181, 181, 359.85, 540].every((d) => {
  const w = wrap180(d)
  return w > -180 && w <= 180
}), 'ok')
check('wrap360(-10) = 350', Math.abs(wrap360(-10) - 350) < 1e-9, String(wrap360(-10)))

console.log(failures === 0 ? '\n✅ TODOS OS TESTES PASSARAM' : `\n❌ ${failures} FALHA(S)`)
process.exit(failures === 0 ? 0 : 1)