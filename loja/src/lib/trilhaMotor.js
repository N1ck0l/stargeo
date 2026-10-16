/**
 * A trilha da Stellara, composta AO VIVO no navegador (Web Audio): piano
 * suave, de notas espaçadas, sobre um fundo atmosférico de acordes longos,
 * com reverberação de sala grande. Original por construção — nenhuma
 * gravação, nenhum arquivo para baixar, nenhum direito autoral de terceiros.
 *
 * A harmonia é fixa (Ré maior: I – vi – IV – V, acordes abertos); o piano
 * escolhe notas da escala pentatônica do acorde da vez, com respiros
 * longos — nunca toca igual, mas sempre soa como a mesma música.
 *
 * Carregado só quando alguém liga a trilha (`lib/trilha.js`).
 */

/** MIDI → Hz. */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)

/** Acordes do fundo (MIDI), 10 s cada. */
const ACORDES = [
  [50, 57, 64, 66], // Ré (com nona)
  [47, 54, 62, 69], // Si menor com sétima
  [43, 50, 59, 66], // Sol com sétima maior
  [45, 52, 59, 64], // Lá suspenso
]
/** Notas do piano por acorde: tons do acorde e da pentatônica, região média-aguda. */
const MELODIA = [
  [62, 64, 66, 69, 71, 74, 76, 78],
  [59, 62, 66, 69, 71, 74, 78],
  [62, 66, 67, 71, 74, 79],
  [61, 64, 69, 71, 73, 76],
]
const DURACAO_ACORDE = 10

/** Volume máximo da mistura: é fundo, não protagonista. */
const TETO = 0.22

function reverberacao(ctx, segundos = 3.2) {
  const taxa = ctx.sampleRate
  const tamanho = Math.floor(taxa * segundos)
  const buffer = ctx.createBuffer(2, tamanho, taxa)
  for (let canal = 0; canal < 2; canal += 1) {
    const dados = buffer.getChannelData(canal)
    for (let i = 0; i < tamanho; i += 1) dados[i] = (Math.random() * 2 - 1) * (1 - i / tamanho) ** 2.6
  }
  const conv = ctx.createConvolver()
  conv.buffer = buffer
  return conv
}

export function criarMotor() {
  const Contexto = window.AudioContext || window.webkitAudioContext
  if (!Contexto) throw new Error('Web Audio indisponível')
  const ctx = new Contexto()

  const mestre = ctx.createGain()
  mestre.gain.value = 0
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.ratio.value = 3
  mestre.connect(compressor).connect(ctx.destination)

  const reverb = reverberacao(ctx)
  const molhado = ctx.createGain()
  molhado.gain.value = 0.55
  reverb.connect(molhado).connect(mestre)
  const seco = ctx.createGain()
  seco.gain.value = 0.7
  seco.connect(mestre)

  /*
   * Canal da sessão: tudo o que toca passa por ele. Ao pausar, ele é
   * desligado — as notas já agendadas não voltam a soar ao religar.
   */
  let barra = null
  const novaBarra = () => {
    barra = ctx.createGain()
    barra.connect(seco)
    barra.connect(reverb)
  }

  let volume = 0.35
  let tocando = false
  let relogio = null
  let proximoAcorde = 0
  let proximaNota = 0
  let indiceAcorde = 0

  /** Uma camada do fundo: duas ondas levemente desafinadas, filtro baixo, entrada e saída lentas. */
  function pad(midi, inicio, duracao) {
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, inicio)
    env.gain.linearRampToValueAtTime(0.05, inicio + 3)
    env.gain.setValueAtTime(0.05, inicio + duracao - 1)
    env.gain.linearRampToValueAtTime(0, inicio + duracao + 4)
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'lowpass'
    filtro.frequency.value = 850
    filtro.connect(env)
    env.connect(barra)
    for (const [tipo, desvio] of [['sine', -5], ['triangle', 5]]) {
      const osc = ctx.createOscillator()
      osc.type = tipo
      osc.frequency.value = hz(midi)
      osc.detune.value = desvio
      osc.connect(filtro)
      osc.start(inicio)
      osc.stop(inicio + duracao + 4.2)
    }
  }

  /** Uma nota de piano: ataque curto, harmônicos que somem antes da fundamental. */
  function piano(midi, inicio, forca) {
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const saida = ctx.createGain()
    saida.gain.value = 1
    if (pan) {
      pan.pan.value = (Math.random() - 0.5) * 0.7
      saida.connect(pan).connect(barra)
    } else {
      saida.connect(barra)
    }
    const decaimento = 2.8 + Math.random() * 1.6
    for (const [multiplo, nivel, tipo, queda] of [
      [1, 1, 'sine', decaimento],
      [2, 0.35, 'sine', decaimento * 0.5],
      [3, 0.1, 'triangle', decaimento * 0.3],
    ]) {
      const env = ctx.createGain()
      env.gain.setValueAtTime(0, inicio)
      env.gain.linearRampToValueAtTime(forca * nivel, inicio + 0.008)
      env.gain.exponentialRampToValueAtTime(0.0001, inicio + queda)
      const osc = ctx.createOscillator()
      osc.type = tipo
      osc.frequency.value = hz(midi) * multiplo
      osc.connect(env).connect(saida)
      osc.start(inicio)
      osc.stop(inicio + queda + 0.05)
    }
  }

  /** Agenda o que cabe nos próximos segundos (o relógio do áudio não atrasa). */
  function agendar() {
    const limite = ctx.currentTime + 1.5
    while (proximoAcorde < limite) {
      for (const nota of ACORDES[indiceAcorde]) pad(nota, proximoAcorde, DURACAO_ACORDE)
      proximoAcorde += DURACAO_ACORDE
      indiceAcorde = (indiceAcorde + 1) % ACORDES.length
    }
    while (proximaNota < limite) {
      const acorde = (indiceAcorde + ACORDES.length - 1) % ACORDES.length
      const notas = MELODIA[acorde]
      const nota = notas[Math.floor(Math.random() * notas.length)]
      piano(nota, proximaNota, 0.05 + Math.random() * 0.06)
      // Às vezes, um pequeno arpejo; quase sempre, respiro.
      if (Math.random() < 0.18) piano(notas[Math.min(notas.length - 1, notas.indexOf(nota) + 2)], proximaNota + 0.32, 0.04)
      proximaNota += 1.3 + Math.random() * 2.6
    }
  }

  return {
    async iniciar() {
      await ctx.resume()
      if (tocando) return
      tocando = true
      novaBarra()
      const agora = ctx.currentTime
      proximoAcorde = Math.max(proximoAcorde, agora + 0.1)
      proximaNota = Math.max(proximaNota, agora + 1.2)
      mestre.gain.cancelScheduledValues(agora)
      mestre.gain.setValueAtTime(mestre.gain.value, agora)
      mestre.gain.linearRampToValueAtTime(volume * TETO, agora + 3)
      agendar()
      relogio = setInterval(agendar, 500)
    },
    parar() {
      if (!tocando) return
      tocando = false
      clearInterval(relogio)
      const agora = ctx.currentTime
      mestre.gain.cancelScheduledValues(agora)
      mestre.gain.setValueAtTime(mestre.gain.value, agora)
      mestre.gain.linearRampToValueAtTime(0, agora + 1.2)
      // Depois do fade, o relógio do áudio para (bateria) e os sons agendados são descartados.
      const desta = barra
      setTimeout(() => {
        desta.disconnect()
        if (!tocando) {
          ctx.suspend()
          proximoAcorde = 0
          proximaNota = 0
        }
      }, 1400)
    },
    volume(valor) {
      volume = Math.max(0, Math.min(1, valor))
      if (tocando) mestre.gain.setTargetAtTime(volume * TETO, ctx.currentTime, 0.2)
    },
  }
}
