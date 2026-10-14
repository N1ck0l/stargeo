/**
 * Montagem do `content` de uma página dedicada.
 *
 * Os componentes do site pessoal (Hero, StarDetails, SkyMap, LoveLetter…)
 * leem um objeto com as mesmas chaves do antigo `conteudo.json`. Aqui esse
 * objeto vem da API, e dois campos extras entram no pacote:
 *
 * - `estrela` — a estrela no formato que os componentes usam (`kausAustralis`
 *   em `loja/src/data/star.js`). É o que faz os componentes deixarem de importar a
 *   Kaus fixa: `content.estrela ?? kausAustralis`.
 *
 * - `sky` / `skyFigura` — o céu desenhado. São dois porque o mapa e a mira
 *   precisam de coisas diferentes do mesmo céu:
 *     · o MAPA quer uma figura rica (o bule, ou as 90 estrelas brilhantes);
 *     · a MIRA quer a figura ENXUTA (só a dedicada) porque o fundo dela já é
 *       o catálogo brilhante — se a figura viesse com as 90, o fundo seria
 *       zerado e a tela perderia o céu de contexto.
 *
 * Sem estrela remota (site pessoal) nada disso existe, e os componentes
 * continuam no import de sempre.
 */
import { constellationLines, sagittariusStars } from '../data/star.js'
import { brightStars } from '../data/brightStars.js'

/**
 * Estrela da página no formato do site pessoal → folha do certificado.
 *
 * O `CertificadoPreview` quer número puro em `ra`/`dec`, não o objeto
 * `{hoursDecimal, formatted}` que os componentes de tela usam — é por isso
 * que aqui se descacha a parte formatada.
 */
export function estrelaDaFolha(estrela) {
  return {
    name: estrela.commonName,
    slug: estrela.slug,
    // A sigla destaca a constelação da estrela no mapa da folha.
    sigla: estrela.sigla,
    bayer: estrela.bayer,
    constellation: estrela.constellation,
    constellationLatin: estrela.constellationLatin,
    spectralType: estrela.spectralType,
    ra: estrela.ra.hoursDecimal,
    dec: estrela.dec.decimal,
    magnitude: estrela.magnitude,
    distanceLy: estrela.distanceLy || null,
  }
}

/**
 * O objeto `content` completo, pronto para o `ContentContext`.
 *
 * `ceu` é o módulo `shared/ceu.js` (carregado sob demanda pela página): com
 * ele, o mapa de QUALQUER estrela do catálogo ganha o céu real em volta e a
 * figura da constelação. Sem ele (testes antigos), fica o fundo das 90
 * brilhantes, como antes.
 */
export function montarConteudo(pagina, estrela, ceu = null) {
  return {
    ...pagina.conteudo,
    estrela,
    sky: montarCeu(estrela, ceu),
    skyFigura: { stars: montarFigura(estrela), lines: [] },
  }
}

/**
 * O céu do MAPA.
 *
 * Em Sagitário é o bule de chá de sempre, com `dedicated` movido para a
 * estrela da página. Nas outras 87 constelações, as estrelas reais até
 * magnitude 5 num raio de 30° e a figura da constelação, com cada traço
 * ligado às estrelas das pontas (a mais próxima, até 0,5°).
 */
function montarCeu(estrela, ceu) {
  if (estrela.constellationLatin === 'Sagittarius') {
    let dedicada = false
    const stars = sagittariusStars.map((star) => {
      const mesma = star.name === estrela.commonName
      if (mesma) dedicada = true
      return { ...star, dedicated: mesma }
    })
    if (!dedicada) stars.push(alvoDe(estrela))
    return { stars, lines: constellationLines }
  }
  if (!ceu) return { stars: [...fundoBrilhante(), alvoDe(estrela)], lines: [] }

  const alvo = alvoDe(estrela)
  const G = Math.PI / 180
  const distancia = (ra1, dec1, ra2, dec2) =>
    Math.acos(
      Math.min(1, Math.sin(dec1 * G) * Math.sin(dec2 * G) + Math.cos(dec1 * G) * Math.cos(dec2 * G) * Math.cos((ra1 - ra2) * 15 * G)),
    ) / G

  const stars = ceu.ESTRELAS.filter(([ra, dec]) => distancia(ra, dec, alvo.ra, alvo.dec) <= 30)
    // A própria estrela (se for brilhante) já entra como alvo.
    .filter(([ra, dec]) => distancia(ra, dec, alvo.ra, alvo.dec) > 0.05)
    .map(([ra, dec, mag], i) => ({ id: `c${i}`, name: '', bayer: '', ra, dec, mag, dedicated: false }))
  stars.push(alvo)

  const maisProxima = (ra, dec) => {
    let melhor = null
    let menor = 0.5
    for (const s of stars) {
      const d = distancia(ra, dec, s.ra, s.dec)
      if (d < menor) {
        menor = d
        melhor = s.id
      }
    }
    return melhor
  }
  const lines = []
  for (const traco of ceu.LINHAS[estrela.sigla] ?? []) {
    for (let i = 0; i < traco.length - 1; i += 1) {
      const a = maisProxima(...traco[i])
      const b = maisProxima(...traco[i + 1])
      if (a && b && a !== b) lines.push([a, b])
    }
  }
  return { stars, lines }
}

/** A figura ENXUTA da mira celeste. */
function montarFigura(estrela) {
  if (estrela.constellationLatin === 'Sagittarius') {
    return sagittariusStars.map((star) => ({
      ...star,
      dedicated: star.name === estrela.commonName,
    }))
  }
  return [alvoDe(estrela)]
}

/** A estrela da página, no formato que os dois componentes desenham. */
function alvoDe(estrela) {
  return {
    id: 'alvo',
    name: estrela.commonName,
    bayer: estrela.bayer,
    ra: estrela.ra.hoursDecimal,
    dec: estrela.dec.decimal,
    mag: estrela.magnitude,
    dedicated: true,
  }
}

/** As 90 brilhantes, no formato `{id, name, bayer, ra, dec, mag}`. */
function fundoBrilhante() {
  return brightStars.map((star, index) => ({
    // O nome próprio é opcional no catálogo (Kaus Australis, aliás, vem sem);
    // sem id o `key` do React e o mapa por id colidiriam.
    id: star.n ?? `fundo-${index}`,
    name: star.n ?? '',
    bayer: '',
    ra: star.ra,
    dec: star.dec,
    mag: star.m,
    dedicated: false,
  }))
}
