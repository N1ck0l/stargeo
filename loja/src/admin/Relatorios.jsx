import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { baixarCsv, vendasEmCsv } from './csv.js'
import { brl, tratarErro } from './formatos.js'

/**
 * Aba Relatórios — vendas por período e a planilha para o contador.
 *
 * O período é pela data do PAGAMENTO, no calendário de Brasília. "Vendas" são
 * os pedidos pagos; reembolsos e estornos aparecem à parte (e na planilha,
 * com a situação de cada um).
 */
const FAIXAS = { lendaria: 'Lendária', nomeada: 'Nomeada', brilhante: 'Brilhante', visivel: 'Visível', profunda: 'Profunda' }
const METODOS = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', desconhecido: 'Não informado' }

/** `AAAA-MM-DD` de uma data, no calendário de Brasília. */
const dia = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)

function periodos() {
  const hoje = new Date()
  const [a, m] = dia(hoje).split('-').map(Number)
  const primeiro = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimo = (ano, mes) => dia(new Date(Date.UTC(ano, mes, 0, 12)))
  const [ap, mp] = m === 1 ? [a - 1, 12] : [a, m - 1]
  return {
    'Este mês': [primeiro(a, m), dia(hoje)],
    'Mês passado': [primeiro(ap, mp), ultimo(ap, mp)],
    'Últimos 30 dias': [dia(new Date(Date.now() - 29 * 86_400_000)), dia(hoje)],
    'Este ano': [`${a}-01-01`, dia(hoje)],
  }
}

export function Relatorios({ aoExpirar }) {
  const opcoes = periodos()
  const [periodo, setPeriodo] = useState(opcoes['Este mês'])
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    chamarAdmin('relatorio', { de: periodo[0], ate: periodo[1] })
      .then((r) => {
        if (!vivo) return
        setDados(r)
        setErro('')
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (vivo && mensagem) setErro(mensagem)
      })
    return () => {
      vivo = false
    }
  }, [periodo, aoExpirar])

  const r = dados?.resumo
  const cartoes = r
    ? [
        ['Receita', brl(r.receitaCentavos), true],
        ['Compras pagas', r.compras, false],
        ['Estrelas vendidas', r.estrelas, false],
        ['Ticket médio', brl(r.ticketMedioCentavos), false],
        ['Descontos de cupom', brl(r.descontoCupomCentavos), false],
        ['Reembolsado', `${brl(r.devolvidoCentavos)} (${r.devolvidas})`, false],
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {Object.entries(opcoes).map(([nome, faixa]) => (
            <button
              key={nome}
              type="button"
              onClick={() => {
                setDados(null)
                setPeriodo(faixa)
              }}
              aria-pressed={periodo[0] === faixa[0] && periodo[1] === faixa[1]}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                periodo[0] === faixa[0] && periodo[1] === faixa[1]
                  ? 'border-gold/70 bg-gold/15 text-gold'
                  : 'border-white/12 text-ivory/70 hover:border-white/30'
              }`}
            >
              {nome}
            </button>
          ))}
        </div>
        <label className="text-xs text-ivory/60">
          De{' '}
          <input type="date" value={periodo[0]} onChange={(e) => e.target.value && setPeriodo([e.target.value, periodo[1]])} className="campo inline-block w-auto py-1.5" />
        </label>
        <label className="text-xs text-ivory/60">
          até{' '}
          <input type="date" value={periodo[1]} onChange={(e) => e.target.value && setPeriodo([periodo[0], e.target.value])} className="campo inline-block w-auto py-1.5" />
        </label>
        <button
          type="button"
          disabled={!dados?.linhas?.length}
          onClick={() => baixarCsv(`vendas-stellara-${periodo[0]}-a-${periodo[1]}.csv`, vendasEmCsv(dados.linhas))}
          className="btn btn-primary ml-auto text-sm"
        >
          Baixar planilha (CSV)
        </button>
      </div>

      {erro && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erro}
        </p>
      )}

      {!dados && !erro && <p className="text-sm text-ivory/50">Carregando…</p>}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cartoes.map(([rotulo, valor, destaque]) => (
              <div key={rotulo} className="rounded-2xl border border-white/8 bg-white/5 p-4">
                <p className={`font-display text-xl ${destaque ? 'text-gold' : 'text-ivory'}`}>{valor}</p>
                <p className="mt-1 text-xs text-ivory/50">{rotulo}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Por faixa</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(r.porFaixa).length === 0 && <li className="text-ivory/45">Nenhuma venda no período.</li>}
                {Object.entries(r.porFaixa)
                  .sort((a, b) => b[1].receitaCentavos - a[1].receitaCentavos)
                  .map(([faixa, v]) => (
                    <li key={faixa} className="flex justify-between gap-3">
                      <span className="text-ivory/80">
                        {FAIXAS[faixa] ?? faixa} · {v.estrelas} {v.estrelas === 1 ? 'estrela' : 'estrelas'}
                      </span>
                      <span className="text-ivory/85">{brl(v.receitaCentavos)}</span>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Por forma de pagamento</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {Object.entries(r.porMetodo).length === 0 && <li className="text-ivory/45">Nenhuma venda no período.</li>}
                {Object.entries(r.porMetodo).map(([metodo, centavos]) => (
                  <li key={metodo} className="flex justify-between gap-3">
                    <span className="text-ivory/80">{METODOS[metodo] ?? metodo}</span>
                    <span className="text-ivory/85">{brl(centavos)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <p className="text-xs text-ivory/45">
            Período pela data do pagamento (horário de Brasília). A planilha traz uma linha por estrela, com comprador, CPF
            (quando informado), valor, cupom, forma e ID do pagamento no Mercado Pago — o que o contador precisa para a nota.
          </p>
        </>
      )}
    </div>
  )
}
