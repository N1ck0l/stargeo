import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as ceu from '../shared/ceu.js'
import { hammer, projetarCeuInteiro } from '../shared/ceuInteiro.js'
import { linhaDoGrupo } from '../shared/grupo.js'
import { MapaCeuInteiro } from '../loja/src/components/MapaCeuInteiro.jsx'

afterEach(cleanup)

describe('linha do grupo no certificado', () => {
  it('par cita a outra pessoa; 3+ conta as estrelas e usa o nome do grupo', () => {
    expect(linhaDoGrupo({ total: 2, outros: [{ estrela: 'Altair', nome: 'Pedro' }] })).toBe('Em par com Altair, dedicada a Pedro')
    expect(linhaDoGrupo({ total: 4, nome: 'Família Souza', outros: [] })).toBe('Uma das quatro estrelas · Família Souza')
    expect(linhaDoGrupo({ total: 3, nome: '', outros: [] })).toBe('Uma das três estrelas dedicadas juntas')
    expect(linhaDoGrupo({ total: 1, outros: [] })).toBe('')
  })
})

describe('céu inteiro (projeção de Hammer)', () => {
  it('o céu cabe na elipse, norte em cima e leste à esquerda', () => {
    const polo = hammer(0, 90)
    expect(polo.y).toBeCloseTo(Math.SQRT2, 5)
    const centro = hammer(12, 0)
    expect(centro.x).toBeCloseTo(0, 5)
    // Ascensão reta maior fica mais à ESQUERDA (leste), como olhando para cima.
    expect(hammer(14, 0).x).toBeLessThan(hammer(10, 0).x)
    for (const [ra, dec] of ceu.ESTRELAS) {
      const { x, y } = hammer(ra, dec)
      expect((x * x) / 8 + (y * y) / 2).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('nenhum traço de constelação atravessa o mapa pela costura', () => {
    const mapa = projetarCeuInteiro(ceu, [], 720)
    expect(mapa.linhas.length).toBeGreaterThan(500)
    for (const [x1, , x2] of mapa.linhas) expect(Math.abs(x1 - x2)).toBeLessThan(360)
  })

  it('o mapa marca as estrelas do grupo com o nome de cada pessoa', () => {
    render(
      <MapaCeuInteiro
        ceu={ceu}
        estrelas={[
          { ra: 18.6, dec: 38.8, rotulo: 'Helena', nome: 'Vega' },
          { ra: 6.4, dec: -52.7, rotulo: 'Pedro', nome: 'Canopus' },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: /2 estrelas marcadas: Helena \(Vega\), Pedro \(Canopus\)/ })).toBeTruthy()
    expect(screen.getByText('Helena')).toBeTruthy()
  })
})
