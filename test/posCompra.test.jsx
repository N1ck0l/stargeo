import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Depois de pagar: a tela de obrigado e o rastreio levam até a página
 * dedicada, onde o certificado está e o PDF sai na hora — o caminho que
 * funciona mesmo quando o e-mail atrasa (ou, hoje, nem sai).
 *
 * O bug que este arquivo impede de voltar: `in_process` (Pix/cartão ainda em
 * análise) aparecia como "Pagamento aprovado", e a pessoa esperava um
 * certificado que só sairia depois da confirmação.
 */

const estado = vi.hoisted(() => ({ respostas: [] }))

vi.mock('../loja/src/lib/api.js', async (original) => ({
  ...(await original()),
  rastrear: vi.fn(async () => ({ pedido: estado.respostas.shift() ?? estado.ultima })),
}))

const { default: Obrigado } = await import('../loja/src/pages/Obrigado.jsx')
const { default: Rastrear } = await import('../loja/src/pages/Rastrear.jsx')

const PEDIDO = {
  code: 'SG-AB3K-9ZXM',
  status: 'approved',
  statusLabel: 'Pagamento aprovado',
  produto: 'Certificado Digital',
  estrela: 'Kaus Australis',
  constelacao: 'Sagitário',
  paraQuem: 'Geovanna',
  valorCentavos: 4900,
  criadoEm: '2026-10-14T12:00:00Z',
  entregueEm: null,
  pendencia: null,
  pagina: null,
}

function responder(...pedidos) {
  estado.respostas = pedidos.map((p) => ({ ...PEDIDO, ...p }))
  estado.ultima = estado.respostas[estado.respostas.length - 1]
}

beforeEach(() => {
  localStorage.setItem('stellara:ultimo-pedido', JSON.stringify({ code: PEDIDO.code, email: 'ana@exemplo.com' }))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

describe('obrigado', () => {
  it('pagamento em análise NÃO aparece como aprovado', async () => {
    responder({ status: 'in_process' })
    render(<Obrigado />)
    expect(await screen.findByText('Pagamento em análise')).toBeTruthy()
    expect(screen.queryByText('Pagamento aprovado')).toBeNull()
  })

  it('pago com a página pronta: o botão principal abre a página da estrela', async () => {
    responder({ pagina: 'SG-AB3K-9ZXM' })
    render(<Obrigado />)
    const link = await screen.findByRole('link', { name: /Abrir a página da estrela/i })
    expect(link.getAttribute('href')).toBe('/p/SG-AB3K-9ZXM')
  })

  it('pago sem página ainda: avisa que atualiza sozinho e volta a consultar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    responder({ pagina: null }, { pagina: 'SG-AB3K-9ZXM' })
    render(<Obrigado />)

    expect(await screen.findByText(/atualiza sozinha/i)).toBeTruthy()
    await vi.advanceTimersByTimeAsync(4100)
    expect(await screen.findByRole('link', { name: /Abrir a página da estrela/i })).toBeTruthy()
  })

  it('recusado oferece tentar de novo', async () => {
    responder({ status: 'rejected' })
    render(<Obrigado />)
    expect(await screen.findByText('Pagamento não aprovado')).toBeTruthy()
  })
})

describe('rastreio', () => {
  const consultar = () => {
    render(<Rastrear />)
    fireEvent.change(screen.getByLabelText(/Código do pedido/i), { target: { value: PEDIDO.code } })
    fireEvent.change(screen.getByLabelText(/E-mail da compra/i), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Consultar pedido/i }))
  }

  it('com a página publicada, leva até ela para baixar o PDF', async () => {
    responder({ pagina: 'SG-AB3K-9ZXM' })
    consultar()
    const link = await screen.findByRole('link', { name: /Abrir a página da estrela/i })
    expect(link.getAttribute('href')).toBe('/p/SG-AB3K-9ZXM')
  })

  it('pedido em análise não pinta de verde nem oferece a página', async () => {
    responder({ status: 'in_process', statusLabel: 'Pagamento em análise' })
    consultar()
    const selo = await screen.findByText('Pagamento em análise')
    expect(selo.className).toMatch(/amber/)
    expect(screen.queryByRole('link', { name: /Abrir a página da estrela/i })).toBeNull()
  })
})
