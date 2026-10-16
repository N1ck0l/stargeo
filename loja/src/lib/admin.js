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

/** Um único cliente Supabase por sessão da página — o import já é sob demanda. */
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
  if (texto.includes('same_password') || texto.includes('should be different')) {
    return 'A nova senha precisa ser diferente da atual.'
  }
  if (texto.includes('weak_password') || texto.includes('at least')) {
    return `Senha fraca: use pelo menos ${SENHA_MINIMA} caracteres.`
  }
  if (texto.includes('session') && texto.includes('missing')) {
    return 'O link de recuperação venceu. Peça outro em "Esqueci minha senha".'
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

/** Senha mínima do painel — a mesma do Supabase Auth (`password_min_length`). */
export const SENHA_MINIMA = 10

/**
 * O link do e-mail de recuperação abre `/admin#access_token=…&type=recovery`
 * (ou `#error=…` se venceu). Tem de ser lido ANTES de o cliente Supabase
 * nascer: ele consome o endereço, cria a sessão e limpa o `#`.
 *
 * @returns {'recuperacao' | 'link_vencido' | null}
 */
export function chegouPeloLinkDeRecuperacao() {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  if (/[#&]type=recovery/.test(hash)) return 'recuperacao'
  if (/[#&]error_code=otp_expired/.test(hash) || /[#&]error=access_denied/.test(hash)) return 'link_vencido'
  return null
}

/**
 * "Esqueci minha senha": o Supabase manda o link para o e-mail, SE ele tiver
 * conta — a resposta é a mesma nos dois casos, para ninguém descobrir quem é
 * administrador.
 */
export async function pedirRecuperacao(email) {
  const db = await supabase()
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin` })
  // Só o limite de envio vale contar; o resto seria pista sobre a conta.
  if (error && /rate limit|too many/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
    throw new ErroApi('limite', 'Muitos pedidos em pouco tempo. Aguarde uma hora e tente de novo.', 429)
  }
}

/** Define a senha nova da conta logada (pelo link de recuperação ou no painel). */
export async function definirNovaSenha(senha) {
  const db = await supabase()
  const { error } = await db.auth.updateUser({ password: senha })
  if (error) throw new ErroApi('senha_falhou', traduzirAuth(error), 400)
}

/** Sessão atual, ou `null` se ninguém entrou (ou a sessão venceu). */
export async function sessaoAtual() {
  const db = await supabase()
  const { data } = await db.auth.getSession()
  return data.session ?? null
}

/** Sai do painel: o token morre no servidor, e a tela volta para o login. */
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
