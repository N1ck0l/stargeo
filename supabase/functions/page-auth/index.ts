/**
 * Login de edição da página dedicada — par (código, e-mail) virando token.
 *
 * Dois formatos de chamada, uma função só:
 *
 * 1. `{code, email}` — o login. É o mesmo par que o cliente já usou no
 *    rastreio (a página guarda o `customer_email` do pedido), então não há
 *    conta para criar, convite para enviar nem link mágico que dependa do
 *    DNS do domínio. O código tem 40 bits; exigir o e-mail junto derruba a
 *    adivinhação para um espaço que precisa de um e-mail válido, do mesmo jeito
 *    que em `track-order`.
 *
 * 2. `Authorization: Bearer <token>` — quem já logou recarrega a edição sem
 *    digitar e-mail de novo. Mesma resposta, sem emitir token novo.
 *
 * O bruto do token só existe na resposta: o banco guarda SHA-256
 * (`page_edit_tokens`), e o token expira em 30 dias mesmo sem uso.
 *
 * URL: `https://<ref>.supabase.co/functions/v1/page-auth`, chamada por
 * `loja/src/lib/pagina.js`. Publicada com `--no-verify-jwt` (ver `LOJA.md`):
 * esta função é o login, então não pode depender de um.
 *
 * Efeitos colaterais: grava o hash em `page_edit_tokens` e apaga os tokens
 * vencidos daquela página no mesmo passo (a tabela não acumula histórico de
 * quem já não edita).
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { lerToken, sessaoDe, VALIDADE_DIAS, gerarToken, sha256Hex } from '../_shared/token.ts'
import {
  conteudoDaLinha,
  estrelaParaPagina,
  SELECAO_PAGINA,
  type LinhaPagina,
} from '../_shared/pagina.ts'

const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/
// Forma, não existência: o endereço precisa bater com `pages.customer_email`
// — validar de mais aqui só afastaria alguém com e-mail legítimo.
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(
  comHandler(async (request) => {
    const corpo = await lerJson(request)
    const db = admin()

    const token = lerToken(request, corpo)

    // Caminho 2: sessão existente — só confirma e devolve a página.
    if (token) {
      const sessao = await sessaoDe(db, token)
      const linha = await carregarPagina(db, sessao.pageId)
      return json(request, {
        expiraEm: sessao.expiraEm,
        ...(await montar(linha)),
      })
    }

    // Caminho 1: login por código + e-mail.
    const { code, email } = corpo as { code?: string; email?: string }

    if (!code || !email) {
      throw new ErroApp('campos_ausentes', 'Informe o código da página e o e-mail.')
    }

    const codigo = String(code).trim().toUpperCase()
    const endereco = String(email).trim().toLowerCase()

    if (!RE_CODIGO.test(codigo)) {
      throw new ErroApp('codigo_invalido', 'Endereço de página inválido.', 422)
    }
    if (!RE_EMAIL.test(endereco)) {
      throw new ErroApp('email_invalido', 'Endereço de e-mail inválido.', 422)
    }

    const { data, error } = await db
      .from('pages')
      .select(SELECAO_PAGINA)
      .eq('code', codigo)
      .eq('customer_email', endereco)
      .maybeSingle()

    if (error) {
      throw new ErroApp('consulta_falhou', 'Não foi possível entrar.', 500, error.message)
    }

    const linha = data as unknown as LinhaPagina | null

    if (!linha) {
      /*
       * Mesma resposta para três casos: página inexistente, e-mail diferente
       * e página sem dono. Qualquer distinção diria a quem testa que o
       * código existe.
       */
      throw new ErroApp(
        'acesso_negado',
        'Não encontramos uma página com esse código e e-mail.',
        404,
      )
    }

    const bruto = gerarToken()
    const hash = await sha256Hex(bruto)
    // 30 dias CONTADOS DE AGORA (`VALIDADE_DIAS`): cada login novo empurra o
    // vencimento, então nada aqui é "vitalício para sempre".
    const expiraEm = new Date(Date.now() + VALIDADE_DIAS * 86_400_000).toISOString()

    // Tokens vencidos da página saem no mesmo passo: a tabela não pode
    // acumular histórico de acesso de quem já não edita.
    await db
      .from('page_edit_tokens')
      .delete()
      .eq('page_id', linha.id)
      .lt('expires_at', new Date().toISOString())

    const { error: erroToken } = await db.from('page_edit_tokens').insert({
      page_id: linha.id,
      token_hash: hash,
      expires_at: expiraEm,
    })

    if (erroToken) {
      throw new ErroApp('token_falhou', 'Não foi possível iniciar a edição.', 500, erroToken.message)
    }

    return json(request, { token: bruto, expiraEm, ...(await montar(linha)) })
  }, 'page-auth'),
)

/** Lê a página por id — o caminho de quem já tem sessão. */
async function carregarPagina(db: ReturnType<typeof admin>, pageId: string): Promise<LinhaPagina> {
  const { data, error } = await db
    .from('pages')
    .select(SELECAO_PAGINA)
    .eq('id', pageId)
    .maybeSingle()

  if (error) {
    throw new ErroApp('consulta_falhou', 'Não foi possível abrir a edição.', 500, error.message)
  }
  if (!data) {
    // Página apagada com token ainda vivo: cascade deveria ter limpado.
    throw new ErroApp('sessao_expirada', 'Sua sessão de edição terminou. Entre de novo.', 401)
  }

  return data as unknown as LinhaPagina
}

/** Página + estrela, no mesmo formato do `get-page`. */
async function montar(linha: LinhaPagina) {
  const { data: estrela } = await admin()
    .from('stars')
    .select('*')
    .eq('slug', linha.star_slug)
    .maybeSingle()

  return {
    pagina: {
      code: linha.code,
      status: linha.status,
      conteudo: conteudoDaLinha(linha),
      starSlug: linha.star_slug,
      // Editor editável por este token — o front decide o que mostrar.
      podeEditar: true,
      criadoEm: linha.created_at,
    },
    estrela: estrela ? estrelaParaPagina(estrela as Record<string, unknown>) : null,
  }
}
