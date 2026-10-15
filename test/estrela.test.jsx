import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Estrela from '../loja/src/pages/Estrela.jsx'
import { textosDaEstrela } from '../netlify/edge-functions/estrela-og.ts'

/**
 * Página pública de uma estrela (`/estrelas/<slug>`) — a porta de entrada
 * pela busca. Sem Supabase nos testes, o catálogo cai nas 12 curadas.
 */
afterEach(() => {
  cleanup()
  document.title = ''
})

describe('página pública da estrela', () => {
  it('mostra a história, os dados, o preço e o caminho para dedicar', async () => {
    render(<Estrela slug="antares" />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Antares' })).toBeTruthy()
    expect(screen.getByText(/visível de todo o Brasil|visível do norte/)).toBeTruthy()
    const dedicar = screen.getByRole('link', { name: /Dedicar Antares a alguém/ })
    expect(dedicar.getAttribute('href')).toBe('/produto/certificado-digital?estrela=antares')
    // O título da aba vira o da estrela (o Google lê depois do JavaScript).
    await waitFor(() => expect(document.title).toMatch(/^Antares, em Escorpião/))
  })

  it('estrela que não existe não quebra a tela', async () => {
    render(<Estrela slug="nao-existe" />)
    expect(await screen.findByText('Estrela não encontrada')).toBeTruthy()
  })
})

describe('prévia da estrela para robôs (edge function)', () => {
  it('título com nome e constelação; descrição cabe na busca', () => {
    const { titulo, descricao } = textosDaEstrela({
      name: 'Antares', constellation: 'Escorpião', story: 'x '.repeat(200), status: 'disponivel',
    })
    expect(titulo).toBe('Antares, em Escorpião · Dedique esta estrela | Stellara')
    expect(descricao.length).toBeLessThanOrEqual(160)
  })

  it('estrela dedicada não é oferecida', () => {
    const { descricao } = textosDaEstrela({ name: 'Vega', constellation: 'Lira', status: 'dedicada' })
    expect(descricao).toMatch(/já foi dedicada/)
  })
})
