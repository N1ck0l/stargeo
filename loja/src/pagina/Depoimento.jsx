import { useEffect, useState } from 'react'
import { ErroApi } from '../lib/api.js'
import { enviarDepoimento, lerDepoimento } from '../lib/pagina.js'

/**
 * "Conte como foi" — o depoimento de quem comprou, dentro da edição.
 *
 * Só aparece para página de pedido pago (o servidor responde `disponivel`):
 * é o que garante que todo depoimento do site vem de uma compra real. Nada é
 * publicado sem a autorização marcada aqui E a aprovação no painel; a home
 * só mostra a seção quando existe um aprovado.
 */
export function Depoimento({ token }) {
  const [estado, setEstado] = useState('carregando') // carregando | indisponivel | pronto
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [texto, setTexto] = useState('')
  const [autoriza, setAutoriza] = useState(false)
  const [status, setStatus] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    lerDepoimento(token)
      .then((r) => {
        if (!vivo) return
        if (!r.disponivel) return setEstado('indisponivel')
        const d = r.depoimento
        if (d) {
          setNome(d.nome_exibicao ?? '')
          setCidade(d.cidade ?? '')
          setTexto(d.texto ?? '')
          setAutoriza(Boolean(d.autoriza_publicar))
          setStatus(d.status)
        }
        setEstado('pronto')
      })
      .catch(() => vivo && setEstado('indisponivel'))
    return () => {
      vivo = false
    }
  }, [token])

  if (estado !== 'pronto') return null

  async function aoEnviar(evento) {
    evento.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const r = await enviarDepoimento(token, { nome, cidade, texto, autorizaPublicar: autoriza })
      setStatus(r.depoimento?.status ?? 'pendente')
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível enviar agora. Tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={aoEnviar} className="cartao mt-6" aria-labelledby="depoimento-titulo">
      <h2 id="depoimento-titulo" className="font-display text-lg text-ivory">
        Conte como foi
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ivory/60">
        Como a pessoa reagiu ao receber? Se quiser, escreva algumas linhas — com a sua autorização, elas podem
        aparecer no site da Stellara. Nada é publicado sem passar por nós, e você pode reescrever quando quiser.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dep-nome" className="rotulo">
            Como quer aparecer
          </label>
          <input
            id="dep-nome"
            className="campo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={40}
            placeholder="Ex.: Ana P."
            required
          />
        </div>
        <div>
          <label htmlFor="dep-cidade" className="rotulo">
            Cidade (opcional)
          </label>
          <input
            id="dep-cidade"
            className="campo"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            maxLength={40}
            placeholder="Ex.: Recife"
          />
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor="dep-texto" className="rotulo">
          Seu depoimento
        </label>
        <textarea
          id="dep-texto"
          className="campo"
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={400}
          required
        />
        <p className="mt-1.5 text-right text-xs text-ivory/45">{texto.length}/400</p>
      </div>
      <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-sm text-ivory/70">
        <input
          type="checkbox"
          checked={autoriza}
          onChange={(e) => setAutoriza(e.target.checked)}
          className="mt-1 accent-[#d8b66a]"
        />
        Autorizo a Stellara a publicar este depoimento no site, com o nome e a cidade acima.
      </label>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erro}
        </p>
      )}
      {status && !erro && (
        <p role="status" className="mt-4 rounded-xl border border-white/10 px-4 py-3 text-sm text-ivory/70">
          {status === 'aprovado'
            ? 'Seu depoimento está publicado. Obrigado!'
            : status === 'recusado'
              ? 'Este depoimento não foi publicado. Se quiser, reescreva e envie de novo.'
              : 'Recebido! Ele aparece no site depois da nossa revisão.'}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <button type="submit" className="btn btn-secundario" disabled={enviando || !autoriza}>
          {enviando ? 'Enviando…' : status ? 'Enviar nova versão' : 'Enviar depoimento'}
        </button>
      </div>
    </form>
  )
}
