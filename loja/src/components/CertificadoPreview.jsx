import { memo, useId, useMemo } from 'react'
import { desenharCarta } from '../../../shared/carta/desenho.js'
import { desenharCertificado, MM_POR_PT } from '../../../shared/certificado/desenho.js'
import { dadosDaFolha } from '../lib/certificado.js'

/**
 * Prévia do certificado — a MESMA folha do PDF, desenhada em SVG.
 *
 * Não há desenho aqui: a folha é a lista de itens de
 * `shared/certificado/desenho.js`, que o `shared/pdf.js` também consome. Este
 * componente só traduz cada item para um elemento SVG. Medidas, quebras de
 * linha e centralização vêm prontas e são as do PDF — o que a pessoa vê antes
 * de pagar é o que ela recebe.
 *
 * O SVG tem `viewBox` em milímetros (210 × 297) e largura 100%: escala sozinho
 * para qualquer caixa, sem medir a tela.
 *
 * Usada em `pages/Home.jsx`, `pages/Produto.jsx` e `pagina/ModalCertificado.jsx`.
 * A carta que acompanha o certificado (`CartaPreview`, abaixo) usa o mesmo
 * tradutor — e mora no mesmo arquivo para vir no mesmo pedaço do bundle.
 */

/** Fonte do desenho → família, estilo e peso no CSS (as mesmas do PDF). */
const FONTES = {
  sans: { family: '"Montserrat", system-ui, sans-serif', style: 'normal', weight: 400 },
  sansMedio: { family: '"Montserrat", system-ui, sans-serif', style: 'normal', weight: 500 },
  sansItalico: { family: '"Montserrat", system-ui, sans-serif', style: 'italic', weight: 400 },
  serif: { family: '"Playfair Display", Georgia, serif', style: 'normal', weight: 400 },
  serifItalico: { family: '"Playfair Display", Georgia, serif', style: 'italic', weight: 400 },
  grego: { family: '"EB Garamond", "Playfair Display", serif', style: 'italic', weight: 400 },
}

/**
 * Kerning e ligaduras DESLIGADOS: o pdf-lib não aplica nenhum dos dois, e as
 * larguras da tabela compartilhada não os incluem. Ligados, a tela compactaria
 * pares como "AV" e o texto sairia mais curto que no papel.
 */
const ESTILO_TEXTO = { fontKerning: 'none', fontVariantLigatures: 'none', whiteSpace: 'pre' }

/**
 * `memo` + `useMemo`: a folha é cara de calcular (céu, medida de cada texto) e
 * só muda quando o que ela mostra muda — antes, qualquer redesenho do pai
 * (rolagem do topo, digitação) a recalculava do zero.
 */
export const CertificadoPreview = memo(function CertificadoPreview({
  estrela,
  honoreeName,
  message,
  fromName,
  dedicationDate,
  code,
  starNickname,
  par,
  grupoLinha,
  campanha = null,
  light = false,
  className = '',
}) {
  const id = useId().replace(/:/g, '')

  const folha = useMemo(
    () =>
      desenharCertificado(
        dadosDaFolha({ estrela, honoreeName, message, fromName, dedicationDate, code, starNickname, par, grupoLinha }),
        { claro: light, campanha },
      ),
    [estrela, honoreeName, message, fromName, dedicationDate, code, starNickname, par, grupoLinha, campanha, light],
  )

  return (
    <FolhaSvg
      folha={folha}
      id={id}
      className={`certificado ${className}`}
      rotulo={`Certificado de ${estrela.name} dedicado a ${honoreeName?.trim() || 'quem recebe'}`}
      light={light}
    />
  )
})

/**
 * Prévia da carta que acompanha o certificado (`shared/carta/desenho.js`) —
 * a mesma folha do PDF da carta.
 */
export const CartaPreview = memo(function CartaPreview({ paragrafos, titulo, fromName, starName, code, qrUrl, campanha = null, light = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const folha = useMemo(
    () => desenharCarta({ paragrafos, titulo, fromName, starName, code, qrUrl }, { claro: light, campanha }),
    [paragrafos, titulo, fromName, starName, code, qrUrl, campanha, light],
  )
  return <FolhaSvg folha={folha} id={id} className={`carta ${className}`} rotulo="Carta que acompanha o certificado" light={light} />
})

function FolhaSvg({ folha, id, className, rotulo, light }) {
  return (
    <svg
      viewBox={`0 0 ${folha.largura} ${folha.altura}`}
      width="100%"
      className={`block ${className}`}
      role="img"
      aria-label={rotulo}
      data-tema={light ? 'claro' : 'escuro'}
    >
      {folha.itens.map((item, i) => (
        <Item key={i} item={item} id={id} />
      ))}
    </svg>
  )
}

function Item({ item, id }) {
  switch (item.tipo) {
    case 'degrade':
      return (
        <>
          <defs>
            <linearGradient id={`fundo-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={item.topo} />
              <stop offset="1" stopColor={item.base} />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill={`url(#fundo-${id})`} />
        </>
      )
    case 'linha':
      return (
        <line
          x1={item.x1}
          y1={item.y1}
          x2={item.x2}
          y2={item.y2}
          stroke={item.cor}
          strokeWidth={item.espessura}
          strokeOpacity={item.opacidade}
        />
      )
    case 'retangulo':
      return (
        <rect
          x={item.x}
          y={item.y}
          width={item.largura}
          height={item.altura}
          fill={item.preenchimento ?? 'none'}
          fillOpacity={item.preenchimento ? item.opacidade : undefined}
          stroke={item.traco}
          strokeWidth={item.traco ? item.espessura : undefined}
          strokeOpacity={item.traco ? item.opacidade : undefined}
          // Módulos do QR lado a lado: sem antialias na borda, para não
          // aparecer a "costura" clara entre dois quadrados vizinhos.
          shapeRendering={item.preenchimento ? 'crispEdges' : undefined}
        />
      )
    case 'imagem':
      return <image href={item.src} x={item.x} y={item.y} width={item.largura} height={item.altura} preserveAspectRatio="xMidYMid meet" />
    case 'circulo':
      return (
        <circle
          cx={item.cx}
          cy={item.cy}
          r={item.r}
          fill={item.preenchimento ?? 'none'}
          fillOpacity={item.preenchimento ? item.opacidade : undefined}
          stroke={item.traco}
          strokeWidth={item.traco ? item.espessura : undefined}
          strokeOpacity={item.traco ? item.opacidade : undefined}
        />
      )
    case 'caminho':
      return (
        <path
          d={item.d}
          transform={`translate(${item.x} ${item.y}) scale(${item.escala})`}
          fill={item.preenchimento ?? 'none'}
          fillOpacity={item.preenchimento ? item.opacidade : undefined}
          stroke={item.traco}
          // O traço vem em mm; dentro do grupo escalado ele seria escalado de novo.
          strokeWidth={item.traco ? item.espessura / item.escala : undefined}
          strokeOpacity={item.traco ? item.opacidade : undefined}
          strokeLinecap={item.ponta === 'redonda' ? 'round' : undefined}
        />
      )
    case 'texto': {
      const fonte = FONTES[item.fonte]
      return (
        <text
          x={item.x}
          y={item.y}
          fill={item.cor}
          fillOpacity={item.opacidade}
          fontFamily={fonte.family}
          fontStyle={fonte.style}
          fontWeight={fonte.weight}
          fontSize={item.pt * MM_POR_PT}
          letterSpacing={item.espaco ? item.espaco * MM_POR_PT : undefined}
          style={ESTILO_TEXTO}
        >
          {item.texto}
        </text>
      )
    }
    default:
      return null
  }
}
