/**
 * A carta que acompanha o certificado (0023): a folha, o PDF, a moderação e
 * o caminho do pedido até a carta da página.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { desenharCarta } from '../shared/carta/desenho.js'
import { MM_POR_PT } from '../shared/certificado/desenho.js'
import { LIMITES, MAX_PARAGRAFOS_CARTA, paragrafosDaCarta, validarPedido } from '../shared/moderation.js'
import { buildLetterPdf } from '../shared/pdf.js'
import { conteudoDoPedido, validarConteudo } from '../supabase/functions/_shared/pagina.ts'
import { MODELOS_DE_CARTA } from '../loja/src/lib/carta.js'

const BASE = { honoreeName: 'Helena', customerName: 'Rafael Souza', customerEmail: 'rafael@exemplo.com' }

const paragrafo = 'Que esta estrela seja um lembrete eterno do lugar especial que você ocupa no meu universo, hoje e sempre, onde quer que a gente esteja.'
const casos = {
  curta: { paragrafos: 'Vó,\nObrigada por tudo.', fromName: 'Lia', starName: 'Vega', code: 'SG-AAAA-BBBB' },
  modelo: { paragrafos: MODELOS_DE_CARTA[0].texto, fromName: 'Com carinho, Rafael', starName: 'Alpha Centauri', code: 'SG-AAAA-BBBB' },
  // O pior caso que a moderação deixa passar: 12 parágrafos e 2.000 caracteres.
  pior: {
    paragrafos: ['Querida Maria Eduarda Albuquerque,', ...Array(11).fill(paragrafo + ' ' + paragrafo.slice(0, 40))]
      .join('\n')
      .slice(0, LIMITES.letter.max),
    fromName: 'Com todo o amor do mundo, para sempre seu',
    starName: 'HD 224700',
    code: 'SG-AAAA-BBBB',
  },
  'sem espaços': { paragrafos: 'W'.repeat(400), starName: 'Vega' },
  vazia: { paragrafos: '' },
}

const caixa = (t) => ({ x1: t.x, x2: t.x + t.largura, y1: t.y - t.pt * MM_POR_PT * 0.74, y2: t.y + t.pt * MM_POR_PT * 0.24 })

describe('desenharCarta', () => {
  it('todo texto fica dentro da moldura e nenhum encosta em outro, nas duas versões', () => {
    for (const [nome, caso] of Object.entries(casos)) {
      for (const claro of [false, true]) {
        const textos = desenharCarta(caso, { claro }).itens.filter((i) => i.tipo === 'texto')
        for (const t of textos) {
          const c = caixa(t)
          expect(c.x1, `${nome}: "${t.texto.slice(0, 20)}"`).toBeGreaterThanOrEqual(14)
          expect(c.x2, `${nome}: "${t.texto.slice(0, 20)}"`).toBeLessThanOrEqual(196)
          expect(c.y1, `${nome}: "${t.texto.slice(0, 20)}"`).toBeGreaterThanOrEqual(14)
          expect(c.y2, `${nome}: "${t.texto.slice(0, 20)}"`).toBeLessThanOrEqual(283)
        }
        for (let i = 0; i < textos.length; i += 1) {
          for (let j = i + 1; j < textos.length; j += 1) {
            const a = caixa(textos[i])
            const b = caixa(textos[j])
            expect(a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2, `${nome}: "${textos[i].texto.slice(0, 20)}" × "${textos[j].texto.slice(0, 20)}"`).toBe(false)
          }
        }
      }
    }
  })

  it('a carta inteira aparece, com a saudação, a assinatura e a ponte com o certificado', () => {
    const textos = desenharCarta(casos.modelo).itens.filter((i) => i.tipo === 'texto').map((t) => t.texto)
    expect(textos).toContain('Meu amor,')
    expect(textos).toContain('Com carinho, Rafael')
    expect(textos.join(' ')).toContain('Que bom que você existe no meu universo.')
    expect(textos.some((t) => t.includes('Acompanha o certificado da estrela Alpha Centauri'))).toBe(true)
    // Nenhuma frase fixa de despedida que não sirva a toda homenagem.
    expect(textos.join(' ')).not.toMatch(/Com carinho,$|para sempre\.$/)
  })

  it('o pior caso cabe sem cortar palavra nenhuma', () => {
    const textos = desenharCarta(casos.pior).itens.filter((i) => i.tipo === 'texto' && i.fonte === 'serif' && i.y > 70).map((t) => t.texto)
    const escrito = textos.join(' ').replace(/\s+/g, ' ')
    const esperado = paragrafosDaCarta(casos.pior.paragrafos).slice(1).join(' ').replace(/\s+/g, ' ')
    expect(escrito).toBe(esperado)
  })
})

describe('PDF da carta', () => {
  it('sai em A4, uma página, com o título de quem recebe', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (url) => {
      const bytes = readFileSync(join(process.cwd(), 'loja', 'public', String(url).replace(/^https?:\/\/[^/]+/, '')))
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    }
    try {
      for (const light of [false, true]) {
        const pdf = await PDFDocument.load(await buildLetterPdf({ ...casos.pior, honoreeName: 'Helena' }, { light }))
        expect(pdf.getPageCount()).toBe(1)
        const { width, height } = pdf.getPages()[0].getSize()
        expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
        expect(pdf.getTitle()).toBe('Uma carta para Helena')
      }
    } finally {
      globalThis.fetch = original
    }
  }, 30_000)
})

describe('moderação da carta', () => {
  it('é opcional, vai até 2.000 caracteres e 12 parágrafos', () => {
    expect(validarPedido({ ...BASE }).ok).toBe(true)
    expect(validarPedido({ ...BASE, letter: MODELOS_DE_CARTA[1].texto }).ok).toBe(true)
    expect(validarPedido({ ...BASE, letter: 'a'.repeat(2001) }).erros[0].campo).toBe('letter')
    const demais = Array(MAX_PARAGRAFOS_CARTA + 1).fill('Linha.').join('\n')
    expect(validarPedido({ ...BASE, letter: demais }).erros[0].motivo).toMatch(/12 parágrafos/)
  })

  it('passa pelas mesmas regras dos outros textos (contato não entra)', () => {
    expect(validarPedido({ ...BASE, letter: 'Me chama no @perfil.secreto' }).ok).toBe(false)
  })

  it('os modelos passam na moderação e não marcam gênero de quem dá', () => {
    for (const modelo of MODELOS_DE_CARTA) {
      expect(validarPedido({ ...BASE, letter: modelo.texto }).ok, modelo.rotulo).toBe(true)
      expect(modelo.texto, modelo.rotulo).not.toMatch(/\bobrigad[oa]\b/i)
    }
  })

  it('cada linha com texto é um parágrafo', () => {
    expect(paragrafosDaCarta('Oi,\n\n  Tudo   bem?  \nTchau')).toEqual(['Oi,', 'Tudo bem?', 'Tchau'])
    expect(paragrafosDaCarta(['a\nb', 'c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('a carta da compra vira a carta da página', () => {
  const ESTRELA = { slug: 'vega', name: 'Vega', bayer: 'α Lyrae', constellation: 'Lira', magnitude: 0.03, story: '' }

  it('com carta, a página traz ela — um parágrafo por linha', () => {
    const c = conteudoDoPedido({ honoree_name: 'Helena', code: 'SG-AAAA-BBBB', letter: 'Meu amor,\nEsta estrela é sua.' }, ESTRELA)
    expect(c.tituloCarta).toBe('Uma carta para você')
    expect(c.carta).toEqual(['Meu amor,', 'Esta estrela é sua.'])
    expect(validarConteudo({ carta: c.carta })).toEqual([])
  })

  it('sem carta, continua o modelo neutro de sempre', () => {
    const c = conteudoDoPedido({ honoree_name: 'Helena', code: 'SG-AAAA-BBBB' }, ESTRELA)
    expect(c.tituloCarta).toBe('Para ser lida sob as estrelas')
    expect(c.carta[0]).toBe('Helena.')
  })

  it('a carta mais longa da compra cabe na edição da página', () => {
    const c = conteudoDoPedido({ honoree_name: 'Helena', code: 'X', letter: 'a '.repeat(1000).trim() }, ESTRELA)
    expect(validarConteudo({ carta: c.carta })).toEqual([])
  })
})
