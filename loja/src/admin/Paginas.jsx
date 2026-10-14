import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { classeStatus, dataCurta, tratarErro } from './formatos.js'

/**
 * Aba Páginas — a lista de tudo que existe em `/p/…`, mais a criação manual
 * (a partir de um pedido a aba é Pedidos; aqui é encomenda fora da loja ou
 * correção de mão).
 *
 * A criação nasce em rascunho — publicar é ato consciente, e o botão de
 * publicar fica a um clique aqui na linha. O carregamento reage ao estado
 * `filtro`, mesmo padrão da aba Pedidos.
 */
export function Paginas({ aoExpirar, aoAbrirPagina }) {
  const [filtro, setFiltro] = useState({ q: '', status: '' })
  const [paginas, setPaginas] = useState([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(null)
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [alternando, setAlternando] = useState(null) // code com troca de status em voo

  useEffect(() => {
    let vivo = true
    chamarAdmin('paginas', {
      q: filtro.q || undefined,
      status: filtro.status || undefined,
      limit: 200,
    })
      .then((dados) => {
        if (!vivo) return
        setPaginas(dados.paginas ?? [])
        setTotal(dados.total ?? 0)
        setErro('')
        setCarregando(false)
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (!vivo) return
        if (mensagem) setErro(mensagem)
        setCarregando(false)
      })
    return () => {
      vivo = false
    }
  }, [filtro, aoExpirar])

  function aoBuscar(evento) {
    evento.preventDefault()
    setCarregando(true)
    setFiltro({ q: busca.trim(), status })
  }

  function aoTrocarStatus(novo) {
    setStatus(novo)
    setCarregando(true)
    setFiltro({ q: busca.trim(), status: novo })
  }

  /** Mesmo filtro de novo = nova leitura (usado após ações da linha). */
  function recarregar() {
    setCarregando(true)
    setFiltro((anterior) => ({ ...anterior }))
  }

  /**
   * Publica/despublica sem sair da lista.
   *
   * O `alternando` trava a ação inteira da tabela (não só da linha): dois
   * cliques seguidos publicariam e despublicariam a mesma página, e o
   * aviso final diria a metade errada. A mudança entra na linha na hora,
   * sem recarregar a lista — a resposta do servidor já é o estado novo.
   */
  async function alternarStatus(pagina) {
    if (alternando) return
    const novo = pagina.status === 'published' ? 'draft' : 'published'
    setAlternando(pagina.code)
    setAviso(null)
    setErro('')
    try {
      await chamarAdmin('paginaAtualizar', { code: pagina.code, status: novo })
      setPaginas((anterior) =>
        anterior.map((linha) => (linha.code === pagina.code ? { ...linha, status: novo } : linha)),
      )
      setAviso({
        texto:
          novo === 'published'
            ? `${pagina.code} publicada — o link já abre para todo mundo.`
            : `${pagina.code} voltou para rascunho.`,
        tipo: 'ok',
      })
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      if (mensagem) setErro(mensagem)
    } finally {
      setAlternando(null)
    }
  }

  /**
   * Cria e já abre o editor da página nova.
   *
   * O formulário não manda `status`, então o servidor grava `draft` — publicar
   * continua sendo ato consciente, feito na lista. O caminho natural depois de
   * criar é escrever o conteúdo antes de deixar o link solto.
   */
  async function aoCriar(formulario) {
    try {
      const dados = await chamarAdmin('paginaCriar', formulario)
      setAviso({ texto: `Página ${dados.pagina.code} criada como rascunho.`, tipo: 'ok' })
      setFormAberto(false)
      setBusca('')
      setStatus('')
      recarregar()
      aoAbrirPagina(dados.pagina.code)
    } catch (e) {
      const mensagem = tratarErro(e, aoExpirar)
      // 401 já foi para o login e não tem texto para o formulário; o resto
      // vira `Error` porque é o formato que o `FormularioCriar` espera.
      if (mensagem) throw new Error(mensagem)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={aoBuscar} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="busca-paginas" className="rotulo">
              Buscar página
            </label>
            <input
              id="busca-paginas"
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Código, nome ou e-mail"
              className="campo"
            />
          </div>
          <div>
            <label htmlFor="status-paginas" className="rotulo">
              Status
            </label>
            <select
              id="status-paginas"
              value={status}
              onChange={(evento) => aoTrocarStatus(evento.target.value)}
              className="campo"
            >
              <option value="">Todas</option>
              <option value="published">Publicadas</option>
              <option value="draft">Rascunhos</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secundario text-sm">
            Buscar
          </button>
        </form>

        <button type="button" onClick={() => setFormAberto((aberto) => !aberto)} className="btn btn-primary text-sm">
          {formAberto ? 'Fechar' : 'Criar página'}
        </button>
      </div>

      {formAberto && <FormularioCriar aoCriar={aoCriar} />}

      {aviso && (
        <p
          role="status"
          className="animate-fade-in mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
        >
          {aviso.texto}
        </p>
      )}
      {erro && (
        <p
          role="alert"
          className="animate-fade-in mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {erro}
        </p>
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/8">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/5 text-left text-xs tracking-wide text-ivory/50 uppercase">
              <th className="px-4 py-3 font-medium">Endereço</th>
              <th className="px-4 py-3 font-medium">Para quem</th>
              <th className="px-4 py-3 font-medium">Estrela</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginas.map((pagina) => (
              <tr key={pagina.code} className="border-b border-white/6 last:border-0">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => aoAbrirPagina(pagina.code)}
                    className="font-mono text-ivory transition hover:text-gold"
                  >
                    {pagina.code}
                  </button>
                  <p className="mt-0.5 text-xs text-ivory/40">{dataCurta(pagina.created_at)}</p>
                </td>
                <td className="px-4 py-3 text-ivory/85">{pagina.honoree_name}</td>
                <td className="px-4 py-3 text-ivory/70">{pagina.star_slug}</td>
                <td className="max-w-44 px-4 py-3">
                  <p className="truncate text-ivory/60">{pagina.customer_email ?? '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${classeStatus(pagina.status)}`}
                  >
                    {pagina.status === 'published' ? 'Publicada' : 'Rascunho'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => aoAbrirPagina(pagina.code)}
                      className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:border-gold hover:text-gold"
                    >
                      Abrir
                    </button>
                    {pagina.status === 'published' && (
                      <a
                        href={`/p/${pagina.code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:border-gold hover:text-gold"
                      >
                        Ver link
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => alternarStatus(pagina)}
                      disabled={alternando !== null}
                      className="rounded-full border border-white/15 px-3 py-1 text-xs transition hover:border-gold hover:text-gold disabled:opacity-50"
                    >
                      {alternando === pagina.code
                        ? '…'
                        : pagina.status === 'published'
                          ? 'Despublicar'
                          : 'Publicar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {/* Duas linhas de lugar único: sem resultado (com aviso do
                filtro) e carregando (só quando a lista ainda está vazia —
                depois disso o spinner ficaria piscando por cima dos dados). */}
            {paginas.length === 0 && !carregando && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ivory/50">
                  Nenhuma página{filtro.q || filtro.status ? ' com esse filtro' : ''}. Crie a
                  primeira com o botão acima — ou a partir de um pedido pago, na aba Pedidos.
                </td>
              </tr>
            )}
            {carregando && paginas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center">
                  <span className="inline-block h-6 w-6 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-ivory/50">
        {paginas.length} de {total} página{total === 1 ? '' : 's'}
      </p>
    </div>
  )
}

/**
 * Criação manual: nome e estrela obrigatórios, o resto opcional. O código
 * nasce sozinho quando não é informado (mesmo gerador do servidor).
 */
function FormularioCriar({ aoCriar }) {
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [data, setData] = useState('')
  const [email, setEmail] = useState('')
  const [registro, setRegistro] = useState('')
  const [codigo, setCodigo] = useState('')
  const [estrelas, setEstrelas] = useState(null)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    chamarAdmin('estrelas')
      .then((dados) => {
        if (vivo) setEstrelas(dados.estrelas ?? [])
      })
      .catch(() => {
        if (vivo) setEstrelas([])
      })
    return () => {
      vivo = false
    }
  }, [])

  async function submeter(evento) {
    evento.preventDefault()
    if (criando) return
    setErro('')
    setCriando(true)
    try {
      await aoCriar({
        honoree_name: nome.trim(),
        star_slug: slug,
        dedication_date: data || undefined,
        customer_email: email.trim() || undefined,
        certificate_id: registro.trim() || undefined,
        code: codigo.trim().toUpperCase() || undefined,
      })
    } catch (e) {
      setErro(e.message ?? 'Não foi possível criar a página.')
    } finally {
      setCriando(false)
    }
  }

  return (
    <form onSubmit={submeter} className="cartao mt-5">
      <p className="font-display text-xs tracking-[0.2em] text-gold uppercase">Nova página</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="criar-nome" className="rotulo">
            Para quem *
          </label>
          <input
            id="criar-nome"
            type="text"
            required
            maxLength={120}
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Nome de quem recebe"
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="criar-estrela" className="rotulo">
            Estrela *
          </label>
          <select
            id="criar-estrela"
            required
            value={slug}
            onChange={(evento) => setSlug(evento.target.value)}
            className="campo"
          >
            <option value="">
              {estrelas === null ? 'Carregando estrelas…' : 'Escolha uma estrela'}
            </option>
            {(estrelas ?? []).map((estrela) => (
              <option key={estrela.slug} value={estrela.slug}>
                {estrela.name} ({estrela.bayer} · {estrela.constellation})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="criar-data" className="rotulo">
            Data da dedicação
          </label>
          <input
            id="criar-data"
            type="date"
            value={data}
            onChange={(evento) => setData(evento.target.value)}
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="criar-email" className="rotulo">
            E-mail de quem edita
          </label>
          <input
            id="criar-email"
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            placeholder="voce@exemplo.com"
            className="campo"
          />
          <p className="mt-1.5 text-xs text-ivory/45">
            É a chave da edição do cliente. Sem e-mail, ninguém edita.
          </p>
        </div>
        <div>
          <label htmlFor="criar-registro" className="rotulo">
            Registro do certificado
          </label>
          <input
            id="criar-registro"
            type="text"
            maxLength={60}
            value={registro}
            onChange={(evento) => setRegistro(evento.target.value)}
            placeholder="Vazio = o código da página"
            className="campo"
          />
        </div>
        <div>
          <label htmlFor="criar-codigo" className="rotulo">
            Código (opcional)
          </label>
          <input
            id="criar-codigo"
            type="text"
            maxLength={11}
            value={codigo}
            // O código sempre nasce maiúsculo, igual ao gerador do servidor —
            // o endereço é digitado à mão com mais frequência do que se imagina.
            onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
            placeholder="SG-XXXX-XXXX"
            className="campo font-mono"
          />
          <p className="mt-1.5 text-xs text-ivory/45">Em branco = gerado automaticamente.</p>
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

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-xs text-ivory/45">Nasce como rascunho — publique depois, na lista.</p>
        <button type="submit" className="btn btn-primary" disabled={criando}>
          {criando ? 'Criando…' : 'Criar página'}
        </button>
      </div>
    </form>
  )
}
