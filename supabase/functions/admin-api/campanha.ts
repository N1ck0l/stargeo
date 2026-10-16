/**
 * Campanhas de homenagem no painel (0024) — a primeira é a PROIMAGEM.
 *
 * Cada homenageada é uma PÁGINA MANUAL (`pages`, sem pedido) marcada com a
 * campanha. Daqui saem: a lista da campanha, o cadastro/edição de uma
 * homenagem e a configuração (assinatura e frase final).
 *
 * Tudo é validado aqui, no servidor (o painel valida também, mas é só
 * conforto): textos pela moderação da loja, a carta pelas regras da carta da
 * compra (2.000 caracteres, 12 parágrafos), o tom por lista fechada, e a
 * mesma pessoa não entra duas vezes na mesma campanha (índice único em
 * `campanha_chave`). A estrela sai da vitrine ao entrar numa homenagem e
 * volta quando é trocada — nunca uma estrela vendida.
 *
 * O que é privado (anotações para a carta, consentimento) só circula entre o
 * banco e o painel; a página pública (`get-page`) não lê essas colunas.
 */
import { ErroApp } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { LIMITES_PAGINA, colunasDoConteudo, conteudoDoPedido } from '../_shared/pagina.ts'
import { MAX_PARAGRAFOS_CARTA, limpar, normalizar, paragrafosDaCarta, validarPedido, validarTextoLivre } from '../../../shared/moderation.js'

type Db = ReturnType<typeof admin>

export const TONS = ['afetuoso', 'elegante', 'inspirador', 'amistoso', 'profissional'] as const
export const ETAPAS = ['rascunho', 'revisao', 'finalizada'] as const

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/
const RE_SLUG_ESTRELA = /^[a-z0-9-]{1,80}$/

/** "Ána  Clára" → "ana clara": a chave que impede a mesma pessoa duas vezes. */
export function chaveDaPessoa(nome: string): string {
  return normalizar(limpar(nome)).replace(/\s+/g, ' ')
}

export interface Homenagem {
  code: string | null
  nome: string
  nomePreferido: string
  starSlug: string
  carta: string[]
  mensagem: string
  assinatura: string
  data: string | null
  etapa: (typeof ETAPAS)[number]
  publicar: boolean
  notas: { qualidades: string; profissional: string; lembranca: string; tom: string }
  consentimento: { redes: boolean; repostagem: boolean; imagem: boolean }
}

/**
 * Corpo do painel → homenagem validada. Lança `ErroApp` 422 com a mensagem
 * do primeiro problema (o painel mostra ao lado do botão).
 */
export function normalizarHomenagem(corpo: Record<string, unknown>): Homenagem {
  const texto = (v: unknown) => limpar(String(v ?? ''))
  const notasEntrada = (corpo.notas ?? {}) as Record<string, unknown>
  const consentimentoEntrada = (corpo.consentimento ?? {}) as Record<string, unknown>

  const h: Homenagem = {
    code: corpo.code ? String(corpo.code).trim().toUpperCase() : null,
    nome: texto(corpo.nome),
    nomePreferido: texto(corpo.nomePreferido),
    starSlug: texto(corpo.starSlug),
    carta: paragrafosDaCarta(String(corpo.carta ?? '')),
    mensagem: texto(corpo.mensagem),
    assinatura: texto(corpo.assinatura),
    data: typeof corpo.data === 'string' && corpo.data ? corpo.data : null,
    etapa: (ETAPAS as readonly string[]).includes(String(corpo.etapa)) ? (corpo.etapa as Homenagem['etapa']) : 'rascunho',
    publicar: corpo.publicar === true,
    notas: {
      qualidades: texto(notasEntrada.qualidades),
      profissional: texto(notasEntrada.profissional),
      lembranca: texto(notasEntrada.lembranca),
      tom: (TONS as readonly string[]).includes(String(notasEntrada.tom)) ? String(notasEntrada.tom) : 'elegante',
    },
    consentimento: {
      redes: consentimentoEntrada.redes === true,
      repostagem: consentimentoEntrada.repostagem === true,
      imagem: consentimentoEntrada.imagem === true,
    },
  }

  const falha = (campo: string, motivo: string) => {
    throw new ErroApp('homenagem_invalida', `${campo}: ${motivo}`, 422)
  }
  if (h.code && !RE_CODIGO.test(h.code)) falha('Endereço', 'formato SG-XXXX-XXXX')
  if (!h.nome) falha('Nome', 'informe o nome completo')
  const erroNome = validarTextoLivre(h.nome, { min: 2, max: LIMITES_PAGINA.nome })
  if (erroNome) falha('Nome', erroNome)
  if (h.nomePreferido) {
    const erro = validarTextoLivre(h.nomePreferido, { max: 40 })
    if (erro) falha('Nome preferido', erro)
  }
  if (!RE_SLUG_ESTRELA.test(h.starSlug)) falha('Estrela', 'escolha uma estrela do catálogo')
  if (h.data && !RE_DATA.test(h.data)) falha('Data', 'formato AAAA-MM-DD')

  // Carta, mensagem do certificado e assinatura: as regras dos textos da compra.
  const cartaTexto = h.carta.join('\n')
  const erros = validarPedido({
    honoreeName: h.nome,
    fromName: h.assinatura,
    message: h.mensagem,
    letter: cartaTexto,
    customerName: 'Painel',
    customerEmail: 'painel@stellara.invalid',
  }).erros
  const nomes: Record<string, string> = { letter: 'Carta', message: 'Mensagem do certificado', fromName: 'Assinatura', honoreeName: 'Nome' }
  if (erros.length) falha(nomes[erros[0].campo] ?? erros[0].campo, erros[0].motivo)
  if (h.carta.length > MAX_PARAGRAFOS_CARTA) falha('Carta', `até ${MAX_PARAGRAFOS_CARTA} parágrafos`)

  for (const [campo, valor] of [
    ['Qualidades', h.notas.qualidades],
    ['Qualidades profissionais', h.notas.profissional],
    ['Lembrança', h.notas.lembranca],
  ]) {
    if (!valor) continue
    const erro = validarTextoLivre(valor, { max: 600 })
    if (erro) falha(campo, erro)
  }
  // Finalizada sem carta não faz sentido: a carta é metade do presente.
  if (h.etapa === 'finalizada' && !h.carta.length) falha('Carta', 'escreva a carta antes de finalizar')
  return h
}

/** A campanha pelo slug (ou 404). */
async function campanhaPorSlug(db: Db, slug: unknown) {
  const { data, error } = await db
    .from('campanhas')
    .select('id, slug, nome, parceiro, logo_url, logo_proporcao, logo_autorizada, assinatura, frase_final, ativa')
    .eq('slug', String(slug ?? ''))
    .maybeSingle()
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível abrir a campanha.', 500, error.message)
  if (!data) throw new ErroApp('campanha_inexistente', 'Campanha não encontrada.', 404)
  return data
}

/** A campanha e as homenagens dela, com as anotações (só o painel vê). */
export async function listarCampanha(db: Db, corpo: Record<string, unknown>) {
  const campanha = await campanhaPorSlug(db, corpo.campanha)
  const { data, error } = await db
    .from('pages')
    .select(
      'code, status, honoree_name, star_slug, from_name, dedication_date, carta, mensagem_pessoal, ' +
        'campanha_etapa, campanha_notas, campanha_consentimento, updated_at, stars(name, bayer, constellation, magnitude)',
    )
    .eq('campanha_id', campanha.id)
    .order('honoree_name', { ascending: true })
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar as homenagens.', 500, error.message)
  return {
    campanha: {
      slug: campanha.slug,
      nome: campanha.nome,
      parceiro: campanha.parceiro,
      logo: campanha.logo_autorizada && campanha.logo_url ? { src: campanha.logo_url, proporcao: Number(campanha.logo_proporcao) } : null,
      assinatura: campanha.assinatura ?? '',
      fraseFinal: campanha.frase_final ?? '',
    },
    homenagens: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((l) => {
      const notas = (l.campanha_notas ?? {}) as Record<string, unknown>
      return {
        code: l.code,
        publicada: l.status === 'published',
        etapa: l.campanha_etapa ?? 'rascunho',
        nome: l.honoree_name,
        nomePreferido: String(notas.nomePreferido ?? ''),
        starSlug: l.star_slug,
        estrela: l.stars,
        assinatura: l.from_name ?? '',
        data: l.dedication_date,
        carta: Array.isArray(l.carta) ? (l.carta as string[]).join('\n') : '',
        mensagem: l.mensagem_pessoal ?? '',
        notas: {
          qualidades: String(notas.qualidades ?? ''),
          profissional: String(notas.profissional ?? ''),
          lembranca: String(notas.lembranca ?? ''),
          tom: String(notas.tom ?? 'elegante'),
        },
        consentimento: l.campanha_consentimento ?? {},
        atualizadaEm: l.updated_at,
      }
    }),
  }
}

/**
 * Cria ou atualiza uma homenagem. Nova: gera o endereço, separa a estrela
 * (sai da vitrine) e nasce em rascunho — publicar é sempre um ato explícito.
 * Edição: troca de estrela devolve a antiga ao catálogo.
 */
export async function salvarHomenagem(db: Db, corpo: Record<string, unknown>, gerarCodigo: () => string) {
  const campanha = await campanhaPorSlug(db, corpo.campanha)
  if (!campanha.ativa) throw new ErroApp('campanha_inativa', 'Esta campanha está desativada.', 409)
  const h = normalizarHomenagem(corpo)
  const chave = chaveDaPessoa(h.nome)

  const { data: estrela } = await db.from('stars').select('*').eq('slug', h.starSlug).maybeSingle()
  if (!estrela) throw new ErroApp('estrela_ausente', 'Estrela: escolha uma estrela do catálogo.', 422)

  // A estrela não pode ser de outra página (homenagem ou compra).
  const { data: outras } = await db.from('pages').select('code').eq('star_slug', h.starSlug).neq('code', h.code ?? '')
  if (outras?.length) throw new ErroApp('estrela_em_uso', 'Estrela: já está em outra página. Escolha outra.', 409)

  const atual = h.code
    ? (await db.from('pages').select('id, code, star_slug, campanha_id, campanha_notas').eq('code', h.code).maybeSingle()).data
    : null
  if (h.code && (!atual || atual.campanha_id !== campanha.id)) {
    throw new ErroApp('nao_encontrada', 'Homenagem não encontrada nesta campanha.', 404)
  }

  if (!atual || atual.star_slug !== h.starSlug) {
    const { data: separou, error } = await db.rpc('dedicar_estrela_manual', { p_slug: h.starSlug })
    if (error) throw new ErroApp('estrela_falhou', 'Não foi possível separar a estrela.', 500, error.message)
    if (!separou) throw new ErroApp('estrela_vendida', 'Estrela: já tem dono. Escolha outra.', 409)
  }

  const assinatura = h.assinatura || campanha.assinatura || ''
  const notas = { ...h.notas, nomePreferido: h.nomePreferido }
  const colunasDaCampanha = {
    honoree_name: h.nome,
    star_slug: h.starSlug,
    from_name: assinatura || null,
    dedication_date: h.data,
    carta: h.carta,
    titulo_carta: 'Uma carta para você',
    mensagem_pessoal: h.mensagem,
    mostrar_mensagem: h.mensagem.length > 0,
    status: h.publicar ? 'published' : 'draft',
    campanha_id: campanha.id,
    campanha_etapa: h.etapa,
    campanha_chave: chave,
    campanha_notas: notas,
    campanha_consentimento: { ...h.consentimento, registradoEm: new Date().toISOString().slice(0, 10) },
  }

  if (atual) {
    const estrelaAntiga = String(atual.star_slug)
    const { error } = await db.from('pages').update(colunasDaCampanha).eq('id', atual.id)
    if (error) throw erroDeGravacao(error)
    if (estrelaAntiga !== h.starSlug) await db.rpc('liberar_estrela_manual', { p_slug: estrelaAntiga })
    return { code: atual.code }
  }

  // Nova: o conteúdo de partida da página (títulos, descrição da estrela) é
  // o mesmo das páginas da loja; a carta e a mensagem são as da homenagem.
  const codigo = gerarCodigo()
  const base = conteudoDoPedido(
    { honoree_name: h.nome, code: codigo, from_name: assinatura, dedication_date: h.data, message: h.mensagem },
    estrela as unknown as Record<string, unknown>,
  )
  const { error } = await db.from('pages').insert({
    code: codigo,
    ...colunasDoConteudo({ ...base, tituloHero: 'uma estrela que agora também é sua', fraseHero: 'Este pedaço do universo foi escolhido para você.' }),
    ...colunasDaCampanha,
  })
  if (error) {
    // A estrela foi separada para esta homenagem: volta se o cadastro falhou.
    await db.rpc('liberar_estrela_manual', { p_slug: h.starSlug })
    throw erroDeGravacao(error)
  }
  return { code: codigo }
}

function erroDeGravacao(error: { code?: string; message: string }) {
  if (error.code === '23505') {
    return new ErroApp('pessoa_repetida', 'Nome: já existe uma homenagem para esta pessoa nesta campanha.', 409, error.message)
  }
  return new ErroApp('grava_falhou', 'Não foi possível salvar a homenagem.', 500, error.message)
}

/** Assinatura padrão e frase final da campanha. */
export async function configurarCampanha(db: Db, corpo: Record<string, unknown>) {
  const campanha = await campanhaPorSlug(db, corpo.campanha)
  const assinatura = limpar(String(corpo.assinatura ?? ''))
  const frase = limpar(String(corpo.fraseFinal ?? ''))
  for (const [campo, valor, max] of [['Assinatura', assinatura, 120], ['Frase final', frase, 200]] as const) {
    if (!valor) continue
    const erro = validarTextoLivre(valor, { max })
    if (erro) throw new ErroApp('config_invalida', `${campo}: ${erro}`, 422)
  }
  const { error } = await db
    .from('campanhas')
    .update({ assinatura: assinatura || null, frase_final: frase || null })
    .eq('id', campanha.id)
  if (error) throw new ErroApp('grava_falhou', 'Não foi possível salvar.', 500, error.message)
  return { ok: true }
}
