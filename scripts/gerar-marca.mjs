/**
 * Gera a logo oficial da Stellara em SVG vetorial — `npm run marca`.
 *
 * Fonte da verdade da marca: a geometria do símbolo está AQUI, e o texto vem
 * das fontes da própria loja (`loja/public/fonts`), convertido em curvas. Os
 * arquivos de `marca/` não dependem de fonte instalada: abrem iguais no
 * navegador, no Illustrator/Figma, na gráfica e no gerador de PDF.
 *
 * Saída (`marca/`):
 *   stellara-simbolo.svg            símbolo isolado, dourado com facetas
 *   stellara-horizontal.svg         símbolo | STELLARA + slogan
 *   stellara-vertical.svg           símbolo em cima, nome e slogan embaixo
 *   ...-mono-marfim.svg             uma cor só, para fundo escuro
 *   ...-mono-noite.svg              uma cor só, para papel claro (impressão)
 *   index.html                      prancha para conferir tudo lado a lado
 *
 * E também, fora de `marca/`: `loja/public/favicon.svg`, os PNGs da loja
 * (favicon-32, apple-touch-icon, icon-192/512, icon-maskable-512, og-image)
 * e `loja/src/components/simboloGeometria.js` (o símbolo do cabeçalho).
 *
 * Mudou a geometria ou a cor? Rode de novo; não edite os SVGs à mão.
 */
import fontkit from '@pdf-lib/fontkit'
import { decompress } from 'wawoff2'
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  caixaSimbolo, contornoEstrela, COR, naOrbita, ORBITA, PONTO, simbolo,
} from '../shared/marca.js'

const raiz = resolve(import.meta.dirname, '..')
const saida = join(raiz, 'marca')
mkdirSync(saida, { recursive: true })

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const n = (v) => Number(v.toFixed(2))
const arredondar = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(n(Number(m))))

async function carregarFonte(arquivo, peso) {
  const ttf = Buffer.from(await decompress(readFileSync(join(raiz, 'loja/public/fonts', arquivo))))
  return fontkit.create(ttf).getVariation({ wght: peso })
}

/**
 * Texto em curvas. `altura` é a altura das MAIÚSCULAS em unidades do SVG;
 * `espaco` é o espaçamento entre letras em fração do corpo (0.2 = 20%).
 * Devolve o `d` do path e a caixa real da tinta, com a linha de base em y=0.
 */
function textoEmCurvas(fonte, texto, altura, espaco) {
  const escala = altura / fonte.capHeight
  const corpo = fonte.unitsPerEm * escala
  const corrida = fonte.layout(texto)
  let x = 0
  let d = ''
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  corrida.glyphs.forEach((glifo, i) => {
    const pos = corrida.positions[i]
    const caminho = glifo.path.scale(escala, -escala).translate(x + pos.xOffset * escala, -pos.yOffset * escala)
    const caixa = caminho.bbox
    if (Number.isFinite(caixa.minX)) {
      minX = Math.min(minX, caixa.minX)
      maxX = Math.max(maxX, caixa.maxX)
      minY = Math.min(minY, caixa.minY)
      maxY = Math.max(maxY, caixa.maxY)
    }
    d += caminho.toSVG()
    x += pos.xAdvance * escala + (i < corrida.glyphs.length - 1 ? espaco * corpo : 0)
  })

  return { d: arredondar(d), caixa: { minX, maxX, minY, maxY, largura: maxX - minX } }
}

// ---------------------------------------------------------------------------
// Composições
// ---------------------------------------------------------------------------
const playfair = await carregarFonte('playfair-display-400-700.woff2', 430)
const montserrat = await carregarFonte('montserrat-400-600.woff2', 450)

const NOME = 'STELLARA'
const SLOGAN = 'A STAR OF YOUR OWN.'

function svg(largura, altura, conteudo, titulo) {
  const w = n(largura)
  const h = n(altura)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${titulo}">` +
    `<title>${titulo}</title>${conteudo}</svg>\n`
}

/** Símbolo isolado. */
function arquivoSimbolo(cor, sufixo) {
  const c = caixaSimbolo()
  const margem = 4
  return svg(c.largura + margem * 2, c.altura + margem * 2,
    `<g transform="translate(${n(margem - c.minX)} ${n(margem - c.minY)})">${simbolo('s' + sufixo, cor)}</g>`,
    'Stellara — símbolo')
}

/** Símbolo à esquerda, fio vertical, nome e slogan à direita. */
function arquivoHorizontal(cor, sufixo) {
  const c = caixaSimbolo()
  const escalaSimbolo = 136 / c.altura
  const nome = textoEmCurvas(playfair, NOME, 46, 0.16)
  const slogan = textoEmCurvas(montserrat, SLOGAN, 10.5, 0.42)

  const alturaSimbolo = c.altura * escalaSimbolo
  const larguraSimbolo = c.largura * escalaSimbolo
  const vao = 34
  const blocoTexto = 46 + 20 + 10.5 // maiúsculas + respiro + slogan
  const larguraTexto = Math.max(nome.caixa.largura, slogan.caixa.largura)
  const margem = 6

  const xSimbolo = margem
  const xFio = xSimbolo + larguraSimbolo + vao
  const xTexto = xFio + vao
  const topoTexto = margem + (alturaSimbolo - blocoTexto) / 2
  const corTexto = cor ?? COR.dourado

  const conteudo =
    `<g transform="translate(${n(xSimbolo - c.minX * escalaSimbolo)} ${n(margem - c.minY * escalaSimbolo)}) scale(${n(escalaSimbolo * 1000) / 1000})">${simbolo('h' + sufixo, cor)}</g>` +
    `<path d="M${n(xFio)} ${n(margem + 14)}V${n(margem + alturaSimbolo - 14)}" stroke="${corTexto}" stroke-width="1" opacity="0.55"/>` +
    `<path d="${nome.d}" fill="${corTexto}" transform="translate(${n(xTexto + (larguraTexto - nome.caixa.largura) / 2 - nome.caixa.minX)} ${n(topoTexto + 46)})"/>` +
    `<path d="${slogan.d}" fill="${corTexto}" transform="translate(${n(xTexto + (larguraTexto - slogan.caixa.largura) / 2 - slogan.caixa.minX)} ${n(topoTexto + blocoTexto)})"/>`

  return svg(xTexto + larguraTexto + margem, alturaSimbolo + margem * 2, conteudo, 'Stellara — A star of your own.')
}

/** Símbolo em cima, nome e slogan centralizados embaixo. */
function arquivoVertical(cor, sufixo) {
  const c = caixaSimbolo()
  const nome = textoEmCurvas(playfair, NOME, 58, 0.17)
  const slogan = textoEmCurvas(montserrat, SLOGAN, 13, 0.42)
  const margem = 6
  const largura = Math.max(c.largura, nome.caixa.largura, slogan.caixa.largura) + margem * 2
  const centro = largura / 2
  const yNome = margem + c.altura + 40 + 58
  const ySlogan = yNome + 30 + 13
  const corTexto = cor ?? COR.dourado

  const conteudo =
    `<g transform="translate(${n(centro - (c.minX + c.largura / 2))} ${n(margem - c.minY)})">${simbolo('v' + sufixo, cor)}</g>` +
    `<path d="${nome.d}" fill="${corTexto}" transform="translate(${n(centro - nome.caixa.largura / 2 - nome.caixa.minX)} ${n(yNome)})"/>` +
    `<path d="${slogan.d}" fill="${corTexto}" transform="translate(${n(centro - slogan.caixa.largura / 2 - slogan.caixa.minX)} ${n(ySlogan)})"/>`

  return svg(largura, ySlogan + margem, conteudo, 'Stellara — A star of your own.')
}

const variantes = [
  ['', null],
  ['-mono-marfim', COR.marfim],
  ['-mono-noite', COR.noite],
]
const arquivos = []
for (const [sufixo, cor] of variantes) {
  for (const [nome, gerar] of [['simbolo', arquivoSimbolo], ['horizontal', arquivoHorizontal], ['vertical', arquivoVertical]]) {
    const arquivo = `stellara-${nome}${sufixo}.svg`
    writeFileSync(join(saida, arquivo), gerar(cor, sufixo.replace(/\W/g, '') || 'cor'))
    arquivos.push({ arquivo, fundo: cor === COR.noite ? 'claro' : 'escuro' })
  }
}

// ---------------------------------------------------------------------------
// Versão reduzida — favicon, cabeçalho e rodapé do site (até ~48 px)
// ---------------------------------------------------------------------------
/*
 * Mesma estrela e mesma órbita, desenhadas para sobreviver em tamanho
 * pequeno: a órbita fina da versão completa teria 0,4 px num favicon de 32 px
 * e sumiria. Aqui o traço é ~2,5x mais grosso e a estrela tem mais corpo
 * (sem isso, em 16–24 px ela some dentro da órbita e o símbolo vira um
 * planeta); sem facetas e sem a folga da órbita na frente — detalhes que
 * nesse tamanho só viram ruído.
 */
const REDUZIDA = { traco: 7, ponto: 10, margem: 6, cintura: 17 }

function geometriaReduzida() {
  const c = caixaSimbolo()
  const m = REDUZIDA.margem + REDUZIDA.traco / 2
  const lado = Math.max(c.largura, c.altura) + m * 2
  const dx = lado / 2 - (c.minX + c.largura / 2)
  const dy = lado / 2 - (c.minY + c.altura / 2)
  const [px, py] = naOrbita(PONTO.angulo)
  return {
    viewBox: `0 0 ${n(lado)} ${n(lado)}`,
    lado,
    transformacao: `translate(${n(dx)} ${n(dy)})`,
    estrela: contornoEstrela(REDUZIDA.cintura),
    orbita: { rx: ORBITA.rx, ry: ORBITA.ry, giro: ORBITA.giro, traco: REDUZIDA.traco },
    ponto: { cx: n(px), cy: n(py), r: REDUZIDA.ponto },
  }
}

const reduzida = geometriaReduzida()
const desenhoReduzido = (cor) =>
  `<g transform="${reduzida.transformacao}">` +
  `<ellipse rx="${reduzida.orbita.rx}" ry="${reduzida.orbita.ry}" transform="rotate(${reduzida.orbita.giro})" fill="none" stroke="${cor}" stroke-width="${reduzida.orbita.traco}"/>` +
  `<path d="${reduzida.estrela}" fill="${cor}"/>` +
  `<circle cx="${reduzida.ponto.cx}" cy="${reduzida.ponto.cy}" r="${reduzida.ponto.r}" fill="${cor}"/></g>`

writeFileSync(join(saida, 'stellara-simbolo-reduzido.svg'),
  svg(reduzida.lado, reduzida.lado, desenhoReduzido(COR.dourado), 'Stellara — símbolo (versão reduzida)'))
arquivos.push({ arquivo: 'stellara-simbolo-reduzido.svg', fundo: 'escuro' })

// Favicon da loja: a versão reduzida sobre o azul-noite, cantos arredondados.
const l = n(reduzida.lado)
writeFileSync(join(raiz, 'loja/public/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${l}">` +
  `<rect width="${l}" height="${l}" rx="${n(l * 0.22)}" fill="${COR.noite}"/>${desenhoReduzido(COR.dourado)}</svg>\n`)

// Geometria para o componente React `Simbolo` (cabeçalho e rodapé do site).
writeFileSync(join(raiz, 'loja/src/components/simboloGeometria.js'),
  `// GERADO por scripts/gerar-marca.mjs (npm run marca) — não edite à mão.\n` +
  `// Versão reduzida do símbolo oficial: ver o comentário de REDUZIDA no gerador.\n` +
  `export const SIMBOLO = ${JSON.stringify(reduzida, null, 2)}\n`)

// ---------------------------------------------------------------------------
// PNGs da loja (`loja/public/`) — ícones do app, favicon e prévia social
// ---------------------------------------------------------------------------
/*
 * Rasterizados aqui mesmo (resvg), a partir dos mesmos desenhos: mudou a
 * marca, `npm run marca` refaz tudo. Os nomes e tamanhos são os que o
 * `loja/index.html` e o `manifest.webmanifest` já apontam.
 */
function png(svgTexto, largura) {
  return new Resvg(svgTexto, { fitTo: { mode: 'width', value: largura } }).render().asPng()
}

/** Ícone quadrado: símbolo reduzido sobre o azul-noite. `ocupa` = fração do lado. */
function icone(ocupa, cantos) {
  const lado = 512
  const escala = (lado * ocupa) / reduzida.lado
  const deslocamento = (lado - reduzida.lado * escala) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}">` +
    `<rect width="${lado}" height="${lado}" rx="${cantos}" fill="${COR.noite}"/>` +
    `<g transform="translate(${n(deslocamento)} ${n(deslocamento)}) scale(${n(escala * 1000) / 1000})">${desenhoReduzido(COR.dourado)}</g></svg>`
}

const publico = join(raiz, 'loja/public')
// `any`: cantos arredondados próprios. Apple e maskable: quadrado cheio — o
// sistema recorta, e o maskable precisa do símbolo dentro da zona segura
// (círculo de 80% do lado), por isso ocupa menos.
writeFileSync(join(publico, 'favicon-32.png'), png(readFileSync(join(publico, 'favicon.svg'), 'utf8'), 32))
writeFileSync(join(publico, 'icon-192.png'), png(icone(0.78, 112), 192))
writeFileSync(join(publico, 'icon-512.png'), png(icone(0.78, 112), 512))
writeFileSync(join(publico, 'apple-touch-icon.png'), png(icone(0.72, 0), 180))
writeFileSync(join(publico, 'icon-maskable-512.png'), png(icone(0.56, 0), 512))

/** Prévia social 1200×630: céu, moldura dupla, símbolo, nome e chamada. */
function ogImage() {
  const L = 1200
  const A = 630
  // Estrelas com sorteio FIXO (mulberry32): a imagem não muda a cada geração.
  let semente = 20261014
  const sorteio = () => {
    semente |= 0
    semente = (semente + 0x6d2b79f5) | 0
    let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let ceu = ''
  for (let i = 0; i < 170; i += 1) {
    const r = sorteio() < 0.9 ? 0.6 + sorteio() * 0.6 : 1.2 + sorteio() * 0.8
    ceu += `<circle cx="${n(sorteio() * L)}" cy="${n(sorteio() * A)}" r="${n(r)}" fill="${COR.marfim}" opacity="${n(0.15 + sorteio() * 0.55)}"/>`
  }

  const c = caixaSimbolo()
  const escala = 150 / c.altura
  const nome = textoEmCurvas(playfair, NOME, 74, 0.17)
  const chamada = textoEmCurvas(montserrat, 'DEDIQUE UMA ESTRELA NO CÉU DO BRASIL', 17, 0.34)
  const ySimbolo = 92
  const yNome = ySimbolo + 150 + 62 + 74
  const yFio = yNome + 40
  const yChamada = yFio + 38 + 17

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}">` +
    `<rect width="${L}" height="${A}" fill="${COR.noite}"/>${ceu}` +
    `<rect x="34" y="34" width="${L - 68}" height="${A - 68}" rx="18" fill="none" stroke="${COR.dourado}" stroke-opacity="0.55" stroke-width="2"/>` +
    `<rect x="46" y="46" width="${L - 92}" height="${A - 92}" rx="12" fill="none" stroke="${COR.marfim}" stroke-opacity="0.12" stroke-width="1"/>` +
    `<g transform="translate(${n(L / 2 - (c.minX + c.largura / 2) * escala)} ${n(ySimbolo - c.minY * escala)}) scale(${n(escala * 1000) / 1000})">${simbolo('og', null)}</g>` +
    `<path d="${nome.d}" fill="${COR.dourado}" transform="translate(${n(L / 2 - nome.caixa.largura / 2 - nome.caixa.minX)} ${yNome})"/>` +
    `<path d="M${L / 2 - 150} ${yFio}H${L / 2 + 150}" stroke="${COR.dourado}" stroke-opacity="0.5" stroke-width="1"/>` +
    `<path d="${chamada.d}" fill="${COR.marfim}" fill-opacity="0.85" transform="translate(${n(L / 2 - chamada.caixa.largura / 2 - chamada.caixa.minX)} ${yChamada})"/>` +
    `</svg>`
}
writeFileSync(join(publico, 'og-image.png'), png(ogImage(), 1200))

// Nome e slogan em curvas para o certificado (`shared/certificado/`): a
// folha usa a marca IDÊNTICA à oficial, sem depender de fonte nem de motor
// de texto. Altura das maiúsculas = 100 unidades; quem desenha escala.
{
  const nome = textoEmCurvas(playfair, NOME, 100, 0.17)
  const slogan = textoEmCurvas(montserrat, SLOGAN, 100, 0.42)
  writeFileSync(join(raiz, 'shared/marcaTexto.js'),
    `// GERADO por scripts/gerar-marca.mjs (npm run marca) — não edite à mão.
` +
    `// "STELLARA" e o slogan em curvas, maiúsculas com 100 unidades de altura,
` +
    `// linha de base em y=0 (y para baixo, como no SVG).
` +
    `export const NOME_EM_CURVAS = ${JSON.stringify(nome)}
` +
    `export const SLOGAN_EM_CURVAS = ${JSON.stringify(slogan)}
`)
}

// Prancha de conferência: cada arquivo sobre o fundo para o qual foi feito.
writeFileSync(join(saida, 'index.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stellara — marca</title>
<style>
  body{margin:0;background:${COR.noite};color:${COR.marfim};font:14px/1.5 system-ui,sans-serif}
  main{max-width:1100px;margin:auto;padding:32px 16px;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
  figure{margin:0;border:1px solid #ffffff1f;border-radius:12px;overflow:hidden}
  figure div{display:grid;place-items:center;padding:32px;min-height:220px}
  figure img{max-width:100%;max-height:200px}
  .escuro div{background:${COR.noite}} .claro div{background:${COR.marfim}}
  figcaption{padding:8px 12px;font-family:ui-monospace,monospace;font-size:12px;opacity:.7}
</style></head><body><main>
${arquivos.map((a) => `<figure class="${a.fundo}"><div><img src="${a.arquivo}" alt=""></div><figcaption>${a.arquivo}</figcaption></figure>`).join('\n')}
<figure class="escuro" style="grid-column:1/-1"><div style="display:flex;gap:28px;align-items:center;justify-content:center;min-height:120px">
${[16, 24, 32, 48].map((t) => `<img src="stellara-simbolo-reduzido.svg" width="${t}" height="${t}" alt="">`).join('')}
<img src="../loja/public/favicon.svg" width="32" height="32" alt="" onerror="this.remove()">
</div><figcaption>versão reduzida em 16, 24, 32 e 48 px (cabeçalho, rodapé, favicon)</figcaption></figure>
</main></body></html>
`)

console.log(`marca/: ${arquivos.length} SVGs + index.html`)
