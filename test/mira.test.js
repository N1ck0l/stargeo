/**
 * Mira celeste (`shared/mira.js`): o Sol e o céu claro, os estados de
 * observação, e a projeção da direção da estrela na tela com a orientação
 * completa do aparelho (inclinado de lado, tela em paisagem).
 */
import { describe, expect, it } from 'vitest'
import {
  alturaDoSol,
  emPunhos,
  faseDoCeu,
  mensagemDeObservacao,
  observacao,
  posicaoDoSol,
  projetarNaTela,
  separacao,
  suavizador,
} from '../shared/mira.js'
import { devicePointing } from '../shared/sky.js'

const SP = { lat: -23.5505, lon: -46.6333 }
const SIRIUS = { ra: 6.7525, dec: -16.716, mag: -1.46 }
const TELA = { largura: 390, altura: 844, fov: 68 }

describe('o Sol', () => {
  it('declinação nos solstícios e equinócio', () => {
    expect(posicaoDoSol(new Date(Date.UTC(2026, 5, 21, 12))).dec).toBeCloseTo(23.44, 0)
    expect(posicaoDoSol(new Date(Date.UTC(2026, 11, 21, 12))).dec).toBeCloseTo(-23.44, 0)
    expect(Math.abs(posicaoDoSol(new Date(Date.UTC(2026, 2, 20, 15))).dec)).toBeLessThan(0.5)
  })

  it('meio-dia alto e meia-noite abaixo, em São Paulo', () => {
    expect(alturaDoSol(SP.lat, SP.lon, new Date(Date.UTC(2026, 9, 16, 15)))).toBeGreaterThan(60) // 12h BRT
    expect(alturaDoSol(SP.lat, SP.lon, new Date(Date.UTC(2026, 9, 17, 3)))).toBeLessThan(-30) // 0h BRT
  })

  it('fases do céu pela altura do Sol', () => {
    expect([10, -3, -9, -15, -25].map(faseDoCeu)).toEqual(['dia', 'civil', 'nautico', 'astronomico', 'noite'])
  })
})

describe('estados de observação', () => {
  it('de dia, acima do horizonte, é "céu claro" — nunca "visível agora"', () => {
    // 16/out, 10h15 em SP: Shaula (Escorpião) está a ~18°, como na captura do usuário.
    const shaula = { ra: 17.5601, dec: -37.1038, mag: 1.62 }
    const info = observacao(shaula, SP.lat, SP.lon, new Date(Date.UTC(2026, 9, 16, 13, 15)))
    expect(info.estado).toBe('ceu-claro')
    expect(info.fase).toBe('dia')
    const m = mensagemDeObservacao(info)
    expect(m.titulo).toBe('Acima do horizonte, mas é dia')
    expect(`${m.titulo} ${m.detalhe}`).not.toMatch(/vis[íi]vel agora/i)
    // E a próxima boa janela é de noite (Sol abaixo de −6° para uma estrela brilhante).
    expect(info.janela).toBeTruthy()
    expect(alturaDoSol(SP.lat, SP.lon, info.janela.inicio)).toBeLessThanOrEqual(-6)
  })

  it('à noite, alta e brilhante: "Boa hora para procurar" (sem prometer)', () => {
    // Sirius no verão, 23h BRT de janeiro: alta no céu.
    const info = observacao(SIRIUS, SP.lat, SP.lon, new Date(Date.UTC(2026, 0, 16, 2)))
    expect(info.estado).toBe('boa')
    const m = mensagemDeObservacao(info)
    expect(m.titulo).toBe('Boa hora para procurar')
    expect(m.detalhe).toMatch(/dá para tentar/)
  })

  it('abaixo do horizonte: diz quando nasce', () => {
    // Sirius em julho às 23h BRT: abaixo do horizonte.
    const info = observacao(SIRIUS, SP.lat, SP.lon, new Date(Date.UTC(2026, 6, 16, 2)))
    expect(info.estado).toBe('abaixo')
    expect(info.nasce).toBeTruthy()
    expect(mensagemDeObservacao(info).titulo).toBe('Abaixo do horizonte agora')
  })

  it('estrela fraca demais para o olho nu, mesmo à noite', () => {
    const fraca = { ...SIRIUS, mag: 8.2 }
    const info = observacao(fraca, SP.lat, SP.lon, new Date(Date.UTC(2026, 0, 16, 2)))
    expect(info.estado).toBe('fraca')
    expect(info.janela).toBeNull()
    expect(mensagemDeObservacao(info).detalhe).toMatch(/binóculo/)
  })

  it('baixa no horizonte é dita como tal', () => {
    // Sirius nascendo: procura um instante logo depois de nascer.
    let quando = new Date(Date.UTC(2026, 9, 16, 3))
    let info = observacao(SIRIUS, SP.lat, SP.lon, quando)
    for (let i = 0; i < 200 && info.estado !== 'baixa'; i += 1) {
      quando = new Date(quando.getTime() + 600000)
      info = observacao(SIRIUS, SP.lat, SP.lon, quando)
    }
    expect(info.estado).toBe('baixa')
    expect(mensagemDeObservacao(info).titulo).toMatch(/muito baixa/)
  })

  it('sem localização: pede a localização', () => {
    expect(mensagemDeObservacao(null).titulo).toMatch(/onde você está/)
  })

  it('altura em punhos', () => {
    expect(emPunhos(31)).toMatch(/3 punhos/)
    expect(emPunhos(3)).toBe('rente ao horizonte')
  })
})

describe('direção na tela', () => {
  // Celular em pé virado para o norte: α=0, β=90, γ=0.
  const emPe = { alpha: 0, beta: 90, gamma: 0 }

  it('apontando para a estrela, ela cai no centro', () => {
    const p = projetarNaTela({ altitude: 0, azimuth: 0 }, emPe, 0, TELA)
    expect(p.naFrente).toBe(true)
    expect(p.x).toBeCloseTo(195, 5)
    expect(p.y).toBeCloseTo(422, 5)
  })

  it('mais alta → acima do centro; mais a leste → à direita', () => {
    expect(projetarNaTela({ altitude: 10, azimuth: 0 }, emPe, 0, TELA).y).toBeLessThan(422)
    expect(projetarNaTela({ altitude: 0, azimuth: 10 }, emPe, 0, TELA).x).toBeGreaterThan(195)
  })

  it('o centro é o que `devicePointing` diz, em qualquer orientação', () => {
    for (const o of [{ alpha: 40, beta: 110, gamma: 15 }, { alpha: 200, beta: 75, gamma: -30 }, { alpha: 310, beta: 130, gamma: 5 }]) {
      const camera = devicePointing(o.alpha, o.beta, o.gamma)
      const p = projetarNaTela(camera, o, 0, TELA)
      expect(p.naFrente).toBe(true)
      expect(p.x).toBeCloseTo(195, 3)
      expect(p.y).toBeCloseTo(422, 3)
    }
  })

  it('celular inclinado de lado: o horizonte inclina junto (a estrela não fica "reta" na tela)', () => {
    // Inclinado de lado de verdade (com β = 90° exato, γ gira o rumo em vez de inclinar).
    const inclinado = { alpha: 0, beta: 60, gamma: 30 }
    const camera = devicePointing(inclinado.alpha, inclinado.beta, inclinado.gamma)
    const a = projetarNaTela({ altitude: 0, azimuth: camera.azimuth - 10 }, inclinado, 0, TELA)
    const b = projetarNaTela({ altitude: 0, azimuth: camera.azimuth + 10 }, inclinado, 0, TELA)
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(5)
  })

  it('tela em paisagem: "mais alta" continua sendo para cima na tela', () => {
    // Celular deitado de lado (topo para a esquerda: α, β=0, γ=−90 → câmera no horizonte), tela girada 90°.
    const deitado = { alpha: 0, beta: 0, gamma: -90 }
    const camera = devicePointing(deitado.alpha, deitado.beta, deitado.gamma)
    expect(Math.abs(camera.altitude)).toBeLessThan(1)
    const paisagem = { largura: 844, altura: 390, fov: 68 }
    const centro = projetarNaTela(camera, deitado, 90, paisagem)
    const acima = projetarNaTela({ altitude: camera.altitude + 10, azimuth: camera.azimuth }, deitado, 90, paisagem)
    expect(centro.x).toBeCloseTo(422, 3)
    expect(acima.y).toBeLessThan(centro.y - 20)
    expect(Math.abs(acima.x - centro.x)).toBeLessThan(2)
  })

  it('estrela atrás de quem segura: fora da frente, e a seta indica o lado certo', () => {
    const atrasDireita = projetarNaTela({ altitude: 0, azimuth: 150 }, emPe, 0, TELA)
    expect(atrasDireita.naFrente).toBe(false)
    expect(Math.abs(atrasDireita.angulo)).toBeLessThan(90) // seta para a direita
    const atrasEsquerda = projetarNaTela({ altitude: 0, azimuth: 210 }, emPe, 0, TELA)
    expect(Math.abs(atrasEsquerda.angulo)).toBeGreaterThan(90) // seta para a esquerda
  })

  it('separação angular verdadeira', () => {
    expect(separacao({ altitude: 0, azimuth: 0 }, { altitude: 0, azimuth: 90 })).toBeCloseTo(90, 5)
    expect(separacao({ altitude: 89, azimuth: 0 }, { altitude: 89, azimuth: 180 })).toBeCloseTo(2, 3)
  })
})

describe('suavização dos sensores', () => {
  it('amortece o tremor e atravessa o norte sem dar a volta', () => {
    const s = suavizador(0.3)
    s({ alpha: 359, beta: 90, gamma: 0 })
    const depois = s({ alpha: 1, beta: 90, gamma: 0 })
    expect(depois.alpha > 359 || depois.alpha < 1).toBe(true)
    const tremor = s({ alpha: 5, beta: 92, gamma: 0 })
    expect(tremor.alpha).toBeLessThan(5)
  })
})
