import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { buildCertificatePdf } from '../shared/pdf.js'
import { LIMITES } from '../shared/moderation.js'
import { MARGIN, MM_PER_PT, PAGE, alturaDe, distribuirBlocos } from '../shared/certificate.js'

const topo = PAGE.height - MARGIN - 10
const base = MARGIN + 26
const dadosAltura = 8

/*
 * A tabela de alturas, igual à dos dois consumidores (PDF e prévia).
 *
 * Só os blocos de UMA linha usam `alturaDe` — a altura das maiúsculas. Nome e
 * mensagem têm várias linhas e valem o avanço de linha (1,15 e 1,5, o mesmo
 * `line-height` do CSS): medir com `alturaDe` subestimava o bloco e o texto
 * saía para fora do espaço reservado.
 */
const blocos = (nomeLinhas, mensagemLinhas) => [
  ['titulo', alturaDe(9)],
  ['marca', alturaDe(40)],
  ['selo', alturaDe(7)],
  ['estrelaSimbolo', 22],
  ['estrela', alturaDe(22)],
  ['bayer', alturaDe(11)],
  ['dedicatoria', alturaDe(7)],
  ['nome', nomeLinhas * 26 * MM_PER_PT * 1.15],
  ...(mensagemLinhas > 0 ? [['mensagem', mensagemLinhas * 11 * MM_PER_PT * 1.5]] : []),
]

// Nome em 2 linhas (o corpo encolhe até caber) e mensagem no limite de 600
// caracteres — cinco a seis linhas. É o pior caso que a moderação deixa passar.
const casos = [
  ['típico', 1, 1],
  ['sem mensagem', 1, 0],
  ['extremo', 2, 5],
  ['extremo apertado', 2, 6],
]

describe('distribuirBlocos (matemática compartilhada PDF ↔ prévia)', () => {
  it('cabe inteiro na faixa útil, com o bloco de dados acima do rodapé', () => {
    for (const [nome, nNome, nMensagem] of casos) {
      const { bases, dadosTopo } = distribuirBlocos(blocos(nNome, nMensagem), {
        topo,
        base,
        dadosAltura,
      })

      const ys = Object.values(bases)
      // Tolerância de 1e-6: no caso apertado a conta bate EXATAMENTE no chão
      // e o resto de vírgula flutuante é 39,99999999999998.
      expect(Math.max(...ys), `${nome}: topo`).toBeLessThanOrEqual(topo + 1e-6)
      expect(Math.min(...ys), `${nome}: chão`).toBeGreaterThanOrEqual(base - 1e-6)

      // O bug: sem o bloco de dados no orçamento, a sobra era toda gasta no
      // vão e ele descia em cima da zona do rodapé.
      expect(dadosTopo - dadosAltura, `${nome}: dados acima do rodapé`).toBeGreaterThanOrEqual(base - 1e-6)
    }
  })

  it('descende pela regra base[i+1] = base[i] - vao - altura[i+1]', () => {
    const alturas = blocos(2, 5)
    const { vao, bases } = distribuirBlocos(alturas, { topo, base, dadosAltura })
    const presentes = alturas.filter(([, altura]) => altura > 0)

    for (let i = 0; i < presentes.length - 1; i += 1) {
      const [chave, altura] = presentes[i]
      const [proximoChave, proximaAltura] = presentes[i + 1]
      expect(bases[proximoChave]).toBeCloseTo(bases[chave] - vao - proximaAltura, 6)
      expect(altura).toBeGreaterThan(0)
    }
  })

  it('o vão fica entre o piso e o teto', () => {
    for (const [nome, nNome, nMensagem] of casos) {
      const { vao } = distribuirBlocos(blocos(nNome, nMensagem), { topo, base, dadosAltura })
      expect(vao, nome).toBeGreaterThanOrEqual(2.5)
      expect(vao, nome).toBeLessThanOrEqual(6)
    }
  })
})

describe('PDF (geração real, fontes lidas do disco)', () => {
  /*
   * Texto longo do caso extremo.
   *
   * O formulário corta em `LIMITES.message.max` (600) — o `maxLength` do textarea
   * —, então o PDF é testado com o MESMO texto que a pessoa consegue digitar.
   * Enviar 668 caracteres aqui fazia a prévia e o PDF renderizarem textos
   * diferentes, e as duas quebras de linha não tinham por que coincidir.
   */
  const mensagemLonga =
    'Que este céu sempre te lembre que você é amada — e que, onde quer que olhe para cima, a gente está olhando para a mesma coisa. Guarde este papel como quem guarda uma carta: ele não é a estrela, é o combinado de que a gente olhava para ela junto. Passaram-se anos, mudou-se de casa, trocou-se de cidade, e o céu continuou lá em cima, exatamente onde estava quando você nasceu — girando devagar, sem pressa, esperando ninguém. Que você encontre ela em noites claras, no fim de uma semana difícil, quando ninguém está olhando. Quando isso acontecer, sorria: é a minha maneira de estar por perto, mesmo quando estiver longe. Que este céu sempre te lembre que você é amada.'

  const casosPdf = {
    normal: {
      honoreeName: 'Geovanna Beatriz Santos Trindade',
      message: 'Que este céu sempre te lembre que você é amada.',
    },
    extremo: {
      honoreeName: 'Maria Fernanda Oliveira dos Santos Albuquerque Júnior Filho',
      message: mensagemLonga.slice(0, LIMITES.message.max),
    },
    semMensagem: {
      honoreeName: 'Ana Clara Ribeiro',
      message: '',
    },
    claro: {
      honoreeName: 'Geovanna Beatriz Santos Trindade',
      message: 'Que este céu sempre te lembre que você é amada.',
    },
  }

  const baseDados = {
    starName: 'Kaus Australis',
    bayer: 'ε Sagittarii',
    constellation: 'Sagitário',
    constellationLatin: 'Sagittarius',
    spectralType: 'B9.5 III',
    raFormatted: '18h 24m 10.32s',
    decFormatted: '−34° 23′ 04.62″',
    magnitude: 0.85,
    distanceLy: 143,
    code: 'SG-TEST-TEST',
    dedicationDate: '13 de outubro de 2026',
    fromName: 'Com amor, sempre',
  }

  it('a mensagem do caso extremo é exatamente o limite da moderação', () => {
    expect(mensagemLonga.length).toBeGreaterThanOrEqual(LIMITES.message.max)
    expect(casosPdf.extremo.message).toHaveLength(LIMITES.message.max)
  })

  it('sai em A4 paisagem nos quatro casos', async () => {
    const original = globalThis.fetch
    // O pdf-lib não tem fallback de fonte: sem ler os arquivos do disco, o
    // "ε" sairia como caixinha. O fetch vira leitura de `loja/public`.
    globalThis.fetch = async (url) => {
      const arquivo = join(process.cwd(), 'loja', 'public', String(url).replace(/^https?:\/\/[^/]+/, ''))
      const bytes = readFileSync(arquivo)
      return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
    }

    try {
      for (const [nome, dados] of Object.entries(casosPdf)) {
        const bytes = await buildCertificatePdf({ ...baseDados, ...dados }, { light: nome === 'claro' })

        // Inspeção visual sob demanda: os PNGs são a única forma de enxergar
        // o "ε" e a geometria de verdade.
        const saida = process.env.CERT_PDF_OUT
        if (saida) {
          mkdirSync(saida, { recursive: true })
          writeFileSync(join(saida, `cert-${nome}.pdf`), bytes)
        }

        const pdf = await PDFDocument.load(bytes)
        const [pagina] = pdf.getPages()
        const { width, height } = pagina.getSize()

        expect(pdf.getPageCount(), `${nome}: páginas`).toBe(1)
        expect(width, `${nome}: largura`).toBeCloseTo((PAGE.width * 72) / 25.4, 1)
        expect(height, `${nome}: altura`).toBeCloseTo((PAGE.height * 72) / 25.4, 1)
        expect(width, `${nome}: paisagem`).toBeGreaterThan(height)
      }
    } finally {
      globalThis.fetch = original
    }
  }, 60000)
})
