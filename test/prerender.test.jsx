import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderizarCascaDoProduto } from '../loja/src/prerender.jsx'
import Produto from '../loja/src/pages/Produto.jsx'

/**
 * Casca pré-renderizada do produto (`produto.html`): o título vem pintado no
 * HTML, e o React aproveita cabeçalho, título e rodapé quando assume.
 */
afterEach(() => {
  cleanup()
  window.history.pushState(null, '', '/')
})

describe('casca do produto', () => {
  it('traz cabeçalho, trilha, título e rodapé no HTML', () => {
    window.history.pushState(null, '', '/produto/certificado-digital')
    const html = renderizarCascaDoProduto()
    expect(html).toContain('<h1 class="mb-8 font-display text-3xl text-ivory sm:text-4xl">Monte o seu certificado</h1>')
    expect(html).toContain('aria-label="Trilha"')
    expect(html).toContain('<header')
    expect(html).toContain('<footer')
    // O miolo fica em branco, com a altura da tela: o rodapé não aparece e pula.
    expect(html).toContain('min-h-dvh')
  })

  it('a página de verdade usa o MESMO título (nada muda de lugar ao assumir)', () => {
    const { container } = render(<Produto slug="certificado-digital" />)
    expect(container.querySelector('h1').outerHTML).toBe(
      '<h1 class="mb-8 font-display text-3xl text-ivory sm:text-4xl">Monte o seu certificado</h1>',
    )
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy()
  })
})
