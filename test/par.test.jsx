import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Produto from '../loja/src/pages/Produto.jsx'

/** Várias estrelas no configurador (sem banco: as 12 curadas). */
afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

/** Adiciona uma pessoa, dá o nome e escolhe a estrela pelo explorador dela. */
async function adicionarPessoa(nome, estrela) {
  fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar/ }))
  const campos = screen.getAllByLabelText(/^Nome da pessoa/)
  fireEvent.change(campos[campos.length - 1], { target: { value: nome } })
  // O explorador da pessoa abre sozinho ao adicionar: é a última busca da tela.
  const buscas = screen.getAllByRole('searchbox')
  fireEvent.change(buscas[buscas.length - 1], { target: { value: estrela.toLowerCase() } })
  const opcoes = await screen.findAllByRole('button', { name: new RegExp(`^${estrela}`) })
  fireEvent.click(opcoes[opcoes.length - 1])
}

describe('mais de uma estrela no configurador', () => {
  it('par: total com 10% e as duas folhas se citam', { timeout: 15000 }, async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius')
    const { container } = render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Helena' } })
    await adicionarPessoa('Pedro', 'Vega')

    // Sirius (R$ 249) + Vega (R$ 249) = R$ 498, com 10%: R$ 448.
    expect(screen.getByRole('button', { name: /Finalizar · R\$ 448/ })).toBeTruthy()
    expect(screen.getByText(/Desconto de 2 estrelas \(10%\)/)).toBeTruthy()
    // A prévia passa para a folha de quem acabou de ganhar a estrela.
    expect(await screen.findByText(/Em par com Sirius, dedicada a Helena/, {}, { timeout: 8000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Folha de Helena' }))
    expect(container.textContent).toContain('Em par com Vega, dedicada a Pedro')
  })

  it('três estrelas: 15%, nome do grupo na linha da folha, e remover volta ao preço do par', { timeout: 20000 }, async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius')
    const { container } = render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/), { target: { value: 'Helena' } })
    await adicionarPessoa('Pedro', 'Vega')
    await adicionarPessoa('Lia', 'Antares')

    // 249 + 249 + 249 = R$ 747, com 15%: R$ 634 (para baixo até o real).
    expect(screen.getByRole('button', { name: /Finalizar · R\$ 634/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Nome do grupo/), { target: { value: 'Família Souza' } })
    await screen.findByText(/Uma das três estrelas · Família Souza/, {}, { timeout: 8000 })
    expect(container.textContent).toContain('Uma das três estrelas · Família Souza')

    const pessoa3 = screen.getByText('Pessoa 3').closest('li')
    fireEvent.click(within(pessoa3).getByRole('button', { name: 'Remover' }))
    expect(screen.getByRole('button', { name: /Finalizar · R\$ 448/ })).toBeTruthy()
  })
})
