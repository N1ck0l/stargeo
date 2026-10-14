import { useState } from 'react'
import { rastrear, ErroApi } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'
import { Reveal } from '../components/Reveal.jsx'

/**
 * Rastreamento por código + e-mail.
 *
 * Os dois campos são obrigatórios porque o código sozinho não protege nada:
 * `SG-AB3K-9ZXM` tem cerca de 40 bits de entropia, e um script de força bruta
 * testaria todas as combinações em minutos num computador comum. Quem tivesse
 * o código veria o nome de quem recebeu o presente — que não é o cliente.
 *
 * Papel na arquitetura: rota `/rastrear` (`loja/src/App.jsx`), export
 * default, e a saída de toda tela de pós-compra — quem não achou o pedido
 * no navegador vem para cá. A consulta é `rastrear` de `lib/api.js`, sempre
 * POST, porque código e e-mail não podem virar parâmetro de URL.
 *
 * Invariantes: os DOIS campos são obrigatórios, e o servidor (`track-order`)
 * também exige; a resposta é a mesma para "código inexistente" e "e-mail
 * errado" — a tela não pode virar um oráculo para adivinhar códigos.
 */
export default function Rastrear() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [pedido, setPedido] = useState(null)
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)

  /**
   * Consulta e mostra a ficha.
   *
   * `rastrear` devolve a falha como `ErroApi`, com a mensagem que o servidor
   * escolheu — exibir essa mensagem é seguro porque ela nunca diz qual dos
   * dois campos estava errado. O que NÃO é `ErroApi` (rede fora do ar,
   * resposta sem JSON) vira o texto genérico do `catch`.
   */
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
        <Reveal>
          <h1 className="font-display text-center text-3xl text-ivory sm:text-4xl">Rastrear pedido</h1>
          <p className="mt-4 text-center leading-relaxed text-ivory/70">
            O código veio no e-mail da compra. Sem ele, não conseguimos encontrar o pedido.
          </p>
        </Reveal>

        <Reveal delay={140}>
          <form onSubmit={consultar} className="cartao mt-10">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="codigo" className="rotulo">
                  Código do pedido
                </label>
                {/* O código costuma vir copiado do e-mail: sem corretor, sem
                    autocompletar, e em maiúsculas — o servidor normaliza, mas
                    não há motivo para deixar a caixa errar. */}
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
              <p
                role="alert"
                className="animate-fade-in mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {erro}
              </p>
            )}

            <button type="submit" className="btn btn-primary mt-6 w-full" disabled={buscando}>
              {buscando ? 'Consultando…' : 'Consultar pedido'}
            </button>
          </form>
        </Reveal>

        {pedido && <Resultado pedido={pedido} />}

        <p className="mt-8 text-center text-sm text-ivory/50">
          Não achou o código?{' '}
          <a href="mailto:nickolasfelipe225@gmail.com" className="text-gold hover:underline">
            Fale com a gente
          </a>{' '}
          e a gente acha para você.
        </p>
      </div>
    </div>
  )
}

/**
 * Ficha do pedido encontrado.
 *
 * `aria-live="polite"` porque o resultado nasce DEPOIS do clique: sem o
 * anúncio, quem usa leitor de tela não sabe que a consulta respondeu.
 * Os rótulos em português (`statusLabel`) vêm do servidor — é ele que
 * conhece os status do Mercado Pago, e a tela não deve repetir a lista.
 */
function Resultado({ pedido }) {
  // "Pendente" aqui significa "ainda não dá para garantir a entrega" —
  // qualquer status que não seja aprovado/análise pinta de âmbar.
  const pendente = pedido.status !== 'approved' && pedido.status !== 'in_process'

  return (
    <section aria-live="polite" className="cartao animate-fade-in mt-8">
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

      {/*
        O valor chega em centavos inteiros (`amount_cents`); formatar aqui,
        em vez de guardar "R$ 49,00" no banco, evita vírgula errada e valor
        quebrado por arredondamento. A data também é formatada no fuso de
        quem olha, não no UTC do servidor.
      */}
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
