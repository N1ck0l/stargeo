/**
 * Gera o catálogo completo de estrelas (~118 mil, Hipparcos) e o céu do mapa.
 *
 *     node scripts/gerar-catalogo.mjs <pasta-de-dados> <pasta-de-saída>
 *
 * A pasta de dados precisa de (todos públicos):
 *   - d3-celestial/   `npm pack d3-celestial@0.7.35`, a pasta `package/data`
 *                     (BSD-3-Clause, Olaf Frohn): posições J2000, brilho,
 *                     cor, nomes e designações, linhas das constelações;
 *   - hipparcos.csv   ESA Hipparcos (1997) via VizieR, tabela I/239/hip_main,
 *                     colunas HIP, Vmag, Plx, e_Plx, SpType, HD — distância
 *                     (paralaxe) e tipo espectral;
 *   - limites.dat     limites oficiais das constelações (Delporte 1930,
 *                     Roman 1987), CDS VI/42 `data.dat`.
 * Os comandos para baixar estão no LOJA.md.
 *
 * Saídas:
 *   - <saída>/catalogo.ndjson  uma estrela por linha, para o banco
 *                              (`scripts/carregar-catalogo.mjs`); NÃO vai
 *                              para o git (~25 MB);
 *   - shared/ceu.js            estrelas até mag 5 e as linhas das 88
 *                              constelações, para o mapa do céu de qualquer
 *                              estrela (folha, PDF e mini mapa da loja).
 */
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { CONSTELACAO_POR_SIGLA } from '../shared/constelacoes.js'
import { STARS } from '../shared/stars.js'

const [entrada, saida] = process.argv.slice(2)
if (!entrada || !saida) {
  console.error('Uso: node scripts/gerar-catalogo.mjs <pasta-de-dados> <pasta-de-saída>')
  process.exit(1)
}
mkdirSync(saida, { recursive: true })
const raiz = resolve(import.meta.dirname, '..')
const ler = (arquivo) => JSON.parse(readFileSync(join(entrada, arquivo), 'utf8'))

// ---------------------------------------------------------------------------
// Constelação de uma posição: precessão a 1875 + tabela de Delporte (Roman)
// ---------------------------------------------------------------------------
/*
 * Os limites oficiais foram traçados em 1930 sobre o equinócio de B1875, em
 * faixas de ascensão reta e declinação. O método de Roman (1987): leva a
 * posição J2000 para 1875 e percorre a tabela, em ordem, até a primeira faixa
 * com dec ≥ limite inferior e AR dentro do intervalo. Exato por construção.
 */
const LIMITES = readFileSync(join(entrada, 'limites.dat'), 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => {
    const [raInf, raSup, decInf, sigla] = l.trim().split(/\s+/)
    return { raInf: Number(raInf), raSup: Number(raSup), decInf: Number(decInf), sigla }
  })

const G = Math.PI / 180

/** Precessão IAU 1976 de J2000 para 1875.0 (T em séculos julianos). */
function para1875(raHoras, decGraus) {
  const T = (1875 - 2000) / 100
  const seg = (v) => (v / 3600) * G
  const zeta = seg(2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3)
  const z = seg(2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3)
  const theta = seg(2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3)
  const a0 = raHoras * 15 * G
  const d0 = decGraus * G
  const A = Math.cos(d0) * Math.sin(a0 + zeta)
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(theta) * Math.sin(d0)
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(theta) * Math.sin(d0)
  let ra = (Math.atan2(A, B) + z) / G / 15
  ra = ((ra % 24) + 24) % 24
  return [ra, Math.asin(Math.max(-1, Math.min(1, C))) / G]
}

function constelacaoDe(raHoras, decGraus) {
  const [ra, dec] = para1875(raHoras, decGraus)
  for (const f of LIMITES) {
    if (dec >= f.decInf && ra >= f.raInf && ra < f.raSup) return f.sigla
  }
  return 'Oct'
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
const paraHoras = (lon) => (((lon < 0 ? lon + 360 : lon) / 15) % 24 + 24) % 24
const estrelas = ler('d3-celestial/stars.14.json').features
const nomes = ler('d3-celestial/starnames.json')
const linhasD3 = ler('d3-celestial/constellations.lines.json').features

const hipparcos = new Map()
{
  const linhas = createInterface({ input: createReadStream(join(entrada, 'hipparcos.csv'), 'utf8') })
  let cabecalho = null
  for await (const linha of linhas) {
    const campos = linha.match(/("([^"]*)"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''))
    if (!cabecalho) {
      cabecalho = campos
      continue
    }
    const r = Object.fromEntries(cabecalho.map((k, i) => [k, campos[i]]))
    hipparcos.set(Number(r.HIP), r)
  }
}

/** As 12 estrelas curadas (história e nome escritos à mão) por HIP. */
const CURADAS = new Map(STARS.map((s) => [s.hip, s]))

// ---------------------------------------------------------------------------
// Textos gerados
// ---------------------------------------------------------------------------
const SOBRESCRITO = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function cor(tipo) {
  const letra = (tipo ?? '').trim()[0]
  return {
    O: 'azul', B: 'azul-esbranquiçada', A: 'branca', F: 'branco-amarelada',
    G: 'amarela', K: 'alaranjada', M: 'avermelhada', C: 'avermelhada', N: 'avermelhada', S: 'avermelhada',
  }[letra] ?? null
}

function porte(tipo) {
  const t = tipo ?? ''
  if (/(^|[^I])Ia|Iab|Ib|^[OBAFGKM][0-9.]*\s*I($|[^IV])/.test(t)) return 'supergigante'
  if (/III/.test(t)) return 'gigante'
  if (/IV/.test(t)) return 'subgigante'
  if (/(^|[^I])V($|[^I])/.test(t)) return 'anã'
  return null
}

function arredondarDistancia(ly) {
  if (ly < 20) return Math.round(ly * 10) / 10
  if (ly < 100) return Math.round(ly)
  if (ly < 1000) return Math.round(ly / 10) * 10
  return Math.round(ly / 100) * 100
}

/** "Junho a agosto": o mês em que culmina à meia-noite, ± 1. */
function melhorEpoca(raHoras) {
  // O Sol cruza AR 0h por volta de 20/3 e anda ~2 h por mês. A estrela
  // culmina à meia-noite quando o Sol está 12 h de AR à frente dela.
  const raSol = (raHoras + 12) % 24
  const dia = new Date(Date.UTC(2026, 2, 20) + raSol * 15.2 * 86_400_000)
  const m = dia.getUTCMonth()
  const de = MESES[(m + 11) % 12]
  const ate = MESES[(m + 1) % 12]
  return `${de[0].toUpperCase()}${de.slice(1)} a ${ate}`
}

/*
 * Visibilidade no Brasil, que vai de +5,3° (Monte Caburaí, RR) a -33,7° (Chuí,
 * RS) de latitude. Uma estrela sobe acima do horizonte de quem está na
 * latitude φ se dec < 90° - |φ| (para o lado oposto ao do observador).
 *   - dec ≤ +56°: aparece em todo o país;
 *   - +56° < dec ≤ +84,7°: só no norte do país, baixa no horizonte;
 *   - dec > +84,7°: nunca aparece do Brasil (a Polaris, por exemplo).
 * (O extremo sul, dec < -84,7°, também some só para o extremo norte — caso
 * raro demais para virar regra.)
 */
function visibilidade(dec) {
  if (dec <= 56.3) return 'brasil'
  if (dec <= 84.7) return 'norte'
  return 'nunca'
}

/** "B8IIIsp..." → "B8IIIsp": sobras de pontuação do catálogo saem. */
function limparTipo(tipo) {
  return (tipo ?? '').replace(/[.\s:]+$/, '').trim()
}

function historia({ nome, tipo, constelacao, distancia, mag, vis }) {
  const c = cor(tipo)
  const p = porte(tipo)
  const descricao = [c, p].filter(Boolean).join(' ')
  let texto = `${nome} é uma estrela${descricao ? ` ${descricao}` : ''} da constelação de ${constelacao}`
  texto += distancia ? `, a cerca de ${arredondarDistancia(distancia).toLocaleString('pt-BR')} anos-luz da Terra.` : '.'
  if (mag <= 2) texto += ' É uma das estrelas mais brilhantes do céu inteiro.'
  else if (mag <= 4.5) texto += ' Brilha a olho nu e é fácil de achar numa noite limpa.'
  else if (mag <= 6.5) texto += ' Dá para vê-la a olho nu longe das luzes da cidade.'
  else if (mag <= 9) texto += ' Aparece com um binóculo comum, escondida entre estrelas mais fortes.'
  else texto += ' Só se revela num telescópio — um segredo do céu, guardado para poucos.'
  if (vis === 'nunca') texto += ' Fica tão ao norte que não aparece no céu do Brasil — é uma estrela do hemisfério norte.'
  else if (vis === 'norte') texto += ' Do Brasil, só aparece no norte do país, baixa no horizonte.'
  if (distancia && distancia > 2) {
    texto += ` A luz que chega dela hoje saiu há cerca de ${arredondarDistancia(distancia).toLocaleString('pt-BR')} anos.`
  }
  return texto
}

/** Faixa de preço: o brilho e o nome fazem a escassez. */
function faixa({ nomeProprio, mag }) {
  if (nomeProprio && mag <= 1.5) return 'lendaria'
  if (nomeProprio) return 'nomeada'
  if (mag <= 4) return 'brilhante'
  if (mag <= 6.5) return 'visivel'
  return 'profunda'
}

function kebab(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// O catálogo
// ---------------------------------------------------------------------------
const slugsUsados = new Set(STARS.map((s) => s.slug))
let conferidas = 0
let divergentes = 0
const linhasSaida = []
const contagemFaixa = {}

for (const f of estrelas) {
  const hip = f.id
  const mag = f.properties.mag
  if (mag == null) continue
  const ra = paraHoras(f.geometry.coordinates[0])
  const dec = f.geometry.coordinates[1]
  const sigla = constelacaoDe(ra, dec)
  const nm = nomes[String(hip)]

  // Validação: o d3-celestial traz a constelação das ~4.900 estrelas com
  // designação. Só as de Bayer contam — as de Flamsteed podem legitimamente
  // divergir (ver a nota da designação abaixo).
  if (nm?.c && nm.bayer) {
    conferidas += 1
    if (nm.c !== sigla) divergentes += 1
  }

  const con = CONSTELACAO_POR_SIGLA.get(sigla)
  const hp = hipparcos.get(hip) ?? {}
  const plx = Number(hp.Plx)
  const ePlx = Number(hp.e_Plx)
  // Paralaxe confiável (erro < 50%): distância em anos-luz. Senão, sem número.
  const distancia = plx > 0 && ePlx / plx < 0.5 ? 3261.56 / plx : null
  const tipo = limparTipo(hp.SpType)
  const vis = visibilidade(dec)
  const curada = CURADAS.get(hip)

  const sobrescrito = (s) => s.replace(/\d/g, (d) => SOBRESCRITO[d])
  /*
   * Designação com a constelação DA DESIGNAÇÃO, não a da posição. Os números
   * de Flamsteed são do século XVIII, anteriores aos limites de 1930: algumas
   * estrelas ficaram com o nome de uma constelação e a posição em outra ("10
   * Ursae Majoris" está no Lince). O d3-celestial traz a da designação (`c`);
   * a constelação que aparece para quem compra é a da posição (`sigla`).
   */
  const genitivo = CONSTELACAO_POR_SIGLA.get(nm?.c)?.genitivo ?? con.genitivo
  const bayer = nm?.bayer ? `${sobrescrito(nm.bayer)} ${genitivo}` : ''
  const flamsteed = nm?.flam ? `${nm.flam} ${genitivo}` : ''
  const nomeProprio = nm?.name?.trim() || ''
  const designacao = bayer || flamsteed || (hp.HD ? `HD ${hp.HD}` : `HIP ${hip}`)

  const nome = curada?.name ?? (nomeProprio || designacao)
  // Segunda linha da folha: a designação, ou o HIP quando o nome já é ela.
  const segunda = curada?.bayer ?? (nome === designacao ? `HIP ${hip}` : designacao)

  let slug = curada?.slug
  if (!slug) {
    const base = nomeProprio ? kebab(nomeProprio) : `hip-${hip}`
    slug = slugsUsados.has(base) ? `${base}-hip-${hip}` : base
  }
  slugsUsados.add(slug)

  const fx = faixa({ nomeProprio: Boolean(nomeProprio || curada), mag })
  contagemFaixa[fx] = (contagemFaixa[fx] ?? 0) + 1

  linhasSaida.push(
    JSON.stringify({
      slug,
      hip,
      name: nome,
      bayer: segunda,
      constellation: curada?.constellation ?? con.pt,
      constellation_latin: curada?.constellationLatin ?? con.latim,
      sigla,
      spectral_type: curada?.spectralType ?? (tipo || 'desconhecido'),
      ra_hours: Math.round(ra * 1e6) / 1e6,
      dec_degrees: Math.round(dec * 1e6) / 1e6,
      magnitude: curada?.magnitude ?? mag,
      distance_ly: curada?.distanceLy ?? (distancia ? Math.round(distancia * 10) / 10 : null),
      bv: Number(f.properties.bv) || null,
      hd: hp.HD ? Number(hp.HD) : null,
      faixa: fx,
      best_month: curada?.bestMonth ?? melhorEpoca(ra),
      story: curada?.story ?? historia({ nome, tipo, constelacao: con.pt, distancia, mag, vis }),
      visibility: vis,
      featured: Boolean(curada?.featured),
      curada: Boolean(curada),
    }),
  )
}

writeFileSync(join(saida, 'catalogo.ndjson'), linhasSaida.join('\n') + '\n')

// ---------------------------------------------------------------------------
// O céu do mapa (shared/ceu.js)
// ---------------------------------------------------------------------------
const MAG_CEU = 5.0
const r3 = (v) => Math.round(v * 1000) / 1000
const r2 = (v) => Math.round(v * 100) / 100
const ceuEstrelas = estrelas
  .filter((f) => f.properties.mag != null && f.properties.mag <= MAG_CEU)
  .map((f) => [r3(paraHoras(f.geometry.coordinates[0])), r2(f.geometry.coordinates[1]), Math.round(f.properties.mag * 10) / 10])

const ceuLinhas = {}
for (const fig of linhasD3) {
  const tracos = fig.geometry.coordinates.map((t) => t.map(([lon, lat]) => [r3(paraHoras(lon)), r2(lat)]))
  ceuLinhas[fig.id] = [...(ceuLinhas[fig.id] ?? []), ...tracos]
}

writeFileSync(
  join(raiz, 'shared/ceu.js'),
  `/**\n` +
    ` * O céu inteiro para o mapa: estrelas até magnitude ${MAG_CEU} e as linhas das\n` +
    ` * 88 constelações. Serve para o mapa de QUALQUER estrela do catálogo — a\n` +
    ` * projeção recorta o pedaço em volta dela (\`shared/certificado/mapa.js\`).\n` +
    ` *\n` +
    ` * GERADO por scripts/gerar-catalogo.mjs a partir do d3-celestial\n` +
    ` * (BSD-3-Clause, Olaf Frohn; catálogo Hipparcos). Não edite à mão.\n` +
    ` *\n` +
    ` * \`ESTRELAS\` = [AR (h), dec (°), magnitude]; \`LINHAS\` = sigla → traços em [AR, dec].\n` +
    ` */\n` +
    `export const RAIO_CEU_GRAUS = 21\n\n` +
    `export const ESTRELAS = ${JSON.stringify(ceuEstrelas)}\n\n` +
    `export const LINHAS = ${JSON.stringify(ceuLinhas)}\n`,
)

console.log(`${linhasSaida.length} estrelas no catálogo`)
console.log('por faixa:', contagemFaixa)
console.log(`constelação: ${conferidas - divergentes}/${conferidas} batem com o d3-celestial (${divergentes} divergentes)`)
console.log(`céu do mapa: ${ceuEstrelas.length} estrelas até mag ${MAG_CEU}, ${Object.keys(ceuLinhas).length} constelações com linhas`)
