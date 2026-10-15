import { projetarCeuInteiro } from '../../../shared/ceuInteiro.js'

/**
 * O céu inteiro com as estrelas de um grupo marcadas — a "constelação da
 * família" (`/g/CODE`). Recebe o céu já carregado (`shared/ceu.js`, que a
 * página traz sob demanda) e as estrelas `{ ra, dec, rotulo }`.
 *
 * As estrelas do grupo são ligadas por um traço dourado fino, na ordem da
 * compra: é a constelação que só aquelas pessoas têm.
 */
export function MapaCeuInteiro({ ceu, estrelas, className = '' }) {
  const mapa = projetarCeuInteiro(ceu, estrelas, 720)
  const raio = (mag) => Math.max(0.35, 2.1 - mag * 0.36)

  return (
    <svg
      viewBox={`0 0 ${mapa.largura} ${mapa.altura}`}
      className={className}
      role="img"
      aria-label={`O céu inteiro, com ${estrelas.length} estrelas marcadas: ${estrelas.map((e) => `${e.rotulo} (${e.nome})`).join(', ')}`}
    >
      <defs>
        <clipPath id="elipse-ceu">
          <ellipse cx={mapa.largura / 2} cy={mapa.altura / 2} rx={mapa.largura / 2 - 1} ry={mapa.altura / 2 - 1} />
        </clipPath>
        <radialGradient id="fundo-ceu" cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#1a2056" />
          <stop offset="1" stopColor="#080a1e" />
        </radialGradient>
      </defs>

      <ellipse cx={mapa.largura / 2} cy={mapa.altura / 2} rx={mapa.largura / 2 - 1} ry={mapa.altura / 2 - 1} fill="url(#fundo-ceu)" />
      <g clipPath="url(#elipse-ceu)">
        {mapa.grade.map((pontos, i) => (
          <polyline key={`g${i}`} points={pontos.map((p) => p.join(',')).join(' ')} fill="none" stroke="#d8b66a" strokeOpacity="0.08" strokeWidth="0.6" />
        ))}
        {mapa.linhas.map(([x1, y1, x2, y2], i) => (
          <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d8b66a" strokeOpacity="0.22" strokeWidth="0.5" />
        ))}
        {mapa.estrelas.map((e, i) => (
          <circle key={`e${i}`} cx={e.x} cy={e.y} r={raio(e.mag)} fill="#f4ecd8" fillOpacity={e.mag < 3 ? 0.9 : 0.55} />
        ))}

        {/* A constelação do grupo: as estrelas ligadas na ordem da compra. */}
        {mapa.marcadas.length > 1 && (
          <polyline
            points={mapa.marcadas.map((m) => `${m.x},${m.y}`).join(' ')}
            fill="none"
            stroke="#d8b66a"
            strokeOpacity="0.55"
            strokeWidth="0.9"
            strokeDasharray="3 3"
          />
        )}
        {mapa.marcadas.map((m) => (
          <g key={`${m.rotulo}-${m.nome}`}>
            <circle cx={m.x} cy={m.y} r="7" fill="none" stroke="#d8b66a" strokeWidth="1" />
            <circle cx={m.x} cy={m.y} r="2.6" fill="#d8b66a" />
            <text
              x={m.x}
              y={m.y - 11}
              textAnchor="middle"
              fill="#f4ecd8"
              fontSize="13"
              fontFamily="Playfair Display, Georgia, serif"
              stroke="#080a1e"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {m.rotulo}
            </text>
          </g>
        ))}
      </g>
      <ellipse cx={mapa.largura / 2} cy={mapa.altura / 2} rx={mapa.largura / 2 - 1} ry={mapa.altura / 2 - 1} fill="none" stroke="#d8b66a" strokeOpacity="0.6" strokeWidth="1" />
      <text x={mapa.largura / 2} y="14" textAnchor="middle" fill="#d8b66a" fillOpacity="0.7" fontSize="9" letterSpacing="2">
        NORTE CELESTE
      </text>
      <text x={mapa.largura / 2} y={mapa.altura - 6} textAnchor="middle" fill="#d8b66a" fillOpacity="0.7" fontSize="9" letterSpacing="2">
        SUL CELESTE
      </text>
    </svg>
  )
}
