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