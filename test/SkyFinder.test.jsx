/**
 * Localizador de estrela pelo céu (Mira): contrato de diálogo modal —
 * presença ARIA, trava de rolagem, ciclo de foco e fechamento com Esc.
 * O motivo de o overlay ter virado modal está no bloco abaixo.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkyFinder } from '../loja/src/pagina/secoes/SkyFinder'

afterEach(cleanup)

const renderFinder = (props = {}) => render(<SkyFinder onClose={() => {}} {...props} />)

/*
 * A Mira cobre a tela inteira e pede câmera, bússola e localização, mas não se
 * comportava como diálogo: sem Esc, sem foco preso, sem trava de rolagem, e
 * sem `role="dialog"` — o teclado vazava para os botões do site por baixo do
 * overlay, que continuam clicáveis e focalizáveis.
 */
describe('SkyFinder como diálogo modal', () => {
  it('se anuncia como diálogo modal, com nome acessível', () => {
    renderFinder()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBeTruthy()
  })

  it('trava a rolagem do fundo', () => {
    renderFinder()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('devolve a rolagem e o foco ao fechar', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { unmount } = renderFinder()
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('move o foco para dentro ao abrir', () => {
    renderFinder()
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('fecha com a tecla Esc', () => {
    const onClose = vi.fn()
    renderFinder({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mantém o foco preso: Tab no último volta ao primeiro', () => {
    renderFinder()
    const dialog = screen.getByRole('dialog')
    const buttons = [...dialog.querySelectorAll('button')]
    const first = buttons[0]
    const last = buttons[buttons.length - 1]

    last.focus()
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('não deixa o foco escapar para fora do diálogo', () => {
    renderFinder()
    const dialog = screen.getByRole('dialog')

    // Simula o Tab do navegador: o elemento focado não está mais no overlay.
    document.body.focus()
    fireEvent.keyDown(document, { key: 'Tab' })

    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})
