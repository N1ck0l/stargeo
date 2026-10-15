/**
 * O certificado — Edição Midnight, A4 retrato.
 *
 * UMA descrição da folha, consumida por dois desenhistas:
 *   - `loja/src/components/CertificadoPreview.jsx` → SVG na tela;
 *   - `shared/pdf.js` → PDF que vai por e-mail.
 *
 * Antes eram dois desenhos mantidos à mão (HTML de um lado, pdf-lib do
 * outro), e divergiram: o PDF saía com a Montserrat Thin, rótulos por cima
 * dos valores e filetes tortos, enquanto a tela mostrava outra coisa. Aqui a
 * folha é uma lista de itens em milímetros — degradê, linha, círculo,
 * caminho, texto — e cada lado só traduz item por item. O que a pessoa vê
 * antes de pagar é, por construção, o que ela recebe.
 *
 * Coordenadas: milímetros, origem no canto superior esquerdo, y para baixo
 * (como no SVG). O PDF inverte o y na tradução. Texto vem ancorado pela linha
 * de base e já com o X inicial calculado — com as MESMAS larguras dos dois
 * lados (`medir`, a partir de `metricas.js`), então a quebra de linha e a
 * centralização são idênticas na tela e no papel.
 */
import { METRICAS } from './metricas.js'
import { COR, arco, caixaSimbolo, contornoEstrela, facetas, naOrbita, ORBITA, PONTO } from '../marca.js'
import { NOME_EM_CURVAS, SLOGAN_EM_CURVAS } from '../marcaTexto.js'
import { projetarCeu, raioDaEstrela } from './mapa.js'

/** A4 retrato, em milímetros. */
export const PAGINA = { largura: 210, altura: 297 }

/** 25,4 mm ÷ 72 pt: corpo de fonte (pt) para milímetros. */
export const MM_POR_PT = 25.4 / 72

const CENTRO_X = PAGINA.largura / 2

/** Altura das maiúsculas de um corpo, em mm (~0,72 do corpo nas fontes da marca). */
const caixaAlta = (pt) => pt * MM_POR_PT * 0.72

// ---------------------------------------------------------------------------
// Texto: medida e quebra (as mesmas na tela e no PDF)
// ---------------------------------------------------------------------------

/**
 * Largura de um texto em mm, com `espaco` pt entre letras.
 *
 * Soma das larguras de avanço da fonte do PDF, sem kerning nem ligaduras —
 * o pdf-lib não aplica nenhum dos dois, e a prévia os desliga no CSS. Um
 * caractere fora da tabela conta como a largura média, em vez de zero.
 */
export function medir(fonte, texto, pt, espaco = 0) {
  const m = METRICAS[fonte]
  if (!m) throw new Error(`Fonte desconhecida no certificado: ${fonte}`)
  let soma = 0
  let n = 0
  for (const ch of String(texto)) {
    soma += m.larguras[ch.codePointAt(0)] ?? m.media ?? (m.media = media(m))
    n += 1
  }
  return (soma / m.unidades) * pt * MM_POR_PT + Math.max(0, n - 1) * espaco * MM_POR_PT
}

function media(m) {
  const valores = Object.values(m.larguras)
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

/**
 * Quebra em linhas de até `largura` mm. Palavra maior que a linha estoura
 * sozinha numa linha — partir um nome no meio ("Beatriz San-tos") é pior.
 */
export function quebrar(texto, fonte, pt, largura) {
  const palavras = String(texto ?? '').trim().split(/\s+/).filter(Boolean)
  const linhas = []
  let atual = ''
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (!atual || medir(fonte, tentativa, pt) <= largura) atual = tentativa
    else {
      linhas.push(atual)
      atual = palavra
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

// ---------------------------------------------------------------------------
// Paletas
// ---------------------------------------------------------------------------

/**
 * `escuro` é a Edição Midnight (a original, para tela e para guardar);
 * `claro` é a versão papel — fundo marfim, quase sem tinta, para a impressora.
 */
const PALETAS = {
  escuro: {
    fundoTopo: '#161b47',
    fundoBase: '#090b20',
    moldura: COR.dourado,
    texto: COR.marfim,
    suave: COR.marfim,
    suaveOpacidade: 0.78,
    rotulo: '#eadfb6',
    destaque: COR.dourado,
    facetaClara: COR.douradoClaro,
    facetaEscura: COR.douradoEscuro,
    estrelaCeu: COR.marfim,
    ceuDeFundo: true,
  },
  claro: {
    fundoTopo: '#fffdf7',
    fundoBase: '#f3ecdc',
    moldura: '#8f6f1f',
    texto: '#1b1d33',
    suave: '#4a4e69',
    suaveOpacidade: 1,
    rotulo: '#8f6f1f',
    destaque: '#8f6f1f',
    facetaClara: '#b08d3e',
    facetaEscura: '#7c5f1c',
    estrelaCeu: '#1b1d33',
    ceuDeFundo: false,
  },
}

/** Cor do degradê de fundo na altura `y` — para "recortes" que imitam a folga. */
function fundoEm(p, y) {
  return misturar(p.fundoTopo, p.fundoBase, y / PAGINA.altura)
}

function misturar(a, b, t) {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------------------
// A folha
// ---------------------------------------------------------------------------

/**
 * @typedef {object} DadosCertificado
 * @property {string} honoreeName
 * @property {string} starName
 * @property {string} [slug]            estrela do catálogo
 * @property {string} [sigla]           constelação ("Sgr") — destaca as linhas dela no mapa
 * @property {number} [ra]              horas (centro do mapa, se não houver slug)
 * @property {number} [dec]             graus
 * @property {string} bayer
 * @property {string} constellation
 * @property {string} constellationLatin
 * @property {string} spectralType
 * @property {string} raFormatted
 * @property {string} decFormatted
 * @property {number} magnitude
 * @property {number} distanceLy
 * @property {string} code
 * @property {string} [dedicationDate]  já em português
 * @property {string} [fromName]
 * @property {string} [message]
 * @property {string} [starNickname]    nome dado à estrela nesta homenagem
 */

/**
 * Monta a folha. Devolve `{ largura, altura, itens }`, itens na ordem de
 * desenho (o de trás primeiro).
 *
 * @param {DadosCertificado} dados
 * @param {{ claro?: boolean }} [opcoes]
 */
export function desenharCertificado(dados, opcoes = {}) {
  const p = PALETAS[opcoes.claro ? 'claro' : 'escuro']
  const itens = []
  const add = (item) => itens.push(item)

  /** Texto com X inicial já resolvido pelo alinhamento. */
  const texto = (conteudo, { x = CENTRO_X, y, fonte, pt, cor, alinhar = 'centro', espaco = 0, opacidade = 1 }) => {
    const largura = medir(fonte, conteudo, pt, espaco)
    const inicio = alinhar === 'centro' ? x - largura / 2 : alinhar === 'direita' ? x - largura : x
    add({ tipo: 'texto', x: inicio, y, texto: conteudo, fonte, pt, cor, espaco, opacidade, largura })
    return largura
  }

  // --- Fundo -----------------------------------------------------------------
  add({ tipo: 'degrade', topo: p.fundoTopo, base: p.fundoBase })
  if (p.ceuDeFundo) ceuDeFundo(add, dados.code ?? '', p)

  // --- Moldura ---------------------------------------------------------------
  moldura(add, p)

  // --- Marca -----------------------------------------------------------------
  simboloOficial(add, p, { cx: CENTRO_X, cy: 33, altura: 22 })
  marcaEmCurvas(add, NOME_EM_CURVAS, { cx: CENTRO_X, base: 55, caixaAlta: 6.2, cor: p.destaque })
  marcaEmCurvas(add, SLOGAN_EM_CURVAS, { cx: CENTRO_X, base: 60.6, caixaAlta: 1.55, cor: p.destaque, opacidade: 0.85 })
  divisor(add, p, 70.5, 30)

  // --- Título ----------------------------------------------------------------
  texto('CERTIFICADO DE DEDICAÇÃO', { y: 86, fonte: 'serif', pt: 17, cor: p.destaque, espaco: 2.2 })
  texto('DE UMA ESTRELA', { y: 92.6, fonte: 'sansMedio', pt: 6.2, cor: p.rotulo, espaco: 2.6, opacidade: 0.9 })

  // --- Bloco central: estrela, nome e mensagem -------------------------------
  blocoCentral(add, texto, dados, p, { topo: 103, base: 197 })

  // --- Dados, mapa do céu e frase --------------------------------------------
  add({ tipo: 'linha', x1: 34, y1: 202.5, x2: 176, y2: 202.5, cor: p.moldura, espessura: 0.18, opacidade: 0.35 })
  dadosAstronomicos(texto, dados, p)
  texto('Algumas estrelas são feitas para sempre.', {
    x: 26, y: 254.5, fonte: 'serifItalico', pt: 10, cor: p.destaque, alinhar: 'esquerda', opacidade: 0.95,
  })
  mapaDoCeu(add, texto, dados, p, { cx: 152, cy: 232, r: 23 })

  // --- Rodapé ----------------------------------------------------------------
  rodape(add, texto, dados, p)

  return { largura: PAGINA.largura, altura: PAGINA.altura, itens }
}

// ---------------------------------------------------------------------------
// Partes da folha
// ---------------------------------------------------------------------------

/** Estrelinhas de fundo, em sorteio FIXO pelo código: a mesma folha sempre. */
function ceuDeFundo(add, semente, p) {
  let s = 2166136261
  for (const ch of `stellara:${semente}`) s = Math.imul(s ^ ch.charCodeAt(0), 16777619)
  const sorteio = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 140; i += 1) {
    const cx = 15 + sorteio() * (PAGINA.largura - 30)
    const cy = 15 + sorteio() * (PAGINA.altura - 30)
    const r = 0.1 + sorteio() ** 3 * 0.32
    const opacidade = 0.12 + sorteio() * 0.38
    // Fora da coluna de texto do miolo e da área dos dados/mapa: estrelinha
    // em cima de uma letra parece sujeira de impressão, não céu.
    const noTexto = (cx > 30 && cx < 180 && cy > 76 && cy < 200) || (cy > 205 && cy < 285)
    if (!noTexto) add({ tipo: 'circulo', cx, cy, r, preenchimento: p.estrelaCeu, opacidade })
  }
}

/**
 * Moldura dupla com uma estrela da marca em cada canto da externa — a linha
 * externa é interrompida ali, para a estrela "segurar" o canto.
 */
function moldura(add, p) {
  const e = 10 // externa
  const i = 13 // interna
  const L = PAGINA.largura
  const A = PAGINA.altura
  const folga = 4.2
  const linha = (x1, y1, x2, y2) => add({ tipo: 'linha', x1, y1, x2, y2, cor: p.moldura, espessura: 0.5, opacidade: 1 })
  linha(e + folga, e, L - e - folga, e)
  linha(e + folga, A - e, L - e - folga, A - e)
  linha(e, e + folga, e, A - e - folga)
  linha(L - e, e + folga, L - e, A - e - folga)
  add({ tipo: 'retangulo', x: i, y: i, largura: L - i * 2, altura: A - i * 2, traco: p.moldura, espessura: 0.18, opacidade: 0.7 })
  for (const [cx, cy] of [[e, e], [L - e, e], [e, A - e], [L - e, A - e]]) {
    estrelaPequena(add, cx, cy, 6.4, p.moldura)
  }
}

/** A estrela da marca, só o contorno, com `altura` mm. */
function estrelaPequena(add, cx, cy, altura, cor, opacidade = 1) {
  // A estrela sem a órbita vai de -96 a 104 no eixo vertical: o centro
  // visual fica 4 unidades abaixo da origem.
  const escala = altura / 200
  add({ tipo: 'caminho', d: contornoEstrela(), x: cx, y: cy - 4 * escala, escala, preenchimento: cor, opacidade })
}

/**
 * O símbolo oficial (facetas + órbita) centrado em (cx, cy).
 *
 * A folga da órbita na frente da estrela é feita "pintando" a faixa com a
 * cor do fundo naquela altura, antes do traço dourado: o pdf-lib não tem
 * máscara, e a imitação é invisível sobre o degradê suave.
 */
function simboloOficial(add, p, { cx, cy, altura }) {
  const c = caixaSimbolo()
  const escala = altura / c.altura
  const x = cx - (c.minX + c.largura / 2) * escala
  const y = cy - (c.minY + c.altura / 2) * escala
  const orbita = (d, cor, espessura) =>
    add({ tipo: 'caminho', d, x, y, escala, traco: cor, espessura: espessura * escala, opacidade: 1, ponta: 'redonda' })

  orbita(arco(false), p.destaque, ORBITA.traco)
  for (const f of facetas()) {
    add({ tipo: 'caminho', d: f.d, x, y, escala, preenchimento: f.tom === 'claro' ? p.facetaClara : p.facetaEscura, opacidade: 1 })
  }
  orbita(arco(true), fundoEm(p, cy), ORBITA.traco + ORBITA.folga * 2)
  orbita(arco(true), p.destaque, ORBITA.traco)
  const [px, py] = naOrbita(PONTO.angulo)
  add({ tipo: 'circulo', cx: x + px * escala, cy: y + py * escala, r: PONTO.raio * escala, preenchimento: p.destaque, opacidade: 1 })
}

/** Nome/slogan em curvas (maiúsculas = 100 unidades), centrados em `cx`. */
function marcaEmCurvas(add, curvas, { cx, base, caixaAlta: alturaMm, cor, opacidade = 1 }) {
  const escala = alturaMm / 100
  const x = cx - (curvas.caixa.minX + curvas.caixa.largura / 2) * escala
  add({ tipo: 'caminho', d: curvas.d, x, y: base, escala, preenchimento: cor, opacidade })
}

/** Fio com uma estrelinha no meio. */
function divisor(add, p, y, meia) {
  const vao = 4.5
  add({ tipo: 'linha', x1: CENTRO_X - meia, y1: y, x2: CENTRO_X - vao, y2: y, cor: p.moldura, espessura: 0.2, opacidade: 0.55 })
  add({ tipo: 'linha', x1: CENTRO_X + vao, y1: y, x2: CENTRO_X + meia, y2: y, cor: p.moldura, espessura: 0.2, opacidade: 0.55 })
  estrelaPequena(add, CENTRO_X, y, 3.6, p.moldura)
}

/**
 * Estrela, nome e mensagem: o único bloco de tamanho variável.
 *
 * Cada elemento declara a altura das maiúsculas e o vão até o próximo; o
 * conjunto é centralizado na faixa. Se não couber, os vãos apertam primeiro
 * (até 65%), depois a mensagem encolhe (até 8,5 pt) e por último o nome (até
 * 22 pt) — o nome de quem recebe é a última coisa a diminuir. O pior caso medido (nome de 80 caracteres +
 * mensagem de 600) cabe; o teste `certificado.test.js` garante.
 */
function blocoCentral(add, texto, dados, p, { topo, base }) {
  const nome = String(dados.honoreeName ?? '').trim() || 'Nome de quem recebe'
  const mensagem = String(dados.message ?? '').trim()
  const apelido = String(dados.starNickname ?? '').trim()
  const estrelaPt = medir('serif', dados.starName, 26) > 150 ? 21 : 26

  let nomePt = 34
  let msgPt = 11
  let aperto = 1
  let montagem
  for (;;) {
    montagem = montar()
    if (montagem.altura <= base - topo) break
    if (aperto > 0.65) aperto -= 0.05
    else if (msgPt > 8.5 && mensagem) msgPt -= 0.5
    else if (nomePt > 22) nomePt -= 1
    else break
  }

  function montar() {
    let nomeLinhas = quebrar(nome, 'serifItalico', nomePt, 160)
    let pt = nomePt
    while (nomeLinhas.length > 2 && pt > 22) {
      pt -= 1
      nomeLinhas = quebrar(nome, 'serifItalico', pt, 160)
    }
    // Palavra sozinha mais larga que a linha (nome sem espaços) não quebra:
    // o corpo desce até ela caber, em vez de vazar pela moldura.
    const maisLarga = () => Math.max(...nomeLinhas.map((l) => medir('serifItalico', l, pt)))
    while (maisLarga() > 168 && pt > 10) {
      pt -= 1
      nomeLinhas = quebrar(nome, 'serifItalico', pt, 160)
    }
    const msgLinhas = mensagem ? quebrar(mensagem, 'serifItalico', msgPt, 156) : []
    // O nome dado à estrela: uma linha só, entre aspas; encolhe para caber.
    const apelidoTexto = apelido ? `“${apelido}”` : ''
    let apelidoPt = 17
    while (apelido && apelidoPt > 11 && medir('serifItalico', apelidoTexto, apelidoPt) > 160) apelidoPt -= 0.5
    const passoNome = pt * MM_POR_PT * 1.18
    const passoMsg = msgPt * MM_POR_PT * 1.5

    // [altura das maiúsculas da 1ª linha, altura total, vão depois, desenhar(y da 1ª base)]
    const partes = [
      [caixaAlta(8.5), caixaAlta(8.5), 5.5, (y) => texto('Certificamos que a estrela', { y, fonte: 'sans', pt: 8.5, cor: p.suave, opacidade: p.suaveOpacidade })],
      [caixaAlta(estrelaPt), caixaAlta(estrelaPt), 4.2, (y) => texto(dados.starName, { y, fonte: 'serif', pt: estrelaPt, cor: p.destaque })],
      [caixaAlta(12), caixaAlta(12), 8, (y) => texto(`${dados.bayer} · ${dados.constellation}`, { y, fonte: 'grego', pt: 12, cor: p.suave, opacidade: p.suaveOpacidade })],
      // Nomeação simbólica, dita como tal: o nome oficial continua o de cima.
      ...(apelido
        ? [
            [caixaAlta(8.5), caixaAlta(8.5), 4.6, (y) => texto('chamada, nesta homenagem, de', { y, fonte: 'sans', pt: 8.5, cor: p.suave, opacidade: p.suaveOpacidade })],
            [
              caixaAlta(apelidoPt),
              caixaAlta(apelidoPt),
              apelidoPt * MM_POR_PT * 0.28 + 6,
              (y) => texto(apelidoTexto, { y, fonte: 'serifItalico', pt: apelidoPt, cor: p.destaque }),
            ],
          ]
        : []),
      [caixaAlta(8.5), caixaAlta(8.5), 7, (y) => texto('foi dedicada a', { y, fonte: 'sans', pt: 8.5, cor: p.suave, opacidade: p.suaveOpacidade })],
      [
        caixaAlta(pt),
        caixaAlta(pt) + (nomeLinhas.length - 1) * passoNome,
        // Folga para as hastes descendentes (g, p, q) não tocarem o fio.
        pt * MM_POR_PT * 0.28 + 3,
        (y) => nomeLinhas.forEach((linha, i) => texto(linha, { y: y + i * passoNome, fonte: 'serifItalico', pt, cor: p.texto })),
      ],
      [0.2, 0.2, msgLinhas.length ? 6.5 : 0, (y) => add({ tipo: 'linha', x1: CENTRO_X - 22, y1: y, x2: CENTRO_X + 22, y2: y, cor: p.moldura, espessura: 0.2, opacidade: 0.6 })],
    ]
    if (msgLinhas.length) {
      partes.push([
        caixaAlta(msgPt),
        caixaAlta(msgPt) + (msgLinhas.length - 1) * passoMsg,
        0,
        (y) => msgLinhas.forEach((linha, i) => texto(linha, { y: y + i * passoMsg, fonte: 'serifItalico', pt: msgPt, cor: p.suave, opacidade: p.suaveOpacidade })),
      ])
    }
    for (const parte of partes) parte[2] *= aperto
    const altura = partes.reduce((soma, [, total, vao], i) => soma + total + (i < partes.length - 1 ? vao : 0), 0)
    return { partes, altura }
  }

  // Centraliza na faixa; o que não coube (caso extremo) começa no topo.
  let y = topo + Math.max(0, (base - topo - montagem.altura) / 2)
  for (const [caps, total, vao, desenhar] of montagem.partes) {
    desenhar(y + caps)
    y += total + vao
  }
}

/** Seis dados em duas colunas, à esquerda do mapa. */
function dadosAstronomicos(texto, dados, p) {
  const formatar = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  const campos = [
    ['CONSTELAÇÃO', dados.constellationLatin],
    ['TIPO ESPECTRAL', dados.spectralType],
    ['ASCENSÃO RETA', dados.raFormatted],
    ['DECLINAÇÃO', dados.decFormatted],
    ['MAGNITUDE', formatar(dados.magnitude)],
    // Estrela fraca muitas vezes não tem paralaxe confiável: sem número, em vez
    // de um "0 anos-luz" ou um chute.
    [
      'DISTÂNCIA',
      Number(dados.distanceLy) > 0
        ? `${Number(dados.distanceLy).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos-luz`
        : 'não medida',
    ],
  ]
  campos.forEach(([rotulo, valor], i) => {
    const x = i % 2 === 0 ? 26 : 70
    const y = 212 + Math.floor(i / 2) * 13.5
    texto(rotulo, { x, y, fonte: 'sansMedio', pt: 5.4, cor: p.rotulo, alinhar: 'esquerda', espaco: 1.2 })
    // Valor longo encolhe para caber na coluna (40 mm), nunca invade a vizinha.
    let pt = 9.5
    while (pt > 7 && medir('sans', String(valor), pt) > 40) pt -= 0.5
    texto(String(valor), { x, y: y + 5.4, fonte: 'sans', pt, cor: p.texto, alinhar: 'esquerda' })
  })
}

/**
 * Mapa do céu real em volta da estrela: projeção gnomônica (a dos atlas),
 * norte para cima e leste à esquerda — como se vê olhando para o céu. Os
 * dados (Hipparcos, via d3-celestial) estão em `shared/ceu.js`.
 */
function mapaDoCeu(add, texto, dados, p, { cx, cy, r }) {
  // Retícula: dois anéis e a cruz, bem apagados.
  for (const f of [0.5, 0.82]) {
    add({ tipo: 'circulo', cx, cy, r: r * f, traco: p.moldura, espessura: 0.12, opacidade: 0.22 })
  }
  add({ tipo: 'linha', x1: cx - r, y1: cy, x2: cx + r, y2: cy, cor: p.moldura, espessura: 0.1, opacidade: 0.18 })
  add({ tipo: 'linha', x1: cx, y1: cy - r, x2: cx, y2: cy + r, cor: p.moldura, espessura: 0.1, opacidade: 0.18 })

  // Linhas da constelação e estrelas, do tamanho do brilho.
  const ceu = projetarCeu(dados, { cx, cy, r })
  // As constelações vizinhas bem apagadas; a da estrela, em destaque.
  for (const [x1, y1, x2, y2] of ceu.linhasVizinhas) {
    add({ tipo: 'linha', x1, y1, x2, y2, cor: p.moldura, espessura: 0.14, opacidade: 0.22 })
  }
  for (const [x1, y1, x2, y2] of ceu.linhas) {
    add({ tipo: 'linha', x1, y1, x2, y2, cor: p.destaque, espessura: 0.22, opacidade: 0.6 })
  }
  for (const { x, y, mag } of ceu.estrelas) {
    add({ tipo: 'circulo', cx: x, cy: y, r: raioDaEstrela(mag), preenchimento: p.estrelaCeu, opacidade: mag < 3 ? 0.95 : 0.7 })
  }

  // A estrela dedicada: a estrela da marca, com um anel.
  add({ tipo: 'circulo', cx, cy, r: 3.1, traco: p.destaque, espessura: 0.2, opacidade: 0.8 })
  estrelaPequena(add, cx, cy, 5.2, p.destaque)

  // Borda por cima de tudo, e as direções.
  add({ tipo: 'circulo', cx, cy, r, traco: p.moldura, espessura: 0.35, opacidade: 0.9 })
  texto('N', { x: cx, y: cy - r - 1.6, fonte: 'sansMedio', pt: 5.4, cor: p.rotulo })
  texto('L', { x: cx - r - 2.6, y: cy + 0.9, fonte: 'sansMedio', pt: 5.4, cor: p.rotulo })
  texto(`${String(dados.constellationLatin ?? '').toUpperCase()} · J2000`, {
    x: cx, y: cy + r + 5, fonte: 'sansMedio', pt: 5, cor: p.rotulo, espaco: 1, opacidade: 0.9,
  })
}

/** Registro e data à esquerda, assinatura à direita, aviso no centro. */
function rodape(add, texto, dados, p) {
  texto('REGISTRO', { x: 26, y: 266, fonte: 'sansMedio', pt: 5.4, cor: p.rotulo, alinhar: 'esquerda', espaco: 1.2 })
  texto(String(dados.code ?? ''), { x: 26, y: 271.2, fonte: 'sans', pt: 8.5, cor: p.texto, alinhar: 'esquerda', espaco: 0.6 })
  if (dados.dedicationDate) {
    texto(`Dedicada em ${dados.dedicationDate}`, {
      x: 26, y: 276.2, fonte: 'sansItalico', pt: 7, cor: p.suave, alinhar: 'esquerda', opacidade: p.suaveOpacidade,
    })
  }

  const assinatura = String(dados.fromName ?? '').trim()
  if (assinatura) {
    let pt = 13
    while (pt > 8 && medir('serifItalico', assinatura, pt) > 58) pt -= 0.5
    texto(assinatura, { x: 184, y: 270.5, fonte: 'serifItalico', pt, cor: p.destaque, alinhar: 'direita' })
    add({ tipo: 'linha', x1: 126, y1: 273, x2: 184, y2: 273, cor: p.moldura, espessura: 0.2, opacidade: 0.6 })
    texto('ASSINATURA', { x: 184, y: 277, fonte: 'sansMedio', pt: 5, cor: p.rotulo, alinhar: 'direita', espaco: 1.2 })
  }

  // Nota honesta: certificado de afeto, não registro astronômico oficial.
  texto('Homenagem simbólica · coordenadas do catálogo Hipparcos (ESA)', {
    y: 281.6, fonte: 'sansItalico', pt: 5.2, cor: p.suave, opacidade: p.suaveOpacidade * 0.8,
  })
}
