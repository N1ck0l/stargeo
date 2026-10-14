/**
 * Mapa do céu sob `prefers-reduced-motion: reduce`: todo comando (botões e
 * teclado) precisa redesenhar o canvas na hora, sem depender do laço de
 * animação. Regressão de bug: com movimento reduzido a vista "mudava" mas
 * nada era repintado. A métrica de redesenho está explicada no bloco abaixo.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SkyMap } from '../loja/src/pagina/secoes/SkyMap'

/*
 * O ambiente de teste reporta `prefers-reduced-motion: reduce` (ver setup.js),
 * que é exatamente o cenário que estava quebrado: sem laço de animação, os
 * botões e o teclado mudavam a vista sem redesenhar nada na tela.
 *
 * O jeito de observar isso é contar os quadros realmente pintados. O jsdom não
 * desenha, mas todo `draw` começa com um `clearRect` — então contar `clearRect`
 * é contar redesenhos de verdade, e não chamadas de React.
 */
let frames = 0

beforeAll(() => {
  /*
   * Contexto de canvas próprio, em vez de involve o mock do setup.js: o que
   * importa aqui é contar `clearRect`, e um proxy que delega recursa quando o
   * valor original já é um spy.
   */
  const noop = () => {}
  const counting = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'clearRect') return () => { frames += 1 }
        if (prop === 'measureText') return () => ({ width: 10 })
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
          return () => ({ addColorStop: noop })
        }
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
        return typeof prop === 'string' ? noop : undefined
      },
      set: () => true,
    },
  )
  HTMLCanvasElement.prototype.getContext = vi.fn(() => counting)
})

afterEach(() => {
  cleanup()
  frames = 0
})

describe('SkyMap sob movimento reduzido', () => {
  it('redesenha quando o zoom muda pelos botões', () => {
    render(<SkyMap onOpenCertificate={() => {}} />)
    frames = 0

    fireEvent.click(screen.getByRole('button', { name: /aproximar/i }))

    expect(frames).toBeGreaterThan(0)
  })

  it('redesenha quando o mapa é movido pelo teclado', () => {
    render(<SkyMap onOpenCertificate={() => {}} />)
    const canvas = screen.getByRole('application')
    frames = 0

    fireEvent.keyDown(canvas, { key: 'ArrowRight' })

    expect(frames).toBeGreaterThan(0)
  })

  it('redesenha ao aproximar com a tecla de mais', () => {
    render(<SkyMap onOpenCertificate={() => {}} />)
    const canvas = screen.getByRole('application')
    frames = 0

    fireEvent.keyDown(canvas, { key: '+' })

    expect(frames).toBeGreaterThan(0)
  })

  it('redesenha ao recentrar com a tecla 0', () => {
    render(<SkyMap onOpenCertificate={() => {}} />)
    const canvas = screen.getByRole('application')
    frames = 0

    fireEvent.keyDown(canvas, { key: '0' })

    expect(frames).toBeGreaterThan(0)
  })

  it('anuncia os comandos de teclado que o mapa realmente obedece', () => {
    render(<SkyMap onOpenCertificate={() => {}} />)
    const canvas = screen.getByRole('application')
    const describedBy = canvas.getAttribute('aria-describedby')

    expect(document.getElementById(describedBy).textContent).toMatch(/setas/i)
  })
})
