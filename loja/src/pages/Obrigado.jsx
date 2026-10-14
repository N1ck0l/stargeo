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
  // Código da página dedicada, quando o webhook já a criou.
  const [pagina, setPagina] = useState(null)

  useEffect(() => {
    let cancelado = false

    /*
     * A decisão vem do servidor, nunca do status que o Mercado Pago põe na
     * URL. E o webhook pode ainda não ter rodado: o Pix cai em segundos, o
     * cartão leva um instante, e a página dedicada nasce logo depois do
     * pagamento. Consulta a cada 4 s por até um minuto, parando na resposta
     * final — pago COM a página pronta, ou recusado.
     */
    let tentativas = 0
    let timer
    const consultar = async () => {
      tentativas += 1
      try {
        const { pedido } = await rastrearUltimo()
        if (cancelado) return
        const novo = descrever(pedido)
        setEstado(novo)
        setPagina(pedido.pagina ?? null)
        const final = novo === 'recusado' || (novo === 'aprovado' && pedido.pagina)
        if (!final && tentativas < 15) timer = setTimeout(consultar, 4000)
      } catch {
        if (!cancelado) setEstado('sem-dados')
      }
    }
    consultar()

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
        {estado === 'aprovado' && <Aprovado pagina={pagina} />}
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
 * Traduz o pedido em um dos estados da tela.
 *
 * Só `approved` é "aprovado". `in_process` é Pix ou cartão AINDA em análise —
 * antes ele aparecia como aprovado, e a pessoa ficava esperando um e-mail que
 * só sai depois da confirmação. `pending` (webhook atrasado, boleto que não
 * compensou) também é espera normal, não erro.
 *
 * O status que o Mercado Pago põe na URL não entra: ele chega antes do
 * webhook e é um parâmetro que o próprio navegador manda — não pode jogar
 * ninguém em "recusado" nem em "aprovado".
 */
function descrever(pedido) {
  if (pedido.status === 'approved') return 'aprovado'
  if (pedido.status === 'rejected' || pedido.status === 'cancelled') return 'recusado'
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

/**
 * Pago. Com a página dedicada pronta, ela é o caminho principal: lá está a
 * folha, o PDF para baixar na hora e o link para mandar a quem recebe — sem
 * depender do e-mail chegar.
 */
function Aprovado({ pagina }) {
  return (
    <div className="text-center">
      <Icone tipo="check" />
      <h1 className="font-display mt-6 text-3xl text-ivory">Pagamento aprovado</h1>
      {pagina ? (
        <p className="mt-4 leading-relaxed text-ivory/70">
          A página da sua estrela está pronta. Lá você vê o certificado, baixa o PDF agora mesmo e
          pega o link para enviar a quem vai receber. Uma cópia também segue para o seu e-mail.
        </p>
      ) : (
        <p className="mt-4 leading-relaxed text-ivory/70" aria-live="polite">
          Estamos montando o certificado e a página da sua estrela — leva poucos segundos. Esta
          tela atualiza sozinha.
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {pagina ? (
          <Link para={`/p/${pagina}`} className="btn btn-primary">
            Abrir a página da estrela
          </Link>
        ) : (
          <Link para="/rastrear" className="btn btn-primary">
            Rastrear meu pedido
          </Link>
        )}
        <Link para="/" className="btn btn-secundario">
          Voltar à loja
        </Link>
      </div>
      <p className="mt-6 text-sm text-ivory/50">
        O e-mail não chegou? Veja a caixa de spam e confira se o endereço é o mesmo da compra.
      </p>
    </div>
  )
}

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
