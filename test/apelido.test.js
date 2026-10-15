import { describe, expect, it } from 'vitest'
import {
  colunasDoConteudo,
  conteudoDaLinha,
  conteudoDoPedido,
  validarConteudo,
} from '../supabase/functions/_shared/pagina.ts'

/**
 * Nome dado à estrela (migration 0016): do pedido para a página, e de volta
 * para as colunas. É dado da COMPRA — sai no certificado —, então o cliente
 * não o alcança pela edição (`CAMPOS_DO_CLIENTE`); só o admin corrige.
 */
const ESTRELA = {
  slug: 'vega', name: 'Vega', bayer: 'α Lyrae', constellation: 'Lira', magnitude: 0.03, story: 'A quinta mais brilhante.',
}

describe('nome dado à estrela na página', () => {
  it('nasce do pedido e aparece no título da estrela', () => {
    const c = conteudoDoPedido({ honoree_name: 'Helena Martins', code: 'SG-AAAA-BBBB', star_nickname: 'Nossa Luz' }, ESTRELA)
    expect(c.apelidoEstrela).toBe('Nossa Luz')
    expect(c.tituloEstrela).toBe('Vega, agora também “Nossa Luz”')
    expect(colunasDoConteudo(c).star_nickname).toBe('Nossa Luz')
  })

  it('sem nome dado, o título fica como antes e a coluna vai nula', () => {
    const c = conteudoDoPedido({ honoree_name: 'Helena Martins', code: 'SG-AAAA-BBBB' }, ESTRELA)
    expect(c.apelidoEstrela).toBe('')
    expect(c.tituloEstrela).toBe('Vega, agora também de Helena')
    expect(colunasDoConteudo(c).star_nickname).toBeNull()
  })

  it('volta da linha do banco para o conteúdo', () => {
    const linha = { honoree_name: 'Helena', from_name: null, star_nickname: 'Nossa Luz', code: 'SG-AAAA-BBBB', carta: [] }
    expect(conteudoDaLinha(linha).apelidoEstrela).toBe('Nossa Luz')
  })

  it('passa pela moderação e pelo teto de 40 caracteres', () => {
    expect(validarConteudo({ apelidoEstrela: 'Nossa Luz' })).toEqual([])
    expect(validarConteudo({ apelidoEstrela: 'x'.repeat(41) })).toHaveLength(1)
    expect(validarConteudo({ apelidoEstrela: 'me chama no zap 11 98765-4321' })).toHaveLength(1)
  })
})
