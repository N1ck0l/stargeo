import { useEffect, useState } from 'react'

/**
 * Barra fina no topo que mostra o quanto da página já foi lido.
 *
 * Usa uma transformação (e não a largura) para ficar na GPU: assim a barra
 * não provoca layout a cada quadro.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0

    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0)
    }

    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        update()
        raf = 0
      })
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    /*
     * A altura da página muda quando o conteúdo carrega ou quando uma fonte
     * termina de chegar — sem observar isso, a barra fica com a escala errada
     * até a pessoa rolar e provocar um novo cálculo.
     */
    const observer = new ResizeObserver(() => onScroll())
    observer.observe(document.body)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-gradient-to-r from-gold via-gold-soft to-gold transition-transform duration-150 ease-out"
      style={{ transform: `scaleX(${progress})` }}
      role="progressbar"
      aria-label="Progresso da leitura"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  )
}
