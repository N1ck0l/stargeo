import { useState } from 'react'
import { Link } from '../lib/Link.jsx'
import { mensagemDoPresente } from '../lib/compartilhar.js'

/**
 * Mandar a página do presente para quem recebe — o momento que importa.
 *
 * WhatsApp primeiro (é por onde quase todo mundo manda), com a mensagem
 * pronta e editável no próprio app; "copiar link" para qualquer outro canal;
 * e o cartão com QR para imprimir. Com revelação na data (0019), a mensagem
 * não entrega a estrela: fala da surpresa e do dia.
 *
 * Usado na tela de obrigado, na edição da página e no rodapé da página
 * quando a dona está logada.
 */
export function CompartilharPagina({ codigo, para, revelaEm, className = '' }) {
  const [copiado, setCopiado] = useState(false)
  const url = `${window.location.origin}/p/${codigo}`
  const texto = mensagemDoPresente({ url, para, revelaEm })

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Sem permissão de área de transferência: o link continua visível abaixo.
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap justify-center gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary text-sm"
        >
          Enviar pelo WhatsApp
        </a>
        <button type="button" onClick={copiar} className="btn btn-secundario text-sm">
          {copiado ? 'Link copiado ✓' : 'Copiar link'}
        </button>
        <Link para={`/p/${codigo}/cartao`} className="btn btn-secundario text-sm">
          Cartão com QR
        </Link>
      </div>
      <p className="mt-2 text-center font-mono text-xs break-all text-ivory/45 select-all">{url}</p>
      <span className="sr-only" aria-live="polite">
        {copiado ? 'Link copiado' : ''}
      </span>
    </div>
  )
}
