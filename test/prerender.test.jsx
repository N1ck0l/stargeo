import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ErroDeTela } from '../loja/src/components/ErroDeTela.jsx'
import { renderizarCascaDoProduto, renderizarHome } from '../loja/src/prerender.jsx'
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

describe('home pronta no HTML', () => {
  it('traz o título e o texto de abertura', () => {
    const html = renderizarHome()
    expect(html).toContain('entre as estrelas')
    expect(html).toContain('Dedique uma estrela real a alguém especial')
  })

  it('o React APROVEITA o HTML: o título e o texto continuam sendo os mesmos nós', async () => {
    const raiz = document.createElement('div')
    raiz.innerHTML = renderizarHome()
    document.body.appendChild(raiz)
    const titulo = raiz.querySelector('h1')
    const abertura = raiz.querySelector('p.mt-6')
    let refeitas = 0
    let arvore
    await act(async () => {
      arvore = hydrateRoot(
        raiz,
        <StrictMode>
          <ErroDeTela>
            <Loja />
          </ErroDeTela>
        </StrictMode>,
        { onRecoverableError: () => (refeitas += 1) },
      )
    })
    expect(raiz.querySelector('h1')).toBe(titulo)
    expect(raiz.querySelector('p.mt-6')).toBe(abertura)
    // Só as duas folhas de exemplo (carregadas depois) são montadas no cliente.
    expect(refeitas).toBeLessThanOrEqual(2)
    // Desmonta antes de o teste acabar: trabalho pendente do React depois do
    // fim do ambiente vira erro solto no Vitest.
    await act(async () => arvore.unmount())
    raiz.remove()
  })
})

