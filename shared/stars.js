/**
 * Catálogo de estrelas que a loja vende.
 *
 * Todos os dados são reais, época J2000, conferidos contra o SIMBAD/ICRS. Não
 * há margem para invenção aqui: um certificado que aponta para uma posição
 * errada é pior do que um certificado bonito. O que muda entre as estrelas é o
 * texto de venda — a astronomia é conferida.
 *
 * Critério de seleção: precisam ser visíveis a olho nu do hemisfério sul
 * (Brasil) em alguma época do ano. As do hemisfério norte absoluto foram
 * deixadas de fora de propósito, mesmo sendo mais conhecidas.
 *
 * Este arquivo é ESM puro e sem dependências, porque é importado em três
 * lugares: o site da loja (Vite), a geração do PDF e os testes — os três
 * precisam falar exatamente a mesma estrela.
 */

/**
 * @typedef {object} Star
 * @property {string}  slug        identificador na URL e no banco
 * @property {string}  name        nome próprio
 * @property {string}  bayer       designação de Bayer
 * @property {string}  constellation
 * @property {string}  constellationLatin
 * @property {string}  spectralType
 * @property {number}  ra          ascensão reta em horas (J2000)
 * @property {number}  dec         declinação em graus (J2000)
 * @property {number}  magnitude   magnitude aparente
 * @property {number}  distanceLy  distância em anos-luz
 * @property {string}  story       o gancho de venda, em primeira pessoa
 * @property {string}  bestMonth   melhor época para ver do Brasil
 */

/** @type {Star[]} */
export const STARS = [
  {
    slug: 'kaus-australis',
    name: 'Kaus Australis',
    bayer: 'ε Sagittarii',
    constellation: 'Sagitário',
    constellationLatin: 'Sagittarius',
    spectralType: 'B9 IVp',
    ra: 18.40286622,
    dec: -34.38461647,
    magnitude: 1.85,
    distanceLy: 143,
    bestMonth: 'Junho a setembro',
    story:
      'A estrela mais brilhante de Sagitário, no bico do "bule de chá". No inverno brasileiro ela sobe alto e fica fácil de encontrar. Sua luz saiu 143 anos atrás — quando o Brasil ainda era um império.',
    featured: true,
  },
  {
    slug: 'alpha-centauri',
    name: 'Alpha Centauri',
    bayer: 'α Centauri',
    constellation: 'Centauro',
    constellationLatin: 'Centaurus',
    spectralType: 'G2V + K1V',
    ra: 14.66013568,
    dec: -60.83397672,
    magnitude: -0.27,
    distanceLy: 4.37,
    bestMonth: 'Abril a setembro',
    story:
      'A estrela mais próxima do Sol depois de Proxima. É na verdade três: duas estrelas que giram uma na outra a cada 16 dias, com uma terceira anã vermelha ao redor. Quatro anos-luz. Na escala do cosmos, é quase vizinha.',
    featured: true,
  },
  {
    slug: 'sirius',
    name: 'Sirius',
    bayer: 'α Canis Majoris',
    constellation: 'Cão Maior',
    constellationLatin: 'Canis Major',
    spectralType: 'A1V + DA2',
    ra: 6.7524808,
    dec: -16.71611586,
    magnitude: -1.46,
    distanceLy: 8.6,
    bestMonth: 'Janeiro a março',
    story:
      'A estrela mais brilhante do céu noturno inteiro, visível do Brasil quase o ano todo. Faz parte do Cão Maior, que os egípcios usavam para marcar a cheia do Nilo. Brilha 25 vezes mais que o Sol.',
    featured: true,
  },
  {
    slug: 'canopus',
    name: 'Canopus',
    bayer: 'α Carinae',
    constellation: 'Carena',
    constellationLatin: 'Carina',
    spectralType: 'A9II',
    ra: 6.39919772,
    dec: -52.69566013,
    magnitude: -0.72,
    distanceLy: 310,
    bestMonth: 'Janeiro a abril',
    story:
      'Segunda mais brilhante do céu, e a estrela-guia dos foguetes: A Soyuz e a cápsula Apollo usavam o brilho dela para se orientar. Do Brasil aparece baixa, perto do horizonte, e some rápido. Difícil de ver. Vale o esforço.',
    featured: false,
  },
  {
    slug: 'antares',
    name: 'Antares',
    bayer: 'α Scorpii',
    constellation: 'Escorpião',
    constellationLatin: 'Scorpius',
    spectralType: 'M1.5Iab',
    ra: 16.49012703,
    dec: -26.43199644,
    magnitude: 1.06,
    distanceLy: 550,
    bestMonth: 'Maio a agosto',
    story:
      'O nome vem do grego: "rival de Marte", porque brilha em vermelho. Uma supergigante tão vasta que, se estivesse onde o Sol está, engoliria a órbita de Marte. O núcleo dela já está no fim.',
    featured: false,
  },
  {
    slug: 'achernar',
    name: 'Achernar',
    bayer: 'α Eridani',
    constellation: 'Erídano',
    constellationLatin: 'Eridanus',
    spectralType: 'B6Vep',
    ra: 1.62857161,
    dec: -57.2367153,
    magnitude: 0.46,
    distanceLy: 139,
    bestMonth: 'Novembro a março',
    story:
      'Significa "o rio que corre para o sul", o fim do rio Egyptian. É uma estrela achatada, girando tão rápido que fica visivelmente oval. Para o hemisfério sul, ocupa o lugar que Polaris ocupa no norte — quase.',
    featured: false,
  },
  {
    slug: 'fomalhaut',
    name: 'Fomalhaut',
    bayer: 'α Piscis Austrini',
    constellation: 'Peixe Austral',
    constellationLatin: 'Piscis Austrinus',
    spectralType: 'A3V',
    ra: 22.96084749,
    dec: -29.62223605,
    magnitude: 1.16,
    distanceLy: 25,
    bestMonth: 'Setembro a novembro',
    story:
      'A estrela mais solitária do céu: não tem nenhuma estrela vizinha num raio grande, numa das regiões mais vazias da Via Láctea. Em 2013 o Telescópio Hubble fotografou um anel de poeira ao redor dela, como se alguém tivesse desenhado um beijo no espaço.',
    featured: true,
  },
  {
    slug: 'spica',
    name: 'Spica',
    bayer: 'α Virginis',
    constellation: 'Virgem',
    constellationLatin: 'Virgo',
    spectralType: 'B1III-IV',
    ra: 13.41988305,
    dec: -11.16132208,
    magnitude: 0.98,
    distanceLy: 250,
    bestMonth: 'Março a maio',
    story:
      'Do latim, "espiga". Não é uma estrela, mas duas, girando uma ao redor da outra a cada quatro dias. Uma empresa de telecomunicações já mediu a distância da Terra até ela com mais precisão do que qualquer laboratório terrestre.',
    featured: false,
  },
  {
    slug: 'pollux',
    name: 'Pollux',
    bayer: 'β Geminorum',
    constellation: 'Gêmeos',
    constellationLatin: 'Gemini',
    spectralType: 'K0III',
    ra: 7.75526358,
    dec: 28.0261992,
    magnitude: 1.14,
    distanceLy: 34,
    bestMonth: 'Dezembro a março',
    story:
      'A mais brilhante dos Gêmeos, parecendo o irmão mais velho de Castor. Anã vermelha e gigante laranja ao mesmo tempo — uma estrela que está engordando enquanto esfria. Uma estrela natalina de verdade.',
    featured: false,
  },
  {
    slug: 'regulus',
    name: 'Regulus',
    bayer: 'α Leonis',
    constellation: 'Leão',
    constellationLatin: 'Leo',
    spectralType: 'B7V',
    ra: 10.13953074,
    dec: 11.96720871,
    magnitude: 1.36,
    distanceLy: 79,
    bestMonth: 'Fevereiro a abril',
    story:
      'Do latim, "pequeno rei". Forma o triângulo da cabeça do Leão. Gira tão rápido no equador que está 30% mais achatada nos polos do que nos lados — a distorção foi medida daqui da Terra.',
    featured: false,
  },
  {
    slug: 'atria',
    name: 'Atria',
    bayer: 'α Trianguli Australis',
    constellation: 'Triângulo Austral',
    constellationLatin: 'Triangulum Australe',
    spectralType: 'K2Ib-II',
    ra: 16.81104865,
    dec: -69.02772075,
    magnitude: 1.91,
    distanceLy: 391,
    bestMonth: 'Maio a agosto',
    story:
      'Segunda mais brilhante do céu para quem está no hemisfério sul, logo abaixo de Canopus. Aponta quase para o Polo Sul Celeste. Foi uma das primeiras estrelas a serem mapeadas por outro continente.',
    featured: false,
  },
  {
    slug: 'vega',
    name: 'Vega',
    bayer: 'α Lyrae',
    constellation: 'Lira',
    constellationLatin: 'Lyra',
    spectralType: 'A0V',
    ra: 18.61564931,
    dec: 38.78368896,
    magnitude: 0.03,
    distanceLy: 25,
    bestMonth: 'Julho a outubro',
    story:
      'A quinta estrela mais brilhante do céu, e a primeira de todas a ser fotografada, em 1850. Foi a estrela em torno da qual a primeira tentativa de encontrar vida extraterrestre se orientou — e continua sendo alvo de buscas.',
    featured: false,
  },
]

/** Índice por slug, para buscar sem varrer a lista. */
export const STAR_BY_SLUG = new Map(STARS.map((star) => [star.slug, star]))

/**
 * Estrela sugerida por padrão, para quando a pessoa não escolher nenhuma.
 * É a mesma do site original: a mais brilhante de Sagitário, que é também a
 * mais fácil de encontrar a olho nu do Brasil.
 */
export const DEFAULT_STAR_SLUG = 'kaus-australis'

/** @returns {Star} a estrela do slug, ou a padrão se o slug não existir. */
export function getStar(slug) {
  return STAR_BY_SLUG.get(slug) ?? STAR_BY_SLUG.get(DEFAULT_STAR_SLUG)
}

/**
 * Formata ascensão reta em horas para exibição: 18.402866 → "18h 24m 10.32s".
 *
 * @param {number} hoursDecimal
 * @returns {string}
 */
export function formatRa(hoursDecimal) {
  const hours = Math.floor(hoursDecimal)
  const minutesFloat = (hoursDecimal - hours) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  const sign = hoursDecimal < 0 ? '−' : ''
  return `${sign}${Math.abs(hours)}h ${String(minutes).padStart(2, '0')}m ${seconds.toFixed(2).padStart(5, '0')}s`
}

/**
 * Formata declinação para exibição: -34.3846 → "−34° 23′ 04.62″".
 *
 * @param {number} decimal
 * @returns {string}
 */
export function formatDec(decimal) {
  const sign = decimal < 0 ? '−' : ''
  const abs = Math.abs(decimal)
  const degrees = Math.floor(abs)
  const minutesFloat = (abs - degrees) * 60
  const minutes = Math.floor(minutesFloat)
  const seconds = (minutesFloat - minutes) * 60
  return `${sign}${degrees}° ${String(minutes).padStart(2, '0')}′ ${seconds.toFixed(2).padStart(5, '0')}″`
}
