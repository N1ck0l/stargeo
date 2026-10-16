import { useEffect, useRef, useState } from 'react'
import { alternarTrilha, definirVolume, useTrilha } from '../lib/trilha.js'

/**
 * Botão discreto da Trilha Stellara, no canto inferior esquerdo.
 *
 * Um toque liga ou pausa; o ícone de ajustes abre o volume. Desligada por
 * padrão (nada toca sozinho), começa baixa e entra devagar. A música é
 * composta ao vivo no navegador (`lib/trilhaMotor.js`): original, sem arquivo
 * para baixar.
 */
export function TrilhaStellara() {
  const { tocando, carregando, volume, erro } = useTrilha()
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef(null)

  // Fecha o volume ao tocar fora ou com Esc.
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => {
      if (!caixaRef.current?.contains(e.target)) setAberto(false)
    }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  return (
    <div ref={caixaRef} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start gap-2">
      {aberto && (
        <div className="w-64 rounded-2xl border border-gold/25 bg-night/95 p-4 text-left shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur" role="dialog" aria-label="Trilha Stellara">
          <p className="font-serif text-lg text-ivory">Trilha Stellara</p>
          <p className="mt-1 text-xs leading-relaxed text-ivory/60">
            Piano e atmosfera para acompanhar sua jornada — música original, composta ao vivo no seu navegador.
          </p>
          <label className="mt-3 flex items-center gap-3 text-xs text-ivory/75">
            <span>Volume</span>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => definirVolume(e.target.value)}
              className="min-h-8 flex-1 accent-[#d8b66a]"
              aria-label="Volume da trilha"
            />
          </label>
          <button
            type="button"
            onClick={alternarTrilha}
            className="mt-3 min-h-10 w-full rounded-full border border-gold/50 text-sm text-gold transition hover:bg-gold hover:text-night"
          >
            {tocando ? 'Pausar a trilha' : 'Tocar a trilha'}
          </button>
          {erro && <p className="mt-2 text-xs text-red-200">{erro}</p>}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-night/80 p-1 shadow-[0_6px_24px_rgba(0,0,0,0.45)] backdrop-blur">
        <button
          type="button"
          onClick={alternarTrilha}
          aria-pressed={tocando}
          aria-label={tocando ? 'Pausar a Trilha Stellara' : 'Tocar a Trilha Stellara'}
          className={`flex size-10 items-center justify-center rounded-full transition ${tocando ? 'bg-gold/20 text-gold' : 'text-ivory/75 hover:text-gold'}`}
        >
          {carregando ? (
            <span className="size-4 animate-spin rounded-full border border-gold/30 border-t-gold" aria-hidden="true" />
          ) : tocando ? (
            <Barras />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
              <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label="Volume e informações da trilha"
          className="flex size-10 items-center justify-center rounded-full text-ivory/60 transition hover:text-gold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** Três barrinhas que "respiram" enquanto toca (paradas com movimento reduzido). */
function Barras() {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 180, 360].map((atraso) => (
        <span key={atraso} className="trilha-barra w-[3px] rounded-full bg-current" style={{ animationDelay: `${atraso}ms` }} />
      ))}
    </span>
  )
}
