/**
 * Páginas dedicadas — chamadas das Edge Functions de página.
 *
 * Mesmo contrato do resto da loja: só POST (código na URL vai para histórico
 * e log) e o erro vira `ErroApi` com o código estável que a função devolveu.
 */
import { chamar } from './api.js'

/**
 * Abre a página pública pelo código (`/p/SG-XXXX-XXXX`).
 *
 * Com o token de edição da dona, a página guardada até a data de revelação
 * (migration 0019) vem inteira; sem ele, vem só `{ guardada }`.
 */
export function buscarPagina(code, token) {
  return chamar('get-page', token ? { code, token } : { code })
}

/** A página de um grupo de estrelas (`/g/GR-XXXX-XXXX`, migration 0021). */
export function buscarGrupo(code) {
  return chamar('get-group', { code })
}

/** O token de edição guardado neste navegador para a página, se houver. */
export function tokenGuardado(code) {
  try {
    const dados = JSON.parse(localStorage.getItem(`stellara:edicao:${code}`) ?? 'null')
    if (!dados?.token || new Date(dados.expiraEm).getTime() <= Date.now()) return null
    return dados.token
  } catch {
    return null
  }
}

/**
 * Login do cliente: par (código, e-mail) → token de edição.
 *
 * Sem token no corpo, a mesma função valida uma sessão já emitida — é o que
 * a tela de edição chama ao recarregar.
 */
export function entrarEdicao({ code, email, token }) {
  return chamar('page-auth', token ? { token } : { code, email })
}

/**
 * Grava a edição do cliente (só assinatura, carta e mensagem pessoal) e,
 * quando vier, a data de revelação (`''` = revelar já).
 */
export function salvarEdicao(token, conteudo, revelaEm) {
  return chamar('page-update', revelaEm === undefined ? { token, conteudo } : { token, conteudo, revelaEm })
}

/** O depoimento do comprador desta página (e se ele pode escrever um). */
export function lerDepoimento(token) {
  return chamar('testimonial', { token, acao: 'ler' })
}

/** Envia (ou reescreve) o depoimento — entra como pendente de aprovação. */
export function enviarDepoimento(token, { nome, cidade, texto, autorizaPublicar }) {
  return chamar('testimonial', { token, acao: 'enviar', nome, cidade, texto, autorizaPublicar })
}
