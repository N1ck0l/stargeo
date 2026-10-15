/**
 * Renderização no BUILD da página do produto (`scripts/prerender-produto.mjs`).
 *
 * A árvore é a MESMA do `main.jsx` — StrictMode › ErroDeTela › App. O
 * formulário (pacote sob demanda) sai como o espaço reservado do Suspense;
 * cabeçalho, trilha, título e rodapé saem prontos, e o navegador os
 * "hidrata" (aproveita) nó a nó quando o JavaScript roda.
 */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.jsx'
import { ErroDeTela } from './components/ErroDeTela.jsx'

export function renderizarCascaDoProduto() {
  return renderToString(
    <StrictMode>
      <ErroDeTela>
        <App />
      </ErroDeTela>
    </StrictMode>,
  )
}
