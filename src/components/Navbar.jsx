import { useEffect, useRef, useState } from 'react'
import { useContent } from '../lib/contentContext'

/** Seções fixas. A de mensagem é acrescentada só quando existe. */
const LINKS_BASE = [
  { href: '#inicio', label: 'Início', id: 'inicio' },
  { href: '#ceu', label: 'Mapa do céu', id: 'ceu' },
  { href: '#estrela', label: 'A estrela', id: 'estrela' },
  { href: '#carta', label: 'Carta', id: 'carta' },
]

/**
 * Cabeçalho fixo. Em telas pequenas os links viram um menu expansível,
 * para que a navegação continue acessível no celular.
 */
export function Navbar({ onOpenCertificate, onOpenFinder }) {
  const { content } = useContent()
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState('inicio')
  const [condensed, setCondensed] = useState(false)
  const menuRef = useRef(null)

  // O link da mensagem pessoal só existe quando ela foi escrita — um link que
  // não leva a lugar nenhum seria pior do que nenhum link.
  const temMensagem = Boolean(content.mensagemPessoal?.trim()) && content.mostrarMensagem !== false
  const links = temMensagem
    ? [...LINKS_BASE, { href: '#mensagem', label: 'Mensagem', id: 'mensagem' }]
    : LINKS_BASE

  // Marca o destino de rolagem que estiver no centro da tela.
  useEffect(() => {
    const sections = LINKS_BASE.map((link) => document.getElementById(link.id)).filter(Boolean)
    if (temMensagem) {
      const mensagem = document.getElementById('mensagem')
      if (mensagem) sections.push(mensagem)
    }
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 1] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [temMensagem])

  // Encolhe a barra assim que a pessoa começa a ler.
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Fecha o menu ao clicar fora dele ou ao pressionar Esc.
  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 border-b bg-[#07061a]/70 backdrop-blur-md transition-all duration-300 ${
        condensed ? 'border-white/10 bg-[#07061a]/85 py-1 shadow-[0_8px_30px_rgba(0,0,0,0.4)]' : 'border-white/5 py-0'
      }`}
    >
      <div className="safe-top mx-auto flex max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#inicio" className="font-display text-sm tracking-[0.28em] text-gold">
          STARGEO
        </a>

        <nav className="hidden items-center gap-6 text-sm text-ivory/75 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`nav-link transition hover:text-gold ${active === link.id ? 'is-active' : ''}`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Aparece só quando o aparelho tem câmera e sensores — ou seja, no celular. */}
          {onOpenFinder && content.mostrarMira !== false && (
            <button
              type="button"
              onClick={onOpenFinder}
              title="Aponte a câmera para o céu e encontre a estrela"
              className="hidden rounded-full border border-gold/50 px-3 py-1.5 text-[11px] tracking-wide text-gold transition hover:bg-gold hover:text-night sm:block sm:px-4 sm:text-xs lg:hidden"
            >
              Mira celeste
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCertificate}
            className="shrink-0 rounded-full border border-gold/50 px-3 py-1.5 text-[11px] tracking-wide text-gold transition hover:bg-gold hover:text-night sm:px-4 sm:text-xs"
          >
            Certificado
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="nav-mobile"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-ivory/80 transition hover:border-gold hover:text-gold md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {menuOpen ? (
                <path
                  d="M3 3 L13 13 M13 3 L3 13"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4 H14 M2 8 H14 M2 12 H14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="nav-mobile"
          ref={menuRef}
          className="animate-dialog-in border-t border-white/5 bg-[#07061a]/95 md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-5 py-2 text-sm text-ivory/80">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-2 py-3 transition hover:bg-white/5 hover:text-gold"
                >
                  {link.label}
                </a>
              </li>
            ))}
{onOpenFinder && content.mostrarMira !== false && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenFinder()
                  }}
                  className="block w-full rounded-lg px-2 py-3 text-left text-gold transition hover:bg-white/5"
                >
                  Mira celeste
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}

      <p className="sr-only">Dedicatória a {content.nome}</p>
    </header>
  )
}