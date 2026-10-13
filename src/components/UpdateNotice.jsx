import { useEffect, useState } from 'react'

/**
 * Aviso de "versão nova disponível".
 *
 * O service worker guarda uma cópia do site para funcionar offline. Isso tem
 * um custo: quem abriu antes continua vendo a versão antiga até recarregar.
 *
 * Um worker novo não pode assumir enquanto a página está em uso — trocar o
 * JavaScript sob os pés de quem está lendo quebraria a página. Por isso o
 * `sw.js` NÃO chama `skipWaiting()` ao instalar: ele fica em espera, e é este
 * aviso que oferece a troca, num botão, no momento em que a pessoa decide.
 */
export function UpdateNotice() {
  const [registration, setRegistration] = useState(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Só em produção: em desenvolvimento o SW é desregistrado de propósito.
    if (import.meta.env.DEV) return

    let disposed = false
    // Precisa viver fora de `track` para o cleanup conseguir remover o listener.
    const cleanupListeners = []

    /**
     * Observa uma registration e avisa quando ela ganha um worker em espera.
     *
     * O `waiting` é lido no render, então o estado precisa mudar de verdade:
     * registrar a mesma referência faria o React encerrar o render sem redesenhar,
     * e o aviso nunca apareceria. O objeto `registration` do navegador é
     * mutável — é o próprio `updatefound` que preenche `installing`/`waiting`
     * depois — então a mudança de estado precisa vir de um evento.
     */
    const track = (reg) => {
      if (!reg || disposed) return
      setRegistration(reg)

      const check = () => {
        if (disposed) return
        // `controller` presente = não é a primeira instalação, é atualização.
        if (reg.waiting && navigator.serviceWorker.controller) {
          setRegistration((current) => (current === reg ? { ...reg } : reg))
        }
      }

      // `updatefound` cobre a installation nova; a chamada direta cobre o caso
      // em que o worker já terminou de instalar entre a consulta e o listener.
      reg.addEventListener('updatefound', check)
      cleanupListeners.push(() => reg.removeEventListener('updatefound', check))
      check()
    }

    navigator.serviceWorker.getRegistration().then(track).catch(() => {})

    /*
     * `controllerchange` só acontece depois que o worker novo assume — o que,
     * com o `skipWaiting` no clique, significa que recarregar mostra o site
     * atualizado. O aviso some por si mesmo, e a página segue.
     */
    const onControllerChange = () => {
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    return () => {
      disposed = true
      for (const remove of cleanupListeners) remove()
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const waiting = registration?.waiting
  if (!waiting) return null

  const apply = () => {
    // Pede ao service worker novo que assuma agora; o `controllerchange`
    // recarrega a página com o conteúdo atualizado.
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div className="animate-dialog-in flex flex-wrap items-center gap-3 rounded-full border border-gold/40 bg-[#0f0a26]/95 px-4 py-2.5 shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur">
        <span className="text-sm text-ivory">Tem uma versão nova do site.</span>
        <button
          type="button"
          onClick={apply}
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-night transition hover:bg-gold-soft"
        >
          Atualizar agora
        </button>
      </div>
    </div>
  )
}
