import { useState } from 'react'
import { explicarErros, validarPedido } from '../../../shared/moderation.js'
import { chamarAdmin } from '../lib/admin.js'
import { tratarErro } from './formatos.js'

/**
 * "Corrigir texto" de um pedido pago (ação `corrigirPedido` do `admin-api`).
 *
 * Muda o que vai IMPRESSO — nome de quem recebe, nome dado à estrela,
 * assinatura, mensagem —, refaz os dois PDFs e, se marcado, reenvia o
 * e-mail. A página do presente acompanha o nome e a assinatura. É a promessa
 * da política: "errou o nome? a gente corrige, sem custo".
 */
const CAMPOS = [
  ['honoree_name', 'Nome de quem recebe', 80],
  ['star_nickname', 'Nome dado à estrela (vazio: nenhum)', 40],
  ['from_name', 'Assinatura', 60],
  ['message', 'Mensagem no certificado', 600],
]

export function CorrigirPedido({ pedido, aoExpirar, aoConcluir, aoCancelar }) {
  const [textos, setTextos] = useState(pedido.textos ?? {})
  const [reenviar, setReenviar] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // A mesma régua do checkout, antes de ir ao servidor (que confere de novo).
  const validacao = validarPedido({
    honoreeName: textos.honoree_name,
    starNickname: textos.star_nickname,
    fromName: textos.from_name,
    message: textos.message,
    customerName: pedido.comprador || 'Comprador',
    customerEmail: pedido.email || 'a@b.co',
  })

  async function salvar(evento) {
    evento.preventDefault()
    if (!validacao.ok) {
      setErro(explicarErros(validacao.erros))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const r = await chamarAdmin('corrigirPedido', { orderId: pedido.id, ...textos, reenviar })
      aoConcluir(
        r.reenviado
          ? `Corrigido: certificado refeito e reenviado para ${r.para}.`
          : r.motivo
            ? `Corrigido e certificado refeito, mas o e-mail falhou: ${r.motivo}`
            : 'Corrigido: certificado refeito (os links antigos já abrem o novo).',
      )
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setErro(mensagem)
      setSalvando(false)
    }
  }

  const mudar = (campo) => (e) => setTextos((t) => ({ ...t, [campo]: e.target.value }))

  return (
    <form onSubmit={salvar} className="rounded-2xl border border-gold/25 bg-gold/[0.04] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(([campo, rotulo, max]) => {
          const id = `corrigir-${pedido.id}-${campo}`
          return (
            <div key={campo} className={campo === 'message' ? 'sm:col-span-2' : ''}>
              <label htmlFor={id} className="rotulo">
                {rotulo}
              </label>
              {campo === 'message' ? (
                <textarea id={id} className="campo" rows={3} maxLength={max} value={textos[campo] ?? ''} onChange={mudar(campo)} />
              ) : (
                <input id={id} className="campo" maxLength={max} value={textos[campo] ?? ''} onChange={mudar(campo)} />
              )}
            </div>
          )
        })}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ivory/70">
        <input type="checkbox" checked={reenviar} onChange={(e) => setReenviar(e.target.checked)} className="accent-[#d8b66a]" />
        Reenviar o e-mail com o certificado corrigido
      </label>
      {erro && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {erro}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className="btn btn-secundario text-sm">
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="btn btn-primary text-sm">
          {salvando ? 'Refazendo o certificado…' : 'Salvar e refazer o certificado'}
        </button>
      </div>
    </form>
  )
}
