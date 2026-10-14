import { useEffect, useState } from 'react'
import { rastrear, ErroApi } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'

/**
 * Página de retorno do pagamento.
 *
 * O Mercado Pago manda a pessoa para cá depois de pagar. Ela chega sem
 * nenhuma informação no corpo — o código do pedido não vai na URL, justamente
 * para não vazar no histórico e no `Referer`.
 *
 * O que a tela faz, em ordem:
 *
 * 1. Pede o código ao servidor, que consulta o Mercado Pago pelo
 *    `payment_id` guardado no pedido.
 * 2. Explica o estado real: pagou, ainda não, ou recusado.
 *
 * O caso "pagou mas o PDF ainda está sendo gerado" é o mais comum e o que mais
 * assusta quando mal explicado. Dizer isso com clareza evita o e-mail de
 * "cadê meu produto" que chega trinta segundos depois.
 *
 * Papel na arquitetura: rota `/obrigado` em `loja/src/App.jsx`, export
 * default. A consulta usa `rastrear` de `lib/api.js` — o mesmo caminho de
 * `/rastrear`, então os dois telas nunca discordam sobre um pedido.
 *
 * Invariantes: o estado mostrado vem do SERVIDOR; o parâmetro da URL é só
 * leitura de contexto, nunca decisão. Nada do pedido aparece na URL ou na
 * tela antes da confirmação do servidor. E toda tela tem saída: link para o
 * rastreamento ou para a home.
 */
export default function Obrigado() {
  const [estado, setEstado] = useState('consultando')

  useEffect(() => {
    let cancelado = false

    // O Mercado Pago manda o status no fragmento da URL ou em query, conforme
    // a versão. Os dois são lidos; nenhum deles é confiável o bastante para
    // decidir o que mostrar — a decisão vem do servidor.
    const params = new URLSearchParams(window.location.search)
    const status = params.get('collection_status') ?? params.get('status') ?? ''

    const consultar = async () => {
      try {
        const { pedido } = await rastrearUltimo()
        if (cancelado) return
        setEstado(descrever(pedido, status))
      } catch {
        if (!cancelado) setEstado('sem-dados')
      }
    }

    // O webhook pode ainda não ter rodado: o Pix cai em segundos, mas o
    // cartão leva um instante. Duas tentativas com espera resolvem a maioria.
    consultar()
    const timer = setTimeout(consultar, 4000)

    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="espaco-secao">
      {/*
        A chave por estado faz a tela nova nascer junto com a animação: sem
        ela, o React reaproveita a árvore e o `fade-in` não dispara na troca
        de "confirmando" para "aprovado".
      */}
      <div key={estado} className="animate-fade-in pilha max-w-xl">
        {estado === 'consultando' && <Consultando />}
        {estado === 'aprovado' && <Aprovado />}
        {estado === 'processando' && <Processando />}
        {estado === 'recusado' && <Recusado />}
        {estado === 'sem-dados' && <SemDados />}
      </div>
    </div>
  )
}

/**
 * Descobre o pedido mais recente deste navegador.
 *
 * O código fica em `localStorage` no momento em que o checkout é criado, no
 * navegador de quem comprou. É o único jeito de achar o pedido ao voltar do
 * gateway sem expor nada na URL. Se o storage estiver bloqueado (navegação
 * privada em alguns navegadores), a tela cai no estado "sem dados" — que
 * manda a pessoa para o rastreamento, e funciona.
 */
async function rastrearUltimo() {
  // A chave nova primeiro; a antiga (pré-rename) só na leitura, para pedido
  // feito no navegador da marca antiga continuar aparecendo aqui.
  const guardado =
    localStorage.getItem('stellara:ultimo-pedido') ??
    localStorage.getItem('stargeo:ultimo-pedido')

  if (!guardado) throw new ErroApi('sem_codigo', 'Nenhum pedido guardado neste navegador.')

  let codigo
  let email
  try {
    const dados = JSON.parse(guardado)
    codigo = dados.code
    email = dados.email
  } catch {
    throw new ErroApi('guardado_invalido', 'Não foi possível ler o pedido guardado.')
  }

  return rastrear({ code: codigo, email })
}

/**
 * Traduz o pedido (mais o status que a URL trouxe, no máximo) em um dos
 * cinco estados da tela.
 *
 * A ordem das verificações importa: `approved`/`in_process` vêm primeiro,
 * porque "está pago" é a resposta que a pessoa quer ouvir e não pode ser
 * sobrescrita por mais nada.
 *
 * O `statusUrl` é lido, mas não decide sozinho: com o pedido ainda `pending` no
 * servidor, tanto o webhook que atrasou quanto o boleto que ainda não
 * compensou caem em "processando" — é espera normal, não erro. Por isso as
 * duas saídas do fim são idênticas; o que não pode acontecer é o pedido
 * cair em "recusado" por causa de um parâmetro que o próprio navegador
 * manda e ninguém autentica.
 */
function descrever(pedido, statusUrl) {
  if (pedido.status === 'approved' || pedido.status === 'in_process') return 'aprovado'
  if (pedido.status === 'rejected' || pedido.status === 'cancelled') return 'recusado'

  // `pending` com a URL dizendo que o gateway aprovou significa que o
  // webhook ainda não chegou. É a espera normal, não um erro.
  if (statusUrl === 'approved') return 'processando'
  return 'processando'
}

/** Espera curta com `aria-live`: se a consulta demorar, o leitor de tela anuncia em vez de ficar em silêncio. */
function Consultando() {
  return (
    <div className="text-center" aria-live="polite">
      <span
        className="animar-girar mx-auto block size-10 rounded-full border-2 border-gold/25 border-t-gold"
        aria-hidden="true"
      />
      <h1 className="font-display mt-6 text-2xl text-ivory">Confirmando seu pagamento</h1>
      <p className="mt-3 text-ivory/70">Leva só alguns segundos.</p>
    </div>
  )
}

/** Dinheiro aceito. A promessa é de prazo ("minutos"), não de instante — é o que o webhook de geração cumpre. */
function Aprovado() {
  return (
    <div className="text-center">
      <Icone tipo="check" />
      <h1 className="font-display mt-6 text-3xl text-ivory">Pagamento aprovado</h1>
      <p className="mt-4 leading-relaxed text-ivory/70">
        Já estamos montando o seu certificado. Ele chega no seu e-mail em instantes — normalmente
        menos de um minuto com Pix.
      </p>
      <p className="mt-4 text-sm text-ivory/50">
        Não chegou? Verifique a caixa de spam e confira se o e-mail digitado é o mesmo da compra.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link para="/rastrear" className="btn btn-primary">
          Rastrear meu pedido
        </Link>
        <Link para="/" className="btn btn-secundario">
          Voltar à loja
        </Link>
      </div>
    </div>
  )
}

/** Ainda `pending` no servidor. Só aparece para quem acabou de pagar, e por isso o texto é de espera, não de problema. */
function Processando() {
  return (
    <div className="text-center">
      <Icone tipo="relogio" />
      <h1 className="font-display mt-6 text-3xl text-ivory">Pagamento em análise</h1>
      <p className="mt-4 leading-relaxed text-ivory/70">
        O Pix e o cartão são confirmados em segundos. Assim que cair, o certificado é gerado
        automaticamente e enviado para o seu e-mail.
      </p>
      <p className="mt-4 text-sm text-ivory/50">
        Se for boleto, a confirmação leva até 3 dias úteis.
      </p>
      <Link para="/rastrear" className="btn btn-primary mt-8">
        Rastrear meu pedido
      </Link>
    </div>
  )
}

/** Recusado ou cancelado. A primeira linha ("Nada foi cobrado") é a pergunta que vem antes de qualquer outra. */
function Recusado() {
  return (
    <div className="text-center">
      <Icone tipo="x" />
      <h1 className="font-display mt-6 text-3xl text-ivory">Pagamento não aprovado</h1>
      <p className="mt-4 leading-relaxed text-ivory/70">
        Nada foi cobrado. Pode ser cartão sem saldo, dados incorretos ou recusa do banco.
      </p>
      <Link para="/" className="btn btn-primary mt-8">
        Tentar de novo
      </Link>
    </div>
  )
}

/**
 * Sem código guardado neste navegador: compra feita no celular e voltada no
 * computador, ou navegação privada. Não é erro — é o caminho normal para o
 * rastreamento manual.
 */
function SemDados() {
  return (
    <div className="text-center">
      <Icone tipo="info" />
      <h1 className="font-display mt-6 text-2xl text-ivory">Não achamos este pedido aqui</h1>
      <p className="mt-4 leading-relaxed text-ivory/70">
        Isso acontece quando a compra foi feita em outro navegador ou aparelho. Com o código e o
        e-mail da compra, a gente encontra em qualquer lugar.
      </p>
      <Link para="/rastrear" className="btn btn-primary mt-8">
        Rastrear pelo código
      </Link>
    </div>
  )
}

/**
 * Ícone do estado, num dicionário de caminho + cor em vez de um `if` por
 * tela. A cor NUNCA é o único sinal: cada ícone está ao lado de um título
 * em texto, para quem não distingue vermelho de verde.
 */
function Icone({ tipo }) {
  const caminhos = {
    check: <path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />,
    x: <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />,
    relogio: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
    info: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 11v5M12 8v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  }
  const cores = {
    check: 'text-emerald-300',
    x: 'text-red-300',
    relogio: 'text-amber-300',
    info: 'text-gold',
  }
  return (
    <span
      className={`animate-seal mx-auto flex size-16 items-center justify-center rounded-full border border-current/25 bg-white/5 ${cores[tipo]}`}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
        {caminhos[tipo]}
      </svg>
    </span>
  )
}
