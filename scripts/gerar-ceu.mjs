/**
 * Gera `shared/ceu.js` — o céu em volta de cada estrela do catálogo, para o
 * mapa estelar do certificado.
 *
 *     npm pack d3-celestial@0.7.35 && tar -xzf d3-celestial-0.7.35.tgz
 *     node scripts/gerar-ceu.mjs <pasta>/package/data
 *
 * Fonte: d3-celestial (BSD-3-Clause, Olaf Frohn), catálogo derivado do
 * Hipparcos, com as linhas das 88 constelações. O pacote tem 49 MB e traz o
 * d3 inteiro, então NÃO é dependência: a extração roda uma vez e o resultado
 * (alguns KB) é versionado.
 *
 * Para cada estrela de `shared/stars.js`:
 *   - estrelas até magnitude `MAG_LIMITE` num raio de `RAIO_GRAUS`;
 *   - as linhas da constelação dela (as que passam perto do campo).
 * Coordenadas em ascensão reta (horas) e declinação (graus), J2000 — a mesma
 * convenção do resto do projeto; a projeção é feita na hora de desenhar.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { STARS } from '../shared/stars.js'

const pasta = process.argv[2]
if (!pasta) {
  console.error('Uso: node scripts/gerar-ceu.mjs <pasta data do d3-celestial>')
  process.exit(1)
}

const RAIO_GRAUS = 21
const MAG_LIMITE = 5.0

/** Abreviação IAU da constelação de cada estrela do catálogo. */
const SIGLA = {
  Sagittarius: 'Sgr',
  Centaurus: 'Cen',
  'Canis Major': 'CMa',
  Carina: 'Car',
  Scorpius: 'Sco',
  Eridanus: 'Eri',
  'Piscis Austrinus': 'PsA',
  Virgo: 'Vir',
  Gemini: 'Gem',
  Leo: 'Leo',
  'Triangulum Australe': 'TrA',
  Lyra: 'Lyr',
}

const ler = (arquivo) => JSON.parse(readFileSync(join(pasta, arquivo), 'utf8'))
const estrelas = ler('stars.6.json').features
const linhas = ler('constellations.lines.json').features

/** d3-celestial guarda a AR em graus de -180 a 180; o projeto usa horas 0–24. */
const paraHoras = (lon) => (((lon < 0 ? lon + 360 : lon) / 15) % 24 + 24) % 24
const r4 = (v) => Math.round(v * 10000) / 10000

/** Distância angular em graus entre dois pontos (AR em horas, dec em graus). */
function distancia(ra1, dec1, ra2, dec2) {
  const g = Math.PI / 180
  const cos =
    Math.sin(dec1 * g) * Math.sin(dec2 * g) +
    Math.cos(dec1 * g) * Math.cos(dec2 * g) * Math.cos((ra1 - ra2) * 15 * g)
  return Math.acos(Math.min(1, Math.max(-1, cos))) / g
}

const ceu = {}
for (const estrela of STARS) {
  const sigla = SIGLA[estrela.constellationLatin]
  if (!sigla) throw new Error(`Sem sigla para ${estrela.constellationLatin}`)

  const campo = estrelas
    .filter((f) => f.properties.mag <= MAG_LIMITE)
    .map((f) => [paraHoras(f.geometry.coordinates[0]), f.geometry.coordinates[1], f.properties.mag])
    .filter(([ra, dec]) => distancia(ra, dec, estrela.ra, estrela.dec) <= RAIO_GRAUS)
    // A própria estrela entra desenhada à parte, com destaque.
    .filter(([ra, dec]) => distancia(ra, dec, estrela.ra, estrela.dec) > 0.05)
    .map(([ra, dec, mag]) => [r4(ra), r4(dec), Math.round(mag * 100) / 100])

  const figura = linhas.find((f) => f.id === sigla)
  if (!figura) throw new Error(`Sem linhas para ${sigla}`)
  const tracos = figura.geometry.coordinates
    .map((traco) => traco.map(([lon, dec]) => [r4(paraHoras(lon)), r4(dec)]))
    // Traço que nem chega perto do campo só pesaria o arquivo.
    .filter((traco) => traco.some(([ra, dec]) => distancia(ra, dec, estrela.ra, estrela.dec) <= RAIO_GRAUS * 1.6))

  ceu[estrela.slug] = { sigla, estrelas: campo, linhas: tracos }
}

const saida = resolve(import.meta.dirname, '../shared/ceu.js')
writeFileSync(
  saida,
  `/**\n` +
    ` * Céu em volta de cada estrela do catálogo — o mapa estelar do certificado.\n` +
    ` *\n` +
    ` * GERADO por scripts/gerar-ceu.mjs a partir do d3-celestial (BSD-3-Clause,\n` +
    ` * Olaf Frohn; catálogo Hipparcos). Não edite à mão.\n` +
    ` *\n` +
    ` * Por slug: \`estrelas\` = [AR (h), dec (°), magnitude] até mag ${MAG_LIMITE} num raio\n` +
    ` * de ${RAIO_GRAUS}°; \`linhas\` = traços da constelação, em [AR (h), dec (°)].\n` +
    ` */\n` +
    `export const RAIO_CEU_GRAUS = ${RAIO_GRAUS}\n\n` +
    `export const CEU = ${JSON.stringify(ceu)}\n`,
)

for (const [slug, dados] of Object.entries(ceu)) {
  console.log(`${slug.padEnd(16)} ${dados.sigla.padEnd(4)} ${String(dados.estrelas.length).padStart(3)} estrelas, ${dados.linhas.length} traços`)
}
