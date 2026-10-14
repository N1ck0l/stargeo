import { SIMBOLO } from './simboloGeometria.js'

/**
 * Símbolo da Stellara no site — estrela de quatro pontas com a órbita.
 *
 * É a VERSÃO REDUZIDA da logo oficial (`marca/`), feita para 16–48 px: mesma
 * estrela e mesma órbita, com traço mais grosso e sem facetas. A geometria
 * vem de `simboloGeometria.js`, gerado por `scripts/gerar-marca.mjs` junto
 * com os SVGs da marca e o favicon — os três nunca divergem.
 *
 * Uso: `loja/src/App.jsx` (cabeçalho) e `loja/src/components/Footer.jsx`
 * (rodapé). Cor por `currentColor`: quem usa decide (dourado no site).
 */
export function Simbolo({ size = 28, className = '' }) {
  const { orbita, ponto } = SIMBOLO
  return (
    <svg
      width={size}
      height={size}
      viewBox={SIMBOLO.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g transform={SIMBOLO.transformacao}>
        {/* Órbita ANTES da estrela, para a estrela cobrir o trecho de dentro. */}
        <ellipse
          rx={orbita.rx}
          ry={orbita.ry}
          transform={`rotate(${orbita.giro})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={orbita.traco}
        />
        <path d={SIMBOLO.estrela} fill="currentColor" />
        <circle cx={ponto.cx} cy={ponto.cy} r={ponto.r} fill="currentColor" />
      </g>
    </svg>
  )
}
