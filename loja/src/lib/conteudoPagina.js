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
    bayer: estrela.bayer,
    constellation: estrela.constellation,
    constellationLatin: estrela.constellationLatin,
    spectralType: estrela.spectralType,
    ra: estrela.ra.hoursDecimal,
    dec: estrela.dec.decimal,
    magnitude: estrela.magnitude,
    distanceLy: estrela.distanceLy,
  }
}

/** O objeto `content` completo, pronto para o `ContentContext`. */
export function montarConteudo(pagina, estrela) {
  return {
    ...pagina.conteudo,
    estrela,
    sky: montarCeu(estrela),
    skyFigura: { stars: montarFigura(estrela), lines: [] },
  }
}

/**
 * O céu do MAPA.
 *
 * Em Sagitário é o bule de chá de sempre, com `dedicated` movido para a
 * estrela da página (o anel dourado e a seleção inicial seguem essa marca).
 * Em qualquer outro lugar são as 90 estrelas brilhantes + a dedicada, sem
 * linhas — não temos a figura de outras constelações, e inventar uma seria
 * pior do que não mostrar.
 */
function montarCeu(estrela) {
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

  return { stars: [...fundoBrilhante(), alvoDe(estrela)], lines: [] }
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
