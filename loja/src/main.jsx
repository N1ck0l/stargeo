/**
 * Ponto de entrada da loja.
 *
 * É o único arquivo que o `index.html` da loja carrega: cria a raiz do React,
 * importa o CSS do tema (`index.css`) e envolve o `App` na fronteira de erro.
 * Quem importa: o HTML (via `<script type="module">`, apontado pelo
 * `loja/vite.config.js`). Não exporta nada.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErroDeTela } from './components/ErroDeTela.jsx'
import { vigiarErros } from './lib/erros.js'

// Erros de script e promessas soltas vão para o painel (sem dado pessoal).
vigiarErros()

const raiz = document.getElementById('root')

/*
 * A fronteira de erro é a mesma ideia do site pessoal: um bug em qualquer
 * componente vira uma tela legível, com o que aconteceu e o que fazer, em vez
 * de uma página branca — que é a pior coisa que uma loja pode mostrar a
 * alguém que está com o cartão na mão.
 */
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <ErroDeTela>
        <App />
      </ErroDeTela>
    </StrictMode>,
  )
}
