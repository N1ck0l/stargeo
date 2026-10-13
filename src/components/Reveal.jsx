import { useReveal } from '../lib/useReveal'

/**
 * Envolve um conteúdo e o revela suavemente quando ele entra na tela.
 *
 * ```jsx
 * <Reveal delay={120}><h2>Sagitário</h2></Reveal>
 * ```
 *
 * Se a pessoa pediu movimento reduzido, o conteúdo aparece sem animação.
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