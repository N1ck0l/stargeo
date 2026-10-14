
import { useState } from 'react'
import { STARS, getStar } from '../../../shared/stars.js'
import { validarPedido, explicarErros } from '../../../shared/moderation.js'
import { CertificadoPreview } from '../components/CertificadoPreview.jsx'
import { Escala } from '../components/Escala.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { criarCheckout, ErroApi, irParaPagamento } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'

/**
 * Preços de exibição. O valor autoritativo é sempre lido do banco.
 *
 * Por enquanto só existe UM produto de verdade (o digital): slug fora desta
 * lista cai na tela "Certificado não encontrado" abaixo. Os outros níveis
 * ficam desligados no banco até virarem produto real — ver migration 0007.
 */
const PRODUTOS = {
  'certificado-digital': { nome: 'Certificado Digital', preco: 49 },
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Hoje, no fuso de quem está comprando, no formato que o `<input type="date">` entende (`YYYY-MM-DD`). */
function dataDeHoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * `YYYY-MM-DD` → "14 de outubro de 2026", para imprimir no certificado.
 *
 * A leitura é em UTC (`T00:00:00Z` + `getUTC*`) de propósito: `new Date(iso)`
 * interpretaria a meia-noite no fuso local, e para quem está a oeste de
 * Greenwich cairia no dia ANTERIOR — a pessoa escolheria 25 de dezembro e o
 * papel sairia com 24.
 */
function dataEmPortugues(iso) {
  if (!iso) return undefined
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/**
 * Página de produto: o configurador.
 *
 * O slug chega por prop, e não lido de `window`. Além de deixar o componente
 * testável, deixa cada um com uma responsabilidade só: o roteador descobre o
 * caminho, esta tela desenha o formulário.
 *
 * A peça central é a PRÉVIA. Ela atualiza a cada tecla e mostra o certificado
 * em A4, nas mesmas medidas do arquivo que será enviado. É isso que troca
 * "estou comprando um PDF" por "estou comprando este objeto".
 *
 * A validação roda no navegador, com a MESMA função que roda no servidor
 * (`shared/moderation.js`). Não é segurança — quem controla o navegador
 * desliga qualquer coisa — é para a pessoa não descobrir a regra só depois de
 * pagar. O servidor valida de novo.
 *
 * Papel na arquitetura: rota `/produto/:slug`, com o `slug` passado por prop
 * pelo roteador (`loja/src/App.jsx`). Export default `Produto`; importa
 * `CertificadoPreview` + `Escala` (a folha), `Reveal`, `shared/moderation.js`
 * (regra única) e `lib/api.js` (`criarCheckout` / `irParaPagamento`).
 *
 * Invariantes: o pedido só nasce DEPOIS de a validação passar — falhar aqui
 * não deixa pedido órfão no banco; a prévia tem de mostrar o mesmo que o PDF
 * final; e a saída é sempre o Mercado Pago (o checkout é um
 * `location.assign`, nunca um formulário de cartão dentro desta página).
 */
export default function Produto({ slug }) {
  const produto = PRODUTOS[slug]

  // A estrela pode vir pela URL: `/produto/...?estrela=sirius`, que é como a
  // home leva alguém direto ao produto com a estrela já escolhida.
  const estrelaInicial = new URLSearchParams(window.location.search).get('estrela')
  const [estrelaSlug, setEstrelaSlug] = useState(
    () => getStar(estrelaInicial)?.slug ?? STARS[0].slug,
  )
  const [paraQuem, setParaQuem] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [data, setData] = useState(dataDeHoje())
  const [versaoClara, setVersaoClara] = useState(false)

  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')

  // Quais campos a pessoa já visitou. Só eles mostram erro — reclamar do nome
  // vazio enquanto a pessoa ainda está digitando é a forma mais rápida de ela
  // fechar a aba.
  const [tocou, setTocou] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  /*
   * `getStar` é uma busca em `Map` — mais barata que comparar dependências de
   * hook. A validação abaixo também roda direto, pelo mesmo motivo.
   */
  const estrela = getStar(estrelaSlug)

  /*
   * A validação roda com a MESMA função do servidor (`shared/moderation.js`).
   * Não é segurança — quem controla o navegador desliga qualquer coisa — é
   * para ninguém descobrir a regra só depois de pagar. O servidor valida de
   * novo, e é valendo.
   *
   * Sem `useMemo` de propósito: `validarPedido` faz umas regex curtas em
   * cinco strings pequenas, a cada tecla. O custo de memorizar é maior que o
   * de recalcular, e guardar o resultado exigia lembrar de listar a dependência
   * certa — que é o tipo de coisa que passa em branco quando alguém edita o
   * formulário e esquece de atualizar a lista.
   */
  const validacao = validarPedido({
    honoreeName: paraQuem,
    fromName: assinatura,
    message: mensagem,
    customerName: nome,
    customerEmail: email,
  })

  /** Mensagem de erro do campo, nula enquanto a pessoa não tiver tocado nele. */
  const erroDe = (campo) => {
    if (!tocou[campo]) return null
    return validacao.erros.find((e) => e.campo === campo)?.motivo ?? null
  }

  /** Marca o campo como tocado. É idempotente: repetir devolve o mesmo objeto e não re-renderiza. */
  const marcarTocado = (campo) => setTocou((t) => (t[campo] ? t : { ...t, [campo]: true }))

  // Slug desconhecido: não existe página de "produto não encontrado" — este
  // aviso é a rota de saída, e ele só aparece DEPOIS dos hooks, porque
  // retornar antes deles quebraria a ordem das regras do React.
  if (!produto) {
    return (
      <div className="pilha espaco-secao text-center">
        <h1 className="font-display text-3xl text-ivory">Certificado não encontrado</h1>
        <p className="mt-3 text-ivory/70">O endereço que você abriu não existe mais.</p>
        <Link para="/" className="btn btn-primary mt-8">
          Ver os certificados
        </Link>
      </div>
    )
  }

  /**
   * Envia o formulário: valida, cria o pedido, guarda o código no navegador
   * e sai para o Mercado Pago.
   *
   * A ordem importa. Validar ANTES de `criarCheckout` para não criar pedido
   * que ninguém vai pagar; guardar o código ANTES de `irParaPagamento`,
   * porque depois do `location.assign` não há mais JS desta página rodando.
   */
  async function finalizar(evento) {
    evento.preventDefault()
    setErro('')

    // Validação local primeiro: evita gastar uma ida ao servidor (e criar um
    // pedido que ninguém vai pagar) quando dá para saber na hora.
    if (!validacao.ok) {
      setTocou({ honoreeName: true, fromName: true, message: true, customerName: true, customerEmail: true })
      setErro(explicarErros(validacao.erros))
      // Foco no primeiro campo inválido: sem isso, quem navega por teclado
      // ou leitor de tela continua no botão sem saber o que corrigir.
      const primeiro = document.querySelector('[aria-invalid="true"]')
      primeiro?.focus()
      return
    }

    setEnviando(true)
    try {
      const resposta = await criarCheckout({
        productSlug: slug,
        starSlug: estrelaSlug,
        honoreeName: paraQuem,
        fromName: assinatura || undefined,
        message: mensagem || undefined,
        dedicationDate: data || undefined,
        customerEmail: email,
        customerName: nome,
      })

      /*
       * Guarda o pedido no navegador para a página de obrigado.
       *
       * O código NÃO vai na URL: URL acaba em histórico, log de servidor e
       * header `Referer` da página seguinte. E o guardado local é best-effort —
       * em navegação privada ele pode não existir, e aí a página de obrigado
       * manda a pessoa para o rastreamento, que funciona do mesmo jeito.
       */
      try {
        localStorage.setItem(
          'stargeo:ultimo-pedido',
          JSON.stringify({ code: resposta.code, email }),
        )
      } catch {
        // Sem storage: o rastreamento pelo código continua disponível.
      }

      irParaPagamento(resposta.initPoint ?? resposta.sandboxInitPoint)
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível iniciar o pagamento. Verifique a conexão e tente de novo.',
      )
      setEnviando(false)
    }
  }

  return (
    <div className="espaco-secao">
      <form onSubmit={finalizar} className="pilha">
        <nav aria-label="Trilha" className="mb-8 text-sm text-ivory/50">
          <Link para="/" className="transition hover:text-gold">
            Início
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ivory/80">{produto.nome}</span>
        </nav>

        {/*
          Prévia em A4 PAISAGEM: 297 mm ≈ 1122 px de folha, então a coluna dela
          precisa de boa parte da largura da tela. O teto de 700 px evita que a
          folha domine a página e a coluna do formulário encolha demais — em
          1024 px de viewport, onde o grid ainda está ligado, `60%` deixa o
          formulário com ~350 px, que é o mínimo confortável.
        */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_min(700px,60%)]">
          {/* --- Formulário --------------------------------------------------
              No celular o formulário vem DEPOIS da prévia (`order-2`): quem
              compra pelo telefone precisa ver o certificado antes de
              começar a digitar. No desktop, os dois cabem lado a lado. */}
          <div className="order-2 space-y-8 lg:order-1">
            <Secao numero="1" titulo="Para quem é o certificado?">
              <Campo
                rotulo="Nome de quem recebe"
                obrigatorio
                value={paraQuem}
                onChange={setParaQuem}
                onBlur={() => marcarTocado('honoreeName')}
                erro={erroDe('honoreeName')}
                placeholder="Ex.: Geovanna Beatriz Santos Trindade"
                maxLength={80}
              />
              <p className="mt-2 text-xs text-ivory/50">
                Se o nome não couber em duas linhas, o corpo da letra diminui um pouco — nunca é
                cortado.
              </p>
            </Secao>

            <Secao numero="2" titulo="Qual estrela?">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {STARS.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => {
                      setEstrelaSlug(item.slug)
                      const params = new URLSearchParams(window.location.search)
                      params.set('estrela', item.slug)
                      // `replaceState` e não `push`: trocar de estrela não
                      // deve encher o histórico com o mesmo caminho — voltar
                      // tem que sair da página.
                      window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
                    }}
                    aria-pressed={item.slug === estrelaSlug}
                    className={`rounded-xl border p-3 text-left transition ${
                      item.slug === estrelaSlug
                        ? 'border-gold/70 bg-gold/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                    }`}
                  >
                    <span className="block font-serif text-sm leading-tight text-ivory">{item.name}</span>
                    <span className="mt-1 block text-[11px] text-gold/70">{item.bayer}</span>
                  </button>
                ))}
              </div>

              <div className="cartao mt-5">
                <h3 className="font-serif text-lg text-ivory">{estrela.name}</h3>
                <p className="mt-1 text-xs text-gold/80">
                  {estrela.bayer} · {estrela.constellation} · {estrela.distanceLy} anos-luz
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ivory/70">{estrela.story}</p>
              </div>
            </Secao>

            <Secao numero="3" titulo="Sua mensagem (opcional)">
              <Campo
                rotulo="Mensagem no certificado"
                value={mensagem}
                onChange={setMensagem}
                onBlur={() => marcarTocado('message')}
                erro={erroDe('message')}
                placeholder="Alguma frase com a sua letra, ou a dele."
                maxLength={600}
                multiline
                contador={{ atual: mensagem.length, max: 600 }}
              />

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo
                  rotulo="Data da dedicação"
                  type="date"
                  value={data}
                  onChange={setData}
                />
                <Campo
                  rotulo="Assinatura (opcional)"
                  value={assinatura}
                  onChange={setAssinatura}
                  onBlur={() => marcarTocado('fromName')}
                  erro={erroDe('fromName')}
                  placeholder="Com amor, sempre"
                  maxLength={60}
                />
              </div>
            </Secao>

            <Secao numero="4" titulo="Seus dados">
              <Campo
                rotulo="Seu nome"
                obrigatorio
                value={nome}
                onChange={setNome}
                onBlur={() => marcarTocado('customerName')}
                erro={erroDe('customerName')}
                placeholder="Quem está comprando"
                maxLength={120}
              />
              <div className="mt-4">
                <Campo
                  rotulo="Seu e-mail"
                  obrigatorio
                  type="email"
                  value={email}
                  onChange={setEmail}
                  onBlur={() => marcarTocado('customerEmail')}
                  erro={erroDe('customerEmail')}
                  placeholder="para enviar o certificado"
                  dica="É para cá que o certificado chega. Não pedimos CPF para emitir."
                />
              </div>
            </Secao>

            {erro && (
              <p
                role="alert"
                className="animate-fade-in rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {erro}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" className="btn btn-primary animate-pulse-glow" disabled={enviando}>
                {enviando ? 'Abrindo o pagamento…' : `Finalizar · R$ ${produto.preco}`}
              </button>
              <p className="text-xs text-ivory/45">
                Você paga no Mercado Pago, por Pix, cartão ou boleto.
              </p>
            </div>
          </div>

          {/* --- Prévia ------------------------------------------------------ */}
          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-24">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-sm tracking-[0.2em] text-gold uppercase">Prévia</h2>
                {/* Duas opções fixas com `aria-pressed`: é um rádio estilizado,
                    e a versão clara existe porque o PDF sai nas duas — a
                    clara gasta menos tinta de impressora. */}
                <div
                  className="flex rounded-full border border-white/15 p-0.5 text-xs"
                  role="group"
                  aria-label="Versão do certificado"
                >
                  {[
                    [false, 'Escura'],
                    [true, 'Clara'],
                  ].map(([valor, rotulo]) => (
                    <button
                      key={rotulo}
                      type="button"
                      onClick={() => setVersaoClara(valor)}
                      aria-pressed={versaoClara === valor}
                      className={`rounded-full px-3 py-1.5 transition ${
                        versaoClara === valor ? 'bg-gold text-night' : 'text-ivory/70 hover:text-ivory'
                      }`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>

              {/*
                A folha é A4 em milímetros, e o contêiner escala por
                `transform`. Dimensionar a folha em pixels fixos faria o
                certificado ficar ilegível no celular e gigante na tela grande —
                o `transform` mantém a proporção em qualquer largura.
              */}
              <div className="shimmer-border overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <Escala>
                  <CertificadoPreview
                    estrela={estrela}
                    honoreeName={paraQuem}
                    message={mensagem}
                    fromName={assinatura}
                    dedicationDate={dataEmPortugues(data)}
                    code="SG-XXXX-XXXX"
                    light={versaoClara}
                  />
                </Escala>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-ivory/45">
                A prévia usa as mesmas medidas e as mesmas fontes do PDF que você vai receber. O
                código de registro só é real depois da compra.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

/**
 * Seção numerada do formulário.
 *
 * Numerar e separar em quatro blocos é deliberado: um formulário comprido
 * parece mais trabalho do que é, e a pessoa que começa costuma terminar. A
 * revelação envolve o bloco inteiro — o comentário sobre isso está no JSX.
 */
function Secao({ numero, titulo, children }) {
  return (
    // A revelação envolve a seção inteira: o número, o título e o campo entram
    // juntos, como no site pessoal — e com movimento reduzido já nascem visíveis.
    <Reveal as="section">
      <h2 className="flex items-center gap-3 font-display text-lg text-ivory">
        <span className="flex size-7 items-center justify-center rounded-full border border-gold/50 text-xs text-gold">
          {numero}
        </span>
        {titulo}
      </h2>
      <div className="mt-5">{children}</div>
    </Reveal>
  )
}

/**
 * Campo com rótulo, erro e contagem.
 *
 * `onChange` recebe o VALOR, não o evento: `Campo` desembrulha o
 * SyntheticEvent antes de chamar quem passou a função. Sem isso, `onChange`
 *recebe o evento inteiro, o estado vira um objeto e a prévia quebra na hora
 * seguinte — que é exatamente o que os testes pegaram.
 *
 * O erro é ligado por `aria-describedby` e o campo marcado com
 * `aria-invalid` — cor sozinha não avisa quem não distingue vermelho, e a
 * cor nem existe para leitor de tela.
 */
function Campo({
  rotulo,
  obrigatorio,
  erro,
  dica,
  contador,
  multiline,
  onChange,
  ...props
}) {
  const id = `campo-${props.name ?? rotulo.toLowerCase().replace(/\W+/g, '-')}`
  const idErro = `${id}-erro`

  const Elemento = multiline ? 'textarea' : 'input'
  const extras = multiline ? { rows: 3 } : {}

  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
        {obrigatorio && <span className="ml-1 text-gold" aria-hidden="true">*</span>}
        {contador && (
          <span className="float-right font-normal normal-case text-ivory/40">
            {contador.atual}/{contador.max}
          </span>
        )}
      </label>

      <Elemento
        id={id}
        className="campo"
        {...extras}
        {...props}
        onChange={(evento) => onChange?.(evento.target.value)}
        required={obrigatorio}
        aria-invalid={erro ? 'true' : undefined}
        aria-describedby={erro ? idErro : undefined}
      />

      {erro && (
        <p id={idErro} className="mt-2 flex items-start gap-1.5 text-xs text-red-300">
          <svg width="14" height="14" viewBox="0 0 24 24" className="mt-px shrink-0" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v6M12 16v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {erro}
        </p>
      )}

      {!erro && dica && <p className="mt-2 text-xs text-ivory/50">{dica}</p>}
    </div>
  )
}
