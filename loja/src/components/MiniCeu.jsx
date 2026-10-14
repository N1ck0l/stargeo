import { projetarCeu, raioDaEstrela } from '../../../shared/certificado/mapa.js'

/**
 * O céu real em volta da estrela, em miniatura — o MESMO mapa que vai na
 * folha do certificado (`shared/certificado/mapa.js`), para quem escolhe a
 * estrela ver a constelação dela antes de pagar.
 *
 * Carregado sob demanda (`MiniCeuSobDemanda`): os dados do céu das 12
 * estrelas não pesam a abertura da loja.
 */
export function MiniCeu({ estrela, className = '' }) {
  const r = 46
  const ceu = projetarCeu(estrela, { cx: 50, cy: 50, r })

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Mapa do céu em volta de ${estrela.name}, na constelação de ${estrela.constellation}`}
    >
      <circle cx="50" cy="50" r={r} fill="#0b0e27" stroke="#d8b66a" strokeOpacity="0.8" strokeWidth="0.8" />
      <circle cx="50" cy="50" r={r * 0.5} fill="none" stroke="#d8b66a" strokeOpacity="0.18" strokeWidth="0.3" />
      {ceu.linhas.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#d8b66a" strokeOpacity="0.6" strokeWidth="0.5" />
      ))}
      {ceu.estrelas.map(({ x, y, mag }, i) => (
        <circle key={i} cx={x} cy={y} r={raioDaEstrela(mag, 1.7)} fill="#f6f1e7" fillOpacity={mag < 3 ? 0.95 : 0.65} />
      ))}
      {/* A estrela escolhida, no centro, com o anel dourado. */}
      <circle cx="50" cy="50" r="5.5" fill="none" stroke="#d8b66a" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="2.2" fill="#d8b66a" />
    </svg>
  )
}
