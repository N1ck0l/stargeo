import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { brl, dataCurta, tratarErro } from './formatos.js'

/**
 * Aba Cupons — criar, pausar e acompanhar (migration 0022).
 *
 * Um cupom vale sobre o total da compra (já com o desconto de grupo) e quem
 * aplica é o servidor. Uso = compra PAGA com ele. O link de parceria leva o
 * cupom pronto: `/produto/certificado-digital?cupom=CODIGO`.
 */
const VAZIO = { codigo: '', tipo: 'percentual', valor: '10', descricao: '', valido_de: '', valido_ate: '', max_usos: '' }

export function Cupons({ aoExpirar }) {
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [versao, setVersao] = useState(0)
  const [copiado, setCopiado] = useState('')

  useEffect(() => {
    let vivo = true
    chamarAdmin('cupons')
      .then((r) => vivo && setLista(r.cupons ?? []))
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (vivo && mensagem) setAviso({ tipo: 'erro', texto: mensagem })
      })
    return () => {
      vivo = false
    }
  }, [versao, aoExpirar])

  async function salvar(dados) {
    setSalvando(true)
    setAviso(null)
    try {
      const r = await chamarAdmin('cupomSalvar', dados)
      setAviso({ tipo: 'ok', texto: `Cupom ${r.codigo} salvo.` })
      setForm(VAZIO)
      setVersao((v) => v + 1)
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setAviso({ tipo: 'erro', texto: mensagem })
    } finally {
      setSalvando(false)
    }
  }

  const linkDe = (codigo) => `${window.location.origin}/produto/certificado-digital?cupom=${codigo}`
  async function copiarLink(codigo) {
    try {
      await navigator.clipboard.writeText(linkDe(codigo))
      setCopiado(codigo)
      setTimeout(() => setCopiado(''), 2000)
    } catch {
      // Sem área de transferência: o link aparece no título do botão.
    }
  }

  const campo = (nome) => ({
    id: `cupom-${nome}`,
    value: form[nome],
    onChange: (e) => setForm((f) => ({ ...f, [nome]: e.target.value })),
    className: 'campo',
  })

  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          salvar({ ...form, ativo: true })
        }}
        className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"
      >
        <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Novo cupom</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="cupom-codigo" className="rotulo">Código</label>
            <input {...campo('codigo')} placeholder="LANCAMENTO10" maxLength={20} required className="campo uppercase" />
          </div>
          <div>
            <label htmlFor="cupom-tipo" className="rotulo">Tipo</label>
            <select {...campo('tipo')}>
              <option value="percentual">Percentual (%)</option>
              <option value="valor">Valor fixo (R$)</option>
            </select>
          </div>
          <div>
            <label htmlFor="cupom-valor" className="rotulo">{form.tipo === 'valor' ? 'Desconto em R$' : 'Desconto em % (até 50)'}</label>
            <input {...campo('valor')} type="number" min="1" max={form.tipo === 'valor' ? undefined : 50} step="1" required />
          </div>
          <div>
            <label htmlFor="cupom-max_usos" className="rotulo">Limite de usos (vazio = sem limite)</label>
            <input {...campo('max_usos')} type="number" min="1" step="1" />
          </div>
          <div>
            <label htmlFor="cupom-valido_de" className="rotulo">Vale a partir de</label>
            <input {...campo('valido_de')} type="datetime-local" />
          </div>
          <div>
            <label htmlFor="cupom-valido_ate" className="rotulo">Vale até</label>
            <input {...campo('valido_ate')} type="datetime-local" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="cupom-descricao" className="rotulo">Descrição (aparece para o cliente)</label>
            <input {...campo('descricao')} maxLength={120} placeholder="Ex.: Parceria com a @mariaestrelas" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={salvando} className="btn btn-primary text-sm">
            {salvando ? 'Salvando…' : 'Criar cupom'}
          </button>
        </div>
      </form>

      {aviso && (
        <p
          role={aviso.tipo === 'erro' ? 'alert' : 'status'}
          className={`rounded-xl border px-4 py-3 text-sm ${
            aviso.tipo === 'erro' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {lista === null ? (
        <p className="text-sm text-ivory/50">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-ivory/50">Nenhum cupom ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[0.03] text-left text-xs text-ivory/50">
              <tr>
                <th className="px-4 py-3 font-normal">Cupom</th>
                <th className="px-4 py-3 font-normal">Desconto</th>
                <th className="px-4 py-3 font-normal">Validade</th>
                <th className="px-4 py-3 font-normal">Usos</th>
                <th className="px-4 py-3 text-right font-normal">Vendeu</th>
                <th className="px-4 py-3 text-right font-normal">Descontou</th>
                <th className="px-4 py-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.codigo} className="border-t border-white/6">
                  <td className="px-4 py-3">
                    <p className="font-mono text-ivory">{c.codigo}</p>
                    {c.descricao && <p className="text-xs text-ivory/45">{c.descricao}</p>}
                    {!c.ativo && <span className="mt-1 inline-block rounded-full border border-white/15 px-2 text-[11px] text-ivory/50">pausado</span>}
                  </td>
                  <td className="px-4 py-3 text-ivory/85">{c.tipo === 'percentual' ? `${c.valor}%` : brl(c.valor)}</td>
                  <td className="px-4 py-3 text-xs text-ivory/60">
                    {c.valido_de ? dataCurta(c.valido_de) : 'já'} → {c.valido_ate ? dataCurta(c.valido_ate) : 'sem fim'}
                  </td>
                  <td className="px-4 py-3 text-ivory/85">
                    {c.usos}
                    {c.max_usos ? ` / ${c.max_usos}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-ivory/85">{brl(c.receitaCentavos)}</td>
                  <td className="px-4 py-3 text-right text-ivory/60">{brl(c.descontoCentavos)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        title={linkDe(c.codigo)}
                        onClick={() => copiarLink(c.codigo)}
                        className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-gold hover:text-gold"
                      >
                        {copiado === c.codigo ? 'Link copiado ✓' : 'Copiar link'}
                      </button>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() =>
                          salvar({
                            ...c,
                            valor: c.tipo === 'valor' ? c.valor / 100 : c.valor,
                            ativo: !c.ativo,
                          })
                        }
                        className="rounded-full border border-white/15 px-3 py-1 text-xs hover:border-gold hover:text-gold"
                      >
                        {c.ativo ? 'Pausar' : 'Reativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
