import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { dataCurta, tratarErro } from './formatos.js'

/**
 * Aba Depoimentos — a fila de aprovação.
 *
 * Todo depoimento vem de uma página de pedido pago (função `testimonial`) e
 * só vai para a home depois de aprovado aqui. Aprovar exige a autorização de
 * publicação que o comprador marcou; recusar tira da home na hora.
 */
const FILTROS = [
  ['pendente', 'Pendentes'],
  ['aprovado', 'Aprovados'],
  ['recusado', 'Recusados'],
]

export function Depoimentos({ aoExpirar }) {
  const [status, setStatus] = useState('pendente')
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [decidindo, setDecidindo] = useState(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    chamarAdmin('depoimentos', { status })
      .then((r) => {
        if (!vivo) return
        setLista(r.depoimentos ?? [])
        setErro('')
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (vivo && mensagem) setErro(mensagem)
      })
    return () => {
      vivo = false
    }
  }, [status, versao, aoExpirar])

  async function decidir(id, novo) {
    setDecidindo(id)
    try {
      await chamarAdmin('depoimentoDecidir', { id, status: novo })
      setVersao((v) => v + 1)
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setErro(mensagem)
    } finally {
      setDecidindo(null)
    }
  }

  return (
    <div>
      <div role="group" aria-label="Filtrar depoimentos" className="flex flex-wrap gap-2">
        {FILTROS.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setLista(null)
              setStatus(id)
            }}
            aria-pressed={status === id}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              status === id ? 'border-gold/70 bg-gold/15 text-gold' : 'border-white/12 text-ivory/70 hover:border-white/30'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erro}
        </p>
      )}

      {lista === null ? (
        <p className="mt-6 text-sm text-ivory/50">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="mt-6 text-sm text-ivory/50">Nenhum depoimento aqui.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {lista.map((d) => (
            <li key={d.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <blockquote className="font-serif text-base leading-relaxed text-ivory/90">“{d.texto}”</blockquote>
              <p className="mt-3 text-sm text-gold/85">
                {d.nome_exibicao}
                {d.cidade ? ` · ${d.cidade}` : ''}
              </p>
              <p className="mt-1 text-xs text-ivory/45">
                Pedido {d.orders?.code ?? '—'} · enviado em {dataCurta(d.updated_at ?? d.created_at)}
                {d.autoriza_publicar ? ' · autorizou publicar' : ' · NÃO autorizou publicar'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {d.status !== 'aprovado' && (
                  <button
                    type="button"
                    disabled={decidindo === d.id || !d.autoriza_publicar}
                    onClick={() => decidir(d.id, 'aprovado')}
                    className="btn btn-primary text-sm"
                  >
                    Aprovar e publicar
                  </button>
                )}
                {d.status !== 'recusado' && (
                  <button
                    type="button"
                    disabled={decidindo === d.id}
                    onClick={() => decidir(d.id, 'recusado')}
                    className="btn btn-secundario text-sm"
                  >
                    {d.status === 'aprovado' ? 'Tirar do site' : 'Recusar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
