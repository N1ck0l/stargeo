import { CENTRO_MAX, MARGIN, PAGE, VAO_MAX, alturaDe } from '../../../shared/certificate.js'
import { formatDec, formatRa } from '../../../shared/stars.js'

/**
 * Prévia do certificado em HTML.
 *
 * Desenhada em MILÍMETROS, a mesma unidade do PDF, e com as mesmas constantes
 * de `shared/certificate.js`. É isso que faz a prévia valer alguma coisa: com
 * as medidas certainas e a mesma folha A4, o que a pessoa vê aqui é o que
 * chega no e-mail.
 *
 * Onde ainda pode divergir: a quebra de linha do nome e da mensagem. O PDF
 * mede com as métricas da fonte embutida; o navegador, com as da fonte
 * carregada. São as mesmas fontes, então a diferença é de fração de
 * milímetro — mas é por isso que a prévia nunca promete "exatamente igual".
 */

/** Converte corpo de fonte em pontos para milímetros de altura de linha. */
const linhaDe = (size) => alturaDe(size)

const MM_PER_PT = 25.4 / 72

/** Corpo de fonte (em pt) convertido para o tamanho que o CSS entende. */
const corpo = (size) => `${size / MM_PER_PT}mm`

/**
 * @typedef {object} DadosPrevia
 * @property {object} estrela  item de `shared/stars.js`
 * @property {string} honoreeName
 * @property {string} [message]
 * @property {string} [fromName]
 * @property {string} [dedicationDate] já em português
 * @property {string} code
 */

/**
 * Quebra o texto no navegador.
 *
 * Espelha a função do PDF: mesma palavra-por-palavra, mesma política de não
 * partir palavra nenhuma no meio (um sobrenome cortado fica pior que um
 * corpo menor).
 */
function quebrar(texto, maxLinhas) {
  if (!texto) return []
  const palavras = String(texto).trim().split(/\s+/)
  const linhas = [palavras[0] ?? '']
  for (const palavra of palavras.slice(1)) {
    const atual = linhas[linhas.length - 1]
    if (atual.length + palavra.length + 1 > maxLinhas) linhas.push(palavra)
    else linhas[linhas.length - 1] = `${atual} ${palavra}`
  }
  return linhas
}

export function CertificadoPreview({ estrela, honoreeName, message, fromName, dedicationDate, code, light = false, className = '' }) {
  const nome = honoreeName?.trim() || 'Nome de quem recebe'
  
  /*
   * O corpo do nome encolhe até caber em duas linhas, exatamente como no PDF.
   * "Geovanna Beatriz Santos Trindade" não cabe em 30 pt numa A4, e cortar o
   * sobrenome seria pior que reduzir o corpo.
   */
  let nomeSize = 30
  let nomeLinhas = quebrar(nome, 22)
  while (nomeLinhas.length > 2 && nomeSize > 20) {
    nomeSize -= 2
    nomeLinhas = quebrar(nome, Math.floor(22 * (nomeSize / 30)) + 6)
  }

  const mensagemSize = 11
  const mensagemLinhas = quebrar(message, 78)

  // Mesma conta de altura do PDF, com as mesmas constantes.
  const altura = {
    titulo: linhaDe(9),
    marca: linhaDe(40),
    selo: linhaDe(7),
    estrelaSimbolo: 22,
    estrela: linhaDe(22),
    bayer: linhaDe(11),
    dedicatoria: linhaDe(7),
    nome: nomeLinhas.length * linhaDe(nomeSize) * 1.15,
    mensagem: mensagemLinhas.length * linhaDe(mensagemSize) * 1.5,
    dados: 39,
  }

  const ordem = ['titulo', 'marca', 'selo', 'estrelaSimbolo', 'estrela', 'bayer', 'dedicatoria', 'nome']
  if (mensagemLinhas.length > 0) ordem.push('mensagem')

  const alturaTotal = ordem.reduce((soma, chave) => soma + altura[chave], 0)
  const topo = PAGE.height - MARGIN - 10
  const base = MARGIN + 26
  const vao = Math.min(VAO_MAX, Math.max(2.5, (topo - base - alturaTotal) / ordem.length))

  // Mesma regra do PDF: desce pelo vão + altura do PRÓXIMO bloco.
  const posicoes = {}
  let y = topo - ordem[0].length * altura[ordem[0]] - Math.min(CENTRO_MAX, Math.max(0, (topo - base - (alturaTotal + vao * ordem.length)) / 2))

  // Calcula a base de cada bloco na mesma ordem do desenho.
  for (let i = 0; i < ordem.length; i += 1) {
    posicoes[ordem[i]] = y
    y -= vao + (altura[ordem[i + 1]] ?? altura.dados)
  }
  posicoes.dados = y - vao

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

      {/* Cada bloco é posicionado pela LINHA DE BASE, como no PDF.
          O `bottom` em mm a partir do rodapé equivale ao Y do PDF. */}
      <Bloco baseY={posicoes.titulo} style={{ fontSize: corpo(9), letterSpacing: '0.6mm', color: cores.rotulo, fontFamily: '"Cinzel", serif' }}>
        CERTIFICADO DE DEDICAÇÃO CELESTE
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
          bottom: `${posicoes.estrelaSimbolo - altura.estrelaSimbolo / 2}mm`,
          transform: 'translateX(-50%)',
        }}
      >
        <Estrela cor={cores.destaque} raio={10} interno={4.2} />
      </div>

      <Bloco baseY={posicoes.estrela} style={{ fontSize: corpo(22), color: cores.destaque }}>
        {estrela.name}
      </Bloco>

      <Bloco baseY={posicoes.bayer} style={{ fontSize: corpo(11), color: cores.suave, fontStyle: 'italic' }}>
        {estrela.bayer} · {estrela.constellation}
      </Bloco>

      <Bloco baseY={posicoes.dedicatoria} style={{ fontSize: corpo(7), letterSpacing: '0.5mm', color: cores.suave }}>
        DEDICADA A
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

      {/* Dados científicos, em duas colunas e três linhas. */}
      <div
        className="absolute grid grid-cols-2"
        style={{
          left: `${MARGIN + 8}mm`,
          right: `${MARGIN + 8}mm`,
          bottom: `${posicoes.dados}mm`,
          rowGap: '3mm',
          columnGap: '16mm',
        }}
      >
        {estrelas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <div style={{ fontSize: corpo(6), color: cores.rotulo, letterSpacing: '0.3mm', fontFamily: '"Outfit", sans-serif' }}>
              {rotulo.toUpperCase()}
            </div>
            <div style={{ fontSize: corpo(10), color: cores.texto, marginTop: '0.4mm' }}>{valor}</div>
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

/** Estrela de cinco pontas, mesmo desenho do PDF e do site. */
function Estrela({ cor, raio = 10, interno = 4.2, pontas = 5 }) {
  const pontos = []
  for (let i = 0; i < pontas * 2; i += 1) {
    const r = i % 2 === 0 ? raio : interno
    const angulo = (Math.PI * i) / pontas - Math.PI / 2
    pontos.push(`${50 + (Math.cos(angulo) * r) / 2}% ${50 + (Math.sin(angulo) * r) / 2}%`)
  }
  return (
    <svg width={`${raio * 2 + 2}mm`} height={`${raio * 2 + 2}mm`} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={pontos.join(' ')} fill={cor} />
    </svg>
  )
}
