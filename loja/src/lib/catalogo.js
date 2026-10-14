import { useEffect, useState } from 'react'
import { STARS, getStar } from '../../../shared/stars.js'

/**
 * O catálogo de estrelas (~118 mil, Hipparcos) — busca, estrela por slug,
 * "surpreenda-me" e faixas de preço.
 *
 * Lê direto do Data API do Supabase com a chave anon: `stars` e `faixas` têm
 * leitura pública (RLS), e a busca é uma função do banco
 * (`buscar_estrelas`, migration 0010). Nada de catálogo no bundle.
 *
 * Sem Supabase configurado (testes, `npm run dev` sem `.env`), tudo cai nas
 * 12 estrelas curadas de `shared/stars.js`: a loja continua navegável.
 */

const URL_BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY
const configurado = Boolean(URL_BASE && CHAVE)

/** Faixas padrão — as mesmas da migration 0010, para o modo sem banco. */
export const FAIXAS_PADRAO = [
  { slug: 'lendaria', nome: 'Lendária', descricao: 'As estrelas mais brilhantes do céu, com nome próprio', precoCentavos: 24900 },
  { slug: 'nomeada', nome: 'Nomeada', descricao: 'Estrelas com nome próprio, conhecidas há séculos', precoCentavos: 14900 },
  { slug: 'brilhante', nome: 'Brilhante', descricao: 'Fáceis de ver a olho nu, mesmo perto da cidade', precoCentavos: 9900 },
  { slug: 'visivel', nome: 'Visível', descricao: 'Visíveis a olho nu num céu escuro', precoCentavos: 6900 },
  { slug: 'profunda', nome: 'Profunda', descricao: 'Só aparecem com binóculo ou telescópio — um segredo do céu', precoCentavos: 4900 },
]

/** Faixa das curadas, quando não há banco (mesma regra do gerador). */
function faixaLocal(s) {
  return s.magnitude <= 1.5 ? 'lendaria' : 'nomeada'
}

async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', ...opcoes.headers },
  })
  if (!resposta.ok) throw new Error(`catálogo indisponível (${resposta.status})`)
  return resposta.json()
}

/** Linha do banco (ou estrela curada) → o formato que a loja e a folha usam. */
export function normalizar(linha) {
  if (!linha) return null
  if ('ra' in linha && !('ra_hours' in linha)) {
    // Já é uma estrela de `shared/stars.js`.
    const faixa = linha.faixa ?? faixaLocal(linha)
    return {
      ...linha,
      faixa,
      precoCentavos: linha.precoCentavos ?? FAIXAS_PADRAO.find((f) => f.slug === faixa).precoCentavos,
      status: linha.status ?? 'disponivel',
      visibility: linha.visibility ?? 'brasil',
      curada: true,
    }
  }
  return {
    slug: linha.slug,
    name: linha.name,
    bayer: linha.bayer,
    constellation: linha.constellation,
    constellationLatin: linha.constellation_latin,
    sigla: linha.sigla,
    spectralType: linha.spectral_type,
    ra: Number(linha.ra_hours),
    dec: Number(linha.dec_degrees),
    magnitude: Number(linha.magnitude),
    distanceLy: linha.distance_ly == null ? null : Number(linha.distance_ly),
    story: linha.story,
    bestMonth: linha.best_month,
    faixa: linha.faixa,
    precoCentavos: linha.price_cents ?? linha.faixas?.price_cents ?? null,
    status: linha.status ?? 'disponivel',
    visibility: linha.visibility,
    curada: Boolean(linha.curada),
  }
}

/**
 * Busca no catálogo. Sem texto nem filtros, as mais brilhantes disponíveis.
 *
 * @returns {Promise<{ estrelas: object[], total: number }>}
 */
export async function buscarEstrelas({ texto = '', sigla = null, faixa = null, visivelBrasil = false, limite = 12, deslocamento = 0 } = {}) {
  if (!configurado) {
    const t = texto.trim().toLowerCase()
    const lista = STARS.map(normalizar).filter(
      (s) =>
        (!t || `${s.name} ${s.bayer} ${s.constellation}`.toLowerCase().includes(t)) &&
        (!sigla || s.sigla === sigla) &&
        (!faixa || s.faixa === faixa),
    )
    return { estrelas: lista.slice(deslocamento, deslocamento + limite), total: lista.length }
  }
  const linhas = await rest('rpc/buscar_estrelas', {
    method: 'POST',
    body: JSON.stringify({
      p_texto: texto.trim() || null,
      p_sigla: sigla,
      p_faixa: faixa,
      p_visivel_brasil: visivelBrasil,
      p_limite: limite,
      p_deslocamento: deslocamento,
    }),
  })
  return { estrelas: linhas.map(normalizar), total: Number(linhas[0]?.total ?? 0) }
}

/** Uma estrela pelo slug, com preço e estado; `null` se não existir. */
export async function buscarEstrela(slug) {
  if (!slug) return null
  if (!configurado) return normalizar(getStar(slug))
  const campos =
    'slug,name,bayer,constellation,constellation_latin,sigla,spectral_type,ra_hours,dec_degrees,magnitude,distance_ly,story,best_month,faixa,status,reserved_until,visibility,curada,faixas(price_cents)'
  const [linha] = await rest(`stars?slug=eq.${encodeURIComponent(slug)}&select=${campos}`)
  if (!linha) return null
  // Reserva vencida é estrela livre de novo (o banco só "limpa" na próxima escrita).
  if (linha.status === 'reservada' && new Date(linha.reserved_until).getTime() < Date.now()) linha.status = 'disponivel'
  return normalizar(linha)
}

/** "Surpreenda-me": o slug de uma estrela disponível ao acaso. */
export async function estrelaAleatoria({ faixa = null } = {}) {
  if (!configurado) {
    const lista = STARS.filter((s) => !faixa || faixaLocal(s) === faixa)
    return lista[Math.floor(Math.random() * lista.length)]?.slug ?? null
  }
  const [slug] = await rest('rpc/estrela_aleatoria', {
    method: 'POST',
    body: JSON.stringify({ p_faixa: faixa, p_visivel_brasil: true }),
  })
  return slug ?? null
}

let faixasCache = null

/** As faixas de preço (do banco; as padrão enquanto carrega ou sem banco). */
export function useFaixas() {
  const [faixas, setFaixas] = useState(() => faixasCache ?? FAIXAS_PADRAO)
  useEffect(() => {
    if (!configurado || faixasCache) return undefined
    let vivo = true
    rest('faixas?select=slug,nome,descricao,price_cents&order=ordem')
      .then((linhas) => {
        faixasCache = linhas.map((f) => ({ slug: f.slug, nome: f.nome, descricao: f.descricao, precoCentavos: f.price_cents }))
        if (vivo) setFaixas(faixasCache)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  return faixas
}

/** "R$ 49" / "R$ 49,90". */
export function reais(centavos) {
  if (centavos == null) return ''
  const v = centavos / 100
  return `R$ ${Number.isInteger(v) ? v : v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

/** Brilho em palavras, para quem não sabe o que é magnitude. */
export function comoSeVe(magnitude) {
  if (magnitude <= 2) return 'uma das mais brilhantes do céu'
  if (magnitude <= 4.5) return 'fácil de ver a olho nu'
  if (magnitude <= 6.5) return 'visível a olho nu em céu escuro'
  if (magnitude <= 9) return 'visível com binóculo'
  return 'visível com telescópio'
}
