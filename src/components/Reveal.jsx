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
 * Papel na arquitetura: casca de animação reutilizável por TODAS as seções.
 * A animação em si não mora aqui — mora na classe `.reveal` de `index.css`,
 * que lê exatamente as três variáveis passadas abaixo (`--reveal-delay`,
 * `--reveal-distance`, `--reveal-duration`). Trocar o nome de uma variável
 * silencia todas as entradas do site.
 *
 * `as` escolhe a tag (`"p"`, `"h2"`, `"section"`…), e `...rest` vai direto
 * para o elemento — é assim que chegam `className` extra, `id` e atributos
 * ARIA. O `className` recebido entra DEPOIS das classes `reveal`, então um
 * utilitário do chamador consegue sobrescrever o padrão.
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