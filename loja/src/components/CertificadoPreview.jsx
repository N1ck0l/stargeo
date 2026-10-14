import { useEffect, useState } from 'react'
import { MARGIN, MM_PER_PT, PAGE, alturaDe, distribuirBlocos } from '../../../shared/certificate.js'
import { formatDec, formatRa } from '../../../shared/stars.js'

/**
 * Prévia do certificado em HTML.
 *
 * Desenhada em MILÍMETROS, a mesma unidade do PDF, e com as mesmas constantes
 * de `shared/certificate.js`. É isso que faz a prévia valer alguma coisa: com
 * as medidas certainas e a mesma folha A4, o que a pessoa vê aqui é o que
 * chega no e-mail.
 *
 * A quebra de linha é MEDIDA com a mesma fonte que o PDF embute (ver
 * `quebrar`), e não estimada por contagem de caracteres — a estimativa tinha
 * sido calibrada para a largura errada e a prévia mostrava seis linhas de
 * mensagem onde o papel levava quatro.
 *
 * Quem importa: `pages/Produto.jsx` (prévia do configurador),
 * `pagina/ModalCertificado.jsx` (a mesma folha no modal) e
 * `test/loja.test.jsx`. Export: `CertificadoPreview`.
 *
 * Invariantes: todo número que existe aqui existe também em
 * `shared/certificate.js` — se os dois lados divergirem, a prévia mente.
 * O nome NUNCA é cortado (só encolhe, até o piso de 20 pt), o texto não
 * sai da moldura, e a folha continua A4 paisagem em milímetros.
 */

/** Corpo de fonte (em pt) convertido para o tamanho que o CSS entende.
 *
 * `MM_PER_PT` é a QUANTIDADE DE MILÍMETROS de um ponto (0,3528), então a
 * conversão é por MULTIPLICAÇÃO. Dividir — que é o que este código fazia —
 * ampliava todo texto em 8×: 9 pt saía como 25,5 mm em vez de 3,17 mm, e a
 * pilha estourava para fora da folha. */
const corpo = (size) => `${size * MM_PER_PT}mm`

/*
 * As duas pontes de unidade: a medição da quebra acontece em pixels (canvas),
 * a folha é em milímetros e o corpo da fonte vem em pontos — 96 dpi para a
 * primeira conversão, 72 dpi para a segunda.
 */
const PX_POR_MM = 96 / 25.4
const PX_POR_PT = 96 / 72

/**
 * Largura de quebra, em milímetros — copiada do PDF.
 *
 * Lá é `textoDisponivel = (width - MARGIN * 2) - 24` = 245 mm, e a mensagem
 * abre mais 20 mm (225). Usar a largura INTEIRA do div (297 mm) deixava a
 * prévia quebrar sete caracteres depois do papel.
 */
const LARGURA_NOME = 245
const LARGURA_MENSAGEM = 225

/*
 * Reserva, em caracteres, para quando não dá para medir: jsdom nos testes e o
 * primeiro quadro antes da fonte carregar. Os números vêm de medir o woff2
 * com fontkit — 4,33 mm por caractere no nome a 30 pt e 1,39 mm na mensagem a
 * 11 pt — divididos pela largura de quebra (245 e 225 mm).
 */
const RESERVA_NOME = 56
const RESERVA_MENSAGEM = 161

/**
 * Mede um texto com a fonte REAL do certificado.
 *
 * O canvas usa o mesmo arquivo woff2 que o pdf-lib embute, no mesmo corpo, e
 * é a mesma conta que o `wrap` do PDF faz — só que em vez de fontkit, com as
 * métricas do navegador. Devolve `null` quando não há canvas e quem chama cai
 * na reserva de caracteres.
 *
 * @param {string} fonteCss corpo já em px e família, ex.: `italic 14.67px "Cormorant Garamond"`.
 * @returns {((texto: string) => number) | null}
 */
function medidor(fonteCss) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext && canvas.getContext('2d')
  if (!ctx) return null
  // Fonte pendente: o canvas mediria com a reserva do sistema e a linha
  // sairia larga demais. `fonts.check` é o jeito certo de perguntar.
  if (typeof document.fonts !== 'undefined' && !document.fonts.check(fonteCss)) return null
  ctx.font = fonteCss
  return (texto) => ctx.measureText(texto).width
}

/**
 * Quebra o texto palavra por palavra, sem partir palavra nenhuma no meio —
 * mesma política do `wrap` do PDF (um sobrenome cortado fica pior que um
 * corpo menor).
 *
 * @param {string|null|undefined} texto
 * @param {object} opcoes
 * @param {number} opcoes.larguraMm largura útil em milímetros (a do PDF).
 * @param {string} opcoes.fonteCss família e corpo, para medir.
 * @param {number} opcoes.reserva caracteres por linha quando não dá para medir.
 * @param {boolean} opcoes.pronta `false` antes da fonte carregar: medir agora
 *   seria meder com a fonte do sistema e a linha sairia larga demais.
 */
function quebrar(texto, { larguraMm, fonteCss, reserva, pronta }) {
  if (!texto) return []
  const medida = pronta ? medidor(fonteCss) : null
  const limitePx = larguraMm * PX_POR_MM
  const cabe = (linha) => (medida ? medida(linha) <= limitePx : linha.length <= reserva)

  const palavras = String(texto).trim().split(/\s+/)
  const linhas = [palavras[0] ?? '']
  for (const palavra of palavras.slice(1)) {
    const atual = linhas[linhas.length - 1]
    const candidato = `${atual} ${palavra}`
    if (cabe(candidato)) linhas[linhas.length - 1] = candidato
    else linhas.push(palavra)
  }
  return linhas
}

/**
 * @typedef {object} DadosPrevia
 * @property {object} estrela  item de `shared/stars.js`
 * @property {string} honoreeName
 * @property {string} [message]
 * @property {string} [fromName]
 * @property {string} [dedicationDate] já em português
 * @property {string} code
 */

export function CertificadoPreview({ estrela, honoreeName, message, fromName, dedicationDate, code, light = false, className = '' }) {
  const nome = honoreeName?.trim() || 'Nome de quem recebe'

  /*
   * A fonte tem de estar carregada antes de medir.
   *
   * `fonts.load` pede os dois arquivos da família (o normal e o itálico) e
   * só depois a medição no ambiente vale — antes disso o navegador mediria
   * com a fonte do sistema e a quebra sairia larga demais. Sem a API (jsdom,
   * render sem DOM) começa pronta e cai na reserva de caracteres.
   */
  const [fontePronta, setFontePronta] = useState(
    () => typeof document === 'undefined' || !document.fonts || !document.fonts.load,
  )

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return undefined
    let vivo = true
    Promise.all([
      document.fonts.load('30px "Cormorant Garamond"'),
      document.fonts.load('italic 11px "Cormorant Garamond"'),
    ])
      .catch(() => undefined)
      .then(() => {
        if (vivo) setFontePronta(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  /*
   * O corpo do nome encolhe até caber em duas linhas, exatamente como no PDF.
   * "Geovanna Beatriz Santos Trindade" não cabe em 30 pt numa A4, e cortar o
   * sobrenome seria pior que reduzir o corpo.
   */
  let nomeSize = 30
  const quebrarNome = (tamanho) =>
    quebrar(nome, {
      larguraMm: LARGURA_NOME,
      fonteCss: `${tamanho * PX_POR_PT}px "Cormorant Garamond"`,
      reserva: Math.round((RESERVA_NOME * tamanho) / 30),
      pronta: fontePronta,
    })

  let nomeLinhas = quebrarNome(nomeSize)
  while (nomeLinhas.length > 2 && nomeSize > 20) {
    nomeSize -= 2
    // Corpo menor cabe mais caractere na mesma largura.
    nomeLinhas = quebrarNome(nomeSize)
  }

  const mensagemSize = 11
  const mensagemLinhas = quebrar(message, {
    larguraMm: LARGURA_MENSAGEM,
    fonteCss: `italic ${mensagemSize * PX_POR_PT}px "Cormorant Garamond"`,
    reserva: RESERVA_MENSAGEM,
    pronta: fontePronta,
  })

  /*
   * Mesma conta de altura do PDF, com as mesmas constantes.
   *
   * Nome e mensagem são os únicos blocos de VÁRIAS linhas: a altura deles é o
   * avanço de linha (line-height 1,15 e 1,5, os mesmos números do CSS aqui em
   * baixo e do PDF), não a das maiúsculas. E o bloco de dados entra na soma —
   * no PDF ele é desenhado um vão abaixo do último bloco e tinha de caber no
   * orçamento, senão invadia a zona do rodapé.
   */
  const altura = {
    titulo: alturaDe(9),
    marca: alturaDe(40),
    selo: alturaDe(7),
    estrelaSimbolo: 22,
    estrela: alturaDe(22),
    bayer: alturaDe(11),
    dedicatoria: alturaDe(7),
    nome: nomeLinhas.length * nomeSize * MM_PER_PT * 1.15,
    mensagem: mensagemLinhas.length * mensagemSize * MM_PER_PT * 1.5,
    dados: 8,
  }

  /*
   * Ordem de leitura, de cima para baixo — a mesma do PDF. A mensagem só
   * entra na lista se houver mensagem: com ela sempre presente, a altura
   * dela empurraria todos os blocos para baixo, e o rodapé invadiria a
   * zona de dados.
   */
  const ordem = ['titulo', 'marca', 'selo', 'estrelaSimbolo', 'estrela', 'bayer', 'dedicatoria', 'nome']
  if (mensagemLinhas.length > 0) ordem.push('mensagem')

  const topo = PAGE.height - MARGIN - 10
  const base = MARGIN + 26
  const { bases, dadosTopo } = distribuirBlocos(
    ordem.map((chave) => [chave, altura[chave]]),
    { topo, base, dadosAltura: altura.dados },
  )

  // `bases` são as linhas de base — as mesmas que o PDF recebe. O `Bloco` é
  // ancorado pelo `bottom` nesse valor, e o div cresce para CIMA a partir da
  // linha de base, igual aos glifos.
  const posicoes = { ...bases }

  // Só o bloco de dados desce: no PDF a linha de rótulo é o topo dele
  // (`linhaY = dadosTopo`) e o valor fica por baixo, então aqui o div ancorado
  // pelo `bottom` tem de descer a altura inteira do bloco.
  posicoes.dados = dadosTopo - altura.dados

  const cores = light
    ? {
        fundo: 'linear-gradient(180deg, #fffdf7 0%, #f2eada 100%)',
        moldura: '#8a6a1c',
        texto: '#2b2342',
        suave: '#5a5170',
        destaque: '#8a6a1c',
        rotulo: '#8a6a1c',
      }
    : {
        fundo: 'linear-gradient(180deg, #16112e 0%, #0c0820 100%)',
        moldura: '#e8c872',
        texto: '#f7f1e1',
        suave: 'rgba(247,241,225,0.82)',
        destaque: '#e8c872',
        rotulo: '#f3e6b8',
      }

  // Os mesmos seis campos do rodapé do PDF, na mesma ordem, formatados com
  // as funções de `shared/stars.js` (ascensão reta e declinação em notação
  // astronômica, não em graus crus).
  const estrelas = [
    ['Constelação', estrela.constellationLatin],
    ['Tipo espectral', estrela.spectralType],
    ['Ascensão reta', formatRa(estrela.ra)],
    ['Declinação', formatDec(estrela.dec)],
    ['Magnitude', estrela.magnitude.toFixed(2)],
    ['Distância', `${estrela.distanceLy} anos-luz`],
  ]

  return (
    <div
      className={`certificado ${className}`}
      style={{
        width: `${PAGE.width}mm`,
        height: `${PAGE.height}mm`,
        background: cores.fundo,
        color: cores.texto,
        fontFamily: '"Cormorant Garamond", Georgia, serif',
      }}
    >
      {/* Moldura dupla, como no PDF. */}
      <div
        className="absolute border"
        style={{
          inset: `${MARGIN}mm`,
          borderColor: cores.moldura,
          borderWidth: '0.7mm',
        }}
      />
      <div
        className="absolute border"
        style={{
          inset: `${MARGIN + 3}mm`,
          borderColor: cores.moldura,
          borderWidth: '0.25mm',
          opacity: 0.55,
        }}
      />

      {/* Colchetes nos quatro cantos, como no PDF: inset MARGIN + 5, 8 mm. */}
      {[
        { v: 'top', h: 'left' },
        { v: 'top', h: 'right' },
        { v: 'bottom', h: 'left' },
        { v: 'bottom', h: 'right' },
      ].flatMap(({ v, h }) => [
        <div
          key={`${v}${h}-h`}
          className="absolute"
          style={{ [v]: `${MARGIN + 5}mm`, [h]: `${MARGIN + 5}mm`, width: '8mm', height: '0.45mm', background: cores.moldura }}
        />,
        <div
          key={`${v}${h}-v`}
          className="absolute"
          style={{ [v]: `${MARGIN + 5}mm`, [h]: `${MARGIN + 5}mm`, width: '0.45mm', height: '8mm', background: cores.moldura }}
        />,
      ])}

      {/* Cada bloco é posicionado pela LINHA DE BASE, como no PDF.
          O `bottom` em mm a partir do rodapé equivale ao Y do PDF. */}
      <Bloco baseY={posicoes.titulo} style={{ fontSize: corpo(9), letterSpacing: '0.6mm', color: cores.rotulo, fontFamily: '"Cinzel", serif' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5mm' }}>
          <span style={{ width: '22mm', height: '0.35mm', background: cores.moldura }} />
          <span>CERTIFICADO DE DEDICAÇÃO CELESTE</span>
          <span style={{ width: '22mm', height: '0.35mm', background: cores.moldura }} />
        </span>
      </Bloco>

      <Bloco baseY={posicoes.marca} style={{ fontSize: corpo(40), color: cores.texto, fontFamily: '"Cinzel", serif' }}>
        StarGeo
      </Bloco>

      <Bloco baseY={posicoes.selo} style={{ fontSize: corpo(7), letterSpacing: '0.5mm', color: cores.suave }}>
        ATRAVÉS DE
      </Bloco>

      <div
        className="absolute"
        style={{
          left: '50%',
          // O bloco da estrela tem o diâmetro inteiro, então o centro é o
          // próprio `bottom` — igual ao `b + altura/2` do PDF.
          bottom: `${posicoes.estrelaSimbolo}mm`,
          transform: 'translateX(-50%)',
        }}
      >
        <Estrela cor={cores.destaque} raio={10} interno={4.2} />
      </div>

      <Bloco baseY={posicoes.estrela} style={{ fontSize: corpo(22), color: cores.destaque }}>
        {estrela.name}
      </Bloco>

      <Bloco
        baseY={posicoes.bayer}
        style={{
          fontSize: corpo(11),
          color: cores.suave,
          fontStyle: 'italic',
          // A EB Garamond é a única com alfabeto grego: sem ela o navegador
          // cai numa fonte do sistema e a prévia deixa de bater com o PDF.
          fontFamily: '"EB Garamond", "Cormorant Garamond", serif',
        }}
      >
        {estrela.bayer} · {estrela.constellation}
      </Bloco>

      <Bloco baseY={posicoes.dedicatoria} style={{ fontSize: corpo(7), letterSpacing: '0.5mm', color: cores.suave }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5mm' }}>
          <span style={{ width: '22mm', height: '0.35mm', background: cores.moldura }} />
          <span>DEDICADA A</span>
          <span style={{ width: '22mm', height: '0.35mm', background: cores.moldura, opacity: 0.75 }} />
        </span>
      </Bloco>

      <Bloco baseY={posicoes.nome} style={{ fontSize: corpo(nomeSize), color: cores.texto, lineHeight: 1.15 }}>
        {nomeLinhas.map((linha, i) => (
          <div key={i}>{linha}</div>
        ))}
      </Bloco>

      {mensagemLinhas.length > 0 && (
        <Bloco baseY={posicoes.mensagem} style={{ fontSize: corpo(mensagemSize), color: cores.suave, fontStyle: 'italic', lineHeight: 1.5 }}>
          {mensagemLinhas.map((linha, i) => (
            <div key={i}>{linha}</div>
          ))}
        </Bloco>
      )}

      {/* Dados científicos: uma fileira de seis colunas, como no PDF. */}
      <div
        className="absolute grid grid-cols-6"
        style={{
          left: `${MARGIN + 8}mm`,
          right: `${MARGIN + 8}mm`,
          bottom: `${posicoes.dados}mm`,
          columnGap: '4mm',
        }}
      >
        {estrelas.map(([rotulo, valor]) => (
          <div key={rotulo} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: corpo(6), color: cores.rotulo, letterSpacing: '0.3mm', fontFamily: '"Outfit", sans-serif' }}>
              {rotulo.toUpperCase()}
            </div>
            <div style={{ fontSize: corpo(11), color: cores.texto, marginTop: '0.4mm' }}>{valor}</div>
          </div>
        ))}
      </div>

      {/* Rodapé. */}
      <div
        className="absolute"
        style={{ left: `${MARGIN + 8}mm`, bottom: `${MARGIN + 6}mm`, right: `${MARGIN + 8}mm` }}
      >
        <div className="flex items-end justify-between">
          <div>
            <div style={{ fontSize: corpo(8), color: cores.rotulo, fontFamily: '"Outfit", sans-serif' }}>
              REGISTRO {code}
            </div>
            {dedicationDate && (
              <div style={{ fontSize: corpo(7), color: cores.suave, fontStyle: 'italic', marginTop: '0.6mm' }}>
                {dedicationDate}
              </div>
            )}
          </div>
          {fromName && (
            <div style={{ fontSize: corpo(13), color: cores.destaque, fontStyle: 'italic' }}>{fromName}</div>
          )}
        </div>
        <div
          className="text-center"
          style={{ fontSize: corpo(6), color: cores.suave, fontStyle: 'italic', marginTop: '1mm' }}
        >
          Documento simbólico. Coordenadas conferidas com o SIMBAD.
        </div>
      </div>
    </div>
  )
}

/**
 * Uma linha de texto posicionada pela linha de base.
 *
 * `bottom` em milímetros equivale ao Y do PDF, que cresce para cima a partir
 * da base da folha — por isso é `bottom` e não `top`.
 */
function Bloco({ baseY, style, children }) {
  return (
    <div
      className="absolute w-full text-center"
      style={{ ...style, bottom: `${baseY}mm`, left: 0, right: 0 }}
    >
      {children}
    </div>
  )
}

/**
 * Estrela de cinco pontas, mesmo desenho do PDF e do site.
 *
 * O `viewBox` é em MILÍMETROS (`0 0 lado lado`), não em porcentagem: SVG não
 * aceita `%` em `points` — o navegador rejeita o atributo inteiro e a estrela
 * simplesmente não aparece. Assim as contas saem direto em mm, e o raio bate
 * com o do PDF.
 */
function Estrela({ cor, raio = 10, interno = 4.2, pontas = 5 }) {
  const lado = raio * 2 + 2
  const centro = lado / 2

  const pontos = []
  for (let i = 0; i < pontas * 2; i += 1) {
    const r = i % 2 === 0 ? raio : interno
    const angulo = (Math.PI * i) / pontas - Math.PI / 2
    pontos.push(`${centro + Math.cos(angulo) * r} ${centro + Math.sin(angulo) * r}`)
  }

  return (
    <svg width={`${lado}mm`} height={`${lado}mm`} viewBox={`0 0 ${lado} ${lado}`} aria-hidden="true">
      <polygon points={pontos.join(' ')} fill={cor} />
    </svg>
  )
}
