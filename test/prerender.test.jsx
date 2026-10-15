import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderizarCascaDoProduto } from '../loja/src/prerender.jsx'
import Loja from '../loja/src/App.jsx'

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
    // O formulário (pacote sob demanda) sai como espaço reservado com a altura
    // da tela: o rodapé não aparece e depois pula.
    expect(html).toContain('min-h-dvh')
    expect(html).not.toContain('Etapas da compra')
  })

  it('na loja, o título fica FORA do pacote do produto: aparece antes do formulário carregar', async () => {
    window.history.pushState(null, '', '/produto/certificado-digital')
    render(<Loja />)
    // Síncrono: o título não espera o pacote sob demanda.
    expect(screen.getByRole('heading', { level: 1, name: 'Monte o seu certificado' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Trilha' })).toBeTruthy()
    // E o formulário chega depois, logo abaixo.
    expect(await screen.findByRole('navigation', { name: 'Etapas da compra' })).toBeTruthy()
  })

  it('produto que não existe não ganha o título de compra', async () => {
    window.history.pushState(null, '', '/produto/nao-existe')
    render(<Loja />)
    expect(await screen.findByText('Certificado não encontrado')).toBeTruthy()
    expect(screen.queryByText('Monte o seu certificado')).toBeNull()
  })
})
