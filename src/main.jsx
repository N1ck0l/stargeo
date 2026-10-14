/**
 * Ponto de entrada da aplicação.
 *
 * Papel na arquitetura: cria a raiz React em `#root`, envolve tudo no
 * `ErrorBoundary` e liga o service worker. Não há lógica de negócio aqui — o
 * que a pessoa vê mora em `App.jsx`.
 *
 * Importado por: `index.html` (via Vite).
 * Exports: nenhum (módulo de efeito único).
 *
 * Invariantes:
 * - o `ErrorBoundary` precisa continuar envolvendo o `<App />`: ele é o que
 *   transforma um crash em tela legível;
 * - o registro do SW continua depois do render, para não atrasar a primeira
 *   pintura.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { registerServiceWorker } from './lib/pwa.js'

const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* Envolvendo a aplicação inteira: se algo quebrar, o presente continua
          legível em vez de virar uma tela branca. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Deixa o site abrir sem internet depois da primeira visita.
registerServiceWorker()