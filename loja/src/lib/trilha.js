import { useSyncExternalStore } from 'react'

/**
 * Estado da Trilha Stellara, compartilhado entre o botão flutuante e a Mira
 * celeste (que cobre a tela e precisa do próprio "pausar").
 *
 * - Desligada por padrão, sempre: nada toca sem um toque da pessoa (e o
 *   navegador nem deixaria). Nem a preferência de "estava tocando" é
 *   lembrada entre visitas — só o volume.
 * - O motor (`trilhaMotor.js`) só é baixado no primeiro "tocar".
 * - Continua tocando ao trocar de tela: a loja é uma página só, e este estado
 *   vive fora dos componentes.
 */
const CHAVE_VOLUME = 'stellara:trilha-volume'

function volumeGuardado() {
  try {
    const v = Number(localStorage.getItem(CHAVE_VOLUME))
    return v > 0 && v <= 1 ? v : 0.35
  } catch {
    return 0.35
  }
}

let estado = { tocando: false, carregando: false, volume: 0.35, erro: '' }
let iniciado = false
let motor = null
const ouvintes = new Set()

function mudar(parcial) {
  estado = { ...estado, ...parcial }
  for (const ouvir of ouvintes) ouvir()
}

function assinar(ouvir) {
  if (!iniciado && typeof window !== 'undefined') {
    iniciado = true
    estado = { ...estado, volume: volumeGuardado() }
  }
  ouvintes.add(ouvir)
  return () => ouvintes.delete(ouvir)
}

const NO_SERVIDOR = { tocando: false, carregando: false, volume: 0.35, erro: '' }

export function useTrilha() {
  return useSyncExternalStore(assinar, () => estado, () => NO_SERVIDOR)
}

export async function alternarTrilha() {
  if (estado.carregando) return
  if (estado.tocando) {
    motor?.parar()
    mudar({ tocando: false })
    return
  }
  mudar({ carregando: true, erro: '' })
  try {
    if (!motor) {
      const { criarMotor } = await import('./trilhaMotor.js')
      motor = criarMotor()
    }
    motor.volume(estado.volume)
    await motor.iniciar()
    mudar({ tocando: true, carregando: false })
  } catch {
    mudar({ carregando: false, erro: 'Este navegador não conseguiu tocar a trilha.' })
  }
}

export function pausarTrilha() {
  if (estado.tocando) alternarTrilha()
}

export function definirVolume(valor) {
  const v = Math.max(0.05, Math.min(1, Number(valor)))
  motor?.volume(v)
  mudar({ volume: v })
  try {
    localStorage.setItem(CHAVE_VOLUME, String(v))
  } catch {
    // Sem armazenamento (aba privada): só não lembra o volume.
  }
}
