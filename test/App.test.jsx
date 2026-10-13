import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../src/App'

afterEach(cleanup)

describe('App', () => {
  it('monta todas as seções', () => {
    render(<App />)
    expect(document.getElementById('inicio')).toBeTruthy()
    expect(document.getElementById('ceu')).toBeTruthy()
    expect(document.getElementById('estrela')).toBeTruthy()
    expect(document.getElementById('carta')).toBeTruthy()
  })

  it('abre o certificado a partir de qualquer botão da página', () => {
    render(<App />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    fireEvent.click(screen.getByText('Visualizar Certificado Digital'))
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
  })

  it('dedica a estrela ao nome completo de Geovanna', () => {
    render(<App />)
    const text = document.body.textContent
    expect(text).toContain('Geovanna Beatriz Santos Trindade')
    expect(text).toContain('Kaus Australis')
    expect(text).toContain('Sagitário')
  })

  it('oferece uma alternativa textual ao mapa desenhado em canvas', () => {
    const { container } = render(<App />)
    // O primeiro canvas da página é o campo de estrelas, que não é interativo.
    const canvas = screen.getByRole('application')
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas.getAttribute('tabindex')).toBe('0')

    // O conteúdo pintado no canvas não existe para leitores de tela, então a
    // lista textual precisa cobrir as estrelas da constelação.
    const describedBy = canvas.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy)).toBeTruthy()
    expect(container.textContent).toContain('Albaldah')
    expect(container.textContent).toContain('Kaus Borealis')
  })

  it('mostra a variação de magnitude catalogada, em vez de um número solto', () => {
    render(<App />)
    expect(document.body.textContent).toMatch(/1,79\s*–\s*1,85/)
  })
})