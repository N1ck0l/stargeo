/**
 * Trilha Stellara: nada toca sozinho, o motor só carrega no primeiro toque,
 * pausa com um toque e lembra só o volume.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const motor = vi.hoisted(() => ({ iniciar: vi.fn(async () => {}), parar: vi.fn(), volume: vi.fn() }))
const criarMotor = vi.hoisted(() => vi.fn(() => motor))
vi.mock('../loja/src/lib/trilhaMotor.js', () => ({ criarMotor }))

const { TrilhaStellara } = await import('../loja/src/components/TrilhaStellara.jsx')

afterEach(cleanup)

describe('Trilha Stellara', () => {
  it('desligada por padrão: nenhum áudio é criado só por abrir a página', () => {
    render(<TrilhaStellara />)
    expect(screen.getByRole('button', { name: 'Tocar a Trilha Stellara' }).getAttribute('aria-pressed')).toBe('false')
    expect(criarMotor).not.toHaveBeenCalled()
  })

  it('um toque toca (com o volume guardado), outro pausa', async () => {
    render(<TrilhaStellara />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tocar a Trilha Stellara' }))
    })
    expect(criarMotor).toHaveBeenCalledTimes(1)
    expect(motor.iniciar).toHaveBeenCalled()
    expect(motor.volume).toHaveBeenCalledWith(0.35)
    const pausar = screen.getByRole('button', { name: 'Pausar a Trilha Stellara' })
    expect(pausar.getAttribute('aria-pressed')).toBe('true')
    await act(async () => {
      fireEvent.click(pausar)
    })
    expect(motor.parar).toHaveBeenCalled()
  })

  it('o volume muda na hora e fica guardado para a próxima visita', () => {
    render(<TrilhaStellara />)
    fireEvent.click(screen.getByRole('button', { name: 'Volume e informações da trilha' }))
    expect(screen.getByText(/composta ao vivo no seu navegador/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Volume da trilha'), { target: { value: '0.6' } })
    expect(motor.volume).toHaveBeenLastCalledWith(0.6)
    expect(localStorage.getItem('stellara:trilha-volume')).toBe('0.6')
  })
})
