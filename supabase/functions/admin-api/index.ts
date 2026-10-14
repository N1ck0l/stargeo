/**
 * Painel administrativo — uma função, muitas ações.
 *
 * Todas as rotas do `/admin` passam por aqui: visão geral, pedidos, páginas,
 * criação manual e reenvio de e-mail. Duas travas, nesta ordem:
 *
 * 1. O token do `Authorization` precisa ser um JWT válido do Supabase Auth
 *    (`db.auth.getUser` valida a assinatura contra o GoTrue — não confiamos no
 *    payload decodificado daqui).
 * 2. O `sub` precisa ter linha em `admins`. Conta criada não basta: é a lista
 *    branca que decide, e uma conta sem linha recebe 403.
 *
 * Chamar com `{action: …}` — lista branca por `switch`, sem roteamento dinâmico
 * que aceite caminho arbitrário. Reenvio de e-mail e escrita em `orders`
 * acontecem aqui dentro com a service_role; a chave nunca chega ao navegador.
 *
 * Endereço: `https://<ref>.supabase.co/functions/v1/admin-api`, chamado por
 * `loja/src/lib/admin.js`. Publicada com `--no-verify-jwt` (ver `LOJA.md`) —
 * o gateway não valida nada, então é ESTE código que autentica cada ação.
 *
 * Efeitos colaterais: grava em `pages` (criar, atualizar, publicar) e dispara
 * o `resend-certificate`, que manda e-mail de verdade.
 *
 * Invariante: a service_role enxerga o schema inteiro, então o que protege o
 * dado é a lista branca de ações — nenhuma aceita tabela, coluna ou SQL vindo
 * do corpo. O que o painel recebe é sempre o retorno de uma função escrita
 * aqui, nunca uma consulta montada em tempo de execução.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin, variavel } from '../_shared/supabase.ts'
import { lerToken } from '../_shared/token.ts'
import {
  colunasDoConteudo,
  conteudoDaLinha,
  conteudoDoPedido,
  criarPaginaDoPedido,
  estrelaParaPagina,
  LIMITES_PAGINA,
  validarConteudo,
  type ConteudoPagina,
  type LinhaPagina,
} from '../_shared/pagina.ts'
import { limpar, validarTextoLivre } from '../../../shared/moderation.js'

const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Mesmo alfabeto do `gen_order_code()` (`0001_loja.sql`): 31 letras sem
 * I/L/O, para o código ser ditável por telefone.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CAMPOS_PEDIDO = [
  'id', 'code', 'status', 'product_name', 'star_slug', 'honoree_name',
  'customer_email', 'customer_name', 'amount_cents', 'dedication_date',
  'created_at', 'delivered_at', 'email_error',
].join(',')

Deno.serve(
  comHandler(async (request) => {
    const corpo = await lerJson(request)
    const acao = String(corpo.action ?? '').trim()

    if (!acao) {
      throw new ErroApp('acao_ausente', 'Informe a ação.', 422)
    }

    const db = admin()
    const operador = await verificarAdmin(db, request)

    // Lista branca de ações: cada `case` chama uma função própria. O que não
    // está aqui vira 422 — não existe "ação genérica" que aceite SQL, coluna
    // ou caminho arbitrário do corpo.
    switch (acao) {
      case 'overview':
        return json(request, await visaoGeral(db))

      case 'pedidos':
        return json(request, await listarPedidos(db, corpo))

      case 'reenviarEmail':
        return json(request, await reenviarEmail(corpo))

      case 'estrelas':
        return json(request, await listarEstrelas(db, corpo))

      case 'paginas':
        return json(request, await listarPaginas(db, corpo))

      case 'paginaAbrir':
        return json(request, await abrirPagina(db, corpo))

      case 'paginaCriar':
        return json(request, await criarPagina(db, corpo, operador))

      case 'paginaAtualizar':
        return json(request, await atualizarPagina(db, corpo, operador))

      default:
        throw new ErroApp('acao_desconhecida', 'Ação não reconhecida.', 422)
    }
  }, 'admin-api'),
)

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

interface Operador {
  userId: string
  email: string
}

/**
 * Quem está chamando — e se ele pode.
 *
 * Duas travas nesta ordem: sessão válida do Supabase Auth, depois linha em
 * `admins`. A ordem importa: um id que não existe no Auth nunca chega a
 * revelar se ele consta (ou não) na lista branca.
 *
 * @returns o id da conta e o e-mail gravado em `admins`. As ações de página
 *          recebem este objeto como contexto; hoje não o usam (`_operador`) —
 *          é o encaixe natural para registrar quem alterou o quê.
 */
async function verificarAdmin(db: ReturnType<typeof admin>, request: Request): Promise<Operador> {
  const token = lerToken(request)
  if (!token) {
    throw new ErroApp('nao_autenticado', 'Entre no painel para continuar.', 401)
  }

  // Valida a assinatura no servidor de autenticação: o payload decodificado
  // por conta própria seria só um JSON com forma de JWT.
  const { data: sessao, error } = await db.auth.getUser(token)
  if (error || !sessao?.user) {
    throw new ErroApp('sessao_expirada', 'Sua sessão terminou. Entre de novo.', 401)
  }

  const { data: linha, error: erroAdmin } = await db
    .from('admins')
    .select('email')
    .eq('user_id', sessao.user.id)
    .maybeSingle()

  if (erroAdmin) {
    throw new ErroApp('consulta_falhou', 'Não foi possível verificar o acesso.', 500, erroAdmin.message)
  }
  if (!linha) {
    // Conta existe, mas não está na lista branca.
    throw new ErroApp('sem_permissao', 'Sua conta não tem acesso ao painel.', 403)
  }

  return { userId: sessao.user.id, email: String(linha.email) }
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

/**
 * Aba "visão geral": agregados que o painel desenha em cima.
 *
 * Os números vêm do banco (`resumo_pedidos()`, migration 0009, e `count` das
 * páginas), e não de somar linhas aqui: antes o total e a receita eram
 * calculados sobre as 500 linhas mais recentes, e passavam a mentir a partir
 * do pedido 501. As listas "recentes" continuam curtas — são só as 8 últimas.
 */
async function visaoGeral(db: ReturnType<typeof admin>) {
  const contarPaginas = (status?: string) => {
    const q = db.from('pages').select('id', { count: 'exact', head: true })
    return status ? q.eq('status', status) : q
  }

  const [resumo, recentes, paginas, publicadas, rascunhos, paginasRecentes] = await Promise.all([
    db.rpc('resumo_pedidos'),
    db
      .from('orders')
      .select('code, status, amount_cents, product_name, honoree_name, created_at, email_error')
      .order('created_at', { ascending: false })
      .limit(8),
    contarPaginas(),
    contarPaginas('published'),
    contarPaginas('draft'),
    db
      .from('pages')
      .select('code, status, honoree_name, star_slug, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  for (const r of [resumo, recentes, paginas, publicadas, rascunhos, paginasRecentes]) {
    if (r.error) throw new ErroApp('consulta_falhou', 'Falha ao montar o painel.', 500, r.error.message)
  }

  const numeros = (resumo.data ?? {}) as {
    total?: number
    porStatus?: Record<string, number>
    receitaCentavos?: number
    comErroDeEmail?: number
    naSemana?: number
  }

  return {
    pedidos: {
      total: numeros.total ?? 0,
      porStatus: numeros.porStatus ?? {},
      receitaCentavos: numeros.receitaCentavos ?? 0,
      comErroDeEmail: numeros.comErroDeEmail ?? 0,
      naSemana: numeros.naSemana ?? 0,
      recentes: recentes.data ?? [],
    },
    paginas: {
      total: paginas.count ?? 0,
      publicadas: publicadas.count ?? 0,
      rascunhos: rascunhos.count ?? 0,
      recentes: paginasRecentes.data ?? [],
    },
  }
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

/**
 * Pedidos paginados, com filtro opcional por status e busca livre.
 *
 * `limit` é preso entre 1 e 200 e `offset` não desce de zero: os dois vêm do
 * corpo da requisição, e número do cliente nunca manda no banco.
 */
async function listarPedidos(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const status = typeof corpo.status === 'string' && corpo.status ? corpo.status : null
  const busca = typeof corpo.q === 'string' ? limpar(corpo.q).slice(0, 80) : ''
  const limite = Math.min(Math.max(Number(corpo.limit ?? 50) || 50, 1), 200)
  const salto = Math.max(Number(corpo.offset ?? 0) || 0, 0)

  let query = db.from('orders').select(CAMPOS_PEDIDO, { count: 'exact' })

  if (status) query = query.eq('status', status)

  if (busca) {
    // PostgREST `.or()`: vírgula e parêntese separam termos — saem da busca.
    const termo = busca.replace(/[,%()]/g, ' ').trim()
    if (termo) {
      const like = `%${termo}%`
      query = query.or(`code.ilike.${like},honoree_name.ilike.${like},customer_email.ilike.${like}`)
    }
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(salto, salto + limite - 1)

  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar os pedidos.', 500, error.message)

  return {
    pedidos: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((linha) => ({
      id: linha.id,
      code: linha.code,
      status: linha.status,
      produto: linha.product_name,
      paraQuem: linha.honoree_name,
      comprador: linha.customer_name,
      email: linha.customer_email,
      valorCentavos: linha.amount_cents,
      data: linha.dedication_date,
      criadoEm: linha.created_at,
      entregueEm: linha.delivered_at,
      pendencia: linha.email_error,
    })),
    total: count ?? 0,
  }
}

/**
 * Repasse para `resend-certificate`, que valida e envia com a service_role.
 *
 * Não envia e-mail daqui: a checagem (pedido pago, PDF existente, não
 * entregue) mora na função chamada, para valer igual quando o reenvio vier
 * de outro caminho. A chamada leva a service_role no header — é por isso que
 * ela acontece servidor a servidor, nunca do navegador.
 */
async function reenviarEmail(corpo: Record<string, unknown>) {
  const orderId = String(corpo.orderId ?? '')
  if (!orderId) throw new ErroApp('pedido_ausente', 'Informe o pedido.', 422)

  const base = variavel('SUPABASE_URL')
  const segredo = variavel('SUPABASE_SERVICE_ROLE_KEY')

  const resposta = await fetch(`${base}/functions/v1/resend-certificate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${segredo}`,
      apikey: segredo,
    },
    body: JSON.stringify({ orderId }),
  })

  const corpoResposta = (await resposta.json().catch(() => null)) as
    | { mensagem?: string }
    | null

  if (!resposta.ok) {
    throw new ErroApp(
      'reenvio_recusado',
      corpoResposta?.mensagem ?? 'Não foi possível reenviar o e-mail.',
      resposta.status,
    )
  }

  return corpoResposta ?? { reenviado: true }
}

// ---------------------------------------------------------------------------
// Estrelas (seletor do editor)
// ---------------------------------------------------------------------------

/**
 * Estrelas para o seletor do editor de página.
 *
 * O catálogo tem ~118 mil estrelas — uma lista com todas travaria o painel.
 * Vão as que têm nome próprio (faixas `lendaria` e `nomeada`, ~600) mais a
 * estrela atual da página, se for outra (`corpo.incluir`). Sem filtro de
 * `active` nem de status: o painel cria páginas manuais e precisa ver tudo.
 */
async function listarEstrelas(db: ReturnType<typeof admin>, corpo: Record<string, unknown> = {}) {
  const campos = 'slug, name, bayer, constellation, magnitude, distance_ly'
  const { data, error } = await db
    .from('stars')
    .select(campos)
    .or('curada.eq.true,faixa.in.(lendaria,nomeada)')
    .order('name')
    .limit(1000)

  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar as estrelas.', 500, error.message)

  const lista = (data ?? []) as Array<Record<string, unknown>>
  const incluir = typeof corpo.incluir === 'string' ? corpo.incluir : ''
  if (incluir && !lista.some((e) => e.slug === incluir)) {
    const { data: atual } = await db.from('stars').select(campos).eq('slug', incluir).maybeSingle()
    if (atual) lista.unshift(atual as Record<string, unknown>)
  }
  return { estrelas: lista }
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

/**
 * Páginas para a aba "páginas" — inclui `draft`, que é justamente o que o
 * `get-page` responde como 404 para o público.
 *
 * Teto de 200 linhas, como em `listarPedidos`: o painel pagina no cliente e
 * não precisa do histórico inteiro de uma vez.
 */
async function listarPaginas(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const status = typeof corpo.status === 'string' && corpo.status ? corpo.status : null
  const busca = typeof corpo.q === 'string' ? limpar(corpo.q).slice(0, 80) : ''

  let query = db
    .from('pages')
    .select('code, status, honoree_name, star_slug, customer_email, order_id, created_at, updated_at', {
      count: 'exact',
    })

  if (status) query = query.eq('status', status)

  if (busca) {
    const termo = busca.replace(/[,%()]/g, ' ').trim()
    if (termo) {
      const like = `%${termo}%`
      query = query.or(`code.ilike.${like},honoree_name.ilike.${like},customer_email.ilike.${like}`)
    }
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar as páginas.', 500, error.message)

  return { paginas: data ?? [], total: count ?? 0 }
}

/**
 * Abre uma página para o editor do painel: linha crua + `conteudo` já no
 * formato que os componentes do site leem.
 *
 * Rascunho abre normalmente — aqui quem olha é o admin, e o `status` vem
 * junto para o front mostrar "publicada" ou "rascunho".
 *
 * É a mesma forma que `criarPagina` e `atualizarPagina` devolvem ao terminar,
 * para o editor não ter dois formatos de "página aberta".
 */
async function abrirPagina(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const codigo = String(corpo.code ?? '').trim().toUpperCase()
  if (!RE_CODIGO.test(codigo)) {
    throw new ErroApp('codigo_invalido', 'Endereço de página inválido.', 422)
  }

  const { data, error } = await db.from('pages').select('*').eq('code', codigo).maybeSingle()
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível abrir a página.', 500, error.message)
  if (!data) throw new ErroApp('nao_encontrada', 'Página não encontrada.', 404)

  const linha = data as unknown as LinhaPagina
  const { data: estrela } = await db.from('stars').select('*').eq('slug', linha.star_slug).maybeSingle()

  return {
    pagina: { ...linha, conteudo: conteudoDaLinha(linha) },
    estrela: estrela ? estrelaParaPagina(estrela as Record<string, unknown>) : null,
  }
}

/**
 * Cria uma página.
 *
 * Dois caminhos: `orderId` (nasce de um pedido já existente — o caso do teste
 * atual, em que a compra foi feita antes do webhook criar páginas) e manual
 * (campos livres, para a página da Geovanna e qualquer encomenda fora da
 * loja). A manual nasce em `draft`: publicar é um ato consciente.
 */
async function criarPagina(
  db: ReturnType<typeof admin>,
  corpo: Record<string, unknown>,
  _operador: Operador,
) {
  // --- origem: pedido -----------------------------------------------------
  if (corpo.orderId) {
    const { data: pedido, error } = await db
      .from('orders')
      .select('*')
      .eq('id', String(corpo.orderId))
      .maybeSingle()

    if (error || !pedido) throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
    if (pedido.status !== 'approved') {
      throw new ErroApp('pedido_nao_pago', 'Só dá para criar página de pedido pago.', 409)
    }

    const { data: estrela } = await db.from('stars').select('*').eq('slug', pedido.star_slug).maybeSingle()
    if (!estrela) throw new ErroApp('estrela_ausente', 'Estrela do pedido não está no catálogo.', 409)

    const id = await criarPaginaDoPedido(db, pedido as unknown as Record<string, unknown>, estrela as Record<string, unknown>)
    if (!id) throw new ErroApp('pagina_falhou', 'Não foi possível criar a página.', 500)

    return await abrirPagina(db, { code: pedido.code })
  }

  // --- origem: manual -----------------------------------------------------
  // Nada de pedido por trás: o admin escolhe nome, estrela, código e data.
  const nome = limpar(String(corpo.honoree_name ?? ''))
  const slug = limpar(String(corpo.star_slug ?? ''))
  const codigo = corpo.code ? String(corpo.code).trim().toUpperCase() : gerarCodigo()
  const data = typeof corpo.dedication_date === 'string' && corpo.dedication_date ? corpo.dedication_date : null

  if (!nome) throw new ErroApp('nome_ausente', 'Informe para quem é a página.', 422)
  const erroNome = validarTextoLivre(nome, { max: LIMITES_PAGINA.nome })
  if (erroNome) throw new ErroApp('nome_invalido', erroNome, 422)
  if (!RE_CODIGO.test(codigo)) {
    throw new ErroApp('codigo_invalido', 'Código no formato SG-XXXX-XXXX.', 422)
  }
  if (data && !RE_DATA.test(data)) {
    throw new ErroApp('data_invalida', 'Data no formato AAAA-MM-DD.', 422)
  }

  const { data: estrela } = await db.from('stars').select('*').eq('slug', slug).maybeSingle()
  if (!estrela) throw new ErroApp('estrela_ausente', 'Escolha uma estrela do catálogo.', 422)

  // Ponto de partida: o mesmo template neutro dos pedidos, com a mensagem
  // vazia — depois o admin escreve a carta que quiser.
  const base = conteudoDoPedido(
    {
      honoree_name: nome,
      code: codigo,
      from_name: corpo.from_name ?? '',
      dedication_date: data,
      message: '',
    },
    estrela as unknown as Record<string, unknown>,
  )

  const conteudo = mesclarConteudo(base, corpo.conteudo)
  validarOuErro(conteudo)

  // Registro impresso no certificado (0005). Sem um no pedido, o próprio
  // código é o registro — nulo aqui, `conteudoDaLinha` resolve para o code.
  const registro = corpo.certificate_id ? limpar(String(corpo.certificate_id)) : null
  if (registro) {
    const erroRegistro = validarTextoLivre(registro, { max: 60 })
    if (erroRegistro) throw new ErroApp('registro_invalido', erroRegistro, 422)
  }

  const { data: criada, error: erroInsert } = await db
    .from('pages')
    .insert({
      code: codigo,
      certificate_id: registro,
      status: corpo.status === 'published' ? 'published' : 'draft',
      star_slug: slug,
      honoree_name: nome,
      dedication_date: data,
      customer_email: typeof corpo.customer_email === 'string' && corpo.customer_email
        ? corpo.customer_email.trim().toLowerCase()
        : null,
      ...colunasDoConteudo(conteudo),
    })
    .select('code')
    .single()

  if (erroInsert) {
    // O único conflito possível que interessa é o código.
    throw new ErroApp(
      erroInsert.code === '23505' ? 'codigo_em_uso' : 'pagina_falhou',
      erroInsert.code === '23505' ? 'Já existe uma página com esse código.' : 'Não foi possível criar a página.',
      erroInsert.code === '23505' ? 409 : 500,
      erroInsert.message,
    )
  }

  return await abrirPagina(db, { code: criada.code })
}

/**
 * Atualização parcial: só o que veio no corpo entra na conta.
 *
 * Cada campo presente passa pela mesma régua da criação (formato do código,
 * data ISO, estrela que existe no catálogo, limite de texto) e `conteudo` é
 * mesclado sobre o que já está no banco ANTES de validar — um patch do front
 * não apaga campo que ele não conhece.
 *
 * Nada veio? 422 em vez de um `update` vazio: gravar sem mudar nada só
 * poluiria o `updated_at`.
 */
async function atualizarPagina(
  db: ReturnType<typeof admin>,
  corpo: Record<string, unknown>,
  _operador: Operador,
) {
  const codigo = String(corpo.code ?? '').trim().toUpperCase()
  if (!RE_CODIGO.test(codigo)) {
    throw new ErroApp('codigo_invalido', 'Endereço de página inválido.', 422)
  }

  const { data: atual, error } = await db.from('pages').select('*').eq('code', codigo).maybeSingle()
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível abrir a página.', 500, error.message)
  if (!atual) throw new ErroApp('nao_encontrada', 'Página não encontrada.', 404)

  const colunas: Record<string, unknown> = {}

  if (corpo.status !== undefined) {
    const status = String(corpo.status)
    if (status !== 'published' && status !== 'draft') {
      throw new ErroApp('status_invalido', 'Status deve ser published ou draft.', 422)
    }
    colunas.status = status
  }

  if (corpo.honoree_name !== undefined) {
    const nome = limpar(String(corpo.honoree_name))
    const erro = validarTextoLivre(nome, { max: LIMITES_PAGINA.nome })
    if (erro || !nome) throw new ErroApp('nome_invalido', erro ?? 'Informe para quem é a página.', 422)
    colunas.honoree_name = nome
  }

  if (corpo.star_slug !== undefined) {
    const slug = limpar(String(corpo.star_slug))
    const { data: estrela } = await db.from('stars').select('slug').eq('slug', slug).maybeSingle()
    if (!estrela) throw new ErroApp('estrela_ausente', 'Escolha uma estrela do catálogo.', 422)
    colunas.star_slug = slug
  }

  if (corpo.dedication_date !== undefined) {
    const data = corpo.dedication_date ? String(corpo.dedication_date) : null
    if (data && !RE_DATA.test(data)) {
      throw new ErroApp('data_invalida', 'Data no formato AAAA-MM-DD.', 422)
    }
    colunas.dedication_date = data
  }

  if (corpo.customer_email !== undefined) {
    colunas.customer_email = corpo.customer_email
      ? String(corpo.customer_email).trim().toLowerCase()
      : null
  }

  if (corpo.certificate_id !== undefined) {
    const registro = corpo.certificate_id ? limpar(String(corpo.certificate_id)) : null
    if (registro) {
      const erroRegistro = validarTextoLivre(registro, { max: 60 })
      if (erroRegistro) throw new ErroApp('registro_invalido', erroRegistro, 422)
    }
    colunas.certificate_id = registro
  }

  if (corpo.conteudo !== undefined) {
    const atualConteudo = conteudoDaLinha(atual as unknown as LinhaPagina)
    const conteudo = mesclarConteudo(atualConteudo, corpo.conteudo)
    validarOuErro(conteudo)
    // `from_name` também nasce do conteúdo, para o admin editar tudo num só
    // lugar (o cliente só alcança os campos de `CAMPOS_DO_CLIENTE`).
    Object.assign(colunas, colunasDoConteudo(conteudo))
  }

  if (!Object.keys(colunas).length) {
    throw new ErroApp('nada_alterado', 'Nada para salvar.', 422)
  }

  const { error: erroUpdate } = await db.from('pages').update(colunas).eq('code', codigo)
  if (erroUpdate) throw new ErroApp('grava_falhou', 'Não foi possível salvar.', 500, erroUpdate.message)

  return await abrirPagina(db, { code: codigo })
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Valida um conteúdo completo ou derruba com a lista de motivos. */
function validarOuErro(conteudo: Partial<ConteudoPagina>) {
  const erros = validarConteudo(conteudo)
  if (erros.length) {
    throw new ErroApp(
      'conteudo_invalido',
      erros.map((e) => `${e.campo}: ${e.motivo}`).join(' · '),
      422,
      JSON.stringify(erros),
    )
  }
}

/** Sobrepõe um patch parcial num conteúdo base (criação e atualização). */
function mesclarConteudo(base: ConteudoPagina, patch: unknown): ConteudoPagina {
  if (!patch || typeof patch !== 'object') return base
  const p = patch as Record<string, unknown>
  const conteudo: ConteudoPagina = { ...base }

  for (const campo of [
    'nome', 'assinatura', 'data', 'tituloHero', 'fraseHero', 'tituloEstrela',
    'descricaoEstrela', 'tituloCarta', 'mensagemPessoal',
  ] as const) {
    if (typeof p[campo] === 'string') Object.assign(conteudo, { [campo]: p[campo] })
  }

  if (typeof p.carta === 'string') {
    conteudo.carta = p.carta.split(/\n{2,}/).map((linha) => linha.trim()).filter(Boolean)
  } else if (Array.isArray(p.carta)) {
    conteudo.carta = p.carta.map((linha) => String(linha).trim()).filter(Boolean)
  }

  if (p.mostrarMensagem !== undefined) conteudo.mostrarMensagem = Boolean(p.mostrarMensagem)
  if (p.mostrarMira !== undefined) conteudo.mostrarMira = Boolean(p.mostrarMira)

  return conteudo
}

/**
 * Código `SG-XXXX-XXXX` com o mesmo alfabeto do `gen_order_code()` de
 * `0001_loja.sql` — as duas pontas precisam se entender, porque o código é o
 * endereço da página e o que o cliente digita no rastreio.
 *
 * Não há re-sorteio em colisão: se o código já existe, o `unique` de
 * `pages.code` barra com 23505 e `criarPagina` traduz para 409
 * (`codigo_em_uso`). Sortear de novo aqui não mudaria o desfecho.
 */
function gerarCodigo(): string {
  const bloco = () =>
    Array.from({ length: 4 }, () => ALFABETO[crypto.getRandomValues(new Uint8Array(1))[0] % ALFABETO.length]).join('')
  return `SG-${bloco()}-${bloco()}`
}
