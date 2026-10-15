/**
 * Chaves de configuração da loja que mudam o que o SITE PROMETE.
 *
 * `VITE_EMAIL_ATIVO=1` só depois que o e-mail de entrega sair de verdade
 * (domínio verificado no Resend — `PENDENCIAS.md`, 1.4). Desligado, nenhum
 * texto diz "enviamos para o seu e-mail": a entrega é a página da estrela e o
 * PDF baixado dela, e a tela de obrigado mostra o código do pedido para a
 * pessoa guardar (sem e-mail, é o único lugar onde ele aparece).
 */
export const EMAIL_ATIVO = import.meta.env.VITE_EMAIL_ATIVO === '1'
