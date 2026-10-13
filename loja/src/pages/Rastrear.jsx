import { useState } from 'react'
import { rastrear, ErroApi } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'

/**
 * Rastreamento por código + e-mail.
 *
 * Os dois campos são obrigatórios porque o código sozinho não protege nada:
 * `SG-AB3K-9ZXM` tem cerca de 40 bits de entropia, e um script de força bruta
 * testaria todas as combinações em minutos num computador comum. Quem tivesse
 * o código veria o nome de quem recebeu o presente — que não é o cliente.
 */
export default function Rastrear() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [pedido, setPedido] = useState(null)
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)

  async function consultar(evento) {
    evento.preventDefault()
    setErro('')
    setPedido(null)
    setBuscando(true)

    try {
      const resposta = await rastrear({ code, email })
      setPedido(resposta.pedido)
    } catch (falha) {
      setErro(falha instanceof ErroApi ? falha.message : 'Não foi possível consultar agora.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="espaco-secao">
      <div className="pilha max-w-2xl">
        <h1 className="font-display text-center text-3xl text-ivory sm:text-4xl">Rastrear pedido</h1>
        <p className="mt-4 text-center leading-relaxed text-ivory/70">
          O código veio no e-mail da compra. Sem ele, não conseguimos encontrar o pedido.
        </p>

        <form onSubmit={consultar} className="cartao mt-10">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="codigo" className="rotulo">
                Código do pedido
              </label>
              <input
                id="codigo"
                className="campo font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SG-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>

            <div>
              <label htmlFor="email-rastreio" className="rotulo">
                E-mail da compra
              </label>
              <input
                id="email-rastreio"
                type="email"
                className="campo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="o e-mail que você usou"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {erro && (
            <p role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {erro}
            </p>
          )}

          <button type="submit" className="btn btn-primary mt-6 w-full" disabled={buscando}>
            {buscando ? 'Consultando…' : 'Consultar pedido'}
          </button>
        </form>

        {pedido && <Resultado pedido={pedido} />}

        <p className="mt-8 text-center text-sm text-ivory/50">
          Não achou o código?{' '}
          <a href="mailto:contato@stargeo.com.br" className="text-gold hover:underline">
            Fale com a gente
          </a>{' '}
          e a gente acha para você.
        </p>
      </div>
    </div>
  )
}

function Resultado({ pedido }) {
  const pendente = pedido.status !== 'approved' && pedido.status !== 'in_process'

  return (
    <section aria-live="polite" className="cartao mt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-xs tracking-[0.2em] text-gold uppercase">Pedido</p>
          <p className="mt-1 font-mono text-lg text-ivory">{pedido.code}</p>
        </div>
        <span
          className={`rounded-full px-4 py-1.5 text-xs ${
            pendente
              ? 'bg-amber-400/15 text-amber-200'
              : 'bg-emerald-400/15 text-emerald-200'
          }`}
        >
          {pedido.statusLabel}
        </span>
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {[
          ['Produto', pedido.produto],
          ['Estrela', pedido.estrela],
          ['Constelação', pedido.constelacao],
          ['Dedicada a', pedido.paraQuem],
          ['Valor', (pedido.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
          ['Feito em', new Date(pedido.criadoEm).toLocaleDateString('pt-BR')],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex justify-between gap-4 border-b border-white/8 pb-2">
            <dt className="text-ivory/50">{rotulo}</dt>
            <dd className="text-right text-ivory/90">{valor}</dd>
          </div>
        ))}
      </dl>

      {/*
        A pendência aparece quando o pedido foi pago mas algo travou — quase
        sempre o envio do e-mail. A pessoa precisa saber que o dinheiro foi
        aceito e que o certificado ainda está sendo gerado, em vez de ver um
        status vermelho e achar que perdeu o presente.
      */}
      {pedido.pendencia && (
        <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          O pagamento foi recebido e já estamos cuidando da entrega. Se o e-mail não chegar em
          meia hora, fale com a gente quoting <strong>{pedido.code}</strong>.
        </p>
      )}

      {!pendente && !pedido.pendencia && pedido.entregueEm && (
        <p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          Certificado enviado em {new Date(pedido.entregueEm).toLocaleString('pt-BR')}. O link do
          e-mail vale por 30 dias — se fechar, a gente manda outro.
        </p>
      )}

      <Link para="/" className="btn btn-secundario mt-6 w-full">
        Comprar outro certificado
      </Link>
    </section>
  )
}
