/**
 * Dados reais de Kaus Australis (ε Sagittarii) e das estrelas
 * mais brilhantes da constelação de Sagitário (época J2000).
 * Fontes: SIMBAD / ICRS.
 */

export const honoree = {
  fullName: 'Geovanna Beatriz Santos Trindade',
  firstName: 'Geovanna',
  certificateId: 'ε-SGR-GBT-2026',
  dedicatedOn: '11 de outubro de 2026',
  // Assinatura. Vazio = não aparece nem na carta nem no certificado.
  // Preencha com um nome ou uma frase, por exemplo: 'Com amor, [seu nome]'.
  from: '',
  /**
   * Mensagem pessoal — o espaço para VOCÊ escrever.
   *
   * É a parte mais dela deste site. Deixei em branco de propósito: nada aqui
   * pode ser escrito por mim, tem que sair de você.
   *
   * Escreva o que quiser, pode quebrar em várias linhas com "\n".
   * Enquanto estiver vazia, a seção inteira não aparece.
   */
  personalMessage: '',
}

/**
 * Ficha completa da estrela, em dois formatos:
 *
 * - `ra`/`dec` "quebrados" (graus, minutos, segundos) são o que a pessoa lê;
 * - `hoursDecimal`/`decimal` são o que a matemática usa (`equatorialToHorizontal`,
 *   `project`) — conferidos um contra o outro nos testes de `shared/sky.test.mjs`;
 * - `formatted` é a string já pronta para a tela, com os símbolos tipográficos
 *   (−, ′, ″). Não monte a formatação no componente: use estes campos.
 *
 * Época J2000: as coordenadas valem para 1º de janeiro de 2000 ao meio-dia;
 * a deriva é de ~50,3″/ano em AR, irrelevante para este presente.
 */
export const kausAustralis = {
  commonName: 'Kaus Australis',
  scientificName: 'Epsilon Sagittarii',
  bayer: 'ε Sagittarii',
  bayerShort: 'ε Sgr',
  namedAs: honoree.fullName,
  constellation: 'Sagitário',
  constellationLatin: 'Sagittarius',
  ra: {
    hours: 18,
    minutes: 24,
    seconds: 10.3184,
    hoursDecimal: 18.40286622,
    formatted: '18h 24m 10.32s',
  },
  dec: {
    degrees: -34,
    minutes: 23,
    seconds: 4.6193,
    decimal: -34.38461647,
    formatted: '−34° 23′ 04.62″',
  },
  magnitude: 1.85,
  magnitudeRange: '1,79 – 1,85',
  magnitudeNote:
    'SIMBAD/Hipparcos listam V = 1,85; a revisão de 2007 do Hipparcos dá 1,79. Em ambos os casos continua sendo a estrela mais brilhante de Sagitário.',
  spectralType: 'B9 IVp',
  distanceLy: 143,
  distancePc: 43.9,
  hip: 'HIP 90185',
  hd: 'HD 169022',
  hr: 'HR 6879',
  bestSeason: 'inverno no hemisfério sul (auge em agosto)',
  note: 'Estrela mais brilhante de Sagitário, visível a olho nu no Brasil.',
}

/** Estrelas principais do “bule de chá” de Sagitário (RA em horas, Dec em graus). */
export const sagittariusStars = [
  {
    id: 'eps',
    name: 'Kaus Australis',
    bayer: 'ε Sgr',
    ra: 18.402866,
    dec: -34.384616,
    mag: 1.85,
    dedicated: true,
  },
  { id: 'sig', name: 'Nunki', bayer: 'σ Sgr', ra: 18.9211, dec: -26.2967, mag: 2.05 },
  { id: 'zet', name: 'Ascella', bayer: 'ζ Sgr', ra: 19.0435, dec: -29.8801, mag: 2.59 },
  { id: 'del', name: 'Kaus Media', bayer: 'δ Sgr', ra: 18.3492, dec: -29.8281, mag: 2.7 },
  { id: 'lam', name: 'Kaus Borealis', bayer: 'λ Sgr', ra: 18.4662, dec: -25.4217, mag: 2.82 },
  { id: 'pi', name: 'Albaldah', bayer: 'π Sgr', ra: 19.1627, dec: -21.0236, mag: 2.89 },
  { id: 'gam', name: 'Alnasl', bayer: 'γ² Sgr', ra: 18.0968, dec: -30.4241, mag: 2.99 },
  { id: 'eta', name: 'η Sagittarii', bayer: 'η Sgr', ra: 18.293, dec: -36.7613, mag: 3.11 },
  { id: 'phi', name: 'φ Sagittarii', bayer: 'φ Sgr', ra: 18.7609, dec: -26.9908, mag: 3.17 },
  { id: 'tau', name: 'τ Sagittarii', bayer: 'τ Sgr', ra: 19.1157, dec: -27.6704, mag: 3.32 },
]

/** Linhas da figura do bule (ids de sagittariusStars). */
export const constellationLines = [
  ['gam', 'del'],
  ['del', 'eps'],
  ['del', 'lam'],
  ['lam', 'phi'],
  ['phi', 'sig'],
  ['sig', 'tau'],
  ['tau', 'zet'],
  ['zet', 'eps'],
  ['eps', 'eta'],
  ['lam', 'pi'],
]

/**
 * Parágrafos da carta, na ordem em que aparecem.
 *
 * São o VALOR PADRÃO: `defaults.js` os copia para `DEFAULTS.carta`, e um
 * `conteudo.json` em `public/` pode substituir a lista inteira. A primeira
 * linha é tratada como abertura (sai maior e sem itálico) em `LoveLetter.jsx`.
 */
export const letterParagraphs = [
  `Geovanna Beatriz Santos Trindade.`,
  `Existe um pedaço do céu que, todas as noites, se recusa a ser comum. Fica em Sagitário — a constelação do arqueiro — e o seu ponto mais brilhante se chama Kaus Australis. Os catálogos a conhecem como ε Sagittarii. A partir de agora, este lugar também te conhece pelo teu nome.`,
  `Eu escolhi essa estrela porque ela não se esconde. Magnitude 1,85: clara o bastante para ser vista a olho nu, especialmente daqui, do hemisfério sul, do Brasil, do mesmo céu que cobre os teus dias. Enquanto o inverno avança, o arqueiro sobe e ela brilha no bico do “bule de chá” — como se o universo tivesse deixado um convite discreto para quem soubesse olhar.`,
  `A 143 anos-luz daqui, a luz que chega aos teus olhos hoje saiu dessa estrela quando ainda éramos só possibilidade. Mesmo assim, ela atravessou o vazio, o tempo e a poeira da Via Láctea para encontrar exatamente este instante. Eu gosto de pensar que o amor faz o mesmo: parte de muito longe e, ainda assim, acerta o alvo.`,
  `Este certificado não pretende possuir o céu. Ninguém é dono de uma estrela. O que ele guarda é outra coisa, mais verdadeira: a decisão de te colocar no mapa. De apontar para um ponto de luz real, com coordenadas, espectro e história, e dizer — aqui. Quando o mundo parecer pequeno demais, levanta os olhos. Ela estará lá. E o teu nome, também.`,
  `Com todo o meu amor, sob a mesma noite.`,
]
