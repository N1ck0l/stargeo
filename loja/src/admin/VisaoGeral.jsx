import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { brl, classeStatus, rotuloStatus, tratarErro } from './formatos.js'

/**
 * Visão geral: o pulso da loja em números e as duas listas mais recentes.
 *
 * Tudo em UMA chamada (`overview`): o servidor monta pedidos e páginas
 * juntos, e a tela só formata — sem N requests na abertura do painel.
 */
export function VisaoGeral({ aoExpirar, aoAbrirPagina, aoIrParaPedidos }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    chamarAdmin('overview')
      .then((resposta) => {
        if (vivo) setDados(resposta)
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (vivo && mensagem) setErro(mensagem)
      })
    return () => {
      vivo = false
    }
  }, [aoExpirar])

  if (erro) {
    return (
      <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {erro}
      </p>
    )
  }
  if (!dados) {
    return (
      <div className="flex justify-center py-16">
        <span className="inline-block h-8 w-8 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
      </div>
    )
  }

  const { pedidos, paginas } = dados

  /*
   * Os seis números do topo, na ordem em que o dono da loja olha: volume,
   * dinheiro e ritmo primeiro (`destaque` pinta de dourado), o resto depois.
   * Receita e "pagos" vêm filtrados no servidor — não é a soma da tela.
   */
  const cartoes = [
    { valor: pedidos.total, rotulo: 'Pedidos', destaque: false },
    { valor: pedidos.porStatus?.approved ?? 0, rotulo: 'Pagos', destaque: true },
    { valor: brl(pedidos.receitaCentavos), rotulo: 'Receita (pagos)', destaque: true },
    { valor: pedidos.naSemana, rotulo: 'Nos últimos 7 dias', destaque: false },
    { valor: paginas.total, rotulo: 'Páginas', destaque: false },
    { valor: paginas.publicadas, rotulo: 'Publicadas', destaque: false },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cartoes.map((cartao) => (
          <div key={cartao.rotulo} className="rounded-2xl border border-white/8 bg-white/5 p-4">
            <p
              className={`font-display text-2xl ${cartao.destaque ? 'text-gold' : 'text-ivory'}`}
            >
              {cartao.valor}
            </p>
            <p className="mt-1 text-xs text-ivory/50">{cartao.rotulo}</p>
          </div>
        ))}
      </div>

      {/*
        O único alerta desta tela: falha de e-mail é o problema que passa
        despercebido (pedido pago, entrega silenciosa) — por isso ganha aviso
        aqui, mas a correção (reenvio) mora na aba Pedidos.
      */}
      {dados.depoimentosPendentes > 0 && (
        <p className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-ivory/85">
          {dados.depoimentosPendentes}{' '}
          {dados.depoimentosPendentes === 1 ? 'depoimento espera' : 'depoimentos esperam'} revisão — na aba
          Depoimentos.
        </p>
      )}

      <Funil funil={dados.funil ?? {}} />

      {pedidos.comErroDeEmail > 0 && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {pedidos.comErroDeEmail}{' '}
          {pedidos.comErroDeEmail === 1 ? 'pedido teve' : 'pedidos tiveram'} falha no e-mail — o
          reenvio fica na aba Pedidos.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">
              Pedidos recentes
            </h2>
            <button type="button" onClick={aoIrParaPedidos} className="text-xs text-ivory/50 transition hover:text-gold">
              Ver todos
            </button>
          </div>
          <ul className="mt-4 space-y-2.5">
            {pedidos.recentes.map((pedido) => (
              <li key={pedido.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono text-ivory">{pedido.code}</p>
                  <p className="truncate text-ivory/50">{pedido.honoree_name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${classeStatus(pedido.status)}`}
                  >
                    {rotuloStatus(pedido.status)}
                  </span>
                  <p className="mt-1 text-xs text-ivory/50">{brl(pedido.amount_cents)}</p>
                </div>
              </li>
            ))}
            {pedidos.recentes.length === 0 && (
              <li className="text-sm text-ivory/45">Nenhum pedido ainda.</li>
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
          <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">
            Páginas recentes
          </h2>
          <ul className="mt-4 space-y-2.5">
            {paginas.recentes.map((pagina) => (
              <li key={pagina.code} className="flex items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => aoAbrirPagina(pagina.code)}
                  className="min-w-0 text-left transition hover:text-gold"
                >
                  <p className="font-mono text-ivory">{pagina.code}</p>
                  <p className="truncate text-ivory/50">{pagina.honoree_name}</p>
                </button>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${classeStatus(pagina.status)}`}
                >
                  {pagina.status === 'published' ? 'Publicada' : 'Rascunho'}
                </span>
              </li>
            ))}
            {paginas.recentes.length === 0 && (
              <li className="text-sm text-ivory/45">
                Nenhuma página ainda. Crie a primeira na aba Páginas — ou a partir de um pedido pago.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}

/**
 * O funil dos últimos 30 dias: contadores agregados por dia (migration 0017),
 * sem nenhum dado de pessoa. "Compras" são os pedidos pagos no banco, não um evento do
 * navegador — é o número confiável; os de cima são aproximados (bloqueadores
 * e "não rastrear" ficam de fora de propósito).
 */
const ETAPAS = [
  ['visita', 'Visitas'],
  ['ver_produto', 'Abriram o produto'],
  ['personalizar', 'Começaram a personalizar'],
  ['iniciar_checkout', 'Foram ao pagamento'],
  ['compra_aprovada', 'Compras aprovadas'],
]

function Funil({ funil }) {
  const base = funil.visita || 0
  return (
    <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
      <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Funil · últimos 30 dias</h2>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {ETAPAS.map(([evento, rotulo]) => {
          const n = funil[evento] ?? 0
          return (
            <li key={evento} className="rounded-xl border border-white/8 bg-white/5 p-3">
              <p className="font-display text-xl text-ivory">{n.toLocaleString('pt-BR')}</p>
              <p className="mt-1 text-xs text-ivory/55">{rotulo}</p>
              {base > 0 && evento !== 'visita' && (
                <p className="mt-1 text-[11px] text-gold/80">
                  {((n / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das visitas
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[11px] text-ivory/45">
        Contagem anônima, sem cookie. Compras são os pedidos pagos; as outras etapas são aproximadas.
      </p>
    </section>
  )
}
