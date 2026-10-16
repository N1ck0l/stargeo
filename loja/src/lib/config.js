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

/**
 * Endereço PÚBLICO da loja — o que vai impresso (QR da carta de campanha).
 * Nunca `window.location.origin`: impresso a partir do painel aberto em
 * localhost ou num endereço de pré-visualização, o QR apontaria para lugar
 * nenhum. Com o domínio próprio, troque `VITE_URL_PUBLICA` na Netlify.
 */
export const URL_PUBLICA = String(import.meta.env.VITE_URL_PUBLICA || 'https://stellara-loja.netlify.app').replace(/\/+$/, '')

/** O endereço da página de uma homenagem ou estrela, para o QR. */
export const urlDaPagina = (codigo) => `${URL_PUBLICA}/p/${codigo}`
