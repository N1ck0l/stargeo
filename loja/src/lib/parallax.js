import { useEffect } from 'react'

/**
 * Parallax do topo SEM passar pelo React — o da home e o da página do
 * cliente (`pagina/secoes/Hero.jsx`).
 *
 * Antes, cada quadro da rolagem virava estado (`useScroll`) e redesenhava o
 * topo inteiro — inclusive a folha do certificado de exemplo, recalculada do
 * zero. No iPhone a rolagem desse trecho engasgava (o resto da página, sem
 * parallax, rolava liso). Agora um único `requestAnimationFrame` por quadro
 * escreve `transform` e `opacity` direto nos elementos: o navegador só move
 * camadas já desenhadas. Passado o topo, para de escrever. Movimento
 * reduzido: nada se move.
 */
export function useParallaxDoTopo(textoRef, arteRef, rolarRef) {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let quadro = 0
    let ultimo = -1
    const aplicar = () => {
      quadro = 0
      const y = Math.min(window.scrollY, 900)
      if (y === ultimo) return
      ultimo = y
      const fade = Math.max(0, 1 - y / 520)
      if (textoRef.current) {
        textoRef.current.style.transform = `translate3d(0, ${y * 0.042}px, 0)`
        textoRef.current.style.opacity = String(fade)
      }
      if (arteRef.current) arteRef.current.style.transform = `translate3d(0, ${-y * 0.07}px, 0)`
      if (rolarRef.current) rolarRef.current.style.opacity = String(fade * 0.9)
    }
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(aplicar)
    }
    aplicar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      window.removeEventListener('scroll', aoRolar)
      cancelAnimationFrame(quadro)
    }
  }, [textoRef, arteRef, rolarRef])
}
