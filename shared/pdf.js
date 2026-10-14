/**
 * Gera o PDF do certificado.
 *
 * Roda na Edge Function, depois que o pagamento é confirmado. Vive em
 * `shared/` porque a mesma função gera o comprovante de teste e o PDF que o
 * cliente recebe — não pode haver dois geradores que divergem.
 *
 * Não usa navegador nem headless: `pdf-lib` desenha direto. São ~200 ms por
 * certificado, em vez de 15 s, e nenhuma dependência de Chrome — que a Edge
 * Function não tem.
 *
 * As fontes são as mesmas do site, convertidas de woff2 para ttf na primeira
 * execução e guardadas em cache. Isso não é vaidade: as fontes padrão do
 * pdf-lib (WinAnsi) não sabem escrever "ε Sagittarii" nem os símbolos
 * astronômicos "−34° 23′ 04.62″". Um certificado que troca a letra grega por um
 * ponto de interrogação não é um certificado de astronomia.
 */
/*
 * Pacotes npm com o prefixo `npm:`, que o Deno exige no empacotamento da Edge
 * Function — um import sem prefixo ("pdf-lib") falha com "not prefixed with /
 * or ./ or ../". Neste arquivo não há importador de navegador: quem chama é a
 * função do servidor, e os testes (vitest) mapeiam os `npm:` para os mesmos
 * pacotes via alias no `vitest.config.js`.
 */
import { PDFDocument, rgb } from 'npm:pdf-lib'
import fontkit from 'npm:@pdf-lib/fontkit'
import { drawCertificate, definirFabricaDeCor, PAGE } from './certificate.js'

/** Milímetros para pontos: 1 polegada = 25,4 mm e 1 polegada = 72 pt. */
export const MM_TO_PT = 72 / 25.4

/**
 * Cache de fontes, por URL.
 *
 * A decompressão de woff2 custa ~150 ms por arquivo. Convertir a cada pedido
 * gastaria esse tempo em toda venda, para sempre. Na Edge Function o processo
 * é efêmero, então o cache vale enquanto a instância estiver viva — que é o
 * comportamento certo para uma função serverless.
 */
const fontCache = new Map()

/**
 * Fila de conversão.
 *
 * O `wawoff2` é um módulo WASM de instância única, e ele NÃO reentrante: duas
 * chamadas a `decompress` ao mesmo tempo corrompem a saída uma da outra, e o
 * fontkit depois acusa "Unknown font format" numa fonte perfeitamente boa.
 *
 * Como as três fontes do certificado são sempre as mesmas, a fila só é
 * percorrida uma vez por instância — e o cache evita as próximas.
 */
let fila = Promise.resolve()

/**
 * Baixa e converte uma fonte woff2 em ttf, uma de cada vez.
 *
 * @param {string} url
 * @returns {Promise<Uint8Array>}
 */
function carregarTtf(url) {
  if (fontCache.has(url)) return Promise.resolve(fontCache.get(url))

  const trabalho = fila.then(async () => {
    if (fontCache.has(url)) return fontCache.get(url)

    // O `arrayBuffer()` de um fetch precisa vir inteiro e destacado; um Buffer
    // que é view de um array maior faz a conversão falhar em silêncio.
    const bruto = new Uint8Array(await (await fetch(url)).arrayBuffer())
    // `npm:` também no import dinâmico: o empacotador do Deno analisa imports
    // literais, mesmo os dinâmicos, e rejeita o bare specifier.
    const { decompress } = await import('npm:wawoff2')
    /*
     * O retorno do WASM é uma *view* dentro do heap dele, com `byteOffset`
     * grande. O fontkit lê a partir do início do `ArrayBuffer` em vez de
     * respeitar a view, então passá-lo direto dá "Unknown font format". A
     * cópia num array novo resolve e custa alguns KB, uma vez por fonte.
     */
    const ttf = Uint8Array.from(await decompress(bruto))
    fontCache.set(url, ttf)
    return ttf
  })

  // A fila não pode quebrar por causa de uma fonte: o próximo chama precisa
  // conseguir tentar de novo.
  fila = trabalho.catch(() => {})
  return trabalho
}

/**
 * Converte `#rrggbb` para a cor do pdf-lib.
 *
 * Exportada porque `certificate.js` não conhece o pdf-lib: quem chama
 * registra esta função como fábrica via `definirFabricaDeCor`, e o desenho
 * continua falando só em hex.
 */
export function cor(hex) {
  const h = hex.replace('#', '')
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  )
}

/**
 * Envolve a página convertendo milímetros para pontos.
 *
 * `certificate.js` desenha em milímetros, que é a unidade em que se pensa
 * papel. O pdf-lib trabalha em pontos e não tem transformação de página
 * inteira, então a conversão fica aqui, na fronteira.
 *
 * Só a geometria é convertida. O `size` da fonte fica em pontos de propósito:
 * font-size em pt é o padrão em tipografia.
 */
function emMilimetros(page) {
  const s = (v) => v * MM_TO_PT
  const escala = (opts) => {
    const out = { ...opts }
    for (const key of ['x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'borderWidth']) {
      if (typeof out[key] === 'number') out[key] = s(out[key])
    }
    return out
  }
  return {
    /*
     * `drawText` recebe (conteúdo, opções) no pdf-lib, e o desenho em
     * `certificate.js` também chama assim. Os dois argumentos precisam
     * passar separados — colapsá-los num objeto só faria o texto sair com a
     * fonte padrão do pdf-lib, que não conhece o "ε".
     *
     * A posição (x, y) é convertida; o `size` NÃO. Tamanho de fonte em pontos
     * é a convenção da tipografia e da spec do PDF, e o desenho já foi
     * escrito pensando em "40 é um título grande", não "40 mm de altura".
     */
    drawText: (content, opts = {}) => {
      const { x, y, ...resto } = opts
      return page.drawText(content, {
        ...resto,
        ...(typeof x === 'number' ? { x: s(x) } : {}),
        ...(typeof y === 'number' ? { y: s(y) } : {}),
      })
    },
    drawRectangle: (opts) => page.drawRectangle(escala(opts)),
    drawLine: (opts) => page.drawLine(escala(opts)),
    /*
     * O `drawSvgPath` do pdf-lib já aplica a escala e a inversão do eixo Y,
     * desde que `scale` venha nas opções. Passar o valor aqui é o que impede
     * a estrela de sair do tamanho de um ponto.
     */
    drawSvgPath: (path, opts = {}) => page.drawSvgPath(path, opts),
    /** Pontos por milímetro, para quem desenhar em unidades do documento. */
    escala: s,
    raw: page,
  }
}

/**
 * @param {object} data    campos de `_certificate`
 * @param {{ light?: boolean, fontBaseUrl?: string }} [opts]
 * @returns {Promise<Uint8Array>} bytes do PDF
 */
export async function buildCertificatePdf(data, opts = {}) {
  const base = opts.fontBaseUrl ?? ''
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)

  /*
   * As fontes do site: Playfair Display (display — marca e título), Montserrat
   * (regular, itálico — texto, nome e dados) e o itálico grego da EB Garamond
   * (linha das designações de Bayer).
   *
   * Playfair e Montserrat são variáveis: o mesmo woff2 cobre a faixa de pesos
   * declarada no CSS, e o pdf-lib embute a instância padrão (400) — que é o
   * único peso que o desenho usa.
   *
   * `subset: true` embute só os glifos usados. Sem isso, cada certificado
   * carregaria ~120 KB de fonte para 40 glifos — e o e-mail ficaria pesado.
   */
  const [display, sans, sansItalic, italicoGrego] = await Promise.all([
    carregarTtf(`${base}/fonts/playfair-display-400-700.woff2`),
    carregarTtf(`${base}/fonts/montserrat-400-600.woff2`),
    carregarTtf(`${base}/fonts/montserrat-400i.woff2`),
    /*
     * Itálico com alfabeto grego, para a linha "ε Sagittarii".
     *
     * Os outros três são subconjuntos só com latim: o "ε" das designações de
     * Bayer não existe neles, e o pdf-lib não tem o fallback que o navegador
     * tem — o glifo saía como a caixinha de "não existe". O subset abaixo foi
     * cortado com as letras gregas inteiras, então serve para qualquer estrela
     * (α, β, δ…), não só para a Kaus Australis.
     */
    carregarTtf(`${base}/fonts/eb-garamond-italic-grego.woff2`),
  ])

  const fonts = {
    regular: await pdf.embedFont(sans, { subset: true }),
    italic: await pdf.embedFont(sansItalic, { subset: true }),
    display: await pdf.embedFont(display, { subset: true }),
    bayer: await pdf.embedFont(italicoGrego, { subset: true }),
  }

  const page = pdf.addPage([PAGE.width * MM_TO_PT, PAGE.height * MM_TO_PT])

  // O desenho fala em hex legível; quem converte para o tipo do pdf-lib é a
  // fábrica informada aqui.
  definirFabricaDeCor(cor)
  drawCertificate(pdf, emMilimetros(page), fonts, data, opts)

  pdf.setTitle(`Certificado de ${data.starName} para ${data.honoreeName}`)
  pdf.setAuthor('Stellara')
  pdf.setSubject('Certificado de dedicação celeste')
  pdf.setKeywords(['certificado', 'estrela', data.starName, data.bayer])
  pdf.setProducer('Stellara')
  pdf.setCreator('Stellara')
  pdf.setCreationDate(new Date())

  return pdf.save()
}
