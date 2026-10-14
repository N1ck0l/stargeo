import { useId } from 'react'
import { arco, caixaSimbolo, COR, facetas, naOrbita, ORBITA, PONTO } from '../../../shared/marca.js'

/**
 * O símbolo oficial COMPLETO — estrela facetada e órbita com a folga — para
 * usos grandes (o herói da home). É o mesmo desenho de `marca/stellara-simbolo.svg`,
 * gerado da mesma geometria (`shared/marca.js`).
 *
 * Abaixo de ~48 px use `Simbolo` (a versão reduzida): a órbita fina daqui some.
 */
export function SimboloOficial({ className = '', titulo }) {
  const id = useId().replace(/:/g, '')
  const c = caixaSimbolo()
  const [px, py] = naOrbita(PONTO.angulo)
  const folga = ORBITA.traco + ORBITA.folga * 2

  return (
    <svg
      viewBox={`${c.minX} ${c.minY} ${c.largura} ${c.altura}`}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <defs>
        <mask id={`folga-${id}`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="400">
          <rect x="-200" y="-200" width="400" height="400" fill="#fff" />
          <path d={arco(true)} fill="none" stroke="#000" strokeWidth={folga} />
        </mask>
      </defs>
      <path d={arco(false)} fill="none" stroke={COR.dourado} strokeWidth={ORBITA.traco} strokeLinecap="round" />
      <g mask={`url(#folga-${id})`}>
        {facetas().map((f) => (
          <path key={f.d} d={f.d} fill={f.tom === 'claro' ? COR.douradoClaro : COR.douradoEscuro} />
        ))}
      </g>
      <path d={arco(true)} fill="none" stroke={COR.dourado} strokeWidth={ORBITA.traco} strokeLinecap="round" />
      <circle cx={px} cy={py} r={PONTO.raio} fill={COR.dourado} />
    </svg>
  )
}
