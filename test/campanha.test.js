/**
 * Campanha de homenagens (0024): folhas com co-branding, QR que leva à
 * página certa, montador de cartas, semelhança entre cartas, validação e
 * cadastro no servidor, e a privacidade da página pública.
 *
 * Só dados FICTÍCIOS: nenhum nome, mensagem ou dado real de quem vai ser
 * homenageada entra aqui.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import jsQR from 'jsqr'
import { PDFDocument } from 'pdf-lib'
import { desenharCarta } from '../shared/carta/desenho.js'
import { desenharCertificado, MM_POR_PT } from '../shared/certificado/desenho.js'
import { matrizQr } from '../shared/campanha.js'
import { STARS, formatDec, formatRa } from '../shared/stars.js'
import { buildCertificatePdf, buildLetterPdf } from '../shared/pdf.js'
import { comporCarta } from '../loja/src/admin/comporCarta.js'
import { cartasParecidas, MUITO_PARECIDA, semelhanca } from '../loja/src/admin/similaridade.js'
import { chaveDaPessoa, normalizarHomenagem, salvarHomenagem } from '../supabase/functions/admin-api/campanha.ts'
import { SELECAO_PAGINA, conteudoDaLinha } from '../supabase/functions/_shared/pagina.ts'

const CAMPANHA = {
  parceiro: 'PARCEIRO TESTE',
  logo: { src: '/campanhas/proimagem.png', proporcao: 1.518 },
  fraseFinal: 'Que esta estrela te lembre do quanto a sua presença faz diferença.',
}
const URL = 'https://stellara-loja.netlify.app/p/SG-TEST-AAAA'

const s = STARS.find((e) => e.slug === 'vega')
const certificado = (extra = {}) => ({
  honoreeName: 'Fulana Exemplo de Teste', starName: s.name, slug: s.slug, sigla: s.sigla, ra: s.ra, dec: s.dec, bayer: s.bayer,
  constellation: s.constellation, constellationLatin: s.constellationLatin, spectralType: s.spectralType,
  raFormatted: formatRa(s.ra), decFormatted: formatDec(s.dec), magnitude: s.magnitude, distanceLy: s.distanceLy,
  code: 'SG-TEST-AAAA', dedicationDate: '20 de outubro de 2026', fromName: 'Remetente Fictício', message: 'Com gratidão.', ...extra,
})
const carta = (extra = {}) => ({
  paragrafos: 'Querida Fulana,\nUm parágrafo de teste.\nOutro parágrafo.',
  fromName: 'Remetente Fictício', starName: 'Vega', code: 'SG-TEST-AAAA', qrUrl: URL, ...extra,
})

const caixa = (t) => ({ x1: t.x, x2: t.x + t.largura, y1: t.y - t.pt * MM_POR_PT * 0.74, y2: t.y + t.pt * MM_POR_PT * 0.24 })
const cruzam = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
const caixaDe = (i) => ({ x1: i.x, x2: i.x + i.largura, y1: i.y, y2: i.y + i.altura })

/** Os módulos do QR (retângulos escuros sobre o quadrado branco) → imagem → jsQR. */
function lerQrDaFolha(folha) {
  const brancos = folha.itens.filter((i) => i.tipo === 'retangulo' && i.preenchimento === '#ffffff')
  expect(brancos).toHaveLength(1)
  const fundo = brancos[0]
  const modulos = folha.itens.filter((i) => i.tipo === 'retangulo' && i.preenchimento && i.preenchimento !== '#ffffff')
  const px = 8 // pixels por mm
  const lado = Math.round(fundo.largura * px)
  const dados = new Uint8ClampedArray(lado * lado * 4).fill(255)
  for (const m of modulos) {
    for (let y = Math.round((m.y - fundo.y) * px); y < Math.round((m.y + m.altura - fundo.y) * px); y += 1) {
      for (let x = Math.round((m.x - fundo.x) * px); x < Math.round((m.x + m.largura - fundo.x) * px); x += 1) {
        const k = (y * lado + x) * 4
        dados[k] = dados[k + 1] = dados[k + 2] = 0
      }
    }
  }
  return { texto: jsQR(dados, lado, lado)?.data ?? null, fundo }
}

describe('QR da carta de campanha', () => {
  it('decodifica para o endereço exato da página daquela pessoa', () => {
    for (const url of [URL, 'https://stellara-loja.netlify.app/p/SG-ZZZZ-9999']) {
      const { texto } = lerQrDaFolha(desenharCarta(carta({ qrUrl: url, code: url.slice(-12) }), { campanha: CAMPANHA }))
      expect(texto).toBe(url)
    }
  })

  it('tem margem branca (zona de silêncio), tamanho de leitura e fica dentro da moldura', () => {
    const folha = desenharCarta(carta(), { campanha: CAMPANHA })
    const { fundo } = lerQrDaFolha(folha)
    expect(fundo.largura).toBeGreaterThanOrEqual(25) // ≥ 2,5 cm impresso
    const n = matrizQr(URL).length
    expect(fundo.largura / (n + 8)).toBeGreaterThan(0.5) // módulo > 0,5 mm
    expect(fundo.x).toBeGreaterThan(14)
    expect(fundo.y + fundo.altura).toBeLessThan(283)
  })

  it('sem endereço não sai QR nenhum (nunca um QR decorativo)', () => {
    const folha = desenharCarta(carta({ qrUrl: '' }), { campanha: CAMPANHA })
    expect(folha.itens.some((i) => i.tipo === 'retangulo' && i.preenchimento)).toBe(false)
  })
})

describe('folhas de campanha', () => {
  const textos = (folha) => folha.itens.filter((i) => i.tipo === 'texto')

  it('carta: chamada com o parceiro, frase final, "Acesse sua homenagem", endereço legível e selo', () => {
    const folha = desenharCarta(carta(), { campanha: CAMPANHA })
    const t = textos(folha).map((i) => i.texto)
    expect(t).toContain('STELLARA · UMA HOMENAGEM PARCEIRO TESTE')
    expect(t).toContain(CAMPANHA.fraseFinal)
    expect(t).toContain('ACESSE SUA HOMENAGEM')
    expect(t).toContain('stellara-loja.netlify.app/p/SG-TEST-AAAA')
    expect(folha.itens.filter((i) => i.tipo === 'imagem')).toHaveLength(1)
  })

  it('carta e certificado: nada encosta, nada sai da moldura — com nome longo e carta longa', () => {
    const longa = ['Querida Fulana,', ...Array(11).fill('Um parágrafo longo de teste, escrito só para ocupar espaço e conferir que a carta cabe na folha sem encostar no QR.')].join('\n')
    const folhas = [
      desenharCarta(carta({ paragrafos: longa, fromName: 'Com carinho, um remetente de nome bem comprido' }), { campanha: CAMPANHA }),
      desenharCarta(carta(), { campanha: CAMPANHA, claro: true }),
      desenharCertificado(certificado({ honoreeName: 'Fulana Beltrana de Albuquerque Cavalcanti Figueiredo Teste' }), { campanha: CAMPANHA }),
      desenharCertificado(certificado(), { campanha: CAMPANHA, claro: true }),
    ]
    for (const folha of folhas) {
      const t = textos(folha)
      const blocos = folha.itens.filter((i) => i.tipo === 'imagem' || (i.tipo === 'retangulo' && i.preenchimento === '#ffffff')).map(caixaDe)
      for (const a of t) {
        const c = caixa(a)
        expect(c.x1, a.texto).toBeGreaterThanOrEqual(13)
        expect(c.x2, a.texto).toBeLessThanOrEqual(197)
        expect(c.y2, a.texto).toBeLessThanOrEqual(284)
        for (const b of t) if (a !== b) expect(cruzam(c, caixa(b)), `"${a.texto.slice(0, 20)}" × "${b.texto.slice(0, 20)}"`).toBe(false)
        for (const bloco of blocos) expect(cruzam(c, bloco), `"${a.texto.slice(0, 20)}" × logo/QR`).toBe(false)
      }
    }
  })

  it('certificado: o selo é discreto (no rodapé) e o aviso de homenagem simbólica continua', () => {
    const folha = desenharCertificado(certificado(), { campanha: CAMPANHA })
    const [img] = folha.itens.filter((i) => i.tipo === 'imagem')
    expect(img.y).toBeGreaterThan(255)
    expect(img.largura).toBeLessThan(25)
    expect(textos(folha).map((i) => i.texto).join(' ')).toContain('Homenagem simbólica')
    // Sem QR no certificado.
    expect(folha.itens.some((i) => i.tipo === 'retangulo' && i.preenchimento === '#ffffff')).toBe(false)
  })

  it('logo não autorizada (sem `logo`) não aparece em lugar nenhum', () => {
    const sem = { ...CAMPANHA, logo: null }
    expect(desenharCarta(carta(), { campanha: sem }).itens.some((i) => i.tipo === 'imagem')).toBe(false)
    expect(desenharCertificado(certificado(), { campanha: sem }).itens.some((i) => i.tipo === 'imagem')).toBe(false)
  })

  it('a folha da loja (sem campanha) não muda', () => {
    expect(desenharCertificado(certificado()).itens.some((i) => i.tipo === 'imagem')).toBe(false)
    expect(textos(desenharCarta(carta())).map((i) => i.texto)).toContain('STELLARA · UMA HOMENAGEM ESPECIAL')
  })

  it('os PDFs saem em A4, com a logo embutida', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (url) => {
      const bytes = readFileSync(join(process.cwd(), 'loja', 'public', String(url).replace(/^https?:\/\/[^/]+/, '')))
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    }
    try {
      for (const bytes of [
        await buildCertificatePdf(certificado(), { campanha: CAMPANHA }),
        await buildLetterPdf(carta({ honoreeName: 'Fulana' }), { campanha: CAMPANHA, light: true }),
      ]) {
        const pdf = await PDFDocument.load(bytes)
        expect(pdf.getPageCount()).toBe(1)
        const { width, height } = pdf.getPages()[0].getSize()
        expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
        expect(new TextDecoder('latin1').decode(bytes)).toContain('/Subtype /Image')
      }
    } finally {
      globalThis.fetch = original
    }
  }, 30_000)
})

describe('montador de cartas', () => {
  const estrela = { nome: 'Vega', constelacao: 'Lira' }

  it('com pouca informação, carta curta e sincera — sem fingir intimidade', () => {
    const texto = comporCarta({ nome: 'Fulana', tom: 'elegante', estrela })
    expect(texto.split('\n')).toHaveLength(3) // saudação, abertura, fecho
    expect(texto).toContain('Vega')
  })

  it('usa as palavras de quem preencheu, sem inventar', () => {
    const texto = comporCarta({
      nome: 'Fulana', tom: 'afetuoso', estrela,
      qualidades: 'a paciência e o bom humor', profissional: 'o cuidado com cada detalhe do atendimento',
      lembranca: 'o dia do bolo surpresa na copa',
    })
    expect(texto).toContain('a paciência e o bom humor')
    expect(texto.toLowerCase()).toContain('o cuidado com cada detalhe do atendimento')
    expect(texto).toContain('o dia do bolo surpresa na copa')
    expect(texto.startsWith('Querida Fulana,')).toBe(true)
  })

  it('tom de colega: nada de declaração amorosa, e sem marcar o gênero de quem escreve', () => {
    for (const tom of ['afetuoso', 'elegante', 'inspirador', 'amistoso', 'profissional']) {
      for (let versao = 0; versao < 6; versao += 1) {
        const texto = comporCarta({ nome: 'Fulana', tom, estrela, qualidades: 'a calma', versao })
        expect(texto, tom).not.toMatch(/\b(amor|apaixon|paixão|beijo|saudade de você)\b/i)
        expect(texto, tom).not.toMatch(/\bobrigad[oa]\b/i)
      }
    }
  })

  it('pessoas diferentes recebem cartas diferentes, e "Outra versão" muda o texto', () => {
    const a = comporCarta({ nome: 'Fulana', estrela, qualidades: 'a calma', versao: 0 })
    const b = comporCarta({ nome: 'Fulana', estrela, qualidades: 'a calma', versao: 1 })
    expect(a).not.toBe(b)
    const nomes = ['Ana Teste', 'Bia Teste', 'Cris Teste', 'Duda Teste', 'Eva Teste', 'Fê Teste']
    const aberturas = new Set(nomes.map((n) => comporCarta({ nome: n, estrela }).split('\n')[1]))
    expect(aberturas.size).toBeGreaterThan(2)
  })
})

describe('semelhança entre cartas', () => {
  it('a mesma carta com outro nome é marcada como muito parecida', () => {
    const base = 'Esta estrela foi escolhida para você como uma forma de agradecer pelo cuidado e pela atenção de todos os dias.'
    const lista = [
      { code: 'A', nome: 'Fulana', carta: `Querida Fulana,\n${base}` },
      { code: 'B', nome: 'Beltrana', carta: `Querida Beltrana,\n${base}` },
      { code: 'C', nome: 'Ciclana', carta: 'Ciclana,\nUm texto completamente diferente, sobre outra pessoa e outra lembrança da equipe.' },
    ]
    const r = cartasParecidas(lista)
    expect(r.get('A')).toMatchObject({ code: 'B' })
    expect(r.get('A').valor).toBeGreaterThanOrEqual(MUITO_PARECIDA)
    expect(r.has('C')).toBe(false)
    expect(semelhanca('a b c d', 'a b c d')).toBe(1)
  })
})

describe('homenagem no servidor', () => {
  it('valida no backend: nome, estrela, tom, carta e textos com contato', () => {
    const ok = { nome: 'Fulana Teste', starSlug: 'vega', carta: 'Querida Fulana,\nTexto.' }
    expect(normalizarHomenagem(ok)).toMatchObject({ nome: 'Fulana Teste', etapa: 'rascunho', publicar: false, notas: { tom: 'elegante' } })
    expect(() => normalizarHomenagem({ ...ok, nome: '' })).toThrow(/Nome/)
    expect(() => normalizarHomenagem({ ...ok, starSlug: 'DROP TABLE' })).toThrow(/Estrela/)
    expect(() => normalizarHomenagem({ ...ok, carta: Array(13).fill('linha').join('\n') })).toThrow(/Carta/)
    expect(() => normalizarHomenagem({ ...ok, notas: { lembranca: 'me chama no @perfil.secreto' } })).toThrow(/Lembrança/)
    expect(() => normalizarHomenagem({ ...ok, carta: '', etapa: 'finalizada' })).toThrow(/finalizar/)
    expect(normalizarHomenagem({ ...ok, notas: { tom: 'romântico' } }).notas.tom).toBe('elegante')
  })

  it('a mesma pessoa tem uma chave só (acento, maiúscula, espaço)', () => {
    expect(chaveDaPessoa('  Ána   CLÁRA Teste ')).toBe(chaveDaPessoa('ana clara teste'))
  })

  it('cadastro: separa a estrela, nasce fora do ar, recusa estrela em uso e pessoa repetida, e devolve a estrela trocada', async () => {
    const db = bancoFalso()
    const corpo = { campanha: 'teste', nome: 'Fulana Teste', starSlug: 'vega', carta: 'Querida Fulana,\nTexto.' }
    const { code } = await salvarHomenagem(db, corpo, () => 'SG-TEST-0001')
    expect(db.estrelas.vega).toBe('dedicada')
    expect(db.paginas[0]).toMatchObject({ code, status: 'draft', campanha_etapa: 'rascunho', campanha_chave: 'fulana teste' })

    await expect(salvarHomenagem(db, { ...corpo, nome: 'Outra Pessoa' }, () => 'SG-TEST-0002')).rejects.toThrow(/outra página/)
    await expect(salvarHomenagem(db, { ...corpo, nome: 'fulana  TESTE', starSlug: 'altair' }, () => 'SG-TEST-0003')).rejects.toThrow(/já existe/)
    expect(db.estrelas.altair).toBe('disponivel') // a estrela separada para o cadastro recusado voltou

    await salvarHomenagem(db, { ...corpo, code, starSlug: 'altair', publicar: true }, () => 'nunca')
    expect(db.estrelas).toMatchObject({ vega: 'disponivel', altair: 'dedicada' })
    expect(db.paginas[0].status).toBe('published')
  })
})

describe('privacidade da página pública', () => {
  it('a leitura pública não traz anotações nem consentimento — só o nome preferido', () => {
    const colunas = SELECAO_PAGINA.split(',')
    expect(colunas).not.toContain('campanha_notas')
    expect(colunas).not.toContain('campanha_consentimento')
    expect(colunas).toContain('campanha_notas->>nomePreferido')
    const c = conteudoDaLinha({ honoree_name: 'Fulana Beltrana Teste', nomePreferido: 'Fufa', code: 'SG-TEST-AAAA', carta: [] })
    expect(c.nomeCurto).toBe('Fufa')
    expect(JSON.stringify(c)).not.toMatch(/qualidades|lembranca|consentimento/)
  })
})

/** O mínimo do Supabase que `salvarHomenagem` usa, em memória. */
function bancoFalso() {
  const estado = {
    campanha: { id: 'c1', slug: 'teste', nome: 'Teste', parceiro: 'PARCEIRO', ativa: true, assinatura: 'Remetente Fictício' },
    estrelas: { vega: 'disponivel', altair: 'disponivel' },
    paginas: [],
  }
  const consulta = (tabela) => {
    const filtros = []
    let operacao = 'select'
    let valores = null
    const linhas = () => {
      if (tabela === 'campanhas') return [estado.campanha]
      if (tabela === 'stars') return Object.keys(estado.estrelas).map((slug) => ({ slug, status: estado.estrelas[slug], name: slug, story: '' }))
      return estado.paginas
    }
    const passa = (l) => filtros.every(([op, col, v]) => (op === 'eq' ? l[col] === v : l[col] !== v))
    const q = {
      select: () => q,
      eq: (col, v) => (filtros.push(['eq', col, v]), q),
      neq: (col, v) => (filtros.push(['neq', col, v]), q),
      order: () => q,
      insert: (v) => ((operacao = 'insert'), (valores = v), q),
      update: (v) => ((operacao = 'update'), (valores = v), q),
      // Cópia, como o Supabase de verdade: gravar depois não muda o que já foi lido.
      maybeSingle: async () => {
        const l = linhas().find(passa)
        return { data: l ? { ...l } : null, error: null }
      },
      then: (resolver) => {
        if (operacao === 'insert') {
          const repetida = estado.paginas.some((p) => p.campanha_id === valores.campanha_id && p.campanha_chave === valores.campanha_chave)
          if (repetida) return resolver({ error: { code: '23505', message: 'duplicate' } })
          estado.paginas.push({ id: `p${estado.paginas.length + 1}`, ...valores })
          return resolver({ error: null })
        }
        if (operacao === 'update') {
          estado.paginas.filter(passa).forEach((p) => Object.assign(p, valores))
          return resolver({ error: null })
        }
        return resolver({ data: linhas().filter(passa), error: null })
      },
    }
    return q
  }
  return {
    get estrelas() { return estado.estrelas },
    get paginas() { return estado.paginas },
    from: consulta,
    rpc: async (nome, { p_slug }) => {
      if (nome === 'dedicar_estrela_manual') {
        if (estado.estrelas[p_slug] !== 'disponivel') return { data: false, error: null }
        estado.estrelas[p_slug] = 'dedicada'
        return { data: true, error: null }
      }
      if (nome === 'liberar_estrela_manual' && !estado.paginas.some((p) => p.star_slug === p_slug)) estado.estrelas[p_slug] = 'disponivel'
      return { data: null, error: null }
    },
  }
}
