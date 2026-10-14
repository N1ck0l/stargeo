import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExploradorDeEstrelas } from '../loja/src/components/ExploradorDeEstrelas.jsx'
import Catalogo from '../loja/src/pages/Catalogo.jsx'
import { comoSeVe, normalizar, reais } from '../loja/src/lib/catalogo.js'
import { projetarCeu } from '../shared/certificado/mapa.js'
import { CONSTELACOES } from '../shared/constelacoes.js'
import { getStar } from '../shared/stars.js'

/**
 * O catálogo completo (~118 mil estrelas). Sem Supabase nos testes, a busca
 * cai nas 12 curadas — o comportamento da tela é o mesmo.
 */

afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

describe('explorador de estrelas', () => {
  it('lista estrelas livres com preço e escolhe uma', async () => {
    let escolhida = null
    render(<ExploradorDeEstrelas aoEscolher={(e) => (escolhida = e)} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'antares' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Antares/ }))
    expect(escolhida.slug).toBe('antares')
    expect(escolhida.precoCentavos).toBeGreaterThan(0)
  })

  it('o nome de uma constelação vira filtro ("Escorpião" → Scorpius)', async () => {
    render(<ExploradorDeEstrelas aoEscolher={() => {}} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'escorpiao' } })
    expect(await screen.findByText(/em Escorpião/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Antares/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Vega/ })).toBeNull()
  })

  it('filtra por faixa de preço', async () => {
    render(<ExploradorDeEstrelas aoEscolher={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Nomeada/ }))
    // Kaus Australis (mag 1,85) é "nomeada"; Sirius (mag -1,46) é "lendária".
    expect(await screen.findByRole('button', { name: /^Kaus Australis/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Sirius/ })).toBeNull()
  })
})

describe('vitrine de abertura', () => {
  it('sem busca, mostra estrelas de mais de uma faixa de preço', async () => {
    render(<ExploradorDeEstrelas aoEscolher={() => {}} />)
    expect(await screen.findByText(/Uma amostra de cada faixa/)).toBeTruthy()
    const precos = new Set(
      (await screen.findAllByRole('button', { pressed: false }))
        .map((b) => b.textContent.match(/R\$ \d+/)?.[0])
        .filter(Boolean),
    )
    // Modo sem banco: as curadas são lendárias (R$ 249) e nomeadas (R$ 149).
    expect(precos.size).toBeGreaterThan(1)
  })
})

describe('página do catálogo', () => {
  it('explica as cinco faixas e leva ao produto com a estrela escolhida', async () => {
    render(<Catalogo />)
    for (const faixa of ['Lendária', 'Nomeada', 'Brilhante', 'Visível', 'Profunda']) {
      expect(screen.getAllByText(faixa).length).toBeGreaterThan(0)
    }
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'vega' } })
    fireEvent.click(await screen.findByRole('button', { name: /^Vega/ }))
    expect(window.location.pathname).toBe('/produto/certificado-digital')
    expect(window.location.search).toBe('?estrela=vega')
  })
})

describe('mapa do céu de qualquer estrela', () => {
  it('Betelgeuse (fora das 12 curadas): estrelas reais e a figura de Órion em destaque', () => {
    const betelgeuse = { ra: 5.919529, dec: 7.407064, sigla: 'Ori' }
    const ceu = projetarCeu(betelgeuse, { cx: 0, cy: 0, r: 25 })
    expect(ceu.estrelas.length).toBeGreaterThan(30)
    expect(ceu.linhas.length).toBeGreaterThan(5)
    // Tudo dentro do círculo.
    for (const { x, y } of ceu.estrelas) expect(x * x + y * y).toBeLessThanOrEqual(25 * 25 + 1e-6)
  })

  it('sem sigla, as linhas do campo entram todas como vizinhas', () => {
    const ceu = projetarCeu({ ra: 5.919529, dec: 7.407064 }, { cx: 0, cy: 0, r: 25 })
    expect(ceu.linhas).toHaveLength(0)
    expect(ceu.linhasVizinhas.length).toBeGreaterThan(5)
  })
})

describe('dados do catálogo', () => {
  it('as 88 constelações, cada uma com nome em português e genitivo', () => {
    expect(CONSTELACOES).toHaveLength(88)
    expect(new Set(CONSTELACOES.map((c) => c.sigla)).size).toBe(88)
    for (const c of CONSTELACOES) expect(c.pt && c.genitivo && c.latim).toBeTruthy()
  })

  it('normaliza a estrela curada com faixa, preço e estado', () => {
    const sirius = normalizar(getStar('sirius'))
    expect(sirius).toMatchObject({ faixa: 'lendaria', status: 'disponivel', sigla: 'CMa' })
    expect(reais(sirius.precoCentavos)).toBe('R$ 249')
  })

  it('normaliza a linha do banco, com distância desconhecida como null', () => {
    const linha = {
      slug: 'hip-1', name: 'HD 224700', bayer: 'HIP 1', constellation: 'Peixes', constellation_latin: 'Pisces',
      sigla: 'Psc', spectral_type: 'F5', ra_hours: 0.0001, dec_degrees: 1.089, magnitude: 9.1, distance_ly: null,
      story: 'x', best_month: 'Agosto a outubro', faixa: 'profunda', price_cents: 4900, status: 'disponivel',
    }
    expect(normalizar(linha)).toMatchObject({ slug: 'hip-1', distanceLy: null, precoCentavos: 4900, ra: 0.0001 })
  })

  it('descreve o brilho em palavras', () => {
    expect(comoSeVe(-1.46)).toMatch(/mais brilhantes/)
    expect(comoSeVe(5.5)).toMatch(/olho nu/)
    expect(comoSeVe(9.1)).toMatch(/telescópio/)
  })
})
