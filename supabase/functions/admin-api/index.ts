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
import { explicarErros, limpar, validarPedido, validarTextoLivre } from '../../../shared/moderation.js'
import { enviarEmail, gerarEGuardar } from '../_shared/certificado.ts'
import { entregasTravadas, type PedidoPago } from './entregas.ts'
import { errosRecentes, listarCupons, relatorio, salvarCupom } from './negocio.ts'
import { configurarCampanha, listarCampanha, salvarHomenagem } from './campanha.ts'
import { dadosDoGrupo, linhaParaCertificado } from '../_shared/par.ts'
import { linhaDoGrupo } from '../../../shared/grupo.js'

const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Mesmo alfabeto do `gen_order_code()` (`0001_loja.sql`): 31 letras sem
 * I/L/O, para o código ser ditável por telefone.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CAMPOS_PEDIDO = [
  'id', 'code', 'status', 'product_name', 'star_slug', 'honoree_name', 'star_nickname',
  'from_name', 'message', 'letter',
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

      case 'corrigirPedido':
        return json(request, await corrigirPedido(db, corpo))

      case 'refazerEntrega':
        return json(request, await refazerEntrega(db, corpo))

      case 'cupons':
        return json(request, await listarCupons(db))

      case 'cupomSalvar':
        return json(request, await salvarCupom(db, corpo))

      case 'relatorio':
        return json(request, await relatorio(db, corpo))

      case 'erros':
        return json(request, await errosRecentes(db))

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

      case 'depoimentos':
        return json(request, await listarDepoimentos(db, corpo))

      case 'depoimentoDecidir':
        return json(request, await decidirDepoimento(db, corpo))

      // Campanhas de homenagem (0024).
      case 'campanha':
        return json(request, await listarCampanha(db, corpo))

      case 'homenagemSalvar':
        return json(request, await salvarHomenagem(db, corpo, gerarCodigo))

      case 'campanhaConfigurar':
        return json(request, await configurarCampanha(db, corpo))

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

  // Funil dos últimos 30 dias (migration 0017): só contadores, sem pessoa.
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)

  const [resumo, recentes, paginas, publicadas, rascunhos, paginasRecentes, metricas, depoimentosPendentes, compras, pagos] = await Promise.all([
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
    db.from('metricas_diarias').select('evento, total').gte('dia', desde),
    db.from('depoimentos').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
    // Compras: os pedidos pagos de verdade, não um evento do navegador.
    db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'approved').gte('created_at', desde),
    // Pagos do último mês, com a página (se houver): base das entregas travadas.
    db
      .from('orders')
      .select('id, code, honoree_name, created_at, certificate_path, pages(id)')
      .eq('status', 'approved')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  for (const r of [resumo, recentes, paginas, publicadas, rascunhos, paginasRecentes, metricas, depoimentosPendentes, compras, pagos]) {
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
    funil: { ...somarPorEvento(metricas.data ?? []), compra_aprovada: compras.count ?? 0 },
    depoimentosPendentes: depoimentosPendentes.count ?? 0,
    entregasTravadas: entregasTravadas((pagos.data ?? []) as unknown as PedidoPago[]),
  }
}


/** Soma os contadores diários por evento (as faixas entram juntas). */
function somarPorEvento(linhas: Array<{ evento: string; total: number }>): Record<string, number> {
  const soma: Record<string, number> = {}
  for (const { evento, total } of linhas) soma[evento] = (soma[evento] ?? 0) + Number(total)
  return soma
}

// ---------------------------------------------------------------------------
// Depoimentos (migration 0018)
// ---------------------------------------------------------------------------

/** Depoimentos por status (padrão: pendentes), com o código do pedido. */
async function listarDepoimentos(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const status = ['pendente', 'aprovado', 'recusado'].includes(String(corpo.status))
    ? String(corpo.status)
    : 'pendente'
  const { data, error } = await db
    .from('depoimentos')
    .select('id, nome_exibicao, cidade, texto, autoriza_publicar, status, created_at, updated_at, decidido_em, orders(code)')
    .eq('status', status)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar os depoimentos.', 500, error.message)
  return { depoimentos: data ?? [] }
}

/** Aprova ou recusa. Aprovar exige a autorização de publicação do comprador. */
async function decidirDepoimento(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const id = String(corpo.id ?? '')
  const status = String(corpo.status ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroApp('id_invalido', 'Depoimento inválido.', 422)
  if (status !== 'aprovado' && status !== 'recusado') {
    throw new ErroApp('status_invalido', 'Status deve ser aprovado ou recusado.', 422)
  }
  const { data: atual } = await db.from('depoimentos').select('autoriza_publicar').eq('id', id).maybeSingle()
  if (!atual) throw new ErroApp('nao_encontrado', 'Depoimento não encontrado.', 404)
  if (status === 'aprovado' && !atual.autoriza_publicar) {
    throw new ErroApp('sem_autorizacao', 'O comprador não autorizou a publicação.', 422)
  }
  const { error } = await db
    .from('depoimentos')
    .update({ status, decidido_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new ErroApp('grava_falhou', 'Não foi possível salvar.', 500, error.message)
  return { ok: true }
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
      // Textos impressos, para o formulário "Corrigir texto" do painel.
      textos: {
        honoree_name: linha.honoree_name ?? '',
        star_nickname: linha.star_nickname ?? '',
        from_name: linha.from_name ?? '',
        message: linha.message ?? '',
      },
      // Só a existência: o texto é pessoal e se lê (e corrige) na página.
      temCarta: Boolean(linha.letter),
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

/**
 * Corrige o texto impresso de um pedido PAGO — nome de quem recebe, nome dado
 * à estrela, assinatura, mensagem — e refaz o certificado.
 *
 * É a promessa da política ("errou o nome? fale com a gente, sem custo"):
 * antes, corrigir no painel mudava só a página, e o PDF entregue continuava
 * com o erro. Aqui o pedido é atualizado, a página acompanha, os DOIS PDFs
 * são regerados no mesmo lugar do Storage (os links antigos passam a abrir o
 * arquivo novo) e, com `reenviar`, o e-mail sai de novo.
 *
 * Mesma moderação do checkout: corrigir não é porta para texto que a compra
 * não aceitaria. Falha no e-mail não desfaz a correção — fica registrada no
 * pedido, como na entrega.
 */
async function corrigirPedido(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const orderId = String(corpo.orderId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ErroApp('pedido_ausente', 'Informe o pedido.', 422)

  const { data: pedido, error } = await db.from('orders').select('*').eq('id', orderId).maybeSingle()
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível ler o pedido.', 500, error.message)
  if (!pedido) throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
  if (pedido.status !== 'approved') {
    throw new ErroApp('pedido_nao_pago', 'Só pedido pago tem certificado para corrigir.', 409)
  }

  // Só o que veio no corpo muda; o resto fica como está.
  const texto = (campo: string, atual: unknown) =>
    corpo[campo] === undefined ? (atual == null ? '' : String(atual)) : limpar(String(corpo[campo] ?? ''))
  const novo = {
    honoree_name: texto('honoree_name', pedido.honoree_name),
    star_nickname: texto('star_nickname', pedido.star_nickname),
    from_name: texto('from_name', pedido.from_name),
    message: texto('message', pedido.message),
  }

  const checagem = validarPedido({
    honoreeName: novo.honoree_name,
    starNickname: novo.star_nickname,
    fromName: novo.from_name,
    message: novo.message,
    customerName: pedido.customer_name,
    customerEmail: pedido.customer_email,
  })
  if (!checagem.ok) throw new ErroApp('texto_nao_permitido', explicarErros(checagem.erros), 422)

  const colunas = {
    honoree_name: novo.honoree_name,
    star_nickname: novo.star_nickname || null,
    from_name: novo.from_name || null,
    message: novo.message || null,
  }
  await db.from('orders').update(colunas).eq('id', orderId).throwOnError()

  // A página do presente acompanha o que é dado da compra. A carta e a
  // mensagem pessoal da página são da pessoa (edição) — não são tocadas.
  await db
    .from('pages')
    .update({ honoree_name: colunas.honoree_name, star_nickname: colunas.star_nickname, from_name: colunas.from_name })
    .eq('order_id', orderId)
    .throwOnError()

  const { data: estrela } = await db.from('stars').select('*').eq('slug', pedido.star_slug).maybeSingle()
  if (!estrela) throw new ErroApp('estrela_inexistente', 'A estrela do pedido não está no catálogo.', 409)

  const grupo = await dadosDoGrupo(db, orderId, pedido.group_id)
  const corrigido = { ...pedido, ...colunas, ...linhaParaCertificado(grupo) }
  const caminho = await refazerPdfs(db, corrigido, estrela as Record<string, unknown>)

  // Par: a folha do OUTRO pedido diz "dedicada a <este nome>" — se o nome
  // mudou, ela é refeita também (sem e-mail). Em grupos de 3+ a linha não
  // cita nomes, e nada mais muda.
  const par = grupo?.total === 2 ? grupo.outros[0] : null
  if (par && colunas.honoree_name !== pedido.honoree_name) {
    const { data: outro } = await db.from('orders').select('*').eq('id', par.orderId).maybeSingle()
    const { data: estrelaOutro } = await db.from('stars').select('*').eq('slug', par.starSlug).maybeSingle()
    if (outro?.status === 'approved' && estrelaOutro) {
      const linha = linhaDoGrupo({ total: 2, outros: [{ estrela: String(estrela.name), nome: colunas.honoree_name }] })
      await refazerPdfs(db, { ...outro, grupo_linha: linha }, estrelaOutro as Record<string, unknown>)
    }
  }

  if (corpo.reenviar !== true) return { corrigido: true, reenviado: false }
  return { corrigido: true, ...(await tentarEmail(db, corrigido, estrela as Record<string, unknown>, caminho)) }
}

/** Gera as duas versões do PDF no lugar de sempre e grava o caminho no pedido. */
async function refazerPdfs(db: ReturnType<typeof admin>, pedido: Record<string, unknown>, estrela: Record<string, unknown>) {
  let caminho = ''
  for (const luz of [false, true]) {
    caminho = (await gerarEGuardar(db, pedido, estrela, luz)).caminho
  }
  await db.from('orders').update({ certificate_path: caminho, certificate_url: caminho }).eq('id', String(pedido.id)).throwOnError()
  return caminho
}

/** E-mail que não derruba nada: falha fica registrada no pedido, como na entrega. */
async function tentarEmail(db: ReturnType<typeof admin>, pedido: Record<string, unknown>, estrela: Record<string, unknown>, caminho: string) {
  try {
    await enviarEmail(db, pedido, estrela, caminho)
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'Falha desconhecida'
    await db.from('orders').update({ email_error: motivo }).eq('id', String(pedido.id))
    return { reenviado: false, motivo }
  }
  await db.from('orders').update({ delivered_at: new Date().toISOString(), email_error: null }).eq('id', String(pedido.id))
  return { reenviado: true, para: pedido.customer_email }
}

/**
 * Refaz a entrega de um pedido pago que travou (ver `entregasTravadas`): o
 * mesmo caminho do webhook — dedica a estrela, gera os PDFs, cria a página se
 * faltar e tenta o e-mail. Cada passo é idempotente, então repetir é seguro.
 */
async function refazerEntrega(db: ReturnType<typeof admin>, corpo: Record<string, unknown>) {
  const orderId = String(corpo.orderId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new ErroApp('pedido_ausente', 'Informe o pedido.', 422)

  const { data: pedido } = await db.from('orders').select('*').eq('id', orderId).maybeSingle()
  if (!pedido) throw new ErroApp('pedido_inexistente', 'Pedido não encontrado.', 404)
  if (pedido.status !== 'approved') throw new ErroApp('pedido_nao_pago', 'Só pedido pago tem entrega.', 409)

  const { data: estrela } = await db.from('stars').select('*').eq('slug', pedido.star_slug).maybeSingle()
  if (!estrela) throw new ErroApp('estrela_inexistente', 'A estrela do pedido não está no catálogo.', 409)

  const { data: dedicou } = await db.rpc('dedicar_estrela', { p_slug: pedido.star_slug, p_order: orderId }).throwOnError()
  if (!dedicou) {
    throw new ErroApp('estrela_de_outro', 'A estrela deste pedido já é de outro pedido — reembolse ou troque a estrela.', 409)
  }

  const comLinhaDoPar = { ...pedido, ...linhaParaCertificado(await dadosDoGrupo(db, orderId, pedido.group_id)) }
  const caminho = await refazerPdfs(db, comLinhaDoPar, estrela as Record<string, unknown>)
  const paginaId = await criarPaginaDoPedido(db, pedido, estrela as Record<string, unknown>)
  if (!paginaId) throw new ErroApp('pagina_falhou', 'O PDF saiu, mas a página não pôde ser criada. Tente de novo.', 500)

  return { entregue: true, ...(await tentarEmail(db, pedido, estrela as Record<string, unknown>, caminho)) }
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
  // `status`: a aba Campanha só oferece estrela livre.
  const campos = 'slug, name, bayer, constellation, magnitude, distance_ly, status'
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
    'nome', 'assinatura', 'apelidoEstrela', 'data', 'tituloHero', 'fraseHero', 'tituloEstrela',
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
