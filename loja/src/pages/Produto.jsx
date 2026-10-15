
import { useEffect, useState } from 'react'
import { getStar } from '../../../shared/stars.js'
import { validarPedido, explicarErros } from '../../../shared/moderation.js'
import { Folha } from '../components/Folha.jsx'
import { ExploradorDeEstrelas } from '../components/ExploradorDeEstrelas.jsx'
import { MiniCeuSobDemanda } from '../components/MiniCeuSobDemanda.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { criarCheckout, ErroApi, irParaPagamento } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'
import { buscarEstrela, comoSeVe, normalizar, reais } from '../lib/catalogo.js'
import { ocasiaoPorSlug, SUGESTOES_GERAIS } from '../lib/ocasioes.js'
import { registrar } from '../lib/metricas.js'
import { EMAIL_ATIVO } from '../lib/config.js'

/**
 * Produtos que têm página. O PREÇO não mora aqui: ele é o da faixa da estrela
 * escolhida (brilho e nome), lido do banco — o mesmo que o `create-checkout`
 * cobra.
 *
 * Por enquanto só existe UM produto de verdade (o digital): slug fora desta
 * lista cai na tela "Certificado não encontrado" abaixo. Os outros níveis
 * ficam desligados no banco até virarem produto real — ver migration 0007.
 */
const PRODUTOS = {
  'certificado-digital': { nome: 'Certificado Digital' },
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
/** `AAAA-MM-DD` no calendário local, `dias` a partir de hoje. */
function diaLocal(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const amanha = () => diaLocal(1)
const daquiAUmAno = () => diaLocal(365)

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
 * `CertificadoPreview` (a folha), `Reveal`, `shared/moderation.js`
 * (regra única) e `lib/api.js` (`criarCheckout` / `irParaPagamento`).
 *
 * Invariantes: o pedido só nasce DEPOIS de a validação passar — falhar aqui
 * não deixa pedido órfão no banco; a prévia tem de mostrar o mesmo que o PDF
 * final; e a saída é sempre o Mercado Pago (o checkout é um
 * `location.assign`, nunca um formulário de cartão dentro desta página).
 */
export default function Produto({ slug }) {
  const produto = PRODUTOS[slug]

  /*
   * A estrela pode vir pela URL (`?estrela=antares`): é como a home e o
   * catálogo trazem alguém com a estrela já escolhida. As 12 curadas aparecem
   * na hora (`shared/stars.js`); qualquer outra das ~118 mil, e o preço e o
   * estado de TODAS, chegam do banco logo depois.
   */
  const estrelaInicial = new URLSearchParams(window.location.search).get('estrela') || 'atria'
  // Veio de uma ocasião da home (`?ocasiao=aniversario`): sugestões dela.
  const ocasiao = ocasiaoPorSlug(new URLSearchParams(window.location.search).get('ocasiao'))
  const sugestoes = ocasiao?.sugestoes ?? SUGESTOES_GERAIS
  const [estrela, setEstrela] = useState(() => normalizar(getStar(estrelaInicial) ?? getStar('atria')))
  useEffect(() => {
    let vivo = true
    buscarEstrela(estrelaInicial)
      .then((e) => {
        if (vivo && e) setEstrela(e)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [estrelaInicial])

  useEffect(() => registrar('ver_produto'), [])

  function escolherEstrela(nova) {
    setEstrela(nova)
    registrar('escolher_estrela', nova.faixa)
    const params = new URLSearchParams(window.location.search)
    params.set('estrela', nova.slug)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }

  // Cada estrela é exclusiva: dedicada (ou reservada por outro pagamento em
  // curso) não dá para comprar.
  const indisponivel = Boolean(estrela.status) && estrela.status !== 'disponivel'

  /*
   * Par de estrelas (migration 0020): uma estrela para cada pessoa — casal,
   * irmãos, mãe e filha. São dois certificados e duas páginas, ligados ("Em
   * par com …"), pagos juntos. O preço é a soma das faixas das duas.
   */
  const [emPar, setEmPar] = useState(false)
  const [estrela2, setEstrela2] = useState(null)
  const [paraQuem2, setParaQuem2] = useState('')
  const [apelido2, setApelido2] = useState('')
  // Qual das duas folhas a prévia mostra.
  const [folhaVisivel, setFolhaVisivel] = useState(1)
  const indisponivel2 = Boolean(estrela2?.status) && estrela2.status !== 'disponivel'
  const totalCentavos = estrela.precoCentavos + (emPar && estrela2 ? estrela2.precoCentavos : 0)
  const preco = reais(totalCentavos)
  const [paraQuem, setParaQuem] = useState('')
  const [assinatura, setAssinatura] = useState('')
  // Nome dado à estrela nesta homenagem (opcional, simbólico).
  const [apelido, setApelido] = useState('')
  // Revelar a página numa data (opcional): até lá, o link mostra a contagem.
  const [guardar, setGuardar] = useState(false)
  const [revelarEm, setRevelarEm] = useState('')
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
    starNickname: apelido,
    message: mensagem,
    customerName: nome,
    customerEmail: email,
  })

  // A segunda pessoa do par passa pela mesma régua (nome e nome da estrela).
  const validacao2 = emPar
    ? validarPedido({ honoreeName: paraQuem2, starNickname: apelido2, customerName: 'Comprador', customerEmail: 'a@b.co' })
    : { ok: true, erros: [] }

  /** Mensagem de erro do campo, nula enquanto a pessoa não tiver tocado nele. */
  const erroDe = (campo) => {
    if (!tocou[campo]) return null
    return validacao.erros.find((e) => e.campo === campo)?.motivo ?? null
  }
  /** O mesmo, para os campos da segunda pessoa (`par.honoreeName`, …). */
  const erroDe2 = (campo) => {
    if (!tocou[`par.${campo}`]) return null
    return validacao2.erros.find((e) => e.campo === campo)?.motivo ?? null
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
    if (indisponivel) {
      setErro('Esta estrela já tem dono. Escolha outra no catálogo acima — são milhares livres.')
      return
    }
    if (emPar) {
      if (!estrela2) {
        setErro('Escolha a segunda estrela do par — ou desmarque "Dar um par de estrelas".')
        return
      }
      if (estrela2.slug === estrela.slug) {
        setErro('O par precisa de duas estrelas diferentes.')
        return
      }
      if (indisponivel2) {
        setErro('A segunda estrela já tem dono. Escolha outra.')
        return
      }
      if (!validacao2.ok) {
        setTocou((t) => ({ ...t, 'par.honoreeName': true, 'par.starNickname': true }))
        setErro(explicarErros(validacao2.erros))
        return
      }
    }
    if (guardar && !revelarEm) {
      setErro('Escolha o dia em que a página se revela — ou desmarque "Guardar a surpresa até uma data".')
      return
    }
    if (!validacao.ok) {
      setTocou({ honoreeName: true, starNickname: true, fromName: true, message: true, customerName: true, customerEmail: true })
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
        starSlug: estrela.slug,
        honoreeName: paraQuem,
        fromName: assinatura || undefined,
        starNickname: apelido.trim() || undefined,
        revealOn: guardar && revelarEm ? revelarEm : undefined,
        par:
          emPar && estrela2
            ? { starSlug: estrela2.slug, honoreeName: paraQuem2, starNickname: apelido2.trim() || undefined }
            : undefined,
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
          'stellara:ultimo-pedido',
          JSON.stringify({ code: resposta.code, email }),
        )
      } catch {
        // Sem storage: o rastreamento pelo código continua disponível.
      }

      registrar('iniciar_checkout', estrela.faixa)
      irParaPagamento(resposta.initPoint ?? resposta.sandboxInitPoint)
    } catch (falha) {
      setErro(
        falha instanceof ErroApi
          ? falha.message
          : 'Não foi possível iniciar o pagamento. Verifique a conexão e tente de novo.',
      )
      // Outra pessoa pegou a estrela no meio do caminho: o estado novo vem do
      // banco, e a tela passa a mostrá-la como indisponível.
      if (falha instanceof ErroApi && falha.codigo === 'estrela_indisponivel') {
        buscarEstrela(estrela.slug).then((e) => e && setEstrela(e)).catch(() => {})
        if (estrela2) buscarEstrela(estrela2.slug).then((e) => e && setEstrela2(e)).catch(() => {})
      }
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

        <h1 className="mb-8 font-display text-3xl text-ivory sm:text-4xl">Monte o seu certificado</h1>

        {/*
          Prévia em A4 RETRATO: a coluna dela tem o teto da própria folha
          (30rem), e o formulário fica com o resto — em retrato a folha é
          estreita, e dar mais largura só a faria passar da altura da tela.
        */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
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
                onBlur={() => {
                  marcarTocado('honoreeName')
                  if (paraQuem.trim()) registrar('personalizar')
                }}
                erro={erroDe('honoreeName')}
                placeholder="Ex.: Maria Fernanda Oliveira"
                maxLength={80}
              />
              <p className="mt-2 text-xs text-ivory/50">
                Se o nome não couber em duas linhas, o corpo da letra diminui um pouco — nunca é
                cortado.
              </p>
              <div className="mt-5">
                <Campo
                  rotulo="Um nome para a estrela (opcional)"
                  value={apelido}
                  onChange={setApelido}
                  onBlur={() => marcarTocado('starNickname')}
                  erro={erroDe('starNickname')}
                  placeholder="Ex.: Nossa Luz, A Estrela da Vó Lúcia"
                  maxLength={40}
                  dica="Aparece no certificado e na página como o nome desta homenagem. O nome oficial da estrela nos catálogos continua o mesmo."
                />
              </div>
            </Secao>

            <Secao numero="2" titulo="Qual estrela?">
              {/* A escolhida: história, céu real em volta e o preço da faixa. */}
              <div className="cartao flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-serif text-xl text-ivory">{estrela.name}</h3>
                    <span className="text-right text-sm text-gold">
                      {preco}
                      <span className="block text-[11px] text-ivory/45">Pix ou até 12x no cartão</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gold/80">
                    {estrela.bayer} · {estrela.constellation}
                    {estrela.distanceLy
                      ? ` · ${estrela.distanceLy.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos-luz`
                      : ''}
                    {` · ${comoSeVe(estrela.magnitude)}`}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-ivory/70">{estrela.story}</p>
                  <Link para={`/estrelas/${estrela.slug}`} className="mt-2 inline-block text-xs text-gold/80 hover:underline">
                    Conhecer {estrela.name}
                  </Link>
                  {indisponivel ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
                    >
                      Esta estrela já foi dedicada a alguém. Cada estrela da Stellara é única — escolha outra
                      abaixo.
                    </p>
                  ) : (
                    <p className="mt-4 text-xs text-ivory/50">
                      Exclusiva: depois de dedicada, ela sai do catálogo e ninguém mais recebe esta estrela.
                    </p>
                  )}
                </div>
                {/* O mesmo mapa do pé da folha: a constelação real, que muda
                    junto com a escolha. */}
                <figure className="mx-auto w-32 shrink-0 text-center sm:mx-0">
                  <MiniCeuSobDemanda key={estrela.slug} estrela={estrela} className="animate-fade-in aspect-square w-32" />
                  <figcaption className="mt-2 text-[10px] leading-snug tracking-wide text-ivory/50">
                    O céu de {estrela.constellation}, como sai na folha
                  </figcaption>
                </figure>
              </div>

              <div className="mt-6">
                <ExploradorDeEstrelas
                  selecionada={estrela.slug}
                  aoEscolher={escolherEstrela}
                  titulo="Escolher outra estrela"
                />
              </div>

              <div className="mt-8 rounded-2xl border border-gold/25 bg-gold/[0.04] p-5">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ivory/90">
                  <input
                    type="checkbox"
                    checked={emPar}
                    onChange={(e) => {
                      setEmPar(e.target.checked)
                      if (!e.target.checked) setFolhaVisivel(1)
                    }}
                    className="mt-1 accent-[#d8b66a]"
                  />
                  <span>
                    Dar um par de estrelas
                    <span className="mt-0.5 block text-xs text-ivory/55">
                      Uma estrela para cada pessoa — casal, irmãos, mãe e filha. Cada uma ganha o próprio
                      certificado e a própria página, ligados um ao outro (“em par com…”). O preço é a soma das
                      duas estrelas.
                    </span>
                  </span>
                </label>

                {emPar && (
                  <div className="mt-5 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Campo
                        name="par-nome"
                        rotulo="Nome da segunda pessoa"
                        obrigatorio
                        value={paraQuem2}
                        onChange={setParaQuem2}
                        onBlur={() => marcarTocado('par.honoreeName')}
                        erro={erroDe2('honoreeName')}
                        placeholder="Ex.: Pedro Henrique Lima"
                        maxLength={80}
                      />
                      <Campo
                        name="par-apelido"
                        rotulo="Nome para a segunda estrela (opcional)"
                        value={apelido2}
                        onChange={setApelido2}
                        onBlur={() => marcarTocado('par.starNickname')}
                        erro={erroDe2('starNickname')}
                        maxLength={40}
                      />
                    </div>

                    {estrela2 ? (
                      <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-ivory/85">
                        Segunda estrela: <span className="font-serif text-ivory">{estrela2.name}</span>
                        <span className="text-ivory/50"> · {estrela2.constellation} · {reais(estrela2.precoCentavos)}</span>
                        {indisponivel2 && <span className="block text-xs text-amber-200">Esta já tem dono — escolha outra.</span>}
                      </p>
                    ) : (
                      <p className="text-xs text-ivory/55">Escolha abaixo a estrela da segunda pessoa.</p>
                    )}

                    <ExploradorDeEstrelas
                      selecionada={estrela2?.slug}
                      aoEscolher={(e) => {
                        if (e.slug === estrela.slug) return
                        setEstrela2(e)
                        setFolhaVisivel(2)
                      }}
                      titulo="Escolher a segunda estrela"
                    />
                  </div>
                )}
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

              {/* Para quem trava na folha em branco: um toque usa a frase, e
                  ela continua editável no campo acima. */}
              <div className="mt-3">
                <p className="text-xs text-ivory/50">
                  {ocasiao ? `Sugestões para ${ocasiao.titulo.toLowerCase()}` : 'Sem inspiração? Comece por uma destas'} — e
                  mude o que quiser:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sugestoes.map((texto) => (
                    <button
                      key={texto}
                      type="button"
                      onClick={() => setMensagem(texto)}
                      className="rounded-xl border border-white/12 px-3 py-2 text-left text-xs leading-snug text-ivory/75 transition hover:border-gold/50 hover:text-ivory"
                    >
                      “{texto}”
                    </button>
                  ))}
                </div>
              </div>

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

              {/* Surpresa na data: o PDF chega na hora para quem compra; o
                  link da página, que vai para quem recebe, só se abre no dia. */}
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ivory/85">
                  <input
                    type="checkbox"
                    checked={guardar}
                    onChange={(e) => setGuardar(e.target.checked)}
                    className="mt-1 accent-[#d8b66a]"
                  />
                  <span>
                    Guardar a surpresa até uma data
                    <span className="mt-0.5 block text-xs text-ivory/50">
                      Você recebe o certificado na hora. A página da estrela mostra só uma contagem regressiva
                      até o dia — dá para mandar o link antes, sem estragar a surpresa.
                    </span>
                  </span>
                </label>
                {guardar && (
                  <div className="mt-3 max-w-[14rem]">
                    <Campo
                      rotulo="Revelar em"
                      type="date"
                      value={revelarEm}
                      onChange={setRevelarEm}
                      min={amanha()}
                      max={daquiAUmAno()}
                    />
                  </div>
                )}
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
                  dica={
                    EMAIL_ATIVO
                      ? 'É para cá que o certificado chega. Não pedimos CPF para emitir.'
                      : 'Com ele (e o código do pedido) você abre e edita a página depois. Não pedimos CPF.'
                  }
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

            {/* Resumo antes de pagar: o que é, para quem, quando chega e
                quanto custa — sem surpresa na tela do Mercado Pago. */}
            <section aria-labelledby="resumo-titulo" className="cartao">
              <h2 id="resumo-titulo" className="font-display text-lg text-ivory">
                Resumo do pedido
              </h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                {[
                  ['Estrela', `${estrela.name} · ${estrela.constellation}`],
                  ['Dedicada a', paraQuem.trim() || '—'],
                  ...(apelido.trim() ? [['Nome da homenagem', `“${apelido.trim()}”`]] : []),
                  ...(emPar
                    ? [
                        ['Segunda estrela', estrela2 ? `${estrela2.name} · ${estrela2.constellation}` : '—'],
                        ['Segunda dedicada a', paraQuem2.trim() || '—'],
                      ]
                    : []),
                  ...(guardar && revelarEm ? [['Página revelada em', dataEmPortugues(revelarEm)]] : []),
                  ['Formato', 'Certificado digital em PDF A4 (versões escura e clara) + página da estrela'],
                  [
                    'Entrega',
                    EMAIL_ATIVO
                      ? 'Logo após a confirmação do pagamento, na página da estrela e no seu e-mail'
                      : 'Logo após a confirmação do pagamento, na página da estrela (com o PDF para baixar)',
                  ],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="flex justify-between gap-4">
                    <dt className="shrink-0 text-ivory/50">{rotulo}</dt>
                    <dd className="text-right text-ivory/85">{valor}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-white/10 pt-3">
                  <dt className="text-ivory/70">Total</dt>
                  <dd className="font-display text-xl text-gold">{preco}</dd>
                </div>
              </dl>
            </section>

            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" className="btn btn-primary animate-pulse-glow" disabled={enviando || indisponivel}>
                {enviando ? 'Abrindo o pagamento…' : `Finalizar · ${preco}`}
              </button>
              <p className="text-xs text-ivory/45">
                Você paga no Mercado Pago, por Pix ou cartão em até 12x. {emPar ? 'As estrelas ficam reservadas' : 'A estrela fica reservada'} para
                você por 30 minutos enquanto paga.{' '}
                <Link para="/politicas" className="underline decoration-white/30 hover:text-gold">
                  Entrega, reembolso e privacidade
                </Link>
                .
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
                A folha é um SVG A4 retrato em milímetros: escala sozinha para
                a largura da caixa. O teto de largura impede que, em retrato,
                ela fique mais alta que a tela no desktop.
              */}
              <div className="shimmer-border mx-auto max-w-[30rem] overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                {emPar && estrela2 && folhaVisivel === 2 ? (
                  <Folha
                    estrela={estrela2}
                    honoreeName={paraQuem2}
                    message={mensagem}
                    fromName={assinatura}
                    starNickname={apelido2}
                    par={{ estrela: estrela.name, nome: paraQuem.trim() || 'quem recebe' }}
                    dedicationDate={dataEmPortugues(data)}
                    code="SG-XXXX-XXXX"
                    light={versaoClara}
                  />
                ) : (
                  <Folha
                    estrela={estrela}
                    honoreeName={paraQuem}
                    message={mensagem}
                    fromName={assinatura}
                    starNickname={apelido}
                    par={emPar && estrela2 ? { estrela: estrela2.name, nome: paraQuem2.trim() || 'a segunda pessoa' } : undefined}
                    dedicationDate={dataEmPortugues(data)}
                    code="SG-XXXX-XXXX"
                    light={versaoClara}
                  />
                )}
              </div>

              {emPar && estrela2 && (
                <div role="group" aria-label="Qual folha do par" className="mt-3 flex justify-center gap-2 text-xs">
                  {[
                    [1, paraQuem.trim().split(' ')[0] || 'Primeira'],
                    [2, paraQuem2.trim().split(' ')[0] || 'Segunda'],
                  ].map(([n, rotulo]) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFolhaVisivel(n)}
                      aria-pressed={folhaVisivel === n}
                      className={`rounded-full border px-3 py-1.5 transition ${
                        folhaVisivel === n ? 'border-gold/70 bg-gold/15 text-gold' : 'border-white/15 text-ivory/70'
                      }`}
                    >
                      Folha de {rotulo}
                    </button>
                  ))}
                </div>
              )}

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
