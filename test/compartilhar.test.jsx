import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CompartilharPagina } from '../loja/src/components/CompartilharPagina.jsx'
import { mensagemDoPresente } from '../loja/src/lib/compartilhar.js'
import { QrCode } from '../loja/src/pagina/CartaoPresente.jsx'
import { entregasTravadas } from '../supabase/functions/admin-api/entregas.ts'

afterEach(cleanup)

describe('mandar o presente', () => {
  it('a mensagem do WhatsApp leva o link; com data marcada, não entrega a estrela', () => {
    const url = 'https://stellara.com.br/p/SG-AAAA-BBBB'
    expect(mensagemDoPresente({ url, para: 'Helena' })).toMatch(/^Helena, uma estrela no céu agora tem o seu nome/)
    const guardada = mensagemDoPresente({ url, para: 'Helena', revelaEm: '2026-12-24' })
    expect(guardada).toContain('24 de dezembro')
    expect(guardada).toContain(url)
  })

  it('o botão do WhatsApp abre o wa.me com a mensagem pronta', () => {
    render(<CompartilharPagina codigo="SG-AAAA-BBBB" para="Helena" />)
    const link = screen.getByRole('link', { name: 'Enviar pelo WhatsApp' })
    expect(link.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=Helena%2C/)
    expect(screen.getByRole('link', { name: 'Cartão com QR' }).getAttribute('href')).toBe('/p/SG-AAAA-BBBB/cartao')
  })

  it('o QR code sai como desenho vetorial, legível para leitores', () => {
    const { container } = render(<QrCode texto="https://stellara.com.br/p/SG-AAAA-BBBB" />)
    expect(container.querySelector('svg path').getAttribute('d').length).toBeGreaterThan(500)
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy()
  })
})

describe('entregas travadas (painel)', () => {
  const agora = Date.parse('2026-10-15T12:00:00Z')
  const base = { id: '1', code: 'SG-AAAA-BBBB', honoree_name: 'Ana', certificate_path: 'x.pdf', pages: [{ id: 'p' }] }

  it('pedido pago há mais de 10 minutos sem PDF ou sem página entra no alerta', () => {
    const lista = entregasTravadas(
      [
        { ...base, id: '1', created_at: '2026-10-15T11:00:00Z', certificate_path: null },
        { ...base, id: '2', created_at: '2026-10-15T11:00:00Z', pages: [] },
        { ...base, id: '3', created_at: '2026-10-15T11:00:00Z' },
        { ...base, id: '4', created_at: '2026-10-15T11:55:00Z', certificate_path: null },
      ],
      agora,
    )
    expect(lista.map((p) => [p.id, p.motivo])).toEqual([
      ['1', 'sem PDF'],
      ['2', 'sem página'],
    ])
  })
})
