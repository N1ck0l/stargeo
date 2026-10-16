import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Loja from '../loja/src/App.jsx'
import Produto from '../loja/src/pages/Produto.jsx'

/**
 * Clareza para quem decide rápido: o produto em três passos no topo, o FAQ
 * por assunto e as etapas da compra na ordem da decisão (estrela primeiro).
 */
afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

describe('home', () => {
  it('explica o produto em três passos logo no topo', () => {
    render(<Loja />)
    for (const passo of ['Escolha uma estrela', 'Personalize a homenagem', 'Receba o certificado']) {
      expect(screen.getByText(passo)).toBeTruthy()
    }
  })

  it('o FAQ abre no assunto "O produto" e troca de assunto sem listar tudo de uma vez', () => {
    render(<Loja />)
    const assuntos = screen.getByRole('group', { name: 'Assunto das perguntas' })
    expect(within(assuntos).getByRole('button', { name: 'O produto' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Isso é uma estrela de verdade?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'E se eu errar o nome?' })).toBeNull()

    fireEvent.click(within(assuntos).getByRole('button', { name: 'Depois da compra' }))
    expect(screen.getByRole('button', { name: 'E se eu errar o nome?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Isso é uma estrela de verdade?' })).toBeNull()
  })
})

describe('personalização em etapas', () => {
  it('as etapas seguem a ordem da decisão, com a estrela primeiro', () => {
    render(<Produto slug="certificado-digital" />)
    const etapas = within(screen.getByRole('navigation', { name: 'Etapas da compra' })).getAllByRole('link')
    expect(etapas.map((e) => e.textContent.replace(/^\d|✓/, ''))).toEqual(['Estrela', 'Para quem', 'Mensagem', 'Carta', 'Dados', 'Pagar'])
    // Cada etapa aponta para uma seção que existe.
    for (const e of etapas) expect(document.querySelector(e.getAttribute('href'))).toBeTruthy()

    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titulos.indexOf('1Escolha a estrela')).toBeLessThan(titulos.indexOf('2Para quem é o certificado?'))
  })
})
