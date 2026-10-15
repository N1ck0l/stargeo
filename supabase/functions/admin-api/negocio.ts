/**
 * Painel: cupons, relatório de vendas e erros do site (migration 0022).
 *
 * Separado do `index.ts` (que sobe o servidor ao ser importado) para o teste
 * chamar as regras direto — as contas do relatório vão para o contador.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ErroApp } from '../_shared/http.ts'
import { limpar, validarTextoLivre } from '../../../shared/moderation.js'

type Db = SupabaseClient

// ---------------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------------

/** Cupons com o desempenho de cada um: usos, receita e desconto concedido. */
export async function listarCupons(db: Db) {
  const [{ data: cupons, error }, { data: usos }, { data: pedidos }] = await Promise.all([
    db.from('cupons').select('*').order('created_at', { ascending: false }),
    db.from('cupom_usos').select('codigo'),
    db.from('orders').select('cupom, amount_cents, desconto_cupom_cents, status').not('cupom', 'is', null),
  ])
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível listar os cupons.', 500, error.message)

  const contagem: Record<string, number> = {}
  for (const u of usos ?? []) contagem[u.codigo] = (contagem[u.codigo] ?? 0) + 1
  const receita: Record<string, number> = {}
  const desconto: Record<string, number> = {}
  for (const p of pedidos ?? []) {
    if (p.status !== 'approved') continue
    receita[p.cupom] = (receita[p.cupom] ?? 0) + Number(p.amount_cents)
    desconto[p.cupom] = (desconto[p.cupom] ?? 0) + Number(p.desconto_cupom_cents)
  }

  return {
    cupons: (cupons ?? []).map((c) => ({
      ...c,
      usos: contagem[c.codigo] ?? 0,
      receitaCentavos: receita[c.codigo] ?? 0,
      descontoCentavos: desconto[c.codigo] ?? 0,
    })),
  }
}

/** Valida e normaliza um cupom vindo do painel. Lança `ErroApp` com o motivo. */
export function normalizarCupom(corpo: Record<string, unknown>) {
  const codigo = String(corpo.codigo ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{3,20}$/.test(codigo)) {
    throw new ErroApp('cupom_codigo', 'Código de 3 a 20 letras e números, sem espaço nem acento (ex.: LANCAMENTO10).', 422)
  }
  const tipo = corpo.tipo === 'valor' ? 'valor' : 'percentual'
  const bruto = Number(corpo.valor)
  // No painel o valor fixo é digitado em REAIS; no banco, centavos.
  const valor = tipo === 'valor' ? Math.round(bruto * 100) : Math.round(bruto)
  if (!Number.isFinite(bruto) || valor <= 0) throw new ErroApp('cupom_valor', 'Informe o desconto.', 422)
  if (tipo === 'percentual' && valor > 50) throw new ErroApp('cupom_valor', 'O percentual vai até 50%.', 422)

  const descricao = corpo.descricao ? limpar(String(corpo.descricao)) : ''
  if (descricao) {
    const erro = validarTextoLivre(descricao, { max: 120 })
    if (erro) throw new ErroApp('cupom_descricao', `Descrição: ${erro}`, 422)
  }

  const data = (v: unknown) => {
    if (!v) return null
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) throw new ErroApp('cupom_data', 'Data de validade inválida.', 422)
    return d.toISOString()
  }
  const validoDe = data(corpo.valido_de)
  const validoAte = data(corpo.valido_ate)
  if (validoDe && validoAte && validoAte <= validoDe) throw new ErroApp('cupom_data', 'O fim da validade vem depois do início.', 422)

  const max = corpo.max_usos === '' || corpo.max_usos == null ? null : Math.round(Number(corpo.max_usos))
  if (max !== null && (!Number.isFinite(max) || max <= 0)) throw new ErroApp('cupom_usos', 'Limite de usos inválido.', 422)

  return {
    codigo,
    tipo,
    valor,
    descricao: descricao || null,
    valido_de: validoDe,
    valido_ate: validoAte,
    max_usos: max,
    ativo: corpo.ativo !== false,
  }
}

export async function salvarCupom(db: Db, corpo: Record<string, unknown>) {
  const cupom = normalizarCupom(corpo)
  const { error } = await db.from('cupons').upsert(cupom, { onConflict: 'codigo' })
  if (error) throw new ErroApp('grava_falhou', 'Não foi possível salvar o cupom.', 500, error.message)
  return { ok: true, codigo: cupom.codigo }
}

// ---------------------------------------------------------------------------
// Relatório de vendas
// ---------------------------------------------------------------------------

export interface LinhaVenda {
  id: string
  code: string
  group_id: string | null
  status: string
  paid_at: string | null
  customer_name: string | null
  customer_email: string | null
  customer_doc: string | null
  honoree_name: string | null
  star_slug: string
  amount_cents: number
  desconto_cupom_cents: number | null
  cupom: string | null
  payment_method: string | null
  payment_id: string | null
  stars: { name: string; faixa: string } | null
}

/**
 * As contas do relatório, a partir das linhas do período. Separado da consulta
 * para o teste: é a parte que vai para o contador.
 *
 * - Vendas = pedidos PAGOS (`approved`); estornados e chargebacks à parte.
 * - Compras = pagamentos (um grupo de estrelas é UMA compra).
 * - Ticket médio = receita ÷ compras.
 */
export function resumirVendas(linhas: LinhaVenda[]) {
  const pagas = linhas.filter((l) => l.status === 'approved')
  const devolvidas = linhas.filter((l) => l.status === 'refunded' || l.status === 'charged_back')
  const receita = pagas.reduce((s, l) => s + Number(l.amount_cents), 0)
  const compras = new Set(pagas.map((l) => l.group_id ?? l.id)).size

  const porFaixa: Record<string, { estrelas: number; receitaCentavos: number }> = {}
  for (const l of pagas) {
    const faixa = l.stars?.faixa ?? 'sem faixa'
    porFaixa[faixa] ??= { estrelas: 0, receitaCentavos: 0 }
    porFaixa[faixa].estrelas += 1
    porFaixa[faixa].receitaCentavos += Number(l.amount_cents)
  }

  const porMetodo: Record<string, number> = {}
  for (const l of pagas) {
    const metodo = l.payment_method ?? 'desconhecido'
    porMetodo[metodo] = (porMetodo[metodo] ?? 0) + Number(l.amount_cents)
  }

  return {
    estrelas: pagas.length,
    compras,
    receitaCentavos: receita,
    ticketMedioCentavos: compras ? Math.round(receita / compras) : 0,
    descontoCupomCentavos: pagas.reduce((s, l) => s + Number(l.desconto_cupom_cents ?? 0), 0),
    devolvidas: devolvidas.length,
    devolvidoCentavos: devolvidas.reduce((s, l) => s + Number(l.amount_cents), 0),
    porFaixa,
    porMetodo,
  }
}

/** Vendas com pagamento entre `de` e `ate` (datas `AAAA-MM-DD`, Brasília, inclusivas). */
export async function relatorio(db: Db, corpo: Record<string, unknown>) {
  const re = /^\d{4}-\d{2}-\d{2}$/
  const de = String(corpo.de ?? '')
  const ate = String(corpo.ate ?? '')
  if (!re.test(de) || !re.test(ate) || ate < de) throw new ErroApp('periodo_invalido', 'Escolha um período válido.', 422)

  // Meia-noite de Brasília (UTC−3) nas duas pontas; `ate` inclui o dia todo.
  const inicio = new Date(`${de}T00:00:00-03:00`).toISOString()
  const fim = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86_400_000).toISOString()

  const { data, error } = await db
    .from('orders')
    .select(
      'id, code, group_id, status, paid_at, customer_name, customer_email, customer_doc, honoree_name, star_slug, ' +
        'amount_cents, desconto_cupom_cents, cupom, payment_method, payment_id, stars(name, faixa)',
    )
    .in('status', ['approved', 'refunded', 'charged_back'])
    .gte('paid_at', inicio)
    .lt('paid_at', fim)
    .order('paid_at', { ascending: true })
    .limit(5000)
  if (error) throw new ErroApp('consulta_falhou', 'Não foi possível montar o relatório.', 500, error.message)

  const linhas = (data ?? []) as unknown as LinhaVenda[]
  return { de, ate, resumo: resumirVendas(linhas), linhas }
}

// ---------------------------------------------------------------------------
// Erros do site
// ---------------------------------------------------------------------------

/** Os erros dos últimos 7 dias, somados por tipo (o mais frequente primeiro). */
export async function errosRecentes(db: Db) {
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await db
    .from('erros_site')
    .select('fingerprint, mensagem, rota, pilha, navegador, total, ultimo, dia')
    .gte('dia', desde)
  if (error) return { total: 0, tipos: [] }

  const porTipo = new Map<string, { mensagem: string; rota: string; pilha: string | null; navegador: string | null; total: number; ultimo: string }>()
  for (const e of data ?? []) {
    const atual = porTipo.get(e.fingerprint)
    if (atual) {
      atual.total += e.total
      if (e.ultimo > atual.ultimo) atual.ultimo = e.ultimo
    } else {
      porTipo.set(e.fingerprint, { mensagem: e.mensagem, rota: e.rota, pilha: e.pilha, navegador: e.navegador, total: e.total, ultimo: e.ultimo })
    }
  }
  const tipos = [...porTipo.values()].sort((a, b) => b.total - a.total).slice(0, 15)
  return { total: tipos.reduce((s, t) => s + t.total, 0), tipos }
}
