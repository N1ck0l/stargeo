import { useCallback, useEffect, useRef, useState } from 'react'
import { kausAustralis } from '../data/star'
import { useContent } from '../lib/contentContext'

/** Elementos que recebem foco dentro do diálogo. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Modal do certificado digital.
 *
 * Trata os detalhes que um diálogo precisa ter para funcionar bem com teclado e
 * leitores de tela: trava a rolagem do fundo, prende o foco, fecha com Esc ou
 * com clique na área escura, e devolve o foco ao fechar.
 */
export function CertificateModal({ open, onClose }) {
  const sheetRef = useRef(null)
  const dialogRef = useRef(null)
  const { content } = useContent()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Versão clara, usada só na hora de imprimir em papel.
  const [paper, setPaper] = useState(false)

  /**
   * Seleciona a versão e abre a janela de impressão.
   *
   * Trocar o tema e abrir a impressão não pode acontecer no mesmo quadro: o
   * navegador fotografaria o certificado ainda na cor anterior. Por isso
   * esperamos dois quadros renderizados.
   *
   * O tema NÃO volta sozinho ao escuro depois de imprimir. Em navegadores em
   * que `window.print()` é assíncrono (Safari, iOS), reverter por tempo fixo
   * poderia desfazer a troca antes de a janela de impressão capturar a página.
   * Quem escolhe a versão continua vendo na tela qual vai sair.
   */
  const handlePrint = useCallback((light) => {
    setPaper(light)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
  }, [])

  const handleDownload = useCallback(async () => {
    if (!sheetRef.current) return
    setSaving(true)
    setError('')
    // A imagem exportada é sempre na versão escura, que é a "original".
    setPaper(false)
    try {
      // Um quadro para a troca de tema aparecer antes de fotografar.
      await new Promise((resolve) => requestAnimationFrame(resolve))
      /*
       * `html-to-image` pesa ~70 kB e só é usado neste botão. Importar aqui,
       * e não no topo do arquivo, tira esse peso do site inicial: quem nunca
       * clicar em "Baixar PNG" nunca baixa esse código.
       */
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(sheetRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#100b2e',
      })
      const link = document.createElement('a')
      link.download = `certificado-${content.nomeCurto.toLowerCase()}-kaus-australis.png`
      link.href = dataUrl
      link.rel = 'noopener'
      // O Firefox legado só respeita o download de um link presente no
      // documento, e remover antes do clique chegar cancela o arquivo.
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      setError('Não foi possível gerar a imagem. Use “Imprimir” para salvar em PDF.')
    } finally {
      setSaving(false)
    }
  }, [content.nomeCurto])

  /*
   * Comportamento de diálogo enquanto `open` for verdadeiro.
   *
   * Quatro coisas acontecem aqui, e todas precisam ser desfeitas no cleanup:
   * trava a rolagem do fundo (compensando a barra para o layout não pular),
   * joga o foco no primeiro elemento focável, prende o `Tab` dentro do
   * diálogo e devolve o foco a quem o tinha. Sem isso, quem navega por
   * teclado continuaria acionando os botões do site escondidos por baixo.
   */
  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement
    const { overflow, paddingRight } = document.body.style
    // Compensa a largura da barra de rolagem para não "pular" a página.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`

    dialogRef.current?.querySelector(FOCUSABLE)?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      // Prende o foco dentro do diálogo.
      const nodes = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
      // Ao reabrir, o certificado volta sempre para a versão escura.
      setPaper(false)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-night/80 p-4 backdrop-blur-sm sm:p-8"
      onClick={(event) => {
        // Só fecha se o clique foi no próprio fundo: um clique que terminou
        // dentro do cartão (arrasto do texto, seleção) não fecha nada.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="certificate-title"
        className="animate-dialog-in my-6 w-full max-w-3xl"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">
            Certificado digital
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={saving}
              className="rounded-full bg-gold px-4 py-2 text-sm text-night transition hover:bg-gold-soft disabled:opacity-60"
            >
              {saving ? 'Preparando…' : 'Baixar PNG'}
            </button>
            <button
              type="button"
              onClick={() => handlePrint(false)}
              title="Salva como PDF no fundo escuro — o melhor para tela"
              className="rounded-full border border-gold/50 px-4 py-2 text-sm text-gold transition hover:bg-gold hover:text-night"
            >
              Imprimir escuro
            </button>
            <button
              type="button"
              onClick={() => handlePrint(true)}
              title="Fundo claro, econômico em tinta e legível em impressoras que não imprimem fundos escuros"
              className="rounded-full border border-white/25 px-4 py-2 text-sm text-ivory transition hover:border-gold hover:text-gold"
            >
              Imprimir claro
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-ivory transition hover:border-gold hover:text-gold"
            >
              Fechar
            </button>
          </div>
        </div>

        <p className="mb-4 text-xs text-ivory/60">
          {paper
            ? 'Versão clara selecionada — vai sair em fundo marfim, com menos tinta.'
            : '“Imprimir escuro” é melhor para PDF. “Imprimir claro” gasta muito menos tinta em papel.'}
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {/*
          `id="certificate-print"` é o alvo de toda a regra `@media print` de
          `index.css` (único elemento visível na folha); `sheetRef` é o que o
          `html-to-image` fotografa. Trocar um dos dois quebra impressão ou
          download — os dois precisam apontar para este mesmo div.
        */}
        <div id="certificate-print" ref={sheetRef}
          className={`certificate-paper shimmer-border relative overflow-hidden rounded-sm border-2 p-6 text-center sm:p-10 ${paper ? 'certificate-light' : ''}`}
        >
          <div className="pointer-events-none absolute inset-3 border" style={{ borderColor: 'var(--cert-frame)' }} />
          <div className="pointer-events-none absolute inset-5 border" style={{ borderColor: 'var(--cert-frame-soft)' }} />

          <p className="cert-kicker font-display text-[10px] tracking-[0.5em] uppercase sm:text-xs">
            Certificado de dedicação celeste
          </p>
          <h2 id="certificate-title" className="cert-title font-serif mt-5 text-3xl sm:text-5xl">
            StarGeo
          </h2>
          <div className="cert-rule mx-auto mt-5 h-px w-32" />
          <p className="cert-body mt-6 font-serif text-base italic">Confere-se a</p>
          <p className="cert-name font-serif mt-2 text-2xl sm:text-4xl">{content.nome}</p>
          <p className="cert-body mx-auto mt-6 max-w-xl font-serif text-base leading-7">
            a estrela real {kausAustralis.commonName} ({kausAustralis.bayer}), a mais brilhante da
            constelação de {kausAustralis.constellation}, como símbolo permanente de admiração,
            memória e amor. Que, ao erguer os olhos, ela reconheça o próprio nome no céu.
          </p>

          <div className="cert-body mx-auto mt-8 grid max-w-lg gap-3 text-left text-sm sm:grid-cols-2">
            <p>
              <span className="cert-label">Constelação:</span>{' '}
              {kausAustralis.constellationLatin}
            </p>
            <p>
              <span className="cert-label">Magnitude:</span> {kausAustralis.magnitude}
            </p>
            <p>
              <span className="cert-label">A.R.:</span> {kausAustralis.ra.formatted}
            </p>
            <p>
              <span className="cert-label">Dec.:</span> {kausAustralis.dec.formatted}
            </p>
            <p className="sm:col-span-2">
              <span className="cert-label">Registro:</span> {content.registro}
            </p>
          </div>

          <p className="cert-body mt-8 text-xs tracking-[0.25em] uppercase">
            {content.data} · visível a olho nu no hemisfério sul
          </p>
          <div className="animate-seal relative mx-auto mt-8 flex size-24 items-center justify-center">
            <span className="animate-spin-slow absolute inset-0 rounded-full border" style={{ borderColor: 'var(--cert-frame)' }} />
            <span className="animate-spin-slow absolute inset-2 rounded-full border border-dashed [animation-direction:reverse] [animation-duration:18s]" style={{ borderColor: 'var(--cert-frame-soft)' }} />
            <svg className="cert-seal" width="34" height="34" viewBox="0 0 72 72" aria-hidden="true">
              <path
                d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>

        {content.assinatura && (
          <p className="mt-4 text-center font-serif text-lg text-gold italic">{content.assinatura}</p>
        )}
      </div>
    </div>
  )
}