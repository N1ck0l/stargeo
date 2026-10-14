/**
 * Helpers de formatação e erro das telas do painel.
 *
 * Arquivo sem React de propósito: é a camada de "falar com o administrador"
 * (moeda, data, status, mensagem) e o tratador de erro que TODAS as abas
 * compartilham. Quem importa: `AdminPagina`, `VisaoGeral`, `Pedidos`,
 * `Paginas` e `EditorAdmin`.
 *
 * Exports: `ROTULOS_STATUS`, `rotuloStatus`, `classeStatus`, `brl`,
 * `dataCurta`, `mensagemDeErro`, `tratarErro`.
 *
 * Invariante: `tratarErro` é a ÚNICA porta de 401 — se ele não for chamado,
 * uma sessão vencida vira mensagem de erro em tela, e não volta pro login.
 * Por isso ele devolve `null` nesse caso: quem chama só mostra se houver
 * texto.
 */
import { ErroApi } from '../lib/api.js'

/** Status do Mercado Pago em palavras de gente. */
export const ROTULOS_STATUS = {
  approved: 'Pago',
  pending: 'Aguardando',
  in_process: 'Em análise',
  authorized: 'Autorizado',
  denied: 'Recusado',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  refunded: 'Devolvido',
  charged_back: 'Estornado',
  expired: 'Expirado',
}

export function rotuloStatus(status) {
  return ROTULOS_STATUS[status] ?? status
}

/** Classe de badge por status (pedidos e páginas usam o mesmo visual). */
export function classeStatus(status) {
  if (status === 'approved' || status === 'published') {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
  }
  if (status === 'draft' || status === 'pending' || status === 'in_process' || status === 'authorized') {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-200'
  }
  return 'border-red-400/30 bg-red-500/10 text-red-200'
}

/** Centavos inteiros → "R$ 24,90". */
export function brl(centavos) {
  return (Number(centavos ?? 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** ISO completo → "13/10/2026". */
export function dataCurta(iso) {
  if (!iso) return '—'
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return String(iso).slice(0, 10)
  return data.toLocaleDateString('pt-BR')
}

/** Mensagem amigável de qualquer erro lançado pelas chamadas. */
export function mensagemDeErro(erro) {
  if (erro instanceof ErroApi) return erro.message
  return 'Algo deu errado. Tente de novo em instantes.'
}

/** 401 = sessão caiu: quem chama manda pro login; senão, devolve a mensagem. */
export function tratarErro(erro, aoExpirar) {
  if (erro instanceof ErroApi && erro.status === 401) {
    aoExpirar?.()
    return null
  }
  return mensagemDeErro(erro)
}
