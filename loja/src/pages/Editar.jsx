import { useState } from 'react'
import { Link } from '../lib/Link.jsx'
import { navegar } from '../lib/rota.js'
import { Reveal } from '../components/Reveal.jsx'

/** Mesmo formato que o `page-auth` aceita (`RE_CODIGO` lá no servidor). */
const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/**
 * Acesso do cliente à edição — rota `/editar`.
 *
 * O endereço da edição é `/p/SG-XXXX-XXXX/editar`, mas quem comprou não
 * precisa decorar: esta tela recebe o CÓDIGO (o mesmo do e-mail da compra,
 * do certificado e do rastreio) e leva a pessoa para o login de edição —
 * que é o `EdicaoPagina`, já com o código na URL, pedindo o e-mail e
 * cuidando do token.
 *
 * Papel na arquitetura: rota `/editar` em `loja/src/App.jsx`, link do
 * rodapé em toda a loja e saída da compra. Não fala com servidor nenhum:
 * a validação do formato é a mesma do `page-auth`, aplicada aqui só para
 * poupar uma ida à Edge Function com um endereço malformado.
 *
 * Invariantes: o código sai em MAIÚSCULAS, como o servidor normaliza na
 * ponta; e o `localStorage` de "último pedido" (gravado no checkout)
 * pré-preenche o campo quando existe — quem acabou de comprar não digita
 * nada, só confirma.
 */
export default function Editar() {
  const [codigo, setCodigo] = useState(() => lerUltimoCodigo())
  const [erro, setErro] = useState('')

  function continuar(evento) {
    evento.preventDefault()
    const limpo = codigo.trim().toUpperCase()

    if (!RE_CODIGO.test(limpo)) {
      setErro('O código tem o formato SG-XXXX-XXXX — está no e-mail da compra.')
      return
    }

    setErro('')
    // A edição em si (e-mail + token) é o `EdicaoPagina`, que já vive em
    // `/p/:code/editar`: aqui só resolvemos o código e passamos adiante.
    navegar(`/p/${limpo}/editar`)
  }

  return (
    <div className="espaco-secao">
      <div className="pilha max-w-xl">
        <Reveal>
          <h1 className="font-display text-center text-3xl text-ivory sm:text-4xl">
            Acessar minha página
          </h1>
          <p className="mt-4 text-center leading-relaxed text-ivory/70">
            Todo certificado tem uma página própria. Com o código da compra você entra nela e
            ajusta a carta, a assinatura e a mensagem pessoal.
          </p>
        </Reveal>

        <Reveal delay={140}>
          <form onSubmit={continuar} className="cartao mt-10">
            <label htmlFor="codigo-edicao" className="rotulo">
              Código da página
            </label>
            {/* Mesmo comportamento do rastreio: código costuma vir copiado
                do e-mail — sem corretor, em maiúsculas. */}
            <input
              id="codigo-edicao"
              className="campo font-mono uppercase"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              placeholder="SG-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              required
            />

            {erro && (
              <p
                role="alert"
                className="animate-fade-in mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {erro}
              </p>
            )}

            <button type="submit" className="btn btn-primary mt-6 w-full">
              Continuar
            </button>

            <p className="mt-4 text-center text-xs leading-relaxed text-ivory/45">
              No próximo passo você confirma o e-mail da compra — só assim a página abre.
            </p>
          </form>
        </Reveal>

        <p className="mt-8 text-center text-sm text-ivory/50">
          Não sabe o código?{' '}
          <Link para="/rastrear" className="text-gold transition hover:underline">
            Rastreie o pedido
          </Link>{' '}
          ou{' '}
          <a href="mailto:contato@stargeo.com" className="text-gold transition hover:underline">
            fale com a gente
          </a>
          .
        </p>
      </div>
    </div>
  )
}

/**
 * Código do último pedido feito NESTE navegador, se houver.
 *
 * O checkout grava `stargeo:ultimo-pedido` antes de sair para o Mercado
 * Pago (o mesmo registro que a página de obrigado lê). É um conforto, não
 * uma dependência: storage bloqueado ou compra de outro aparelho deixam o
 * campo em branco, e a pessoa digita.
 */
function lerUltimoCodigo() {
  try {
    const guardado = JSON.parse(localStorage.getItem('stargeo:ultimo-pedido'))
    return guardado?.code ?? ''
  } catch {
    return ''
  }
}
