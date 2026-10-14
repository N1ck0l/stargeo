import { useReveal } from '../lib/useReveal'

/**
 * Envolve um conteúdo e o revela suavemente quando ele entra na tela.
 *
 * ```jsx
 * <Reveal delay={120}><h2>Sagitário</h2></Reveal>
 * ```
 *
 * Se a pessoa pediu movimento reduzido, o conteúdo aparece sem animação.
 *
 * Quem importa: `pages/Home.jsx` e `pages/Rastrear.jsx` — quase toda seção
 * da loja passa por aqui. Export: `Reveal`. `as` escolhe a tag (`li`, `p`,
 * `h1`…), então o componente pode entrar dentro de listas sem quebrar a
 * hierarquia.
 *
 * Invariantes: atraso, distância e duração são CSS custom properties
 * (`--reveal-*`), não estilo calculado no JS — quem anima é o stylesheet,
 * e `prefers-reduced-motion` é tratado dentro de `useReveal`, que nasce
 * com `visible` verdadeiro nesse caso.
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  distance = 28,
  duration = 800,
  className = '',
  children,
  ...rest
}) {
  const [ref, visible] = useReveal()

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{
        '--reveal-delay': `${delay}ms`,
        '--reveal-distance': `${distance}px`,
        '--reveal-duration': `${duration}ms`,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
