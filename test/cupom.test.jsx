import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** Cupom no configurador: mostra o desconto antes de pagar (o servidor decide). */
vi.mock('../loja/src/lib/catalogo.js', async (original) => ({
  ...(await original()),
  consultarCupom: vi.fn(async (codigo) =>
    String(codigo).toUpperCase() === 'MARIA15' ? { codigo: 'MARIA15', tipo: 'percentual', valor: 15, descricao: 'Parceria com a Maria' } : null,
  ),
}))

const { default: Produto } = await import('../loja/src/pages/Produto.jsx')

afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

describe('cupom no configurador', () => {
  it('cupom válido entra no resumo e no total', async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius')
    render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText('Cupom de desconto'), { target: { value: 'maria15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    // R$ 249 com 15%: R$ 211 (para baixo até o real).
    expect(await screen.findByRole('button', { name: /Finalizar · R\$ 211/ })).toBeTruthy()
    expect(screen.getByText(/Cupom aplicado — Parceria com a Maria/)).toBeTruthy()
    expect(screen.getByText('− R$ 38')).toBeTruthy()
  })

  it('o link de parceria já chega com o cupom aplicado', async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius&cupom=MARIA15')
    render(<Produto slug="certificado-digital" />)
    expect(await screen.findByRole('button', { name: /Finalizar · R\$ 211/ })).toBeTruthy()
  })

  it('cupom inválido avisa e o preço não muda', async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=sirius')
    render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText('Cupom de desconto'), { target: { value: 'NAOEXISTE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByText(/não é válido/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Finalizar · R\$ 249/ })).toBeTruthy()
  })
})
