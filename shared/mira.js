/**
 * Matemática da Mira celeste que vai além da posição da estrela
 * (`shared/sky.js`): o Sol e o céu claro, o que dá para dizer com honestidade
 * sobre a observação, e a projeção da direção da estrela na tela da câmera a
 * partir da orientação COMPLETA do aparelho (inclusive inclinado de lado e
 * com a tela em paisagem).
 *
 * Convenções (as mesmas de `sky.js`): azimute em graus a partir do norte, no
 * sentido horário (90° = leste); altura em graus acima do horizonte. Mundo em
 * coordenadas leste-norte-cima (ENU), aparelho no sistema da W3C (x para a
 * direita da tela em retrato, y para o topo, z saindo da tela; a câmera
 * traseira olha para −z).
 */
import { cardinal, equatorialToHorizontal, wrap180, wrap360 } from './sky.js'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// ---------------------------------------------------------------------------
// O Sol e o céu claro
// ---------------------------------------------------------------------------

/**
 * Posição aparente do Sol (ascensão reta em horas, declinação em graus) —
 * fórmula de baixa precisão do Astronomical Almanac, erro < 0,01° entre 1950
 * e 2050: muito mais do que basta para saber se é dia ou crepúsculo.
 */
export function posicaoDoSol(data) {
  const n = data.getTime() / 86400000 + 2440587.5 - 2451545.0
  const L = wrap360(280.46 + 0.9856474 * n)
  const g = wrap360(357.528 + 0.9856003 * n) * D2R
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R
  const eps = (23.439 - 0.0000004 * n) * D2R
  const ra = wrap360(Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * R2D) / 15
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * R2D
  return { ra, dec }
}

/** Altura do Sol, em graus, num lugar e momento. */
export function alturaDoSol(lat, lon, data) {
  const { ra, dec } = posicaoDoSol(data)
  return equatorialToHorizontal(ra, dec, lat, lon, data).altitude
}

/**
 * O céu pela altura do Sol: dia, crepúsculos civil (até −6°), náutico (até
 * −12°) e astronômico (até −18°), e noite.
 */
export function faseDoCeu(alturaSol) {
  if (alturaSol > -0.833) return 'dia'
  if (alturaSol > -6) return 'civil'
  if (alturaSol > -12) return 'nautico'
  if (alturaSol > -18) return 'astronomico'
  return 'noite'
}

/**
 * A estrela mais fraca que o olho nu costuma alcançar em cada fase, em céu
 * limpo e escuro (magnitude: quanto MAIOR, mais fraca). De dia, nenhuma.
 * Valores conservadores — luz da cidade e névoa só pioram.
 */
const LIMITE_OLHO_NU = { dia: null, civil: 1, nautico: 3, astronomico: 5, noite: 6 }

/** Abaixo disto, prédios, árvores e a névoa do horizonte costumam esconder. */
export const ALTURA_MINIMA = 10

/** A estrela mais fraca que o olho nu alcança mesmo em céu perfeito. */
export const MAGNITUDE_OLHO_NU = 6.5

/** Em cidade grande, estrelas mais fracas que isto se perdem nas luzes. */
export const MAGNITUDE_CIDADE = 3.5

/** Quanto o Sol tem de descer para o céu escurecer o bastante para esta estrela. */
function solParaVer(mag) {
  if (mag <= 1) return -6
  if (mag <= 3) return -12
  return -15
}

/**
 * O que dá para dizer agora sobre observar a estrela — sem prometer o que
 * não se sabe (tempo nublado, luz da cidade, relevo).
 *
 * Estados:
 * - `abaixo`     — abaixo do horizonte;
 * - `baixa`      — acima, mas a menos de `ALTURA_MINIMA`;
 * - `ceu-claro`  — acima, mas é dia ou crepúsculo claro demais para o brilho dela;
 * - `fraca`      — acima, em céu escuro, mas fraca demais para o olho nu;
 * - `boa`        — acima, alta e com céu escuro o bastante: dá para TENTAR.
 *
 * Mais `janela`: a próxima faixa, nas 24 h seguintes, em que ela fica a 15°
 * ou mais com o céu escuro o bastante (o "melhor horário").
 *
 * @param {{ ra: number, dec: number, mag: number }} estrela  AR em horas, dec em graus
 */
export function observacao(estrela, lat, lon, data) {
  const agora = equatorialToHorizontal(estrela.ra, estrela.dec, lat, lon, data)
  const sol = alturaDoSol(lat, lon, data)
  const fase = faseDoCeu(sol)
  const limite = LIMITE_OLHO_NU[fase]
  const mag = Number(estrela.mag)

  let estado
  if (agora.altitude < 0) estado = 'abaixo'
  else if (agora.altitude < ALTURA_MINIMA) estado = 'baixa'
  else if (mag > MAGNITUDE_OLHO_NU) estado = 'fraca'
  else if (limite === null || mag > limite) estado = 'ceu-claro'
  else estado = 'boa'

  // Varredura das próximas 24 h, de 10 em 10 minutos.
  const passo = 10 * 60000
  let janela = null
  let nasce = null
  for (let t = 0; t <= 24 * 60; t += 10) {
    const quando = new Date(data.getTime() + t * 60000)
    const pos = equatorialToHorizontal(estrela.ra, estrela.dec, lat, lon, quando)
    if (!nasce && agora.altitude < 0 && pos.altitude >= 0) nasce = quando
    const boa = pos.altitude >= 15 && mag <= MAGNITUDE_OLHO_NU && alturaDoSol(lat, lon, quando) <= solParaVer(mag)
    if (boa && !janela) janela = { inicio: quando, fim: quando, alturaMax: pos.altitude, azimute: pos.azimuth }
    else if (boa && janela && janela.fim.getTime() === quando.getTime() - passo) {
      janela.fim = quando
      if (pos.altitude > janela.alturaMax) janela = { ...janela, alturaMax: pos.altitude, azimute: pos.azimuth }
    } else if (!boa && janela) break
  }

  return { estado, altitude: agora.altitude, azimute: agora.azimuth, alturaSol: sol, fase, mag, janela, nasce }
}

/** "19h40", no fuso do aparelho. */
const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

/** Hoje, amanhã ou a data, para as janelas que passam da meia-noite. */
function dia(d, agora) {
  const mesmoDia = (a, b) => a.toDateString() === b.toDateString()
  if (mesmoDia(d, agora)) return ''
  const amanha = new Date(agora.getTime() + 86400000)
  return mesmoDia(d, amanha) ? ' (amanhã)' : ` (${d.toLocaleDateString('pt-BR')})`
}

/**
 * O estado da observação em duas linhas: um título curto e o detalhe. Nunca
 * "visível agora": o que se sabe é se ela está acima do horizonte e se o céu
 * permite tentar — nuvens, luzes e prédios ninguém calcula.
 */
export function mensagemDeObservacao(info, agora = new Date()) {
  if (!info) {
    return {
      titulo: 'Falta saber onde você está',
      detalhe: 'Com a sua localização (ou uma cidade próxima), calculamos onde ela está no seu céu agora.',
    }
  }
  const direcao = `para o ${cardinal(info.azimute)}`
  const quandoJanela = info.janela
    ? `Melhor horário para procurar: ${hora(info.janela.inicio)} às ${hora(info.janela.fim)}${dia(info.janela.inicio, agora)}, até ${Math.round(info.janela.alturaMax)}° de altura, ${'para o ' + cardinal(info.janela.azimute)}.`
    : 'Nas próximas 24 horas ela não fica alta num céu escuro o bastante daqui.'

  switch (info.estado) {
    case 'abaixo':
      return {
        titulo: 'Abaixo do horizonte agora',
        detalhe: info.nasce
          ? `Ela nasce às ${hora(info.nasce)}${dia(info.nasce, agora)}. ${info.janela ? quandoJanela : ''}`.trim()
          : 'Daqui, ela não sobe acima do horizonte nas próximas 24 horas.',
      }
    case 'baixa':
      return {
        titulo: `Acima do horizonte, mas muito baixa (${Math.round(info.altitude)}°)`,
        detalhe: `Perto do horizonte, prédios, árvores e a névoa costumam escondê-la. ${quandoJanela}`,
      }
    case 'fraca':
      return {
        titulo: 'Acima do horizonte, mas fraca demais para o olho nu',
        detalhe: `Com magnitude ${info.mag.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}, ela só aparece com binóculo ou telescópio, longe das luzes da cidade. A mira mostra a direção ${direcao}.`,
      }
    case 'ceu-claro':
      return {
        titulo:
          info.fase === 'dia'
            ? 'Acima do horizonte, mas é dia'
            : 'Acima do horizonte, mas o céu ainda está claro',
        detalhe: `${info.fase === 'dia' ? 'De dia as estrelas não aparecem — nem a olho nu, nem na câmera.' : 'No crepúsculo, só as mais brilhantes aparecem.'} ${quandoJanela}`,
      }
    default:
      return {
        titulo: 'Boa hora para procurar',
        detalhe:
          `Ela está a ${Math.round(info.altitude)}° de altura, ${direcao}. Em céu limpo e longe de luzes fortes, dá para tentar vê-la a olho nu.` +
          (info.mag > MAGNITUDE_CIDADE ? ' Em cidade grande, estrelas desse brilho costumam se perder nas luzes.' : ''),
      }
  }
}

/** Altura em "punhos": com o braço esticado, um punho fechado cobre ~10°. */
export function emPunhos(graus) {
  const punhos = Math.max(0, Math.round(graus / 10))
  if (punhos === 0) return 'rente ao horizonte'
  return `cerca de ${punhos} ${punhos === 1 ? 'punho fechado' : 'punhos fechados'} acima do horizonte, com o braço esticado`
}

// ---------------------------------------------------------------------------
// A direção na tela
// ---------------------------------------------------------------------------

/** Direção (altura, azimute) → vetor unitário leste-norte-cima. */
export function vetorDoCeu(altitude, azimute) {
  const a = altitude * D2R
  const z = azimute * D2R
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)]
}

/**
 * Matriz de rotação do aparelho para o mundo (W3C: R = Rz(α)·Rx(β)·Ry(γ)).
 * A mesma de `devicePointing` em `sky.js`, por inteiro.
 */
export function matrizDoAparelho(alpha, beta, gamma) {
  const [sa, ca] = [Math.sin(alpha * D2R), Math.cos(alpha * D2R)]
  const [sb, cb] = [Math.sin(beta * D2R), Math.cos(beta * D2R)]
  const [sg, cg] = [Math.sin(gamma * D2R), Math.cos(gamma * D2R)]
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ]
}

/** Separação angular verdadeira entre duas direções do céu, em graus. */
export function separacao(a, b) {
  const va = vetorDoCeu(a.altitude, a.azimuth)
  const vb = vetorDoCeu(b.altitude, b.azimuth)
  const dot = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]
  return Math.acos(Math.max(-1, Math.min(1, dot))) * R2D
}

/**
 * Onde uma direção do céu cai na tela da câmera.
 *
 * Câmera estenopeica olhando para −z do aparelho; a distância focal sai do
 * campo de visão `fov` medido no lado COMPRIDO da imagem. `anguloTela` é a
 * rotação da tela (0 retrato, 90/270 paisagem — `screen.orientation.angle`):
 * os eixos do aparelho não giram com a tela, os da imagem sim.
 *
 * @returns {{ x: number, y: number, naFrente: boolean, angulo: number }}
 *   x/y em pixels a partir do canto superior esquerdo; `angulo` é a direção
 *   (graus, sentido da tela: 0 = direita, 90 = baixo) do centro até o ponto —
 *   vale também quando ele está atrás de quem segura o celular.
 */
export function projetarNaTela(direcao, orientacao, anguloTela, { largura, altura, fov }) {
  const R = matrizDoAparelho(orientacao.alpha, orientacao.beta, orientacao.gamma)
  const t = vetorDoCeu(direcao.altitude, direcao.azimuth)
  // Mundo → aparelho: Rᵀ · t.
  const d = [0, 1, 2].map((i) => R[0][i] * t[0] + R[1][i] * t[1] + R[2][i] * t[2])
  const naFrente = d[2] < 0
  const profundidade = Math.max(Math.abs(d[2]), 1e-6)
  const u = d[0] / profundidade
  const v = d[1] / profundidade
  const th = anguloTela * D2R
  const telaX = u * Math.cos(th) - v * Math.sin(th)
  const telaY = u * Math.sin(th) + v * Math.cos(th)
  const focal = Math.max(largura, altura) / 2 / Math.tan((fov / 2) * D2R)
  // Atrás: a direção na tela é a do componente lateral (para que lado virar).
  const ax = naFrente ? telaX : d[0] * Math.cos(th) - d[1] * Math.sin(th)
  const ay = naFrente ? telaY : d[0] * Math.sin(th) + d[1] * Math.cos(th)
  return {
    x: largura / 2 + telaX * focal,
    y: altura / 2 - telaY * focal,
    naFrente,
    angulo: Math.atan2(-ay, ax) * R2D,
  }
}

/** Raio, em graus de céu, que `px` pixels cobrem no centro da imagem. */
export function grausDoRaio(px, { largura, altura, fov }) {
  const focal = Math.max(largura, altura) / 2 / Math.tan((fov / 2) * D2R)
  return Math.atan(px / focal) * R2D
}

/**
 * Suaviza a orientação (o tremor da mão e o ruído do sensor): média móvel
 * exponencial, circular nos ângulos que dão a volta (α e β). Devolve uma
 * função `(leitura) => suavizada`.
 */
export function suavizador(fator = 0.25) {
  let atual = null
  const circular = (velho, novo) => velho + wrap180(novo - velho) * fator
  return (leitura) => {
    if (!atual) {
      atual = { ...leitura }
      return atual
    }
    // Salto grande (troca de fonte, recalibração): aceita na hora.
    if (Math.abs(wrap180(leitura.alpha - atual.alpha)) > 60) atual = { ...leitura }
    else {
      atual = {
        alpha: wrap360(circular(atual.alpha, leitura.alpha)),
        beta: wrap180(circular(atual.beta, leitura.beta)),
        gamma: atual.gamma + (leitura.gamma - atual.gamma) * fator,
      }
    }
    return atual
  }
}
