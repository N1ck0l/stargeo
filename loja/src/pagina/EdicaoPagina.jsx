import { useEffect, useRef, useState } from 'react'
import { ErroApi } from '../lib/api.js'
import { entrarEdicao, salvarEdicao } from '../lib/pagina.js'
import { Link } from '../lib/Link.jsx'
import { Depoimento } from './Depoimento.jsx'

/**
 * Edição do cliente — `/p/SG-XXXX-XXXX/editar`.
 *
 * Duas telas numa só rota. Quem chega sem sessão vê o login (código da URL +
 * e-mail); quem tem sessão guardada no navegador cai direto no editor, com o
 * token revalidado no servidor antes de mostrar qualquer coisa.
 *
 * Quando o servidor está no modo de link por e-mail (`EDICAO_POR_EMAIL`), o
 * login responde `{ enviado: true }` e o token chega no link do e-mail, no
 * fragmento `#acesso=…`. Quem abre o link entra direto: o fragmento é lido uma
 * vez, apagado da barra de endereço e tratado como uma sessão guardada.
 *
 * Só existem três campos, e são os de `CAMPOS_DO_CLIENTE` do servidor:
 * assinatura, carta e mensagem pessoal. Nome, estrela e data aparecem aqui
 * como cartões SÓ PARA LER — são o que foi comprado, e a lista branca do
 * `page-update` ignora tentativa de mudança mesmo que o formulário tente.
 */
export function EdicaoPagina({ codigo }) {
  // Três fases: `login` (sem sessão), `validando` (sessão local na mão,
  // esperando o servidor confirmar) e `editor`. Sem sessão guardada a tela já
  // nasce no login; com sessão, o efeito revalida e só então libura o editor.
  const [tokenDoLink] = useState(lerTokenDoLink)
  const [fase, setFase] = useState(() =>
    tokenDoLink || lerSessao(codigo) ? 'validando' : 'login',
  )
  const [codigoAnterior, setCodigoAnterior] = useState(codigo)
  if (codigoAnterior !== codigo) {
    setCodigoAnterior(codigo)
    setFase(lerSessao(codigo) ? 'validando' : 'login')
  }
  const [sessao, setSessao] = useState(null) // { token, expiraEm }
  const [pagina, setPagina] = useState(null)
  const [estrela, setEstrela] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('') // mensagem do login (ex.: sessão vencida)

  const [email, setEmail] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [linkEnviado, setLinkEnviado] = useState(false)

  const [assinatura, setAssinatura] = useState('')
  const [carta, setCarta] = useState('')
  const [mensagem, setMensagem] = useState('')
  // Dia em que a página se revela a quem recebe (`''` = já revelada).
  const [revelaEm, setRevelaEm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState(null)

  const cartaRef = useRef(null)
  const mensagemRef = useRef(null)

  // --- sessão guardada: revalida antes de liberar o editor ------------------
  useEffect(() => {
    let vivo = true
    const guardado = tokenDoLink ? { token: tokenDoLink } : lerSessao(codigo)
    if (!guardado) {
      // A tela já está no login (estado inicial ou ajuste acima).
      return
    }
    entrarEdicao({ token: guardado.token })
      .then((dados) => {
        if (!vivo) return
        guardarSessao(codigo, dados.token ?? guardado.token, dados.expiraEm)
        montarEditor(dados)
        setEstrela(dados.estrela ?? null)
        setSessao({ token: dados.token ?? guardado.token, expiraEm: dados.expiraEm })
        setFase('editor')
      })
      .catch(() => {
        if (!vivo) return
        limparSessao(codigo)
        setAviso(
          tokenDoLink
            ? 'Este link de edição venceu ou já não vale. Peça outro com seu e-mail.'
            : 'Sua sessão de edição terminou. Entre de novo com seu e-mail.',
        )
        setFase('login')
      })
    return () => {
      vivo = false
    }
  }, [codigo, tokenDoLink])

  function montarEditor(dados) {
    // O `page-update` devolve menos campos que o `page-auth` (sem `nome` nem
    // `starSlug`), então o merge preserva o que o login já tinha trazido.
    setPagina((anterior) => ({ ...anterior, ...dados.pagina }))
    const conteudo = dados.pagina.conteudo
    setAssinatura(conteudo.assinatura ?? '')
    setCarta((conteudo.carta ?? []).join('\n\n'))
    setMensagem(conteudo.mensagemPessoal ?? '')
    setRevelaEm(dados.pagina.revelaEm ?? '')
    setSalvoEm(null)
    setErro('')
  }

  async function aoEntrar(evento) {
    evento.preventDefault()
    if (entrando) return
    setErro('')
    setEntrando(true)
    try {
      const dados = await entrarEdicao({ code: codigo, email })
      if (dados.enviado) {
        setLinkEnviado(true)
        setAviso('')
        return
      }
      guardarSessao(codigo, dados.token, dados.expiraEm)
      setSessao({ token: dados.token, expiraEm: dados.expiraEm })
      montarEditor(dados)
      setEstrela(dados.estrela ?? null)
      setAviso('')
      setFase('editor')
    } catch (e) {
      setErro(
        e instanceof ErroApi && (e.status === 404 || e.status === 401)
          ? 'Não encontramos uma página com esse código e e-mail. Confira os dois campos.'
          : e.message ?? 'Não foi possível entrar. Tente de novo.',
      )
    } finally {
      setEntrando(false)
    }
  }

  async function aoSalvar(evento) {
    evento.preventDefault()
    if (salvando || !sessao) return
    setErro('')

    const paragrafos = contarParagrafos(carta)
    if (paragrafos > 12) {
      setErro(`A carta tem ${paragrafos} parágrafos — o limite é 12. Separe os blocos por uma linha em branco.`)
      cartaRef.current?.focus()
      return
    }

    setSalvando(true)
    try {
      const dados = await salvarEdicao(
        sessao.token,
        { assinatura, carta, mensagemPessoal: mensagem },
        revelaEm,
      )
      montarEditor(dados)
      setSalvoEm(Date.now())
    } catch (e) {
      if (e instanceof ErroApi && (e.status === 401 || e.codigo === 'sessao_expirada')) {
        limparSessao(codigo)
        setAviso('Sua sessão de edição terminou. Entre de novo com seu e-mail.')
        setFase('login')
      } else {
        setErro(e.message ?? 'Não foi possível salvar. Tente de novo.')
      }
    } finally {
      setSalvando(false)
    }
  }

  function aoSair() {
    limparSessao(codigo)
    setSessao(null)
    setPagina(null)
    setAviso('')
    setErro('')
    setFase('login')
  }

  // --- telas ----------------------------------------------------------------

  if (fase === 'validando') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
        <span className="inline-block h-10 w-10 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
        <p className="font-serif mt-6 text-lg italic text-ivory/60">Conferindo sua edição…</p>
      </div>
    )
  }

  if (fase === 'login') {
    return (
      <div className="espaco-secao">
        <div className="pilha max-w-xl">
          <p className="font-display text-center text-[11px] tracking-[0.3em] text-gold uppercase">
            Página dedicada
          </p>
          <h1 className="font-display mt-3 text-center text-3xl text-ivory sm:text-4xl">
            Editar a página
          </h1>
          <p className="mt-4 text-center leading-relaxed text-ivory/70">
            Entre com o código da página — <span className="font-mono text-gold">{codigo}</span> — e o
            e-mail de quem comprou. Não existe senha.
          </p>

          {linkEnviado ? (
            <div role="status" className="cartao animate-fade-in mt-8 text-center">
              <p className="font-serif text-xl text-ivory">Confira seu e-mail</p>
              <p className="mt-3 leading-relaxed text-ivory/70">
                Se <span className="text-gold">{email}</span> for o e-mail desta página, um link para
                editar acabou de chegar lá. Ele abre a edição direto, sem senha.
              </p>
              <button
                type="button"
                onClick={() => setLinkEnviado(false)}
                className="mt-6 text-sm text-ivory/55 transition hover:text-gold"
              >
                Usar outro e-mail
              </button>
            </div>
          ) : (
            <form onSubmit={aoEntrar} className="cartao mt-8">
              <div className="grid gap-4">
                <div>
                  <label htmlFor="email-edicao" className="rotulo">
                    E-mail de quem comprou
                  </label>
                  <input
                    id="email-edicao"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(evento) => setEmail(evento.target.value)}
                    placeholder="voce@exemplo.com"
                    className="campo"
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
              {aviso && !erro && (
                <p className="animate-fade-in mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {aviso}
                </p>
              )}

              <button type="submit" className="btn btn-primary mt-6 w-full" disabled={entrando}>
                {entrando ? 'Entrando…' : 'Entrar para editar'}
              </button>
            </form>
          )}

          <div className="mt-8 flex justify-center gap-4 text-sm">
            <Link para={`/p/${codigo}`} className="text-ivory/60 transition hover:text-gold">
              Ver a página
            </Link>
            <Link para="/" className="text-ivory/60 transition hover:text-gold">
              Ir para a loja
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // --- editor ---------------------------------------------------------------
  const paragrafos = contarParagrafos(carta)

  return (
    <div className="espaco-secao">
      <div className="pilha max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-[11px] tracking-[0.3em] text-gold uppercase">
              Editar a página
            </p>
            <h1 className="font-serif mt-2 text-3xl text-ivory sm:text-4xl">
              {pagina?.conteudo?.nome ?? ''}
            </h1>
            <p className="mt-2 font-mono text-sm text-ivory/50">{codigo}</p>
          </div>
          <Link para={`/p/${codigo}`} className="btn btn-secundario text-sm">
            Ver a página
          </Link>
        </div>

        {pagina?.status === 'draft' && (
          <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Rascunho: esta página ainda não está publicada. Só o administrador consegue vê-la por
            enquanto.
          </p>
        )}

        <form onSubmit={aoSalvar} className="cartao mt-6">
          {/* O que não muda — lido do servidor, sem campo de edição. */}
          <fieldset className="mb-7 rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <legend className="font-display px-2 text-[11px] tracking-[0.2em] text-gold/80 uppercase">
              O que não muda
            </legend>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-ivory/45">Para quem</dt>
                <dd className="mt-0.5 text-ivory/85">{pagina?.conteudo?.nome}</dd>
              </div>
              <div>
                <dt className="text-ivory/45">Estrela</dt>
                <dd className="mt-0.5 text-ivory/85">
                  {estrela?.commonName ?? pagina?.starSlug}
                </dd>
              </div>
              <div>
                <dt className="text-ivory/45">Registro</dt>
                <dd className="mt-0.5 font-mono text-ivory/85">{pagina?.conteudo?.registro}</dd>
              </div>
            </dl>
          </fieldset>

          <div className="grid gap-6">
            <div>
              <label htmlFor="assinatura-edicao" className="rotulo">
                Sua assinatura
              </label>
              <input
                id="assinatura-edicao"
                type="text"
                maxLength={120}
                value={assinatura}
                onChange={(evento) => setAssinatura(evento.target.value)}
                placeholder="Com amor, [seu nome]"
                className="campo"
              />
              <p className="mt-1.5 text-xs text-ivory/45">
                Aparece no fim da carta e no certificado. Deixe vazio para não assinar.
              </p>
            </div>

            <div>
              <label htmlFor="carta-edicao" className="rotulo">
                A carta
              </label>
              <textarea
                id="carta-edicao"
                ref={cartaRef}
                rows={14}
                value={carta}
                onChange={(evento) => setCarta(evento.target.value)}
                className="campo font-serif text-base leading-relaxed"
                style={{ minHeight: '18rem' }}
              />
              <p className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ivory/45">
                <span>Um parágrafo em branco separa um do outro. Sem formatação — só texto.</span>
                <span className={paragrafos > 12 ? 'text-red-300' : 'text-ivory/45'}>
                  {paragrafos} {paragrafos === 1 ? 'parágrafo' : 'parágrafos'} (máx. 12)
                </span>
              </p>
            </div>

            <div>
              <label htmlFor="mensagem-edicao" className="rotulo">
                Mensagem pessoal
              </label>
              <textarea
                id="mensagem-edicao"
                ref={mensagemRef}
                rows={6}
                maxLength={4000}
                value={mensagem}
                onChange={(evento) => setMensagem(evento.target.value)}
                placeholder="A parte que só você escreve. Vazia = a seção não aparece."
                className="campo"
                style={{ minHeight: '9rem' }}
              />
              <p className="mt-1.5 flex justify-between gap-2 text-xs text-ivory/45">
                <span>Enquanto estiver vazia, a seção fica escondida na página.</span>
                <span>{mensagem.length}/4000</span>
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <label htmlFor="revelar-edicao" className="rotulo">
              Revelar a página em (opcional)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="revelar-edicao"
                type="date"
                className="campo max-w-[12rem]"
                value={revelaEm}
                min={amanha()}
                onChange={(e) => setRevelaEm(e.target.value)}
              />
              {revelaEm && (
                <button type="button" onClick={() => setRevelaEm('')} className="text-xs text-ivory/55 hover:text-gold">
                  Revelar já
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ivory/45">
              Até essa data, quem abrir o link vê só uma contagem regressiva. Você continua vendo tudo
              neste navegador.
            </p>
          </div>

          {erro && (
            <p
              role="alert"
              className="animate-fade-in mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {erro}
            </p>
          )}
          {salvoEm && !erro && (
            <p
              role="status"
              className="animate-fade-in mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
            >
              Salvo. A página pública já mostra o texto novo.
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={aoSair} className="text-sm text-ivory/50 transition hover:text-gold">
              Sair da edição
            </button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>

        <Depoimento token={sessao.token} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Mesma regra do servidor: parágrafos separados por linha(s) em branco. */
function contarParagrafos(texto) {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean).length
}

/*
 * Sessão do cliente no navegador.
 *
 * A chave é POR CÓDIGO (`stellara:edicao:SG-XXXX-XXXX`): quem edita duas
 * páginas em aberto não troca o token da uma pela outra. O token é de vida
 * curta e o `expiraEm` é conferido na leitura — vencido, a tela volta para o
 * login sem mandar um token velho para o servidor. Guardar em `localStorage`
 * existe para o F5 do meio da edição não deslogar; sem storage (modo privado
 * rígido) o `catch` mantém a sessão só em memória, que é o suficiente.
 *
 * A leitura ainda cai na chave antiga (`stargeo:edicao:...`) quando a nova não
 * existe: sessão aberta antes do rename da marca não pode ser perdida no F5.
 */
/**
 * Token que veio no link do e-mail (`#acesso=<hex>`), lido uma vez só.
 *
 * O fragmento sai da barra de endereço na hora: o token não pode ficar no
 * histórico nem ir junto num "copiar link" para quem recebeu o presente.
 */
function lerTokenDoLink() {
  try {
    const casado = window.location.hash.match(/^#acesso=([a-f0-9]{64})$/)
    if (!casado) return null
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return casado[1]
  } catch {
    return null
  }
}

function chaveLocal(codigo) {
  return `stellara:edicao:${codigo}`
}

function chaveLegada(codigo) {
  return `stargeo:edicao:${codigo}`
}

function lerSessao(codigo) {
  try {
    const bruto =
      localStorage.getItem(chaveLocal(codigo)) ?? localStorage.getItem(chaveLegada(codigo))
    if (!bruto) return null
    const dados = JSON.parse(bruto)
    if (!dados?.token || !dados?.expiraEm) return null
    if (new Date(dados.expiraEm).getTime() <= Date.now()) {
      limparSessao(codigo)
      return null
    }
    return dados
  } catch {
    return null
  }
}

function guardarSessao(codigo, token, expiraEm) {
  try {
    localStorage.setItem(chaveLocal(codigo), JSON.stringify({ token, expiraEm }))
  } catch {
    // Sem storage (modo privado rígido): a sessão dura só nesta aba, o que
    // continua funcionando — o estado em memória é quem segura o token.
  }
}

function limparSessao(codigo) {
  try {
    localStorage.removeItem(chaveLocal(codigo))
    localStorage.removeItem(chaveLegada(codigo))
  } catch {
    // ver acima
  }
}

/** Amanhã, no calendário local, `AAAA-MM-DD` — o primeiro dia que dá para guardar. */
function amanha() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
