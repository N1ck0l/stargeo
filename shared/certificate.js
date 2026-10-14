/**
 * Desenho do certificado, em uma fonte só.
 *
 * A mesma instância gera o PDF na Edge Function e o preview na loja. Se os
 * dois desenhassem por conta própria, o cliente receberia um papel diferente
 * do que viu na tela — e isso é exatamente o tipo de arrependimento que o
 * Código de Defesa do Consumidor torna direito.
 *
 * Por isso o desenho é imperativo sobre coordenadas em milímetros, e não HTML:
 * não depende de fonte instalada, de navegador nem de Tailwind. `pdf-lib` só
 * sabe desenhar retângulos, linhas e texto, e é tudo o que um certificado
 * precisa.
 */

/** Paleta, espelhando as variáveis CSS do site (`src/index.css`). */
export const PALETTE = {
  night: '#07061a',
  deep: '#100b2e',
  gold: '#e8c872',
  goldSoft: '#f3e6b8',
  ivory: '#f7f1e1',
  paper: '#fffdf7',
  paperEdge: '#f2eada',
  ink: '#2b2342',
  inkMuted: '#5a5170',
  goldInk: '#8a6a1c',
}

/** A4 paisagem, em milímetros. */
export const PAGE = { width: 297, height: 210 }

/**
 * Milímetros por ponto: 25,4 mm ÷ 72 pt ≈ 0,353. Multiplica um tamanho em
 * pontos para obter milímetros — a ponte entre o corpo da fonte (que o
 * pdf-lib e a tipografia mantêm em pt) e o sistema de coordenadas em mm
 * deste arquivo. Não confundir com `MM_TO_PT` de `shared/pdf.js`, que é o
 * inverso (72 ÷ 25,4) e serve para o caminho contrário.
 */
export const MM_PER_PT = 25.4 / 72

/**
 * Margem da moldura dourada, em milímetros.
 *
 * Exportada porque a prévia da loja desenha o certificado em HTML com as
 * mesmas unidades, e a precisação entre "o que a pessoa viu" e "o que ela
 * recebeu" começa aqui.
 */
export const MARGIN = 14

/**
 * Altura visual de uma linha, em milímetros.
 *
 * Não é o corpo da fonte, e sim da base até o topo das maiúsculas. Usar o corpo
 * inteiro como avanço fazia o texto de 40 pt subir por cima do que estava
 * acima dele.
 */
export const alturaDe = (size) => size * MM_PER_PT * 0.72

/** Vão máximo entre blocos. Acima disso o texto boia no meio da folha. */
export const VAO_MAX = 9

/** Quanto o bloco pode descer do topo para se centralizar, em milímetros. */
export const CENTRO_MAX = 22

/**
 * Distribui os blocos na faixa útil da folha.
 *
 * Uma conta só para o PDF e para a prévia: eram duas cópias da mesma matemática
 * e já divergiram duas vezes — o parágrafo do PDF descia enquanto a tela subia,
 * e o bloco de dados ficava fora do orçamento. Aqui as duas leem o mesmo número.
 *
 * As linhas de base são calculadas numa passada só (calcular durante o desenho
 * produziu duas sobreposições seguidas). O vão é medido do FUNDO do bloco
 * anterior até o TOPO do próximo, e como o texto é ancorado pela linha de base:
 *
 *     base[i+1] = base[i] - vao - altura[i+1]
 *
 * O vão tem TETO (`VAO_MAX`): dividir a sobra igualmente dava ~14 mm de respiro
 * com pouco conteúdo e o texto boiava. O que sobra desce para o pé da página,
 * centralizado até `CENTRO_MAX` — centralizar de verdade empurrava o título
 * 5 cm para baixo.
 *
 * O bloco de dados entra na conta: ele é desenhado um vão abaixo do último
 * bloco, e sem estar no orçamento a sobra era toda gasta no vão e ele invadia
 * a zona do rodapé.
 *
 * @param {Array<[string, number]>} alturas `[chave, altura]` na ordem de desenho.
 * @param {{ topo: number, base: number, dadosAltura: number }} faixa
 *   limites verticais em milímetros (topo = topo útil, base = chão acima do rodapé).
 * @returns {{ vao: number, bases: Record<string, number>, dadosTopo: number }}
 *   linha de base de cada bloco, o vão usado e o TOPO do bloco de dados.
 */
export function distribuirBlocos(alturas, { topo, base, dadosAltura }) {
  const presentes = alturas.filter(([, altura]) => altura > 0)
  const alturaConteudo = presentes.reduce((soma, [, altura]) => soma + altura, 0) + dadosAltura

  // O vão só é calculado depois de saber quantos blocos existem de fato
  // — sem mensagem são 8, com mensagem são 9.
  const vao = Math.min(VAO_MAX, Math.max(2.5, (topo - base - alturaConteudo) / presentes.length))
  const sobra = topo - base - (alturaConteudo + vao * presentes.length)

  const bases = {}
  let y = topo - presentes[0][1] - Math.min(CENTRO_MAX, Math.max(0, sobra / 2))

  for (let i = 0; i < presentes.length; i += 1) {
    bases[presentes[i][0]] = y
    const proximo = presentes[i + 1]
    if (proximo) y -= vao + proximo[1]
  }

  // `y` parou no último bloco: é daí que o bloco de dados desce um vão.
  return { vao, bases, dadosTopo: y - vao }
}

/**
 * @typedef {object} CertificateData
 * @property {string} honoreeName  nome de quem recebe
 * @property {string} starName
 * @property {string} bayer
 * @property {string} constellation
 * @property {string} constellationLatin
 * @property {string} spectralType
 * @property {string} raFormatted   já formatado ("18h 24m 10.32s")
 * @property {string} decFormatted  já formatado ("−34° 23′ 04.62″")
 * @property {number} magnitude
 * @property {number} distanceLy
 * @property {string} story
 * @property {string} code          código público do pedido
 * @property {string} [dedicationDate]  data já em português ("11 de outubro de 2026")
 * @property {string} [fromName]
 * @property {string} [message]
 */

/**
 * Desenha o certificado na página.
 *
 * @param {object} pdf    instância do pdf-lib
 * @param {object} page   página já criada
 * @param {object} fonts  { regular, italic, display }
 * @param {CertificateData} data
 * @param {{ light?: boolean }} [opts] `light` desenha a versão em papel, que
 *        economiza tinta e é a que vai para a impressora.
 */
export function drawCertificate(pdf, page, fonts, data, opts = {}) {
  const light = opts.light === true
  const c = light
    ? {
        bg: PALETTE.paper,
        bgEdge: PALETTE.paperEdge,
        frame: PALETTE.goldInk,
        text: PALETTE.ink,
        muted: PALETTE.inkMuted,
        accent: PALETTE.goldInk,
        label: PALETTE.goldInk,
      }
    : {
        bg: PALETTE.deep,
        bgEdge: PALETTE.night,
        frame: PALETTE.gold,
        text: PALETTE.ivory,
        muted: PALETTE.ivory,
        accent: PALETTE.gold,
        label: PALETTE.goldSoft,
      }

  const { width, height } = PAGE

  /*
   * Fundo em degradê vertical.
   *
   * O `pdf-lib` não tem API de gradiente, e `drawSvgPath` NÃO aceita SVG: ele
   * espera uma *string de path* (`M … L … Z`) e a converte em traçado. Passar
   * `<linearGradient>` ali não dá erro — dá uma página corrompida com
   * "Unknown command NaN".
   *
   * A primeira tentativa empilhou 150 faixas de 2 mm, e elas apareceram como
   * listras bem visíveis. O segredo não é só o número de faixas: é a
   * SOBREPOSIÇÃO. Sem ela, cada retângulo arredonda para um pixel diferente do
   * vizinho e aparece uma linha mais clara entre eles. Com 50% de sobreposição
   * e 0,25 mm de passo, o degrau entre faixas é ~0,008 por canal — abaixo do
   * que o olho distingue.
   */
  const bands = Math.ceil(height / 0.25)
  const bandHeight = height / bands
  for (let i = 0; i < bands; i += 1) {
    // i = 0 é a base da página (y pequeno), onde o tom é o escuro.
    const t = i / (bands - 1)
    page.drawRectangle({
      x: 0,
      y: i * bandHeight,
      width,
      height: bandHeight * 1.5,
      color: C(mixHex(c.bgEdge, c.bg, t)),
    })
  }

  // Moldura dupla dourada.
  page.drawRectangle({
    x: MARGIN,
    y: MARGIN,
    width: width - MARGIN * 2,
    height: height - MARGIN * 2,
    borderColor: C(c.frame),
    borderWidth: 0.7,
  })
  page.drawRectangle({
    x: MARGIN + 3,
    y: MARGIN + 3,
    width: width - (MARGIN + 3) * 2,
    height: height - (MARGIN + 3) * 2,
    borderColor: C(c.frame),
    borderWidth: 0.25,
  })

  /*
   * Colchetes nos quatro cantos, um pouco para dentro da moldura.
   *
   * É o sinal clássico de certificado: duas barras curtas formando um "L" em
   * cada canto. Custa oito retângulos e dá à folha o acabamento de um
   * documento impresso, em vez de um retângulo simples.
   *
   * O comprimento (8 mm) é curto de propósito: um colchete longo passaria por
   * baixo do "REGISTRO" e da data, que moram a 22 mm da borda.
   */
  const orn = { inset: MARGIN + 5, L: 8, T: 0.45 }
  const cantos = [
    { x: orn.inset, y: height - orn.inset, dirX: 1, dirY: -1 },
    { x: width - orn.inset, y: height - orn.inset, dirX: -1, dirY: -1 },
    { x: orn.inset, y: orn.inset, dirX: 1, dirY: 1 },
    { x: width - orn.inset, y: orn.inset, dirX: -1, dirY: 1 },
  ]
  for (const canto of cantos) {
    // Barra horizontal: sai do canto na direção de `dirX`, logo abaixo/acima.
    page.drawRectangle({
      x: canto.dirX > 0 ? canto.x : canto.x - orn.L,
      y: canto.dirY > 0 ? canto.y : canto.y - orn.T,
      width: orn.L,
      height: orn.T,
      color: C(c.frame),
    })
    // Barra vertical: sai na direção de `dirY`, ao lado do canto.
    page.drawRectangle({
      x: canto.dirX > 0 ? canto.x : canto.x - orn.T,
      y: canto.dirY > 0 ? canto.y : canto.y - orn.L,
      width: orn.T,
      height: orn.L,
      color: C(c.frame),
    })
  }

  /*
   * Layout em blocos, não em deslocamentos fixos.
   *
   * A primeira versão empilhava `y -= 12` um atrás do outro, sem medir
   * nada: um nome curto deixava um vão enorme no meio, e um nome longo com
   * mensagem transbordava para fora da moldura. Aqui cada bloco declara a
   * própria altura, o espaço que sobra é distribuído entre eles, e o desenho
   * cabe por construção.
   *
   * É isso também que permite reduzir a tipografia quando o conteúdo é
   * grande: sem mensagem, o mesmo desenho fica arejado em vez de espremido.
   */
  const larguraUtil = width - MARGIN * 2
  const textoDisponivel = larguraUtil - 24

  const campos = [
    ['Constelação', data.constellationLatin],
    ['Tipo espectral', data.spectralType],
    ['Ascensão reta', data.raFormatted],
    ['Declinação', data.decFormatted],
    ['Magnitude', data.magnitude.toFixed(2)],
    ['Distância', `${formatNumber(data.distanceLy)} anos-luz`],
  ]

  // O nome é a peça central: fonte grande, encolhendo até caber em duas linhas.
  // Nomes compostos como "Geovanna Beatriz Santos Trindade" não cabem em 30 pt
  // numa A4, e cortar o sobrenome seria pior que reduzir o corpo.
  let nomeSize = 30
  let nomeLinhas = wrap(data.honoreeName, fonts.regular, nomeSize, textoDisponivel)
  while (nomeLinhas.length > 2 && nomeSize > 20) {
    nomeSize -= 2
    nomeLinhas = wrap(data.honoreeName, fonts.regular, nomeSize, textoDisponivel)
  }

  const mensagemSize = 11
  const mensagemLinhas = data.message
    ? wrap(data.message, fonts.italic, mensagemSize, textoDisponivel - 20)
    : []

  /*
   * Altura de uma linha de texto, em milímetros.
   *
   * Não é o corpo da fonte, e sim a altura VISUAL — da base até o topo das
   * maiúsculas (≈ 0,72 × corpo). O desenho posiciona cada linha pela linha de
   * base, que fica ACIMA do topo da linha anterior; usar o corpo inteiro como
   * avanço fazia o "StarGeo" de 40 pt subir por cima do título que estava
   * logo acima dele.
   */

  const altura = {
    titulo: alturaDe(9),
    marca: alturaDe(40),
    selo: alturaDe(7),
    // A estrela é um círculo de 22 mm, e o bloco dela também: o centro tem de
    // ficar no MEIO do bloco (`b + 11`), não na linha de base. Centralizada na
    // base, metade da estrela pendia para baixo — os pontinhos de baixo
    // encostavam nas maiúsculas de "Kaus Australis".
    estrelaSimbolo: 10 * 2 + 2,
    estrela: alturaDe(22),
    bayer: alturaDe(11),
    dedicatoria: alturaDe(7),
    /*
     * Nome e mensagem são os únicos blocos com VÁRIAS linhas, e a altura deles
     * não é a das maiúsculas: é o avanço de linha que a prévia usa no CSS
     * (`line-height` 1,15 no nome e 1,5 na mensagem). Medir com `alturaDe`
     * (0,72 × corpo) subestimava o bloco — 1,08 em por linha onde a tela
     * mostrava 1,5 —, e a mensagem longa saía do espaço reservado, descendo
     * em cima dos dados científicos e do rodapé.
     */
    nome: nomeLinhas.length * nomeSize * MM_PER_PT * 1.15,
    mensagem: mensagemLinhas.length * mensagemSize * MM_PER_PT * 1.5,
    // Uma linha só: em paisagem a folha tem largura de sobra e altura de menos.
    dados: 8,
  }

  // O rodapé é zona reservada: o conteúdo nunca entra nela.
  const topo = height - MARGIN - 10
  const base = MARGIN + 26

  /*
   * Cada bloco declara sua ALTURA e como se desenha; as linhas de base vêm
   * depois, numa passada só — calcular durante o desenho foi o que produziu
   * duas sobreposições seguidas. A conta inteira mora em `distribuirBlocos`,
   * que a prévia usa também: duas cópias da mesma matemática já divergiram.
   */
  const blocos = [
    {
      chave: 'titulo',
      altura: altura.titulo,
      desenhar: (b) =>
        comFiletes(page, 'CERTIFICADO DE DEDICAÇÃO CELESTE', fonts.display, b, {
          size: 9,
          color: C(c.label),
          charSpace: 3,
          filete: C(c.frame),
        }),
    },
    {
      chave: 'marca',
      altura: altura.marca,
      desenhar: (b) => textCentered(page, 'StarGeo', fonts.display, b, { size: 40, color: C(c.text) }),
    },
    {
      chave: 'selo',
      altura: altura.selo,
      desenhar: (b) =>
        textCentered(page, 'ATRAVÉS DE', fonts.regular, b, { size: 7, color: C(c.muted), charSpace: 2 }),
    },
    {
      /*
       * A estrela tem bloco PROPRIO.
       *
       * Dividida com o rótulo, ela precisava caber num vão de ~11 mm entre a
       * linha de base de "ATRAVÉS DE" e o topo de "Kaus Australis" — e com
       * raio de 10 mm ela invadia o nome. Bloco próprio, altura medida pelo
       * próprio raio, e cada elemento fica onde deveria.
       */
      chave: 'estrelaSimbolo',
      altura: altura.estrelaSimbolo,
      desenhar: (b) =>
        drawStar(page, width / 2, b + altura.estrelaSimbolo / 2, 10, 4.2, 5, C(c.accent), page.escala(1)),
    },
    {
      chave: 'estrela',
      altura: altura.estrela,
      desenhar: (b) => textCentered(page, data.starName, fonts.regular, b, { size: 22, color: C(c.accent) }),
    },
    {
      chave: 'bayer',
      altura: altura.bayer,
      desenhar: (b) =>
        textCentered(page, `${data.bayer} · ${data.constellation}`, fonts.bayer, b, {
          size: 11,
          color: C(c.muted),
        }),
    },
    {
      chave: 'dedicatoria',
      altura: altura.dedicatoria,
      desenhar: (b) =>
        comFiletes(page, 'DEDICADA A', fonts.regular, b, {
          size: 7,
          color: C(c.muted),
          charSpace: 2,
          filete: C(c.frame),
        }),
    },
    {
      chave: 'nome',
      altura: altura.nome,
      desenhar: (b) =>
        paragraph(page, nomeLinhas, fonts.regular, nomeSize, width / 2, b, {
          color: C(c.text),
          align: 'center',
          lineHeight: 1.15,
        }),
    },
  ]

  if (mensagemLinhas.length > 0) {
    blocos.push({
      chave: 'mensagem',
      altura: altura.mensagem,
      desenhar: (b) =>
        paragraph(page, mensagemLinhas, fonts.italic, mensagemSize, width / 2, b, {
          color: C(c.muted),
          align: 'center',
          lineHeight: 1.5,
        }),
    })
  }

  const { bases, dadosTopo } = distribuirBlocos(
    blocos.map((b) => [b.chave, b.altura]),
    { topo, base, dadosAltura: altura.dados },
  )

  for (const bloco of blocos) {
    const b = bases[bloco.chave]
    if (b !== undefined) bloco.desenhar(b)
  }

  /*
   * Dados científicos: UMA linha de seis colunas.
   *
   * Em retrato eram duas colunas em três linhas — 39 mm de altura, que em
   * paisagem não cabem: a folha perdeu 87 mm de altura e ganhou 87 de
   * largura. A largura paga a conta inteira.
   *
   * As colunas são CENTRADAS em si mesmas, como o resto da folha: alinhadas à
   * esquerda elas pareciam uma tabela de planilha colada no certificado, e a
   * fileira inteira ficava visualmente pendendo para a esquerda.
   */
  const gapColunas = 4
  const colWidth = (width - (MARGIN + 8) * 2 - gapColunas * (campos.length - 1)) / campos.length
  const leftX = MARGIN + 8

  // Mesmo vão dos demais, medido até o TOPO do bloco de dados.
  const linhaY = dadosTopo
  for (let i = 0; i < campos.length; i += 1) {
    const [label, value] = campos[i]
    const centroX = leftX + colWidth / 2 + i * (colWidth + gapColunas)

    const rotulo = label.toUpperCase()
    // 0,9 pt de espaçamento = 0,32 mm, o mesmo `letter-spacing` da prévia.
    const larguraRotulo = larguraEmMm(fonts.regular, rotulo, 6) + rotulo.length * 0.9 * MM_PER_PT
    page.drawText(rotulo, {
      x: centroX - larguraRotulo / 2,
      y: linhaY,
      size: 6,
      font: fonts.regular,
      color: C(c.label),
      characterSpacing: 0.9,
    })

    const larguraValor = larguraEmMm(fonts.regular, String(value), 11)
    page.drawText(String(value), {
      x: centroX - larguraValor / 2,
      y: linhaY - 6 * MM_PER_PT - 1,
      size: 11,
      font: fonts.regular,
      color: C(c.text),
    })
  }

  // Rodapé: registro, data e assinatura.
  page.drawText(`REGISTRO ${data.code}`, {
    x: MARGIN + 8,
    y: MARGIN + 16,
    size: 8,
    font: fonts.regular,
    color: C(c.label),
  })

  if (data.dedicationDate) {
    page.drawText(data.dedicationDate, {
      x: MARGIN + 8,
      y: MARGIN + 12,
      size: 7,
      font: fonts.italic,
      color: C(c.muted),
    })
  }

  if (data.fromName) {
    textRight(page, data.fromName, fonts.italic, MARGIN + 8, MARGIN + 12, {
      size: 13,
      color: C(c.accent),
    })
  }

  // Nota de rodapé honesta: certificado de afeto, não documento astronômico
  // oficial. Dizer isso no próprio papel é o que mantém a promessa dentro do
  // que a empresa consegue cumprir.
  textCentered(page, 'Documento simbólico. As coordenadas são conferidas com o SIMBAD.', fonts.italic, MARGIN + 6, {
    size: 6,
    color: C(c.muted),
  })
}

// ---------------------------------------------------------------------------
// Utilidades de desenho
// ---------------------------------------------------------------------------

/**
 * Escreve uma linha centralizada na largura útil da página.
 * Devolve o Y abaixo dela.
 *
 * Cuidado com as unidades: `widthOfTextAtSize` devolve PONTOS, e o desenho
 * todo aqui é em MILÍMETROS. Misturar as duas fazia o texto sair encostado à
 * esquerda — a largura medida era ~1,8 vez maior que a da linha, então o X
 * saía negativo. A conversão é feita uma vez, aqui.
 */
function textCentered(page, content, font, y, { size, color, charSpace = 0 }) {
  const largura = larguraEmMm(font, content, size) + (charSpace ? content.length * charSpace * MM_PER_PT : 0)
  const x = (PAGE.width - MARGIN * 2) / 2 + MARGIN - largura / 2
  page.drawText(content, { x, y, size, font, color, characterSpacing: charSpace || undefined })
  return y - size - 3
}

/**
 * Texto centralizado com um filete curto de cada lado.
 *
 * Os dois rótulos de seção ("CERTIFICADO DE DEDICAÇÃO CELESTE" e "DEDICADA A")
 * são miúdos e com muito espaçamento: sozinhos, flutuavam no meio do papel. O
 * filete dá peso visual sem competir com o título de verdade, que é o nome de
 * quem recebe.
 *
 * A altura do filete é a metade da altura das maiúsculas (`0,36 × corpo`), que
 * é onde o olho espera uma linha divisória — na base do texto ela passaria
 * raspando pelo que vem embaixo.
 *
 * @param {number} [larguraFilete] mm de cada filete
 * @param {number} [folga] mm entre o texto e o filete
 */
function comFiletes(page, content, font, y, { size, color, charSpace = 0, filete, larguraFilete = 22, folga = 5 }) {
  const largura = larguraEmMm(font, content, size) + (charSpace ? content.length * charSpace * MM_PER_PT : 0)
  const centro = (PAGE.width - MARGIN * 2) / 2 + MARGIN
  const meia = largura / 2
  const alturaFilete = 0.35
  const baseFilete = y + size * MM_PER_PT * 0.36

  for (const dir of [-1, 1]) {
    page.drawRectangle({
      x: dir < 0 ? centro - meia - folga - larguraFilete : centro + meia + folga,
      y: baseFilete,
      width: larguraFilete,
      height: alturaFilete,
      color: filete,
    })
  }

  page.drawText(content, {
    x: centro - meia,
    y,
    size,
    font,
    color,
    characterSpacing: charSpace || undefined,
  })
  return y - size - 3
}

function textRight(page, content, font, rightMargin, y, { size, color }) {
  const largura = larguraEmMm(font, content, size)
  page.drawText(content, { x: PAGE.width - rightMargin - largura, y, size, font, color })
  return y - size - 3
}

/** Largura de um texto em milímetros, a partir da medida em pontos. */
function larguraEmMm(font, content, size) {
  return font.widthOfTextAtSize(content, size) * MM_PER_PT
}

/**
 * Quebra o texto em linhas que cabem em `maxWidth` (milímetros).
 *
 * Uma palavra maior que a linha inteira não pode ser dividida — partir no
 * meio de um nome produziria "Beatriz San-tos". Nesses casos a palavra estoura
 * de propósito, e quem chama decide se reduz o corpo ou aceita.
 */
function wrap(content, font, size, maxWidth) {
  const palavras = content.split(/\s+/)
  const linhas = []
  let atual = ''

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (larguraEmMm(font, tentativa, size) <= maxWidth || !atual) {
      atual = tentativa
    } else {
      linhas.push(atual)
      atual = palavra
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

/**
 * Desenha um bloco de linhas centralizado, de BAIXO para CIMA.
 *
 * `y` é a linha de base da ÚLTIMA linha — a mesma âncora dos blocos de linha
 * única e a mesma da prévia, onde o `bottom` do div segura a última linha e o
 * parágrafo cresce para cima. Desenhando para baixo, como fazia antes, a
 * mensagem longa descia em cima dos dados científicos e do rodapé.
 *
 * `lineHeight` é o mesmo número do `line-height` da prévia (1,15 no nome,
 * 1,5 na mensagem): é ele que define o avanço entre linhas dos dois lados.
 */
function paragraph(page, linhas, font, size, centerX, y, { color, align = 'left', lineHeight = 1.5 }) {
  const passo = size * MM_PER_PT * lineHeight
  let atualY = y + (linhas.length - 1) * passo

  for (const linha of linhas) {
    const w = larguraEmMm(font, linha, size)
    const x = align === 'center' ? centerX - w / 2 : centerX
    page.drawText(linha, { x, y: atualY, size, font, color })
    atualY -= passo
  }
  return atualY
}

/**
 * Estrela de N pontas, como polígono de dois raios.
 *
 * `drawSvgPath` do pdf-lib aplica `scale(s, -s)` — o sinal negativo inverte o
 * eixo Y, porque o SVG cresce para baixo e o PDF para cima. As coordenadas do
 * SVG são, então, `(x, -y)` em pontos.
 *
 * Passar as coordenadas de PDF direto desenhava a estrela fora da folha, sem
 * nenhum erro: o pdf-lib não valida a geometria, e o polígono simplesmente
 * sumia. Negar o Y resolve, e é o que a documentação do operador exige.
 *
 * @param {{ drawSvgPath: (path: string, opts?: object) => void }} page
 * @param {number} ptPorMm  pontos por milímetro
 */
function drawStar(page, centerXmm, centerYmm, raioExternoMm, raioInternoMm, pontas, color, ptPorMm) {
  const comandos = []
  for (let i = 0; i < pontas * 2; i += 1) {
    const raio = i % 2 === 0 ? raioExternoMm : raioInternoMm
    // -90° para a primeira ponta apontar para cima.
    const angulo = (Math.PI * i) / pontas - Math.PI / 2
    const x = ((centerXmm + Math.cos(angulo) * raio) * ptPorMm).toFixed(3)
    // O Y vai com o sinal invertido: é o que o `scale(s, -s)` espera.
    const y = (-(centerYmm + Math.sin(angulo) * raio) * ptPorMm).toFixed(3)
    comandos.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`)
  }

  page.drawSvgPath(`${comandos.join(' ')} Z`, {
    color,
    borderColor: color,
    borderWidth: 0.4,
    scale: 1,
  })
}

/** Escala as cores para o destino antes de desenhar, se houver. */
const COR = { factory: null, cache: new Map() }

/**
 * Informa qual fábrica de cor usar (a do pdf-lib, na Edge Function).
 *
 * Invariante: chamar ANTES de `drawCertificate`. A fábrica alimenta o cache
 * interno de `C()`; trocar depois de desenhar deixa o cache com cores no
 * formato antigo, e o pdf-lib ignora objetos RGB crus sem avisar.
 *
 * Sem isso, `C()` cai no retorno cru de `hexToRgb`, que só serve para
 * inspecionar valores — nunca para desenhar.
 */
export function definirFabricaDeCor(factory) {
  COR.factory = factory
  COR.cache.clear()
}

/** Cor no formato que o destino entende, com cache por hex. */
function C(hex) {
  if (COR.cache.has(hex)) return COR.cache.get(hex)
  const value = COR.factory ? COR.factory(hex) : hexToRgb(hex)
  COR.cache.set(hex, value)
  return value
}

/** Converte `#rrggbb` em canais normalizados, sem passar pela fábrica. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  }
}

/** Interpola linearmente entre duas cores hex. */
function mixHex(a, b, t) {
  const pa = C(a)
  const pb = C(b)
  const channel = (x, y) => Math.round((x + (y - x) * t) * 255)
  const hex = (n) => n.toString(16).padStart(2, '0')
  return `#${hex(channel(pa.red, pb.red))}${hex(channel(pa.green, pb.green))}${hex(channel(pa.blue, pb.blue))}`
}

/** 143 → "143"; 4.37 → "4,4". Vírgula, como manda o português. */
export function formatNumber(value) {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}
