import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Produto from '../loja/src/pages/Produto.jsx'

/** Par de estrelas no configurador (sem banco: as 12 curadas). */
afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

describe('par de estrelas no configurador', () => {
  it('pede a segunda pessoa e a segunda estrela; o total é a soma e as duas folhas se citam', { timeout: 15000 }, async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius')
    const { container } = render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Helena' } })
    fireEvent.click(screen.getByLabelText(/Dar um par de estrelas/))
    fireEvent.change(screen.getByLabelText(/Nome da segunda pessoa/), { target: { value: 'Pedro' } })

    const buscas = screen.getAllByRole('searchbox')
    fireEvent.change(buscas[1], { target: { value: 'vega' } })
    const vegas = await screen.findAllByRole('button', { name: /^Vega/ })
    fireEvent.click(vegas[vegas.length - 1])

    // Sirius (R$ 249) + Vega (R$ 249) = R$ 498, com 10% do par: R$ 448.
    expect(screen.getByRole('button', { name: /Finalizar · R\$ 448/ })).toBeTruthy()
    expect(screen.getByText(/Desconto do par \(10%\)/)).toBeTruthy()
    expect(screen.getByText('Segunda estrela')).toBeTruthy()
    // A prévia passa para a folha da segunda pessoa, citando a primeira.
    expect(await screen.findByText(/Em par com Sirius, dedicada a Helena/, {}, { timeout: 8000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Folha de Helena' }))
    expect(container.textContent).toContain('Em par com Vega, dedicada a Pedro')
  })
})
