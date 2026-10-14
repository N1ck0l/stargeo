/**
 * Diálogo do certificado: contrato de modal (ARIA, trava de rolagem do
 * body, foco preso, Esc, clique no backdrop) e os dados reais exibidos.
 *
 * A trava de rolagem é regressão de bug já ocorrido: sem `overflow: hidden`
 * no body, a página por baixo do overlay continuava rolando no celular. O
 * foco preso fecha o vazamento de teclado para fora do diálogo.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CertificateModal } from '../src/components/CertificateModal'

afterEach(cleanup)

const renderModal = (props = {}) =>
  render(<CertificateModal open onClose={() => {}} {...props} />)

describe('CertificateModal', () => {
  // === Modal fechado / presença e acessibilidade ===

  it('não renderiza nada quando está fechado', () => {
    const { container } = render(<CertificateModal open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('se anuncia como diálogo modal, com título acessível', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('certificate-title')
    expect(document.getElementById('certificate-title')).toBeTruthy()
  })

  it('trava a rolagem do fundo ao abrir e devolve ao fechar', () => {
    const { rerender } = renderModal()
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<CertificateModal open={false} onClose={() => {}} />)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  // === Foco: entrada no diálogo ===

  it('move o foco para dentro do diálogo ao abrir', () => {
    renderModal()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })

  // === Fechamento: Esc e clique no backdrop ===

  it('fecha com a tecla Esc', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('não fecha com outras teclas', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('fecha ao clicar na área escura, mas não ao clicar no certificado', () => {
    const onClose = vi.fn()
    const { container } = renderModal({ onClose })

    // O listener de fechamento vive no overlay (raiz do diálogo): clique
    // dentro do certificado é filho e não pode fechar.
    fireEvent.click(container.firstChild)
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(document.getElementById('certificate-print'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // === Armadilha de foco (Tab / Shift+Tab) ===

  it('mantém o foco preso: Tab no último volta ao primeiro', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const buttons = [...dialog.querySelectorAll('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]

    last.focus()
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('mantém o foco preso: Shift+Tab no primeiro vai ao último', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const buttons = [...dialog.querySelectorAll('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  // === Dados exibidos (Kaus Australis) ===

  it('exibe os dados reais de Kaus Australis', () => {
    renderModal()
    const text = document.body.textContent
    expect(text).toContain('Geovanna Beatriz Santos Trindade')
    expect(text).toContain('Kaus Australis')
    expect(text).toContain('18h 24m 10.32s')
    expect(text).toContain('−34° 23′ 04.62″')
  })
})