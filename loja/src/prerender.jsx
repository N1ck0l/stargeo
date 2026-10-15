/**
 * Renderização no BUILD das páginas que chegam prontas no HTML
 * (`scripts/prerender-produto.mjs`): a home e a casca do produto.
 *
 * A árvore é a MESMA do `main.jsx` — StrictMode › ErroDeTela › App —, para o
 * navegador "hidratar" (aproveitar) o HTML nó a nó em vez de redesenhar.
 *
 * `renderToString` NÃO espera as partes sob demanda, e é de propósito:
 *
 * - Home: textos e estrutura vêm prontos; as folhas do certificado de exemplo
 *   (SVGs grandes) ficam como espaço reservado e chegam em seguida. Com elas
 *   desenhadas, o HTML ia a 49 KB comprimidos e o título demorava MAIS
 *   (Lighthouse: 2,9 → 3,5 s), porque a primeira pintura esperava o arquivo.
 * - Produto: o formulário depende da estrela e do cupom do endereço, então
 *   sai como espaço reservado; cabeçalho, trilha e título vêm prontos.
 */
import { StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App.jsx'
import { ErroDeTela } from './components/ErroDeTela.jsx'

const arvore = () => (
  <StrictMode>
    <ErroDeTela>
      <App />
    </ErroDeTela>
  </StrictMode>
)

/**
 * O roteador lê o endereço na primeira renderização (`useRota`). No build
 * (Node) não há `window`: entra um mínimo. Nos testes (jsdom) ele existe e
 * NÃO pode ser trocado — só o endereço muda.
 */
function noEndereco(caminho) {
  if (typeof window === 'undefined') {
    globalThis.window = { location: { pathname: caminho, search: '', origin: 'https://stellara.invalid' } }
  } else {
    window.history.pushState(null, '', caminho)
  }
}

export function renderizarCascaDoProduto() {
  noEndereco('/produto/certificado-digital')
  return renderToString(arvore())
}

export function renderizarHome() {
  noEndereco('/')
  return renderToString(arvore())
}
