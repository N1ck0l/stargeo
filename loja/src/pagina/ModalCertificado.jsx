import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CertificadoPreview } from '../components/CertificadoPreview.jsx'
import { Escala } from '../components/Escala.jsx'
import { useContent } from '../../../src/lib/contentContext.js'
import { estrelaDaFolha } from '../lib/conteudoPagina.js'

/**
 * O certificado da página dedicada.
 *
 * É o MESMO desenho do PDF (folha A4 em milímetros, `CertificadoPreview`),
 * e não o modal do site pessoal: a folha da loja já foi conferida contra o
 * PDF que sai da Edge Function, e reaproveitá-la significa que prévia e
 * entrega não podem divergir. O que o modal empresta do antigo é o
 * comportamento de diálogo — Esc, foco preso, rolagem do fundo travada.
 *
 * Baixar é em PNG (via `html-to-image`, carregado só no clique); o PDF com
 * as fontes embutidas continua vindo por e-mail.
 */
export function ModalCertificado({ open, onClose }) {
  const { content } = useContent()
  const painelRef = useRef(null)
  const folhaRef = useRef(null)
  const [claro, setClaro] = useState(false)
  const [baixando, setBaixando] = useState(false)

  // Com o modal fechado o componente não renderiza nada; `open` fica aqui
  // para o chamador controlar montagem sem perder o contrato do diálogo.
  if (!open) return null

  return (
    <DiarioDialog onClose={onClose} painelRef={painelRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-[10px] tracking-[0.3em] text-gold uppercase">
            Certificado
          </p>
          <h2 className="font-serif mt-1 text-2xl text-ivory sm:text-3xl">
            {content.nome}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/15 p-1">
            {[[false, 'Escura'], [true, 'Clara']].map(([valor, rotulo]) => (
              <button
                key={rotulo}
                type="button"
                onClick={() => setClaro(valor)}
                aria-pressed={claro === valor}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  claro === valor ? 'bg-gold text-night' : 'text-ivory/70 hover:text-ivory'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/25 px-4 py-2 text-sm text-ivory transition hover:border-gold hover:text-gold"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="shimmer-border mt-4 overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <Escala>
          <div ref={folhaRef}>
            <CertificadoPreview
              estrela={estrelaDaFolha(content.estrela)}
              honoreeName={content.nome}
              message={content.mensagemPessoal}
              fromName={content.assinatura}
              dedicationDate={content.data}
              code={content.registro}
              light={claro}
            />
          </div>
        </Escala>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs leading-relaxed text-ivory/50">
          Mesmas medidas e fontes do PDF enviado por e-mail. Para guardar em
          alta, baixe a imagem — ou use o PDF do e-mail, que é o documento.
        </p>
        <button
          type="button"
          disabled={baixando}
          onClick={async () => {
            if (!folhaRef.current || baixando) return
            setBaixando(true)
            try {
              const { toPng } = await import('html-to-image')
              const url = await toPng(folhaRef.current, { pixelRatio: 2 })
              const link = document.createElement('a')
              link.href = url
              link.download = `certificado-${content.registro}.png`
              document.body.appendChild(link)
              link.click()
              link.remove()
            } catch {
              // Sem downloads no aparelho o certificado continua no e-mail;
              // não é motivo para quebrar a tela.
            } finally {
              setBaixando(false)
            }
          }}
          className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-night transition hover:bg-gold-soft disabled:opacity-60"
        >
          {baixando ? 'Preparando…' : 'Baixar imagem (PNG)'}
        </button>
      </div>
    </DiarioDialog>
  )
}

/**
 * O invólucro do diálogo: fundo travado, Esc fecha e o foco fica preso
 * enquanto estiver aberto.
 */
function DiarioDialog({ onClose, painelRef, children }) {
  const anteriorRef = useRef(null)

  useEffect(() => {
    anteriorRef.current = document.activeElement

    const { overflow, paddingRight } = document.body.style
    const compensacao = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (compensacao > 0) document.body.style.paddingRight = `${compensacao}px`

    painelRef.current?.focus()

    const aoTeclar = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focaveis = painelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focaveis?.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]

      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault()
        ultimo.focus()
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      anteriorRef.current?.focus?.()
    }
  }, [onClose, painelRef])

  /*
   * Portal no fim do `body`: o diálogo é `fixed z-50`, e um ancestral com
   * `z-index` (o `<main class="z-10">` da loja) criaria um contexto de
   * empilhamento onde o 50 fica preso por baixo do header sticky (z-40) — o
   * sintoma é o clique no certificado interceptado pela barra de cima.
   * No fim do body ele disputa no mesmo nível que todo mundo — e vence.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Certificado de dedicação celeste"
      className="fixed inset-0 z-50 overflow-y-auto bg-night/92 backdrop-blur-sm"
      onMouseDown={(event) => {
        // Clique no fundo fecha; clique dentro do painel não (o mousedown
        // começa dentro e termina fora é arrasto de seleção de texto).
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={painelRef}
        tabIndex={-1}
        className="mx-auto my-6 w-[min(1060px,94vw)] rounded-3xl border border-gold/20 bg-[#0b0824] p-5 outline-none sm:p-7"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
