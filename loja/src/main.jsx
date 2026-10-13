import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErroDeTela } from './components/ErroDeTela.jsx'

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
