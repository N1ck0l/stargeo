/**
 * Gera o PDF do certificado.
 *
 * Roda na Edge Function, depois que o pagamento é confirmado. Vive em
 * `shared/` porque a mesma função gera o comprovante de teste e o PDF que o
 * cliente recebe — não pode haver dois geradores que divergem.
 *
 * O desenho NÃO mora aqui: ele é a lista de itens de
 * `shared/certificado/desenho.js`, a mesma que a prévia da loja desenha em
 * SVG. Este arquivo só traduz item por item para o pdf-lib — y invertido
 * (o PDF cresce para cima), milímetros em pontos, letra por letra quando há
 * espaçamento (o pdf-lib não tem `letter-spacing`).
 *
 * Fontes: as instâncias ESTÁTICAS de `loja/public/fonts/pdf/`
 * (`scripts/gerar-fontes.py`). As do site são variáveis, e o pdf-lib embute
 * a instância padrão — a da Montserrat é a Thin, e o certificado saía todo
 * fininho. As fontes padrão do pdf-lib (WinAnsi) também não serviriam: não
 * escrevem "ε Sagittarii" nem "−34° 23′ 04.62″".
 */
/*
 * Pacotes npm com o prefixo `npm:`, que o Deno exige no empacotamento da Edge
 * Function. Os testes (vitest) mapeiam os `npm:` para os mesmos pacotes via
 * alias no `vitest.config.js`.
 */
import { LineCapStyle, PDFDocument, rgb } from 'npm:pdf-lib'
import fontkit from 'npm:@pdf-lib/fontkit'
import { desenharCertificado, PAGINA } from './certificado/desenho.js'
import { METRICAS } from './certificado/metricas.js'

/** Milímetros para pontos: 1 polegada = 25,4 mm e 1 polegada = 72 pt. */
export const MM_TO_PT = 72 / 25.4

/**
 * Cache de fontes, por URL. A decompressão de woff2 custa ~150 ms por
 * arquivo; na Edge Function o cache vale enquanto a instância estiver viva.
 */
const fontCache = new Map()

/**
 * Fila de conversão: o `wawoff2` é um módulo WASM de instância única e NÃO é
 * reentrante — duas chamadas a `decompress` ao mesmo tempo corrompem a saída
 * uma da outra ("Unknown font format" numa fonte boa).
 */
let fila = Promise.resolve()

/**
 * Baixa uma fonte e devolve o TTF, uma de cada vez.
 *
 * `.ttf` vem pronto (é o caminho do navegador, no "Baixar PDF" da página
 * dedicada); `.woff2` é descomprimido (o caminho do servidor, arquivo menor).
 */
function carregarTtf(url) {
  if (fontCache.has(url)) return Promise.resolve(fontCache.get(url))

  const trabalho = fila.then(async () => {
    if (fontCache.has(url)) return fontCache.get(url)
    const resposta = await fetch(url)
    if (!resposta.ok) throw new Error(`Fonte não encontrada: ${url} (${resposta.status})`)
    const bruto = new Uint8Array(await resposta.arrayBuffer())
    if (url.endsWith('.ttf')) {
      fontCache.set(url, bruto)
      return bruto
    }
    const { decompress } = await import('npm:wawoff2')
    const ttf = Uint8Array.from(await decompress(bruto))
    fontCache.set(url, ttf)
    return ttf
  })

  fila = trabalho.catch(() => {})
  return trabalho
}

/** `#rrggbb` → cor do pdf-lib. */
export function cor(hex) {
  const h = hex.replace('#', '')
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
}

function misturar(a, b, t) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Gera o PDF.
 *
 * @param {import('./certificado/desenho.js').DadosCertificado} data
 * @param {{ light?: boolean, fontBaseUrl?: string, formatoFonte?: 'woff2' | 'ttf' }} [opts]
 *   `formatoFonte: 'ttf'` é o do navegador (sem o descompressor WASM).
 * @returns {Promise<Uint8Array>}
 */
export async function buildCertificatePdf(data, opts = {}) {
  const base = opts.fontBaseUrl ?? ''
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)

  const chaves = Object.keys(METRICAS)
  const extensao = opts.formatoFonte === 'ttf' ? '.ttf' : '.woff2'
  const ttfs = await Promise.all(
    chaves.map((k) => carregarTtf(`${base}/fonts/pdf/${METRICAS[k].arquivo.replace(/\.woff2$/, extensao)}`)),
  )
  const fontes = {}
  for (let i = 0; i < chaves.length; i += 1) {
    fontes[chaves[i]] = await pdf.embedFont(ttfs[i], { subset: true })
  }

  const folha = desenharCertificado(data, { claro: opts.light === true })
  const page = pdf.addPage([PAGINA.largura * MM_TO_PT, PAGINA.altura * MM_TO_PT])
  desenhar(page, folha, fontes)

  pdf.setTitle(`Certificado de ${data.starName} para ${data.honoreeName}`)
  pdf.setAuthor('Stellara')
  pdf.setSubject('Certificado de dedicação de estrela')
  pdf.setKeywords(['certificado', 'estrela', data.starName, data.bayer])
  pdf.setProducer('Stellara')
  pdf.setCreator('Stellara')
  pdf.setCreationDate(new Date())

  return pdf.save()
}

/** Traduz a lista de itens para o pdf-lib. */
function desenhar(page, folha, fontes) {
  const pt = (mm) => mm * MM_TO_PT
  const yPdf = (y) => pt(folha.altura - y)

  for (const item of folha.itens) {
    switch (item.tipo) {
      case 'degrade': {
        /*
         * O pdf-lib não tem gradiente: faixas de 0,25 mm com 50% de
         * sobreposição. Sem a sobreposição, cada faixa arredonda para um pixel
         * diferente e aparece uma listra clara entre elas.
         */
        const faixas = Math.ceil(folha.altura / 0.25)
        const h = folha.altura / faixas
        for (let i = 0; i < faixas; i += 1) {
          page.drawRectangle({
            x: 0,
            y: yPdf((i + 1) * h),
            width: pt(folha.largura),
            height: pt(h * 1.5),
            color: cor(misturar(item.topo, item.base, i / (faixas - 1))),
          })
        }
        break
      }
      case 'linha':
        page.drawLine({
          start: { x: pt(item.x1), y: yPdf(item.y1) },
          end: { x: pt(item.x2), y: yPdf(item.y2) },
          thickness: pt(item.espessura),
          color: cor(item.cor),
          opacity: item.opacidade,
        })
        break
      case 'retangulo':
        page.drawRectangle({
          x: pt(item.x),
          y: yPdf(item.y + item.altura),
          width: pt(item.largura),
          height: pt(item.altura),
          borderColor: cor(item.traco),
          borderWidth: pt(item.espessura),
          borderOpacity: item.opacidade,
        })
        break
      case 'circulo':
        page.drawCircle({
          x: pt(item.cx),
          y: yPdf(item.cy),
          size: pt(item.r),
          ...(item.preenchimento ? { color: cor(item.preenchimento), opacity: item.opacidade } : {}),
          ...(item.traco
            ? { borderColor: cor(item.traco), borderWidth: pt(item.espessura), borderOpacity: item.opacidade }
            : {}),
        })
        break
      case 'caminho':
        // `drawSvgPath` lê o path com y para baixo, a partir da origem dada.
        page.drawSvgPath(item.d, {
          x: pt(item.x),
          y: yPdf(item.y),
          scale: pt(item.escala),
          ...(item.preenchimento ? { color: cor(item.preenchimento), opacity: item.opacidade } : {}),
          ...(item.traco
            ? {
                borderColor: cor(item.traco),
                borderWidth: pt(item.espessura),
                borderOpacity: item.opacidade,
                ...(item.ponta === 'redonda' ? { borderLineCap: LineCapStyle.Round } : {}),
              }
            : {}),
        })
        break
      case 'texto': {
        const fonte = fontes[item.fonte]
        const opcoes = { size: item.pt, font: fonte, color: cor(item.cor), opacity: item.opacidade }
        if (!item.espaco) {
          page.drawText(item.texto, { ...opcoes, x: pt(item.x), y: yPdf(item.y) })
          break
        }
        // Espaçamento entre letras: uma letra por vez, avançando pela MESMA
        // tabela de larguras que a prévia usa.
        const m = METRICAS[item.fonte]
        let x = item.x
        for (const ch of item.texto) {
          page.drawText(ch, { ...opcoes, x: pt(x), y: yPdf(item.y) })
          const avanco = m.larguras[ch.codePointAt(0)] ?? 0
          x += (avanco / m.unidades) * item.pt * (25.4 / 72) + item.espaco * (25.4 / 72)
        }
        break
      }
      default:
        throw new Error(`Item desconhecido no certificado: ${item.tipo}`)
    }
  }
}
