import { useCallback, useEffect, useState } from 'react'
import { ErroApi } from '../lib/api.js'
import {
  SENHA_MINIMA,
  chegouPeloLinkDeRecuperacao,
  definirNovaSenha,
  entrarNoPainel,
  pedirRecuperacao,
  sairDoPainel,
  sessaoAtual,
} from '../lib/admin.js'
import { mensagemDeErro } from './formatos.js'
import { VisaoGeral } from './VisaoGeral.jsx'
import { Pedidos } from './Pedidos.jsx'
import { Paginas } from './Paginas.jsx'
import { EditorAdmin } from './EditorAdmin.jsx'
import { Depoimentos } from './Depoimentos.jsx'
import { Cupons } from './Cupons.jsx'
import { Relatorios } from './Relatorios.jsx'

/**
 * `/admin` — o painel da plataforma.
 *
 * O portão é Supabase Auth (e-mail + senha); a permissão é a lista branca
 * `admins` conferida no servidor, linha por linha. Em cima disso, três abas:
 * visão geral, pedidos e páginas — mais o editor de uma página, que abre por
 * cima da aba e volta para ela ao fechar.
 */
export function AdminPagina() {
  // undefined = conferindo sessão; null = fora.
  const [sessao, setSessao] = useState(undefined)
  const [aba, setAba] = useState('visao')
  const [codigoAberto, setCodigoAberto] = useState(null)
  // Veio pelo link do e-mail de recuperação? Lido no PRIMEIRO render, antes
  // de o cliente Supabase consumir o endereço (`chegouPeloLinkDeRecuperacao`).
  const [recuperacao, setRecuperacao] = useState(chegouPeloLinkDeRecuperacao)
  const [trocandoSenha, setTrocandoSenha] = useState(false)

  useEffect(() => {
    let vivo = true
    sessaoAtual().then((s) => {
      if (vivo) setSessao(s)
    })
    return () => {
      vivo = false
    }
  }, [])

  /*
   * O painel fica fora do índice: o `index.html` é um só (SPA), então o
   * noindex é criado aqui e removido quando a rota muda — quem executa
   * JavaScript (Google, os buscadores que importam) lê a meta; quem não
   * executa nunca encontra o `/admin` no menu, que não existe.
   */
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  async function aoEntrar(email, senha) {
    const s = await entrarNoPainel(email, senha)
    // Tudo volta ao estado de primeira visita: quem entrou agora não herda a
    // aba ou a página aberta de uma sessão anterior (que nem existia).
    setSessao(s)
    setAba('visao')
    setCodigoAberto(null)
  }

  async function aoSair() {
    await sairDoPainel()
    setSessao(null)
    setCodigoAberto(null)
    setAba('visao')
  }

  /**
   * Qualquer chamada que devolva 401 derruba a tela para o login.
   *
   * `useCallback` com lista vazia: as telas filhas o usam nas dependências
   * dos efeitos de carga, e uma identidade nova a cada render do pai
   * recarregaria os dados sem parar.
   */
  const aoExpirar = useCallback(() => {
    setSessao(null)
    setCodigoAberto(null)
  }, [])

  if (sessao === undefined) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
        <span className="inline-block h-10 w-10 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
        <p className="font-serif mt-6 text-lg italic text-ivory/60">Abrindo o painel…</p>
      </div>
    )
  }

  // O link do e-mail já abriu a sessão: falta só a senha nova.
  if (recuperacao === 'recuperacao' && sessao) {
    return (
      <Moldura titulo="Criar uma nova senha">
        <NovaSenha
          aoTerminar={() => {
            window.history.replaceState(null, '', '/admin')
            setRecuperacao(null)
          }}
          rotuloBotao="Salvar e entrar no painel"
        />
      </Moldura>
    )
  }

  if (sessao === null) {
    return (
      <Login
        aoEntrar={aoEntrar}
        aviso={
          recuperacao
            ? 'Este link de recuperação venceu ou já foi usado. Peça outro em "Esqueci minha senha".'
            : ''
        }
      />
    )
  }

  return (
    <div className="espaco-secao">
      <div className="mx-auto w-full max-w-6xl px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-[11px] tracking-[0.3em] text-gold uppercase">
              Painel administrativo
            </p>
            <h1 className="font-serif mt-2 text-3xl text-ivory sm:text-4xl">Stellara</h1>
            <p className="mt-1 text-sm text-ivory/45">{sessao.user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTrocandoSenha((v) => !v)} className="btn btn-secundario text-sm" aria-expanded={trocandoSenha}>
              Trocar senha
            </button>
            <button type="button" onClick={aoSair} className="btn btn-secundario text-sm">
              Sair
            </button>
          </div>
        </div>

        {trocandoSenha && (
          <div className="cartao mt-6 max-w-md">
            <h2 className="font-display text-lg text-ivory">Trocar senha</h2>
            <NovaSenha aoTerminar={() => setTrocandoSenha(false)} rotuloBotao="Salvar a nova senha" />
          </div>
        )}

        {/* Editor aberto = tela cheia por cima: a navegação de abas some, e
            ele próprio traz o botão de voltar para a lista. */}
        {!codigoAberto && (
          <nav className="mt-7 flex flex-wrap gap-2 border-b border-white/10 pb-px">
            {[
              ['visao', 'Visão geral'],
              ['pedidos', 'Pedidos'],
              ['paginas', 'Páginas'],
              ['relatorios', 'Relatórios'],
              ['cupons', 'Cupons'],
              ['depoimentos', 'Depoimentos'],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAba(id)}
                aria-current={aba === id ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                  aba === id
                    ? 'border-gold text-gold'
                    : 'border-transparent text-ivory/55 hover:text-ivory'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </nav>
        )}

        <div className="mt-7">
          {codigoAberto ? (
            <EditorAdmin
              codigo={codigoAberto}
              aoFechar={() => setCodigoAberto(null)}
              aoExpirar={aoExpirar}
            />
          ) : aba === 'visao' ? (
            <VisaoGeral
              aoExpirar={aoExpirar}
              aoAbrirPagina={setCodigoAberto}
              aoIrParaPedidos={() => setAba('pedidos')}
            />
          ) : aba === 'pedidos' ? (
            <Pedidos aoExpirar={aoExpirar} aoAbrirPagina={setCodigoAberto} />
          ) : aba === 'relatorios' ? (
            <Relatorios aoExpirar={aoExpirar} />
          ) : aba === 'cupons' ? (
            <Cupons aoExpirar={aoExpirar} />
          ) : aba === 'depoimentos' ? (
            <Depoimentos aoExpirar={aoExpirar} />
          ) : (
            <Paginas aoExpirar={aoExpirar} aoAbrirPagina={setCodigoAberto} />
          )}
        </div>
      </div>
    </div>
  )
}

/** Cabeçalho comum das telas de fora do painel (login, senha nova). */
function Moldura({ titulo, children }) {
  return (
    <div className="espaco-secao">
      <div className="pilha max-w-md">
        <p className="font-display text-center text-[11px] tracking-[0.3em] text-gold uppercase">
          Painel administrativo
        </p>
        <h1 className="font-display mt-3 text-center text-3xl text-ivory sm:text-4xl">{titulo}</h1>
        {children}
      </div>
    </div>
  )
}

/** Aviso de erro ou de sucesso dentro dos formulários. */
function Aviso({ tipo = 'erro', children }) {
  const cores =
    tipo === 'erro' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
  return (
    <p role={tipo === 'erro' ? 'alert' : 'status'} className={`animate-fade-in mt-4 rounded-xl border px-4 py-3 text-sm ${cores}`}>
      {children}
    </p>
  )
}

/**
 * Senha nova, digitada duas vezes. Serve ao link de recuperação e ao "Trocar
 * senha" do painel — nos dois casos a sessão já existe e o Supabase só troca.
 */
function NovaSenha({ aoTerminar, rotuloBotao }) {
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  async function submeter(evento) {
    evento.preventDefault()
    if (salvando) return
    setErro('')
    if (senha.length < SENHA_MINIMA) return setErro(`Use pelo menos ${SENHA_MINIMA} caracteres.`)
    if (senha !== repetida) return setErro('As duas senhas não são iguais.')
    setSalvando(true)
    try {
      await definirNovaSenha(senha)
      setPronto(true)
      setTimeout(aoTerminar, 1200)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={submeter} className="mt-6">
      <div className="grid gap-4">
        <div>
          <label htmlFor="nova-senha" className="rotulo">
            Nova senha
          </label>
          <input
            id="nova-senha"
            type="password"
            required
            minLength={SENHA_MINIMA}
            autoComplete="new-password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            className="campo"
          />
          <p className="mt-1.5 text-xs text-ivory/45">Pelo menos {SENHA_MINIMA} caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.</p>
        </div>
        <div>
          <label htmlFor="nova-senha-repetida" className="rotulo">
            Repita a nova senha
          </label>
          <input
            id="nova-senha-repetida"
            type="password"
            required
            autoComplete="new-password"
            value={repetida}
            onChange={(evento) => setRepetida(evento.target.value)}
            className="campo"
          />
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {pronto && <Aviso tipo="ok">Senha nova salva.</Aviso>}
      <button type="submit" className="btn btn-primary mt-6 w-full" disabled={salvando || pronto}>
        {salvando ? 'Salvando…' : rotuloBotao}
      </button>
    </form>
  )
}

/**
 * "Esqueci minha senha": pede o e-mail e o Supabase manda o link (vale 1 hora)
 * que volta para `/admin` já com a sessão — lá a pessoa cria a senha nova.
 * A resposta é sempre a mesma, exista a conta ou não.
 */
function EsqueciSenha({ aoVoltar }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  async function submeter(evento) {
    evento.preventDefault()
    if (enviando) return
    setErro('')
    setEnviando(true)
    try {
      await pedirRecuperacao(email.trim())
      setEnviado(true)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={submeter} className="cartao mt-8">
      {enviado ? (
        <Aviso tipo="ok">
          Se este e-mail tiver acesso ao painel, enviamos um link para criar uma nova senha. Ele vale por 1 hora —
          confira também a caixa de spam.
        </Aviso>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ivory/70">
            Digite o e-mail da sua conta do painel. Mandamos um link para você criar uma senha nova.
          </p>
          <div className="mt-4">
            <label htmlFor="recuperar-email" className="rotulo">
              E-mail
            </label>
            <input
              id="recuperar-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="campo"
            />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <button type="submit" className="btn btn-primary mt-6 w-full" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar o link'}
          </button>
        </>
      )}
      <button type="button" onClick={aoVoltar} className="mt-4 w-full text-center text-sm text-gold/80 hover:underline">
        Voltar para o login
      </button>
    </form>
  )
}

/**
 * Login do painel, com "Esqueci minha senha". A conta nasce pelo admin (o
 * cadastro público do Supabase Auth fica desligado).
 */
function Login({ aoEntrar, aviso = '' }) {
  const [esqueci, setEsqueci] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [erro, setErro] = useState('')

  async function submeter(evento) {
    evento.preventDefault()
    // Enter repetido não manda duas senhas: a segunda tentativa passaria pelo
    // rate limit do GoTrue sem motivo nenhum.
    if (entrando) return
    setErro('')
    setEntrando(true)
    try {
      await aoEntrar(email.trim(), senha)
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : mensagemDeErro(e))
    } finally {
      setEntrando(false)
    }
  }

  if (esqueci) {
    return (
      <Moldura titulo="Esqueci minha senha">
        <EsqueciSenha aoVoltar={() => setEsqueci(false)} />
      </Moldura>
    )
  }

  return (
    <div className="espaco-secao">
      <div className="pilha max-w-md">
        <p className="font-display text-center text-[11px] tracking-[0.3em] text-gold uppercase">
          Painel administrativo
        </p>
        <h1 className="font-display mt-3 text-center text-3xl text-ivory sm:text-4xl">
          Entrar no painel
        </h1>
        {aviso && <Aviso>{aviso}</Aviso>}

        <form onSubmit={submeter} className="cartao mt-8">
          <div className="grid gap-4">
            <div>
              <label htmlFor="admin-email" className="rotulo">
                E-mail
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="admin-senha" className="rotulo">
                Senha
              </label>
              <input
                id="admin-senha"
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
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

          <button type="submit" className="btn btn-primary mt-6 w-full" disabled={entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
          <button type="button" onClick={() => setEsqueci(true)} className="mt-4 w-full text-center text-sm text-gold/80 hover:underline">
            Esqueci minha senha
          </button>
        </form>
      </div>
    </div>
  )
}
