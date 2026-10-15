/**
 * Planilha de vendas para o contador (aba Relatórios).
 *
 * No formato que o Excel em português abre sem configurar nada: separador
 * `;`, vírgula decimal, datas `dd/mm/aaaa hh:mm` em Brasília e BOM UTF-8 no
 * começo (sem ele, os acentos viram "Ã§").
 */
const COLUNAS = [
  ['Data do pagamento', (l) => dataHora(l.paid_at)],
  ['Pedido', (l) => l.code],
  ['Situação', (l) => ({ approved: 'Pago', refunded: 'Reembolsado', charged_back: 'Estornado' })[l.status] ?? l.status],
  ['Comprador', (l) => l.customer_name],
  ['E-mail', (l) => l.customer_email],
  ['CPF', (l) => l.customer_doc],
  ['Para quem', (l) => l.honoree_name],
  ['Estrela', (l) => l.stars?.name ?? l.star_slug],
  ['Faixa', (l) => l.stars?.faixa],
  ['Valor pago (R$)', (l) => reaisCsv(l.amount_cents)],
  ['Desconto do cupom (R$)', (l) => reaisCsv(l.desconto_cupom_cents ?? 0)],
  ['Cupom', (l) => l.cupom],
  ['Forma de pagamento', (l) => ({ pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito' })[l.payment_method] ?? l.payment_method],
  ['ID do pagamento (Mercado Pago)', (l) => l.payment_id],
]

function dataHora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).replace(',', '')
}

function reaisCsv(centavos) {
  return (Number(centavos ?? 0) / 100).toFixed(2).replace('.', ',')
}

function celula(valor) {
  const texto = String(valor ?? '')
  // Aspas quando há separador, aspas ou quebra; e um apóstrofo antes de
  // =, +, - ou @ no começo, para a planilha não executar como fórmula.
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/** As linhas do relatório → texto CSV (com BOM). */
export function vendasEmCsv(linhas) {
  const corpo = [COLUNAS.map(([titulo]) => titulo), ...linhas.map((l) => COLUNAS.map(([, pegar]) => pegar(l)))]
    .map((linha) => linha.map(celula).join(';'))
    .join('\r\n')
  return `﻿${corpo}\r\n`
}

/** Baixa o texto como arquivo. */
export function baixarCsv(nome, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
