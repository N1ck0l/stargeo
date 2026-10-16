/**
 * A carta que acompanha o certificado — A4 retrato, peça irmã da folha.
 *
 * Mesma paleta, mesmas fontes e a mesma estrela da marca, mas outra
 * composição: o certificado é para contemplar (tudo centrado, hierarquia
 * forte, dados); a carta é para LER — texto alinhado à esquerda, corpo
 * confortável, muito ar e quase nenhum ornamento. Não pode parecer um
 * formulário anexado: é a segunda peça do presente.
 *
 * Mesma saída do certificado (`{ largura, altura, itens }`, em mm), então os
 * mesmos tradutores servem: `CertificadoPreview.jsx` (SVG na tela) e
 * `shared/pdf.js` (PDF). A prévia na compra é, por construção, o arquivo.
 *
 * O texto é de quem dá, sem moldes: nenhuma frase fixa ("Com carinho",
 * "Para sempre") que não sirva a toda homenagem. O primeiro parágrafo curto
 * ("Meu amor,", "Querida vó,") vira a saudação.
 */
import {
  CENTRO_X,
  PAGINA,
  PALETAS,
  caixaAlta,
  divisor,
  estrelaPequena,
  medir,
  MM_POR_PT,
  quebrar,
  simboloOficial,
} from '../certificado/desenho.js'
import { paragrafosDaCarta } from '../moderation.js'
import { qrDaUrl, seloDoParceiro } from '../campanha.js'

/** Margens da coluna de texto, em mm. */
const ESQUERDA = 32
const LARGURA = 146
const DIREITA = ESQUERDA + LARGURA

/** Faixa do texto: da saudação até antes do rodapé (a de campanha tem o QR embaixo). */
const TOPO = 76
const BASE_SIMPLES = 256
const BASE_CAMPANHA = 222

/** Primeiro parágrafo com até isto de caracteres vira saudação. */
const SAUDACAO_MAX = 80

/**
 * @typedef {object} DadosCarta
 * @property {string[] | string} paragrafos  a carta (lista, ou texto com quebras de linha)
 * @property {string} [titulo]        título no topo ("Uma carta para você")
 * @property {string} [fromName]      assinatura
 * @property {string} [honoreeName]   para quem (só no título do PDF)
 * @property {string} [starName]      a estrela (rodapé)
 * @property {string} [code]          registro (rodapé)
 * @property {string} [qrUrl]         campanha: o endereço DEFINITIVO da página (vira o QR)
 */

/**
 * Campanha (`opcoes.campanha`): o parceiro no cabeçalho ("uma homenagem
 * PROIMAGEM"), a frase final opcional e, no pé, o QR da página com "Acesse
 * sua homenagem" e o endereço legível, ao lado do selo do parceiro.
 *
 * @param {DadosCarta} dados
 * @param {{ claro?: boolean, campanha?: import('../campanha.js').Campanha }} [opcoes]
 */
export function desenharCarta(dados, opcoes = {}) {
  const p = PALETAS[opcoes.claro ? 'claro' : 'escuro']
  const campanha = opcoes.campanha ?? null
  const base = campanha ? BASE_CAMPANHA : BASE_SIMPLES
  const itens = []
  const add = (item) => itens.push(item)
  const texto = (conteudo, { x = CENTRO_X, y, fonte, pt, cor, alinhar = 'centro', espaco = 0, opacidade = 1 }) => {
    const largura = medir(fonte, conteudo, pt, espaco)
    const inicio = alinhar === 'centro' ? x - largura / 2 : alinhar === 'direita' ? x - largura : x
    add({ tipo: 'texto', x: inicio, y, texto: conteudo, fonte, pt, cor, espaco, opacidade, largura })
  }

  // --- Fundo e moldura (uma linha só: mais leve que a dupla do certificado) --
  add({ tipo: 'degrade', topo: p.fundoTopo, base: p.fundoBase })
  const m = 12
  add({ tipo: 'retangulo', x: m, y: m, largura: PAGINA.largura - m * 2, altura: PAGINA.altura - m * 2, traco: p.moldura, espessura: 0.25, opacidade: 0.75 })
  for (const [cx, cy] of [[m, m], [PAGINA.largura - m, m], [m, PAGINA.altura - m], [PAGINA.largura - m, PAGINA.altura - m]]) {
    estrelaPequena(add, cx, cy, 4.6, p.moldura)
  }

  // --- Cabeçalho -------------------------------------------------------------
  simboloOficial(add, p, { cx: CENTRO_X, cy: 28, altura: 11 })
  const chamada = campanha ? `STELLARA · UMA HOMENAGEM ${campanha.parceiro}`.toLocaleUpperCase('pt-BR') : 'STELLARA · UMA HOMENAGEM ESPECIAL'
  texto(chamada, { y: 42.5, fonte: 'sansMedio', pt: 6, cor: p.rotulo, espaco: 2.4, opacidade: 0.85 })
  const titulo = String(dados.titulo ?? '').trim() || 'Uma carta para você'
  let tituloPt = 20
  while (tituloPt > 12 && medir('serif', titulo, tituloPt) > LARGURA) tituloPt -= 0.5
  texto(titulo, { y: 56, fonte: 'serif', pt: tituloPt, cor: p.destaque })
  divisor(add, p, 63.5, 22)

  // --- O texto ---------------------------------------------------------------
  corpo(add, texto, dados, p, base)

  const estrela = String(dados.starName ?? '').trim()
  const codigo = String(dados.code ?? '').trim()

  if (campanha) {
    rodapeDeCampanha(add, texto, dados, p, campanha, { estrela, codigo, claro: Boolean(opcoes.claro) })
    return { largura: PAGINA.largura, altura: PAGINA.altura, itens }
  }

  // --- Rodapé: a ponte com o certificado ---------------------------------------
  if (estrela || codigo) {
    add({ tipo: 'linha', x1: CENTRO_X - 16, y1: 264, x2: CENTRO_X + 16, y2: 264, cor: p.moldura, espessura: 0.18, opacidade: 0.5 })
    const linha = [estrela && `Acompanha o certificado da estrela ${estrela}`, codigo && `registro ${codigo}`].filter(Boolean).join(' · ')
    let pt = 7
    while (pt > 5 && medir('sansItalico', linha, pt) > LARGURA + 10) pt -= 0.25
    texto(linha, { y: 270.5, fonte: 'sansItalico', pt, cor: p.suave, opacidade: p.suaveOpacidade * 0.85 })
  }

  return { largura: PAGINA.largura, altura: PAGINA.altura, itens }
}

/**
 * Saudação, parágrafos e assinatura. Começa no alto da faixa (carta se lê de
 * cima para baixo); carta curta desce um pouco, para não deixar o pé vazio.
 * Se não couber, o corpo encolhe (até 8,5 pt) e depois os vãos apertam.
 */
function corpo(add, texto, dados, p, BASE) {
  const todos = paragrafosDaCarta(dados.paragrafos)
  const lista = todos.length ? todos : ['Escreva aqui a sua carta.']
  const saudacao = lista.length > 1 && lista[0].length <= SAUDACAO_MAX ? lista[0] : ''
  const paragrafos = saudacao ? lista.slice(1) : lista
  const assinatura = String(dados.fromName ?? '').trim()

  let pt = 12
  let aperto = 1
  let montagem
  for (;;) {
    montagem = montar(pt, aperto)
    if (montagem.altura <= BASE - TOPO) break
    if (pt > 8.5) pt -= 0.25
    else if (aperto > 0.6) aperto -= 0.05
    else break
  }

  function montar(corpoPt, fator) {
    const blocos = []
    const passo = corpoPt * MM_POR_PT * 1.62
    // Palavra mais larga que a coluna (sem espaços) desce o corpo DELA até caber.
    const linhasDe = (t, fonte, base) => {
      let tam = base
      let linhas = quebrar(t, fonte, tam, LARGURA)
      const larga = () => Math.max(...linhas.map((l) => medir(fonte, l, tam))) > LARGURA
      while (tam > 8 && larga()) {
        tam -= 0.5
        linhas = quebrar(t, fonte, tam, LARGURA)
      }
      // Último caso ("WWWW…" sem espaço nenhum): parte a palavra na borda.
      if (larga()) linhas = quebrar(partirPalavras(t, fonte, tam), fonte, tam, LARGURA)
      return { linhas, tam }
    }

    if (saudacao) {
      const { linhas, tam } = linhasDe(saudacao, 'serifItalico', corpoPt * 1.35)
      const passoS = tam * MM_POR_PT * 1.3
      blocos.push({
        caps: caixaAlta(tam),
        altura: caixaAlta(tam) + (linhas.length - 1) * passoS,
        vao: 7 * fator,
        desenhar: (y) => linhas.forEach((l, i) => texto(l, { x: ESQUERDA, y: y + i * passoS, fonte: 'serifItalico', pt: tam, cor: p.destaque, alinhar: 'esquerda' })),
      })
    }
    paragrafos.forEach((paragrafo) => {
      const { linhas, tam } = linhasDe(paragrafo, 'serif', corpoPt)
      blocos.push({
        caps: caixaAlta(tam),
        altura: caixaAlta(tam) + (linhas.length - 1) * passo,
        vao: (passo * 0.5 + 3.2) * fator,
        desenhar: (y) => linhas.forEach((l, i) => texto(l, { x: ESQUERDA, y: y + i * passo, fonte: 'serif', pt: tam, cor: p.texto, alinhar: 'esquerda', opacidade: 0.92 })),
      })
    })
    if (assinatura) {
      let tam = 15
      while (tam > 9 && medir('serifItalico', assinatura, tam) > LARGURA) tam -= 0.5
      blocos[blocos.length - 1].vao += 5 * fator
      blocos.push({
        caps: caixaAlta(tam),
        altura: caixaAlta(tam),
        vao: 0,
        desenhar: (y) => texto(assinatura, { x: DIREITA, y, fonte: 'serifItalico', pt: tam, cor: p.destaque, alinhar: 'direita' }),
      })
    }
    const altura = blocos.reduce((soma, b, i) => soma + b.altura + (i < blocos.length - 1 ? b.vao : 0), 0)
    return { blocos, altura }
  }

  let y = TOPO + Math.max(0, (BASE - TOPO - montagem.altura) * 0.2)
  for (const bloco of montagem.blocos) {
    bloco.desenhar(y + bloco.caps)
    y += bloco.altura + bloco.vao
  }
}

/** Parte cada palavra mais larga que a coluna em pedaços que cabem nela. */
function partirPalavras(texto, fonte, pt) {
  return texto
    .split(' ')
    .map((palavra) => {
      if (medir(fonte, palavra, pt) <= LARGURA) return palavra
      const pedacos = []
      let atual = ''
      for (const letra of palavra) {
        if (atual && medir(fonte, atual + letra, pt) > LARGURA) {
          pedacos.push(atual)
          atual = letra
        } else atual += letra
      }
      return [...pedacos, atual].join(' ')
    })
    .join(' ')
}

/**
 * Pé da carta de campanha: frase final (opcional), o QR da página com "Acesse
 * sua homenagem" e o endereço legível (para quem não usa a câmera), e o selo
 * do parceiro à direita. O QR só sai com endereço — nunca um QR decorativo.
 */
function rodapeDeCampanha(add, texto, dados, p, campanha, { estrela, codigo, claro }) {
  const frase = String(campanha.fraseFinal ?? '').trim()
  if (frase) {
    let pt = 10.5
    while (pt > 8 && medir('serifItalico', frase, pt) > LARGURA) pt -= 0.25
    texto(frase, { y: 232, fonte: 'serifItalico', pt, cor: p.destaque, opacidade: 0.95 })
  }
  add({ tipo: 'linha', x1: ESQUERDA, y1: 238.5, x2: DIREITA, y2: 238.5, cor: p.moldura, espessura: 0.18, opacidade: 0.45 })

  const url = String(dados.qrUrl ?? '').trim()
  if (url) {
    qrDaUrl(add, { x: ESQUERDA - 2, y: 243, tamanho: 30, url })
    const x = ESQUERDA + 33
    texto('ACESSE SUA HOMENAGEM', { x, y: 252, fonte: 'sansMedio', pt: 6.6, cor: p.rotulo, alinhar: 'esquerda', espaco: 1.4 })
    const legivel = url.replace(/^https?:\/\//, '')
    let pt = 8
    while (pt > 6 && medir('sans', legivel, pt) > 76) pt -= 0.25
    texto(legivel, { x, y: 258, fonte: 'sans', pt, cor: p.texto, alinhar: 'esquerda' })
    texto('Aponte a câmera do celular para o código ao lado.', {
      x, y: 263.5, fonte: 'sansItalico', pt: 6.2, cor: p.suave, alinhar: 'esquerda', opacidade: p.suaveOpacidade,
    })
    const ponte = [estrela && `Acompanha o certificado da estrela ${estrela}`, codigo && `registro ${codigo}`].filter(Boolean).join(' · ')
    if (ponte) {
      let ptPonte = 6.2
      while (ptPonte > 5 && medir('sansItalico', ponte, ptPonte) > 76) ptPonte -= 0.25
      texto(ponte, { x, y: 269.5, fonte: 'sansItalico', pt: ptPonte, cor: p.suave, alinhar: 'esquerda', opacidade: p.suaveOpacidade * 0.85 })
    }
  }

  seloDoParceiro(add, p, { x: DIREITA - 32, y: 245, largura: 32, campanha, claro })
}

