import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { aindaGuardada, hojeEmBrasilia, validarRevelacao } from '../supabase/functions/_shared/datas.ts'
import { PaginaGuardada } from '../loja/src/pagina/PaginaGuardada.jsx'
import Produto from '../loja/src/pages/Produto.jsx'

/**
 * Revelação na data (migration 0019): o certificado chega na hora para quem
 * compra; a página da estrela fica guardada até o dia escolhido.
 */
afterEach(cleanup)

// 15/10/2026, 02:00 em UTC = ainda 14/10 em Brasília (UTC−3).
const MADRUGADA_UTC = new Date('2026-10-15T02:00:00Z')

describe('datas da revelação (servidor)', () => {
  it('"hoje" é o de Brasília, não o do servidor', () => {
    expect(hojeEmBrasilia(MADRUGADA_UTC)).toBe('2026-10-14')
  })

  it('aceita uma data futura de até um ano; hoje ou antes é revelar já', () => {
    expect(validarRevelacao('2026-12-24', MADRUGADA_UTC)).toEqual({ data: '2026-12-24' })
    expect(validarRevelacao('2026-10-14', MADRUGADA_UTC)).toEqual({ data: null })
    expect(validarRevelacao('', MADRUGADA_UTC)).toEqual({ data: null })
    expect(validarRevelacao('2028-01-01', MADRUGADA_UTC)).toHaveProperty('erro')
    expect(validarRevelacao('24/12/2026', MADRUGADA_UTC)).toHaveProperty('erro')
  })

  it('a página fica guardada até a meia-noite de Brasília do dia', () => {
    expect(aindaGuardada('2026-10-15', MADRUGADA_UTC)).toBe(true)
    expect(aindaGuardada('2026-10-15', new Date('2026-10-15T03:00:00Z'))).toBe(false)
    expect(aindaGuardada(null, MADRUGADA_UTC)).toBe(false)
  })
})

describe('página guardada', () => {
  it('mostra a contagem e a data, sem a estrela', () => {
    render(<PaginaGuardada revelaEm="2099-06-12" para="Helena" codigo="SG-AAAA-BBBB" />)
    expect(screen.getByRole('heading', { name: /Helena, uma estrela espera por você/ })).toBeTruthy()
    expect(screen.getByText(/12 de junho de 2099/)).toBeTruthy()
    expect(screen.getByLabelText('Tempo até a revelação')).toBeTruthy()
  })
})

describe('configurador', () => {
  it('guardar a surpresa pede a data e ela entra no resumo', () => {
    render(<Produto slug="certificado-digital" />)
    fireEvent.click(screen.getByLabelText(/Guardar a surpresa até uma data/))
    fireEvent.change(screen.getByLabelText('Revelar em'), { target: { value: '2099-12-24' } })
    expect(screen.getByText('Página revelada em')).toBeTruthy()
    expect(screen.getByText('24 de dezembro de 2099')).toBeTruthy()
  })
})
