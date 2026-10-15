/**
 * Renderização no BUILD da casca do produto (`scripts/prerender-produto.mjs`).
 *
 * A árvore é a MESMA do `main.jsx` — StrictMode › ErroDeTela › App —, só com
 * a tela do produto trocada pela casca. É o que permite ao navegador
 * "hidratar" (aproveitar) o HTML pronto: cabeçalho, título e rodapé batem nó
 * a nó, e só o miolo da página (dentro do Suspense) é refeito quando o pacote
 * do produto chega.
 */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.jsx'
import { ErroDeTela } from './components/ErroDeTela.jsx'
import { CascaDoProduto } from './pages/Produto.jsx'

export function renderizarCascaDoProduto() {
  return renderToString(
    <StrictMode>
      <ErroDeTela>
        <App telaPronta={<CascaDoProduto />} />
      </ErroDeTela>
    </StrictMode>,
  )
}
