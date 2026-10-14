import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { brl, classeStatus, dataCurta, rotuloStatus, tratarErro } from './formatos.js'

const POR_PAGINA = 100

/**
 * Aba Pedidos — busca, filtro, reenvio de e-mail e criação de página.
 *
 * Duas fontes numa tela só: os pedidos vêm do `pedidos` e o mapa
 * `order_id → code` do `paginas`, porque é cruzando as duas que a linha
 * descobre se já existe página (abrir) ou se ainda dá para criar.
 *
 * O carregamento reage a `filtro` (estado): os handlers trocam o filtro, o
 * efeito busca — assim o efeito só chama função importada e o `setState`
 * acontece na resposta, que é o padrão do resto do repo.
 */
export function Pedidos({ aoExpirar, aoAbrirPagina }) {
  const [filtro, setFiltro] = useState({ q: '', status: '', offset: 0 })
  const [pedidos, setPedidos] = useState([])
  const [total, setTotal] = useState(0)
  const [paginasPorPedido, setPaginasPorPedido] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(null) // { texto, tipo }
  const [busca, setBusca] = useState('') // texto do campo, sem disparar busca
  const [status, setStatus] = useState('')

  const [reenviando, setReenviando] = useState(null) // id do pedido em reenvio
  const [criando, setCriando] = useState(null) // id do pedido ganhando página

  useEffect(() => {
    let vivo = true
    Promise.all([
      chamarAdmin('pedidos', {
        q: filtro.q || undefined,
        status: filtro.status || undefined,
        limit: POR_PAGINA,
        offset: filtro.offset,
      }),
      // Toda recarga: barato, e serve para todas as linhas da tabela.
      chamarAdmin('paginas', { limit: 200 }),
    ])
      .then(([dados, listaPaginas]) => {
        if (!vivo) return
        const mapa = {}
        for (const pagina of listaPaginas.paginas ?? []) {
          if (pagina.order_id) mapa[pagina.order_id] = pagina.code
        }
        setPaginasPorPedido(mapa)
        setPedidos((anterior) => (filtro.offset === 0 ? dados.pedidos : [...anterior, ...dados.pedidos]))
        setTotal(dados.total ?? 0)
        setErro('')
        setCarregando(false)
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (!vivo) return
        if (mensagem) setErro(mensagem)
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [filtro, aoExpirar])

  function aoBuscar(evento) {
    evento.preventDefault()
    setCarregando(true)
    setFiltro({ q: busca.trim(), status, offset: 0 })
  }

  function aoTrocarStatus(novo) {
    setStatus(novo)
    setCarregando(true)
    setFiltro({ q: busca.trim(), status: novo, offset: 0 })
  }

  function aoCarregarMais() {
    setCarregando(true)
    setFiltro((anterior) => ({ ...anterior, offset: pedidos.length }))
  }

  /** Mesmo filtro de novo = nova leitura (usado após ações da linha). */
  function recarregar() {
    setCarregando(true)
    setFiltro((anterior) => ({ ...anterior }))
  }

  async function reenviar(pedido) {
    if (reenviando) return
    setReenviando(pedido.id)
    setAviso(null)
    setErro('')
    try {
      const resposta = await chamarAdmin('reenviarEmail', { orderId: pedido.id })
      setAviso({ texto: resposta?.mensagem ?? 'E-mail reenviado.', tipo: 'ok' })
      recarregar()
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setAviso({ texto: mensagem, tipo: 'erro' })
    } finally {
      setReenviando(null)
    }
  }

  async function criarPagina(pedido) {
    if (criando) return
    setCriando(pedido.id)
    setAviso(null)
    setErro('')
    try {
      const dados = await chamarAdmin('paginaCriar', { orderId: pedido.id })
      setAviso({ texto: `Página ${dados.pagina.code} criada.`, tipo: 'ok' })
      aoAbrirPagina(dados.pagina.code)
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setAviso({ texto: mensagem, tipo: 'erro' })
    } finally {
      setCriando(null)
    }
  }

  const restam = total - pedidos.length

  return (
    <div>
      <form onSubmit={aoBuscar} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="busca-pedidos" className="rotulo">
            Buscar pedido
          </label>
          <input
            id="busca-pedidos"
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Código, nome ou e-mail"
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="status-pedidos" className="rotulo">
            Status
          </label>
          <select
            id="status-pedidos"
            value={status}
            onChange={(evento) => aoTrocarStatus(evento.target.value)}
            className="campo"
          >
            <option value="">Todos</option>
            <option value="approved">Pago</option>
            <option value="pending">Aguardando</option>
            <option value="in_process">Em análise</option>
            <option value="rejected">Recusado</option>
            <option value="cancelled">Cancelado</option>
            <option value="refunded">Devolvido</option>
          </select>
        </div>
        <button type="submit" className="btn btn-secundario text-sm">
          Buscar
        </button>
      </form>

      {aviso && (
        <p
          role="status"
          className={`animate-fade-in mt-4 rounded-xl border px-4 py-3 text-sm ${
            aviso.tipo === 'ok'
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-400/40 bg-red-500/10 text-red-200'
          }`}
        >
          {aviso.texto}
        </p>
      )}
      {erro && (
        <p
          role="alert"
          className="animate-fade-in mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {erro}
        </p>
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/8">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/5 text-left text-xs tracking-wide text-ivory/50 uppercase">
              <th className="px-4 py-3 font-medium">Pedido</th>
              <th className="px-4 py-3 font-medium">Para quem</th>
              <th className="px-4 py-3 font-medium">Comprador</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Criado</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((pedido) => {
              const codigoPagina = paginasPorPedido[pedido.id]
              const podeCriar = pedido.status === 'approved' && !codigoPagina
              return (
                <tr key={pedido.id} className="border-b border-white/6 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-mono text-ivory">{pedido.code}</p>
                    {pedido.pendencia && (
                      <span className="mt-1 inline-block rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                        e-mail falhou
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ivory/85">{pedido.paraQuem}</td>
                  <td className="max-w-44 px-4 py-3">
                    <p className="truncate text-ivory/70">{pedido.comprador ?? '—'}</p>
                    <p className="truncate text-xs text-ivory/45">{pedido.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${classeStatus(pedido.status)}`}
                    >
                      {rotuloStatus(pedido.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-ivory/85">{brl(pedido.valorCentavos)}</td>
                  <td className="px-4 py-3 text-ivory/60">{dataCurta(pedido.criadoEm)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {codigoPagina && (
                        <button
                          type="button"
                          onClick={() => aoAbrirPagina(codigoPagina)}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:border-gold hover:text-gold"
                        >
                          Abrir página
                        </button>
                      )}
                      {podeCriar && (
                        <button
                          type="button"
                          onClick={() => criarPagina(pedido)}
                          disabled={criando !== null}
                          className="btn btn-primary px-3 py-1 text-xs"
                        >
                          {criando === pedido.id ? 'Criando…' : 'Criar página'}
                        </button>
                      )}
                      {pedido.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => reenviar(pedido)}
                          disabled={reenviando !== null}
                          className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:border-gold hover:text-gold disabled:opacity-50"
                        >
                          {reenviando === pedido.id ? 'Enviando…' : 'Reenviar e-mail'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {pedidos.length === 0 && !carregando && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ivory/50">
                  Nenhum pedido{filtro.q || filtro.status ? ' com esse filtro' : ''} ainda.
                </td>
              </tr>
            )}
            {carregando && pedidos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center">
                  <span className="inline-block h-6 w-6 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ivory/50">
        <span>
          {pedidos.length} de {total} pedido{total === 1 ? '' : 's'}
        </span>
        {restam > 0 && (
          <button
            type="button"
            onClick={aoCarregarMais}
            disabled={carregando}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs transition hover:border-gold hover:text-gold disabled:opacity-50"
          >
            Carregar mais ({restam} restantes)
          </button>
        )}
      </div>
    </div>
  )
}
