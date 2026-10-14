/**
 * Tokens de edição do cliente.
 *
 * O bruto (32 bytes aleatórios) só viaja na resposta do `page-auth`; o banco
 * guarda SHA-256. Mesma razão de `track-order`: não há conta para quem compra
 * um presente, então o acesso é o par (código, e-mail) que a pessoa já tem —
 * trocado por um segredo com validade, para não ser eterno nem recorrente de
 * digitar.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ErroApp } from './http.ts'

/** Validade do token: 30 dias, mesmo intervalo do rastreio com folga. */
export const VALIDADE_DIAS = 30

/** 32 bytes aleatórios em hex — 256 bits, colisão fora de questão. */
export function gerarToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 em hex, para guardar o token sem guardar o token. */
export async function sha256Hex(valor: string): Promise<string> {
  const dados = new TextEncoder().encode(valor)
  const digesto = await crypto.subtle.digest('SHA-256', dados)
  return [...new Uint8Array(digesto)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Lê o token do header `Authorization: Bearer …` ou do campo `token` do corpo. */
export function lerToken(request: Request, corpo?: Record<string, unknown> | null): string | null {
  const autorizacao = request.headers.get('authorization') ?? ''
  const cabecalho = autorizacao.toLowerCase().startsWith('bearer ')
    ? autorizacao.slice(7).trim()
    : ''

  const bruto = cabecalho || (typeof corpo?.token === 'string' ? corpo.token.trim() : '')
  return bruto || null
}

/**
 * Valida um token e devolve a página dona dele.
 *
 * Falha com 401 nas três saídas possíveis — hash desconhecido, token vencido
 * e token órfão (página apagada) — porque distinguir diria ao portador se o
 * hash existe.
 */
export async function sessaoDe(
  db: SupabaseClient,
  token: string,
): Promise<{ pageId: string; expiraEm: string }> {
  const hash = await sha256Hex(token)

  const { data, error } = await db
    .from('page_edit_tokens')
    .select('id, page_id, expires_at')
    .eq('token_hash', hash)
    .maybeSingle()

  if (error) {
    throw new ErroApp('consulta_falhou', 'Não foi possível verificar a sessão.', 500, error.message)
  }

  if (!data) {
    throw new ErroApp('sessao_expirada', 'Sua sessão de edição terminou. Entre de novo.', 401)
  }

  if (new Date(String(data.expires_at)).getTime() <= Date.now()) {
    await db.from('page_edit_tokens').delete().eq('id', data.id)
    throw new ErroApp('sessao_expirada', 'Sua sessão de edição terminou. Entre de novo.', 401)
  }

  return { pageId: String(data.page_id), expiraEm: String(data.expires_at) }
}
