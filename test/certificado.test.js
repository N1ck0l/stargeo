/**
 * Certificado: a folha (`shared/certificado/desenho.js`), as fontes do PDF e
 * a geração real do arquivo.
 *
 * Os bugs que este arquivo impede de voltar:
 *
 * - O PDF embutia a fonte VARIÁVEL da Montserrat, cuja instância padrão é a
 *   Thin: todo texto saía fininho, diferente da prévia.
 * - Rótulos dos dados desenhados por cima dos valores, filetes tortos (o
 *   pdf-lib ignorava o espaçamento entre letras que a conta somava).
 * - Texto longo saindo do espaço dele. O pior caso que a moderação deixa
 *   passar — nome de 80 caracteres, mensagem de 600, assinatura de 60 —
 *   precisa caber sem encostar em nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { decompress } from 'wawoff2'
import { buildCertificatePdf } from '../shared/pdf.js'
import { LIMITES } from '../shared/moderation.js'
import { desenharCertificado, medir, MM_POR_PT, PAGINA, quebrar } from '../shared/certificado/desenho.js'
import { METRICAS } from '../shared/certificado/metricas.js'
import { STARS, formatDec, formatRa } from '../shared/stars.js'

const mensagemLonga =
  'Que este céu sempre te lembre que você é amada — e que, onde quer que olhe para cima, a gente está olhando para a mesma coisa. Guarde este papel como quem guarda uma carta: ele não é a estrela, é o combinado de que a gente olhava para ela junto. Passaram-se anos, mudou-se de casa, trocou-se de cidade, e o céu continuou lá em cima, exatamente onde estava quando você nasceu — girando devagar, sem pressa, esperando ninguém. Que você encontre ela em noites claras, no fim de uma semana difícil, quando ninguém está olhando. Quando isso acontecer, sorria: é a minha maneira de estar por perto, mesmo quando estiver longe. Que este céu sempre te lembre que você é amada.'

/** Dados da folha a partir de uma estrela do catálogo — como a prévia monta. */
function dados(slug, extra = {}) {
  const s = STARS.find((estrela) => estrela.slug === slug)
  return {
    starName: s.name,
    slug: s.slug,
    sigla: s.sigla,
    ra: s.ra,
    dec: s.dec,
    bayer: s.bayer,
    constellation: s.constellation,
    constellationLatin: s.constellationLatin,
    spectralType: s.spectralType,
    raFormatted: formatRa(s.ra),
    decFormatted: formatDec(s.dec),
    magnitude: s.magnitude,
    distanceLy: s.distanceLy,
    code: 'SG-AB3K-9ZXM',
    dedicationDate: '14 de outubro de 2026',
    honoreeName: 'Geovanna Beatriz Santos Trindade',
    ...extra,
  }
}

const casos = {
  típico: dados('kaus-australis', { message: 'Que este céu sempre te lembre que você é amada.', fromName: 'Com amor, Nickolas' }),
  'sem mensagem nem assinatura': dados('vega', { honoreeName: 'Lívia' }),
  extremo: dados('alpha-centauri', {
    honoreeName: 'Maria Eduarda Albuquerque de Vasconcelos Cavalcanti Figueiredo Pessoa Junior'.slice(0, LIMITES.honoreeName.max),
    message: mensagemLonga.slice(0, LIMITES.message.max),
    fromName: 'Com todo o amor do mundo, para sempre seu, hoje e amanhã'.slice(0, LIMITES.fromName.max),
    starNickname: 'A Estrela Mais Brilhante da Vovó Lúcia e do Vovô'.slice(0, LIMITES.starNickname.max),
  }),
  'com nome da estrela': dados('vega', {
    message: 'Para você lembrar de olhar para cima.',
    starNickname: 'Nossa Luz',
  }),
  'nome da estrela sem espaços': dados('sirius', {
    starNickname: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW'.slice(0, LIMITES.starNickname.max),
  }),
  'extremo sem espaços': dados('canopus', {
    honoreeName: 'Wolfeschlegelsteinhausenbergerdorff Montmorency Albuquerque',
    message: 'Amor '.repeat(150).slice(0, LIMITES.message.max).trim(),
  }),
}

/** Caixa aproximada de um texto: da altura das maiúsculas até as descendentes. */
const caixa = (t) => ({
  x1: t.x,
  x2: t.x + t.largura,
  y1: t.y - t.pt * MM_POR_PT * 0.74,
  y2: t.y + t.pt * MM_POR_PT * 0.24,
})

// === A folha ===
describe('desenharCertificado', () => {
  it('é A4 retrato, em milímetros', () => {
    const folha = desenharCertificado(casos.típico)
    expect([folha.largura, folha.altura]).toEqual([210, 297])
    expect(PAGINA).toEqual({ largura: 210, altura: 297 })
  })

  it('todo texto fica dentro da moldura interna, em todos os casos', () => {
    for (const [nome, caso] of Object.entries(casos)) {
      for (const claro of [false, true]) {
        const textos = desenharCertificado(caso, { claro }).itens.filter((i) => i.tipo === 'texto')
        for (const t of textos) {
          const c = caixa(t)
          expect(c.x1, `${nome}: "${t.texto.slice(0, 30)}" à esquerda`).toBeGreaterThanOrEqual(13)
          expect(c.x2, `${nome}: "${t.texto.slice(0, 30)}" à direita`).toBeLessThanOrEqual(197)
          expect(c.y1, `${nome}: "${t.texto.slice(0, 30)}" no topo`).toBeGreaterThanOrEqual(13)
          expect(c.y2, `${nome}: "${t.texto.slice(0, 30)}" no pé`).toBeLessThanOrEqual(284)
        }
      }
    }
  })

  it('nenhum texto encosta em outro — nem no pior caso que a moderação permite', () => {
    for (const [nome, caso] of Object.entries(casos)) {
      const textos = desenharCertificado(caso).itens.filter((i) => i.tipo === 'texto')
      for (let i = 0; i < textos.length; i += 1) {
        for (let j = i + 1; j < textos.length; j += 1) {
          const a = caixa(textos[i])
          const b = caixa(textos[j])
          const cruzam = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
          expect(cruzam, `${nome}: "${textos[i].texto.slice(0, 25)}" × "${textos[j].texto.slice(0, 25)}"`).toBe(false)
        }
      }
    }
  })

  it('o bloco central não desce até o fio que separa os dados', () => {
    for (const [nome, caso] of Object.entries(casos)) {
      const textos = desenharCertificado(caso).itens.filter((i) => i.tipo === 'texto' && i.y > 100 && i.y < 205)
      const ultimo = Math.max(...textos.map((t) => caixa(t).y2))
      expect(ultimo, nome).toBeLessThan(202.5)
    }
  })

  it('o nome inteiro aparece: encolhe o corpo, nunca corta o sobrenome', () => {
    const textos = desenharCertificado(casos.extremo).itens.filter((i) => i.tipo === 'texto').map((t) => t.texto)
    expect(textos.join(' ')).toContain('Cavalcanti')
    expect(textos.join(' ')).toContain('Pessoa')
  })

  it('o nome dado à estrela sai entre aspas, dito como homenagem; sem ele, nada muda', () => {
    const com = desenharCertificado(casos['com nome da estrela']).itens.filter((i) => i.tipo === 'texto').map((t) => t.texto)
    expect(com).toContain('“Nossa Luz”')
    expect(com).toContain('chamada, nesta homenagem, de')
    // O nome oficial continua na folha.
    expect(com).toContain('Vega')
    const sem = desenharCertificado(casos.típico).itens.filter((i) => i.tipo === 'texto').map((t) => t.texto)
    expect(sem).not.toContain('chamada, nesta homenagem, de')
  })

  it('a mesma entrada dá sempre a mesma folha (céu de fundo com sorteio fixo)', () => {
    expect(JSON.stringify(desenharCertificado(casos.típico))).toBe(JSON.stringify(desenharCertificado(casos.típico)))
  })

  it('as 12 estrelas têm mapa do céu, com estrelas reais e linhas da constelação', () => {
    for (const estrela of STARS) {
      const itens = desenharCertificado(dados(estrela.slug)).itens
      // Estrelas do mapa: círculos preenchidos dentro do círculo do mapa.
      const doMapa = itens.filter(
        (i) => i.tipo === 'circulo' && i.preenchimento && (i.cx - 152) ** 2 + (i.cy - 232) ** 2 < 23 ** 2,
      )
      const linhas = itens.filter((i) => i.tipo === 'linha' && i.espessura === 0.22)
      expect(doMapa.length, `${estrela.slug}: estrelas`).toBeGreaterThan(15)
      expect(linhas.length, `${estrela.slug}: linhas`).toBeGreaterThan(0)
      const legenda = itens.find((i) => i.tipo === 'texto' && i.texto.endsWith('· J2000'))
      expect(legenda.texto).toBe(`${estrela.constellationLatin.toUpperCase()} · J2000`)
    }
  })
})

// === Medida de texto, compartilhada com a prévia ===
describe('medir e quebrar', () => {
  it('soma as larguras da tabela, sem kerning', () => {
    const m = METRICAS.sans
    const esperado = (('A'.codePointAt(0) in m.larguras ? m.larguras[65] : 0) + m.larguras[86]) / m.unidades * 10 * MM_POR_PT
    expect(medir('sans', 'AV', 10)).toBeCloseTo(esperado, 6)
  })

  it('o espaçamento entra entre as letras, não depois da última', () => {
    expect(medir('sans', 'ABC', 10, 2) - medir('sans', 'ABC', 10)).toBeCloseTo(2 * 2 * MM_POR_PT, 6)
  })

  it('quebra sem passar da largura, salvo palavra maior que a linha', () => {
    const linhas = quebrar(mensagemLonga, 'serifItalico', 10, 120)
    expect(linhas.length).toBeGreaterThan(3)
    for (const linha of linhas) expect(medir('serifItalico', linha, 10)).toBeLessThanOrEqual(120)
    expect(quebrar('Supercalifragilisticexpialidocious', 'serif', 30, 20)).toHaveLength(1)
  })
})

// === Fontes do PDF ===
describe('fontes do PDF', () => {
  it('são estáticas e no peso certo — a variável embutia a Montserrat THIN', async () => {
    const pesos = { sans: 400, sansMedio: 500, sansItalico: 400, serif: 400, serifItalico: 400, grego: 400 }
    for (const [chave, peso] of Object.entries(pesos)) {
      const woff2 = readFileSync(join(process.cwd(), 'loja/public/fonts/pdf', METRICAS[chave].arquivo))
      // Uint8Array puro: no ambiente jsdom o Buffer não passa pela ponte do WASM.
      const fonte = fontkit.create(Buffer.from(await decompress(Uint8Array.from(woff2))))
      expect(Object.keys(fonte.variationAxes ?? {}), `${chave}: variável`).toHaveLength(0)
      expect(fonte['OS/2'].usWeightClass, `${chave}: peso`).toBe(peso)
    }
  })
})

// === Geração real do PDF ===
describe('PDF (geração real, fontes lidas do disco)', () => {
  it('sai em A4 retrato, uma página, nos casos do teste e nas duas versões', async () => {
    const original = globalThis.fetch
    // O pdf-lib não tem fallback de fonte: o fetch vira leitura de `loja/public`.
    globalThis.fetch = async (url) => {
      const arquivo = join(process.cwd(), 'loja', 'public', String(url).replace(/^https?:\/\/[^/]+/, ''))
      const bytes = readFileSync(arquivo)
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    }

    try {
      for (const [nome, caso] of Object.entries(casos)) {
        for (const light of [false, true]) {
          const bytes = await buildCertificatePdf(caso, { light })

          // Inspeção visual sob demanda: `CERT_PDF_OUT=pasta npx vitest run test/certificado.test.js`.
          const saida = process.env.CERT_PDF_OUT
          if (saida) {
            mkdirSync(saida, { recursive: true })
            writeFileSync(join(saida, `cert-${nome.replace(/\s+/g, '-')}${light ? '-claro' : ''}.pdf`), bytes)
          }

          const pdf = await PDFDocument.load(bytes)
          const [pagina] = pdf.getPages()
          const { width, height } = pagina.getSize()
          expect(pdf.getPageCount(), `${nome}: páginas`).toBe(1)
          expect(width, `${nome}: largura`).toBeCloseTo((210 * 72) / 25.4, 1)
          expect(height, `${nome}: altura`).toBeCloseTo((297 * 72) / 25.4, 1)
        }
      }

      // O caminho do navegador ("Baixar PDF" da página dedicada): fontes em
      // TTF, sem o descompressor de woff2. Mesma folha, mesmo tamanho.
      const viaTtf = await buildCertificatePdf(casos.típico, { formatoFonte: 'ttf' })
      const pdf = await PDFDocument.load(viaTtf)
      expect(pdf.getPageCount()).toBe(1)
      expect(viaTtf.length).toBeGreaterThan(20_000)
    } finally {
      globalThis.fetch = original
    }
  }, 60000)
})
