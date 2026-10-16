/**
 * Senha do painel: "Esqueci minha senha", o link de recuperação e o "Trocar
 * senha". O Supabase Auth fica de fora (mock): aqui vale o que a tela faz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  sessao: null,
  pedirRecuperacao: vi.fn(async () => {}),
  definirNovaSenha: vi.fn(async () => {}),
}))

vi.mock('../loja/src/lib/admin.js', async (original) => {
  const real = await original()
  return {
    ...real,
    sessaoAtual: vi.fn(async () => auth.sessao),
    pedirRecuperacao: auth.pedirRecuperacao,
    definirNovaSenha: auth.definirNovaSenha,
    chamarAdmin: vi.fn(async () => new Promise(() => {})),
  }
})

const { AdminPagina } = await import('../loja/src/admin/AdminPagina.jsx')
const { chegouPeloLinkDeRecuperacao } = await import('../loja/src/lib/admin.js')

beforeEach(() => {
  auth.sessao = null
  window.history.replaceState(null, '', '/admin')
})
afterEach(() => vi.clearAllMocks())

const digitar = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })

describe('esqueci minha senha', () => {
  it('pede o e-mail e responde igual, exista a conta ou não', async () => {
    render(<AdminPagina />)
    fireEvent.click(await screen.findByRole('button', { name: 'Esqueci minha senha' }))
    digitar('E-mail', ' dono@exemplo.com ')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar o link' }))
    expect(await screen.findByText(/Se este e-mail tiver acesso ao painel/)).toBeTruthy()
    expect(auth.pedirRecuperacao).toHaveBeenCalledWith('dono@exemplo.com')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }))
    expect(screen.getByRole('heading', { name: 'Entrar no painel' })).toBeTruthy()
  })

  it('o link do e-mail abre a tela da senha nova, que confere tamanho e repetição', async () => {
    window.history.replaceState(null, '', '/admin#access_token=x&type=recovery')
    auth.sessao = { access_token: 'x', user: { email: 'dono@exemplo.com' } }
    render(<AdminPagina />)
    expect(await screen.findByRole('heading', { name: 'Criar uma nova senha' })).toBeTruthy()

    digitar('Nova senha', 'curta')
    digitar('Repita a nova senha', 'curta')
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar e entrar no painel' }).closest('form'))
    expect(await screen.findByText(/pelo menos 10 caracteres/i, { selector: '[role=alert]' })).toBeTruthy()

    digitar('Nova senha', 'uma frase bem longa')
    digitar('Repita a nova senha', 'uma frase bem longa')
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar e entrar no painel' }).closest('form'))
    expect(await screen.findByText('Senha nova salva.')).toBeTruthy()
    expect(auth.definirNovaSenha).toHaveBeenCalledWith('uma frase bem longa')
    // Depois, o painel — e o endereço sem o token.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stellara' })).toBeTruthy(), { timeout: 3000 })
    expect(window.location.hash).toBe('')
  })

  it('link vencido avisa no login', async () => {
    window.history.replaceState(null, '', '/admin#error=access_denied&error_code=otp_expired')
    render(<AdminPagina />)
    expect(await screen.findByText(/link de recuperação venceu/)).toBeTruthy()
  })

  it('lê o endereço do link', () => {
    window.history.replaceState(null, '', '/admin#access_token=a&type=recovery')
    expect(chegouPeloLinkDeRecuperacao()).toBe('recuperacao')
    window.history.replaceState(null, '', '/admin')
    expect(chegouPeloLinkDeRecuperacao()).toBeNull()
  })
})

describe('trocar senha no painel', () => {
  it('abre o formulário e salva', async () => {
    auth.sessao = { access_token: 'x', user: { email: 'dono@exemplo.com' } }
    render(<AdminPagina />)
    fireEvent.click(await screen.findByRole('button', { name: 'Trocar senha' }))
    digitar('Nova senha', 'outra frase bem longa')
    digitar('Repita a nova senha', 'outra frase diferente')
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar a nova senha' }).closest('form'))
    expect(await screen.findByText('As duas senhas não são iguais.')).toBeTruthy()
    digitar('Repita a nova senha', 'outra frase bem longa')
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar a nova senha' }).closest('form'))
    expect(await screen.findByText('Senha nova salva.')).toBeTruthy()
    expect(auth.definirNovaSenha).toHaveBeenCalledWith('outra frase bem longa')
  })
})
