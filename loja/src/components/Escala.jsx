import { useLayoutEffect, useRef, useState } from 'react'

/** Largura da folha A4 em paisagem (297 mm) a 96 dpi — é o denominador do fator de escala. */
const LARGURA_FOLHA_PX = 1122.52

/**
 * Escala a folha A4 em PAISAGEM para caber na largura disponível.
 *
 * A folha é desenhada em milímetros, e `297 mm` valem `1122.52 px` a 96 dpi —
 * é por isso que o fator é `largura / 1122.52`. O que muda em relação à versão
 * anterior é QUEM faz a conta: era CSS puro, `scale(calc(100cqw / 793.7))`,
 * e isso não funciona — o calc devolve um COMPRIMENTO, e `scale()` exige um
 * número. O navegador descartava a declaração, a folha ficava em tamanho
 * natural e o `overflow: hidden` cortava a prévia.
 *
 * Não existe como transformar a largura do contêiner em número sem medir, então
 * a medida é JS. O `ResizeObserver` observa o contêiner (e não a janela), não
 * precisa de throttle e não gera render extra: ele só dispara quando a largura
 * realmente muda.
 *
 * Mora em componente próprio porque a prévia aparece em dois lugares: a
 * página do produto e o modal do certificado na página dedicada.
 *
 * Quem importa: `pages/Produto.jsx` e `pagina/ModalCertificado.jsx`. Export:
 * `Escala`. Invariante: o `aspect-ratio` interno é 297/210 — trocar a folha
 * para retrato sem mexer aqui deixa uma caixa com a proporção errada.
 */
export function Escala({ children }) {
  const caixa = useRef(null)
  const [fator, setFator] = useState(1)

  useLayoutEffect(() => {
    const elemento = caixa.current
    if (!elemento) return undefined

    const medir = () => setFator(elemento.clientWidth / LARGURA_FOLHA_PX)
    // Mede antes de o navegador pintar: começa escalado, sem pulso de folha gigante.
    medir()

    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  return (
    <div ref={caixa} style={{ width: '100%' }}>
      <div style={{ width: '100%', aspectRatio: '297 / 210', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: 'top left',
            transform: `scale(${fator})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
