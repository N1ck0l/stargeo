import { useCallback, useEffect, useState } from 'react'
import { ErroApi } from '../lib/api.js'
import { entrarNoPainel, sairDoPainel, sessaoAtual } from '../lib/admin.js'
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

  if (sessao === null) {
    return <Login aoEntrar={aoEntrar} />
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
          <button type="button" onClick={aoSair} className="btn btn-secundario text-sm">
            Sair
          </button>
        </div>

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

/**
 * Login do painel. Sem "esqueci a senha" no v1 — a recuperação é pelo
 * Supabase Auth (dashboard ou futura tela), e a conta nasce pelo admin.
 */
function Login({ aoEntrar }) {
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

  return (
    <div className="espaco-secao">
      <div className="pilha max-w-md">
        <p className="font-display text-center text-[11px] tracking-[0.3em] text-gold uppercase">
          Painel administrativo
        </p>
        <h1 className="font-display mt-3 text-center text-3xl text-ivory sm:text-4xl">
          Entrar no painel
        </h1>

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
        </form>
      </div>
    </div>
  )
}
