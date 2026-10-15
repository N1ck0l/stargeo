import { describe, expect, it } from 'vitest'
import { vendasEmCsv } from '../loja/src/admin/csv.js'
import { limparTexto } from '../loja/src/lib/erros.js'
import { normalizarCupom, resumirVendas } from '../supabase/functions/admin-api/negocio.ts'

/** Cupons, relatório para o contador e registro de erros (migration 0022). */

const venda = (extra) => ({
  id: 'p1', code: 'SG-AAAA-AAAA', group_id: null, status: 'approved', paid_at: '2026-10-15T15:30:00Z',
  customer_name: 'Ana Lima', customer_email: 'ana@exemplo.com', customer_doc: null, honoree_name: 'Helena',
  star_slug: 'vega', amount_cents: 24900, desconto_cupom_cents: 0, cupom: null, payment_method: 'pix',
  payment_id: '123', stars: { name: 'Vega', faixa: 'lendaria' }, ...extra,
})

describe('relatório de vendas', () => {
  it('receita só dos pagos; um grupo é UMA compra; reembolsos à parte', () => {
    const r = resumirVendas([
      venda({ id: 'p1', group_id: 'g1', amount_cents: 22400 }),
      venda({ id: 'p2', group_id: 'g1', amount_cents: 22400, star_slug: 'altair' }),
      venda({ id: 'p3', amount_cents: 4900, stars: { name: 'HD 1', faixa: 'profunda' }, payment_method: 'credit_card', desconto_cupom_cents: 500, cupom: 'X10' }),
      venda({ id: 'p4', status: 'refunded', amount_cents: 6900 }),
    ])
    expect(r).toMatchObject({
      estrelas: 3,
      compras: 2,
      receitaCentavos: 49700,
      ticketMedioCentavos: 24850,
      descontoCupomCentavos: 500,
      devolvidas: 1,
      devolvidoCentavos: 6900,
    })
    expect(r.porFaixa).toEqual({ lendaria: { estrelas: 2, receitaCentavos: 44800 }, profunda: { estrelas: 1, receitaCentavos: 4900 } })
    expect(r.porMetodo).toEqual({ pix: 44800, credit_card: 4900 })
  })

  it('a planilha abre no Excel em português: ; como separador, vírgula decimal, BOM', () => {
    const csv = vendasEmCsv([venda({ amount_cents: 22450 })])
    expect(csv.startsWith('﻿')).toBe(true)
    const [cabecalho, linha] = csv.slice(1).trim().split('\r\n')
    expect(cabecalho.split(';')).toContain('Valor pago (R$)')
    expect(linha).toContain(';224,50;')
    expect(linha).toContain('15/10/2026 12:30') // horário de Brasília
    expect(linha).toContain(';Pago;')
  })

  it('texto do cliente não vira fórmula na planilha', () => {
    const csv = vendasEmCsv([venda({ customer_name: '=HYPERLINK("http://x")', honoree_name: 'Ana; Bia' })])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain('"Ana; Bia"')
  })
})

describe('cupom no painel', () => {
  it('normaliza: código em maiúsculas, valor fixo em reais vira centavos', () => {
    expect(normalizarCupom({ codigo: 'lancamento10', tipo: 'percentual', valor: '10' })).toMatchObject({
      codigo: 'LANCAMENTO10', tipo: 'percentual', valor: 10, ativo: true, max_usos: null,
    })
    expect(normalizarCupom({ codigo: 'MENOS15', tipo: 'valor', valor: '15' }).valor).toBe(1500)
  })

  it('recusa código com espaço, percentual acima de 50 e validade invertida', () => {
    expect(() => normalizarCupom({ codigo: 'com espaço', tipo: 'percentual', valor: 10 })).toThrow(/Código/)
    expect(() => normalizarCupom({ codigo: 'X60', tipo: 'percentual', valor: 60 })).toThrow(/50%/)
    expect(() =>
      normalizarCupom({ codigo: 'DATAS', tipo: 'percentual', valor: 5, valido_de: '2026-12-01', valido_ate: '2026-11-01' }),
    ).toThrow(/validade/)
  })
})

describe('erros do site sem dado pessoal', () => {
  it('apaga e-mail, código de pedido, números longos e querystring', () => {
    const limpo = limparTexto(
      'Falha para ana.lima@exemplo.com no pedido SG-AB3K-9ZXM (tel 11987654321) em https://stellara.com.br/p/x?cupom=MARIA#acesso=abc',
      300,
    )
    expect(limpo).not.toMatch(/ana\.lima|AB3K|987654321|MARIA|acesso/)
    expect(limpo).toContain('[email]')
    expect(limpo).toContain(':codigo')
  })
})
