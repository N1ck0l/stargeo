/**
 * A mensagem que vai junto com o link do presente (WhatsApp, cópia).
 * Com revelação na data (migration 0019), não entrega a estrela: fala da
 * surpresa e do dia.
 */
export function mensagemDoPresente({ url, para, revelaEm }) {
  const nome = para ? `${para}, ` : ''
  if (revelaEm) {
    const dia = new Date(`${revelaEm}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    return `${nome}tenho uma surpresa nas estrelas para você ✨ Ela se revela em ${dia} — guarde este link: ${url}`
  }
  return `${nome}uma estrela no céu agora tem o seu nome ✨ Veja onde ela está: ${url}`
}
