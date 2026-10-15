import { useEffect, useState } from 'react'

/**
 * Barra fina no topo que mostra o quanto da página já foi lido.
 *
 * Usa uma transformação (e não a largura) para ficar na GPU: assim a barra
 * não provoca layout a cada quadro.
 *
 * Quem importa: `loja/src/App.jsx` (junto com o `Starfield`). Export:
 * `ScrollProgress`.
 *
 * Invariantes: a barra é só visual (`aria-hidden`). Antes ela era um
 * `progressbar` cujo valor mudava a cada rolagem — ruído para quem usa leitor
 * de tela, que já informa a posição na página, e um elemento solto fora das
 * regiões (a auditoria axe apontava). A escala é refeita quando a altura da
 * página muda (fonte ou imagem que carrega depois), senão o percentual mente.
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
      // Guarda contra rajada de eventos: só um cálculo por quadro, e o
      // próximo só depois do anterior rodar.
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
      aria-hidden="true"
    />
  )
}
