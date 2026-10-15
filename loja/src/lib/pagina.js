/**
 * Páginas dedicadas — chamadas das Edge Functions de página.
 *
 * Mesmo contrato do resto da loja: só POST (código na URL vai para histórico
 * e log) e o erro vira `ErroApi` com o código estável que a função devolveu.
 */
import { chamar } from './api.js'

/** Abre a página pública pelo código (`/p/SG-XXXX-XXXX`). */
export function buscarPagina(code) {
  return chamar('get-page', { code })
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

/** Grava a edição do cliente (só assinatura, carta e mensagem pessoal). */
export function salvarEdicao(token, conteudo) {
  return chamar('page-update', { token, conteudo })
}

/** O depoimento do comprador desta página (e se ele pode escrever um). */
export function lerDepoimento(token) {
  return chamar('testimonial', { token, acao: 'ler' })
}

/** Envia (ou reescreve) o depoimento — entra como pendente de aprovação. */
export function enviarDepoimento(token, { nome, cidade, texto, autorizaPublicar }) {
  return chamar('testimonial', { token, acao: 'enviar', nome, cidade, texto, autorizaPublicar })
}
