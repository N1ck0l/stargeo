import { useEffect, useRef, useState } from 'react'

/** Respeita a preferência de movimento reduzido do sistema. */
function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Observa um elemento e avisa quando ele entra na tela.
 *
 * Usado para as animações de entrada das seções. Se a pessoa pediu movimento
 * reduzido, o elemento já nasce marcado como visível e a animação simplesmente
 * não acontece.
 */
export function useReveal({ threshold = 0.15, once = true } = {}) {
  const ref = useRef(null)
  // O estado nasce resolvido, para o conteúdo já aparecer na primeira pintura.
  const [visible, setVisible] = useState(
    () => prefersReducedMotion() || typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setVisible(false)
          }
        }
      },
      { threshold, rootMargin: '0px 0px -10% 0px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold, once])

  return [ref, visible]
}

/** Idêntico, mas devolvendo o offset de rolagem, para efeitos de parallax. */
export function useScroll() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    // `prefersReducedMotion` já protege contra `matchMedia` ausente.
    if (prefersReducedMotion()) return

    let raf = 0
    const onScroll = () => {
      // Agrupa as chamadas: só um cálculo por quadro.
      if (raf) return
      raf = requestAnimationFrame(() => {
        setOffset(window.scrollY)
        raf = 0
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return offset
}

/**
 * Escreve um texto letra a letra.
 *
 * Com movimento reduzido o texto aparece inteiro, de imediato — o efeito é
 * decorativo e nunca deve esconder conteúdo de quem pediu menos movimento.
 */
export function useTypewriter(text, { speed = 58, startDelay = 500 } = {}) {
  const still = prefersReducedMotion()
  const [output, setOutput] = useState(() => (still ? text : ''))
  const [done, setDone] = useState(() => still)

  useEffect(() => {
    if (prefersReducedMotion()) return

    /*
     * Não é preciso zerar `output` aqui: quando o texto muda, o efeito roda de
     * novo e o primeiro `tick` sobrescreve com a string nova. Zerar no início
     * só provocaria um render a mais sem mudar o que aparece.
     */
    let index = 0
    let timer
    const tick = () => {
      index += 1
      setOutput(text.slice(0, index))
      if (index >= text.length) {
        setDone(true)
        return
      }
      timer = setTimeout(tick, speed)
    }

    timer = setTimeout(tick, startDelay)
    return () => clearTimeout(timer)
  }, [text, speed, startDelay])

  return { output, done }
}
