/**
 * Símbolo da Stellara — estrela de quatro pontas com a órbita dourada.
 *
 * A mesma identidade da prancha da marca: uma estrela cintilante de pontas
 * côncavas, o elipse de órbita inclinado 30° passando por trás dela e o ponto
 * que acompanha a órbita. Nada de imagem: é SVG, escala de 16 px ao rodapé sem
 * perder a ponta.
 *
 * Uso: `loja/src/App.jsx` (cabeçalho), `loja/src/components/Footer.jsx` (rodapé)
 * e `loja/public/favicon.svg` (o mesmo desenho, em arquivo). Export `Simbolo`.
 *
 * Cores por `currentColor` — quem usa decide (dourado no site, marfim no
 * certificado monocromático).
 */

/** Caminho da estrela de quatro pontas, centrada em 36,36 no viewBox 72. */
const ESTRELA = 'M36 6 C 37.6 22.5 49.5 34.4 66 36 C 49.5 37.6 37.6 49.5 36 66 C 34.4 49.5 22.5 37.6 6 36 C 22.5 34.4 34.4 22.5 36 6 Z'

export function Simbolo({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {/* Órbita: elipse inclinado, desenhado ANTES para a estrela cobrir o
          trecho que passa por dentro dela. */}
      <ellipse
        cx="36"
        cy="36"
        rx="33"
        ry="13.5"
        transform="rotate(-30 36 36)"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.85"
      />
      <path d={ESTRELA} fill="currentColor" />
      {/* Ponto sobre a órbita (extremo leste, girado -30°). */}
      <circle cx="64.6" cy="19.5" r="4" fill="currentColor" />
    </svg>
  )
}
