/**
 * Painel administrativo — autenticação e chamadas do `admin-api`.
 *
 * Duas chaves, dois papéis:
 *
 * - O LOGIN é Supabase Auth (`signInWithPassword`): existe conta, existe
 *   senha, existe sessão — mesma infraestrutura do resto do Supabase, sem
 *   tabela de senha nossa para errar.
 * - A PERMISSÃO é a lista branca `admins` lá no servidor: ter sessão não
 *   basta, o `admin-api` confere a linha antes de qualquer ação. Uma conta
 *   fora da lista recebe 403 mesmo logada.
 *
 * A sessão (access token de vida curta) vai no `Authorization` de cada
 * chamada ao `admin-api`; a chave publicável fica no navegador de qualquer
 * forma — é para isso que ela existe.
 *
 * O `@supabase/supabase-js` é importado SOB DEMANDA: quem só visita a loja
 * nunca paga o peso do pacote de autenticação no download.
 */
import { ErroApi, chamar } from './api.js'

let clientePromise = null

function supabase() {
  if (!clientePromise) {
    clientePromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      ),
    )
  }
  return clientePromise
}

/** Mensagens de erro do GoTrue em português, sem vazar detalhe interno. */
function traduzirAuth(erro) {
  // O GoTrue responde tanto pelo `code` (`invalid_credentials`) quanto pela
  // frase (`Invalid login credentials`) — os dois textos entram na checagem.
  const texto = `${erro?.code ?? ''} ${erro?.message ?? ''}`.toLowerCase()
  if (texto.includes('invalid login') || texto.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (texto.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado.'
  if (texto.includes('rate limit') || texto.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  }
  if (texto.includes('failed to fetch') || texto.includes('network')) {
    return 'Sem conexão com o servidor de acesso. Tente de novo.'
  }
  return 'Não foi possível entrar no painel.'
}

/** Entra no painel. Lança `ErroApi` com mensagem amigável. */
export async function entrarNoPainel(email, senha) {
  const db = await supabase()
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error) throw new ErroApi('login_falhou', traduzirAuth(error), 401)
  return data.session
}

/** Sessão atual, ou `null` se ninguém entrou (ou a sessão venceu). */
export async function sessaoAtual() {
  const db = await supabase()
  const { data } = await db.auth.getSession()
  return data.session ?? null
}

export async function sairDoPainel() {
  const db = await supabase()
  await db.auth.signOut()
}

/**
 * Chama uma ação do `admin-api` com a sessão vigente.
 *
 * @param {string} acao lista branca do servidor (`overview`, `pedidos`, …)
 * @param {object} corpo
 */
export async function chamarAdmin(acao, corpo = {}) {
  const sessao = await sessaoAtual()
  if (!sessao) {
    throw new ErroApi('nao_autenticado', 'Entre no painel para continuar.', 401)
  }
  return chamar('admin-api', { action: acao, ...corpo }, {
    headers: { Authorization: `Bearer ${sessao.access_token}` },
  })
}
