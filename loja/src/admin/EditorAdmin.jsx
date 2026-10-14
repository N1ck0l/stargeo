import { useEffect, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { classeStatus, tratarErro } from './formatos.js'

/**
 * Editor de página — tudo que o servidor aceita em `paginaAtualizar`.
 *
 * Enquanto o cliente edita três campos, aqui a página inteira: dedicação
 * (nome, estrela, data, e-mail, registro), textos da loja, carta, mensagem
 * pessoal e o status de publicação. Salvar manda o pacote inteiro; o
 * servidor valida cada campo e devolve a página montada de volta.
 */
export function EditorAdmin({ codigo, aoFechar, aoExpirar }) {
  const [pagina, setPagina] = useState(null)
  const [estrelas, setEstrelas] = useState([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState(null)

  // Dados de dedicação (colunas da linha).
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [data, setData] = useState('')
  const [email, setEmail] = useState('')
  const [registro, setRegistro] = useState('')
  const [publicada, setPublicada] = useState(false)

  // Conteúdo (textos).
  const [tituloHero, setTituloHero] = useState('')
  const [fraseHero, setFraseHero] = useState('')
  const [tituloEstrela, setTituloEstrela] = useState('')
  const [descricaoEstrela, setDescricaoEstrela] = useState('')
  const [tituloCarta, setTituloCarta] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [carta, setCarta] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [mostrarMensagem, setMostrarMensagem] = useState(true)
  const [mostrarMira, setMostrarMira] = useState(true)

  useEffect(() => {
    let vivo = true
    Promise.all([chamarAdmin('paginaAbrir', { code: codigo }), chamarAdmin('estrelas')])
      .then(([aberta, lista]) => {
        if (!vivo) return
        setEstrelas(lista.estrelas ?? [])
        montar(aberta.pagina)
      })
      .catch((e) => {
        const mensagem = tratarErro(e, aoExpirar)
        if (vivo && mensagem) setErro(mensagem)
      })
    return () => {
      vivo = false
    }
  }, [codigo, aoExpirar])

  /**
   * Espalha a linha devolvida pelo servidor nos dezenas de `useState`.
   *
   * A carta vira um `textarea` com `\n\n` entre os parágrafos — é o inverso
   * (e o mesmo contrato) do que `contarParagrafos` conta ao salvar. Chamar
   * depois de CADA gravação importa: o servidor limpa e valida os textos, e
   * a tela tem que mostrar o que ficou gravado, não o que foi digitado.
   */
  function montar(linha) {
    const conteudo = linha.conteudo
    setPagina(linha)
    setNome(linha.honoree_name ?? '')
    setSlug(linha.star_slug ?? '')
    setData(linha.dedication_date ?? '')
    setEmail(linha.customer_email ?? '')
    setRegistro(linha.certificate_id ?? '')
    setPublicada(linha.status === 'published')
    setTituloHero(conteudo.tituloHero ?? '')
    setFraseHero(conteudo.fraseHero ?? '')
    setTituloEstrela(conteudo.tituloEstrela ?? '')
    setDescricaoEstrela(conteudo.descricaoEstrela ?? '')
    setTituloCarta(conteudo.tituloCarta ?? '')
    setAssinatura(conteudo.assinatura ?? '')
    setCarta((conteudo.carta ?? []).join('\n\n'))
    setMensagem(conteudo.mensagemPessoal ?? '')
    setMostrarMensagem(conteudo.mostrarMensagem !== false)
    setMostrarMira(conteudo.mostrarMira !== false)
    setErro('')
    setSalvoEm(null)
  }

  /**
   * Salva o pacote inteiro, e não só o campo que mudou.
   *
   * O `paginaAtualizar` aceita qualquer subconjunto, mas mandar tudo evita a
   * pergunta "o que a pessoa alterou?" — o formulário é a fonte visível da
   * tela, então o que está nele é o que deve ficar gravado. Os limites de
   * tamanho e a moderação rodam no servidor (`validarConteudo` + `limpar`);
   * aqui só o cheque dos 12 parágrafos, para o erro aparecer no campo certo
   * antes da ida e volta.
   */
  async function aoSalvar(evento) {
    evento.preventDefault()
    if (salvando) return

    const paragrafos = contarParagrafos(carta)
    if (paragrafos > 12) {
      setErro(`A carta tem ${paragrafos} parágrafos — o limite é 12. Separe os blocos por uma linha em branco.`)
      return
    }

    setSalvando(true)
    setErro('')
    try {
      const dados = await chamarAdmin('paginaAtualizar', {
        code: codigo,
        status: publicada ? 'published' : 'draft',
        honoree_name: nome.trim(),
        star_slug: slug,
        dedication_date: data || null,
        customer_email: email.trim(),
        certificate_id: registro.trim(),
        conteudo: {
          assinatura,
          carta,
          tituloHero,
          fraseHero,
          tituloEstrela,
          descricaoEstrela,
          tituloCarta,
          mensagemPessoal: mensagem,
          mostrarMensagem,
          mostrarMira,
        },
      })
      montar(dados.pagina)
      setSalvoEm(Date.now())
    } catch (e) {
      const mensagemErro = tratarErro(e, aoExpirar)
      if (mensagemErro) setErro(mensagemErro)
    } finally {
      setSalvando(false)
    }
  }

  if (erro && !pagina) {
    return (
      <div>
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {erro}
        </p>
        <button type="button" onClick={aoFechar} className="btn btn-secundario mt-4 text-sm">
          Voltar
        </button>
      </div>
    )
  }

  if (!pagina) {
    return (
      <div className="flex justify-center py-16">
        <span className="inline-block h-8 w-8 animate-spin-slow rounded-full border border-gold/25 border-t-gold" />
      </div>
    )
  }

  const paragrafos = contarParagrafos(carta)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[11px] tracking-[0.3em] text-gold uppercase">
            Editar página
          </p>
          <h1 className="font-serif mt-2 text-3xl text-ivory sm:text-4xl">{nome}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-sm text-ivory/50">{codigo}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${classeStatus(pagina.status)}`}
            >
              {pagina.status === 'published' ? 'Publicada' : 'Rascunho'}
            </span>
            {pagina.status === 'published' && (
              // `<a>` de verdade e não `Link`: a página pública é outro
              // mundo (sem o painel no meio), e abrir em nova aba deixa o
              // formulário como estava.
              <a
                href={`/p/${codigo}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ivory/55 transition hover:text-gold"
              >
                Ver página ↗
              </a>
            )}
          </div>
        </div>
        <button type="button" onClick={aoFechar} className="btn btn-secundario text-sm">
          Voltar para a lista
        </button>
      </div>

      <form onSubmit={aoSalvar} className="mt-7 grid gap-6">
        {/* --- dedicação: o que era imutável para o cliente, livre aqui ------ */}
        <fieldset className="cartao">
          <legend className="font-display px-2 text-[11px] tracking-[0.2em] text-gold/80 uppercase">
            Dedicação
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-nome" className="rotulo">
                Para quem
              </label>
              <input
                id="ed-nome"
                type="text"
                required
                maxLength={120}
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="ed-estrela" className="rotulo">
                Estrela
              </label>
              <select
                id="ed-estrela"
                required
                value={slug}
                onChange={(evento) => setSlug(evento.target.value)}
                className="campo"
              >
                <option value="">Escolha uma estrela</option>
                {estrelas.map((estrela) => (
                  <option key={estrela.slug} value={estrela.slug}>
                    {estrela.name} ({estrela.bayer} · {estrela.constellation})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ed-data" className="rotulo">
                Data da dedicação
              </label>
              <input
                id="ed-data"
                type="date"
                value={data}
                onChange={(evento) => setData(evento.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="ed-email" className="rotulo">
                E-mail de quem edita
              </label>
              <input
                id="ed-email"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                className="campo"
              />
              <p className="mt-1.5 text-xs text-ivory/45">
                A chave de entrada da edição do cliente.
              </p>
            </div>
            <div>
              <label htmlFor="ed-registro" className="rotulo">
                Registro do certificado
              </label>
              <input
                id="ed-registro"
                type="text"
                maxLength={60}
                value={registro}
                onChange={(evento) => setRegistro(evento.target.value)}
                placeholder="Vazio = o código da página"
                className="campo"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-3 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={publicada}
                  onChange={(evento) => setPublicada(evento.target.checked)}
                  className="h-4 w-4 accent-gold"
                />
                Publicada (visível para todos)
              </label>
            </div>
          </div>
        </fieldset>

        {/* --- textos da loja ---------------------------------------------- */}
        <fieldset className="cartao">
          <legend className="font-display px-2 text-[11px] tracking-[0.2em] text-gold/80 uppercase">
            Textos da página
          </legend>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ed-titulo-hero" className="rotulo">
                  Título do topo
                </label>
                <input
                  id="ed-titulo-hero"
                  type="text"
                  maxLength={120}
                  value={tituloHero}
                  onChange={(evento) => setTituloHero(evento.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="ed-frase-hero" className="rotulo">
                  Frase do topo
                </label>
                <input
                  id="ed-frase-hero"
                  type="text"
                  maxLength={220}
                  value={fraseHero}
                  onChange={(evento) => setFraseHero(evento.target.value)}
                  className="campo"
                />
                <p className="mt-1.5 text-right text-xs text-ivory/45">{fraseHero.length}/220</p>
              </div>
            </div>
            <div>
              <label htmlFor="ed-titulo-estrela" className="rotulo">
                Título da estrela
              </label>
              <input
                id="ed-titulo-estrela"
                type="text"
                maxLength={160}
                value={tituloEstrela}
                onChange={(evento) => setTituloEstrela(evento.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="ed-descricao-estrela" className="rotulo">
                Descrição da estrela
              </label>
              <textarea
                id="ed-descricao-estrela"
                rows={5}
                maxLength={1600}
                value={descricaoEstrela}
                onChange={(evento) => setDescricaoEstrela(evento.target.value)}
                className="campo"
                style={{ minHeight: '8rem' }}
              />
              <p className="mt-1.5 text-right text-xs text-ivory/45">
                {descricaoEstrela.length}/1600
              </p>
            </div>
            <div>
              <label htmlFor="ed-titulo-carta" className="rotulo">
                Título da carta
              </label>
              <input
                id="ed-titulo-carta"
                type="text"
                maxLength={160}
                value={tituloCarta}
                onChange={(evento) => setTituloCarta(evento.target.value)}
                className="campo"
              />
            </div>
          </div>
        </fieldset>

        {/* --- carta -------------------------------------------------------- */}
        <fieldset className="cartao">
          <legend className="font-display px-2 text-[11px] tracking-[0.2em] text-gold/80 uppercase">
            Carta
          </legend>
          <div className="grid gap-4">
            <div>
              <label htmlFor="ed-assinatura" className="rotulo">
                Assinatura
              </label>
              <input
                id="ed-assinatura"
                type="text"
                maxLength={120}
                value={assinatura}
                onChange={(evento) => setAssinatura(evento.target.value)}
                placeholder="Com amor, [nome]"
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="ed-carta" className="rotulo">
                A carta
              </label>
              <textarea
                id="ed-carta"
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
          </div>
        </fieldset>

        {/* --- mensagem pessoal + mira ------------------------------------- */}
        <fieldset className="cartao">
          <legend className="font-display px-2 text-[11px] tracking-[0.2em] text-gold/80 uppercase">
            Mensagem pessoal e mira
          </legend>
          <div className="grid gap-4">
            <div>
              <label htmlFor="ed-mensagem" className="rotulo">
                Mensagem pessoal
              </label>
              <textarea
                id="ed-mensagem"
                rows={6}
                maxLength={4000}
                value={mensagem}
                onChange={(evento) => setMensagem(evento.target.value)}
                placeholder="Vazia = a seção não aparece na página."
                className="campo"
                style={{ minHeight: '9rem' }}
              />
              <p className="mt-1.5 flex justify-between gap-2 text-xs text-ivory/45">
                <span>O cliente também edita este campo na dele.</span>
                <span>{mensagem.length}/4000</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={mostrarMensagem}
                  onChange={(evento) => setMostrarMensagem(evento.target.checked)}
                  className="h-4 w-4 accent-gold"
                />
                Mostrar a seção da mensagem
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={mostrarMira}
                  onChange={(evento) => setMostrarMira(evento.target.checked)}
                  className="h-4 w-4 accent-gold"
                />
                Mostrar a mira da estrela
              </label>
            </div>
          </div>
        </fieldset>

        {erro && (
          <p
            role="alert"
            className="animate-fade-in rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {erro}
          </p>
        )}
        {salvoEm && !erro && (
          <p
            role="status"
            className="animate-fade-in rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          >
            Salvo. {publicada ? 'A página pública já mostra o que mudou.' : 'Segue em rascunho.'}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-ivory/45">
            Atualizada pela última vez em{' '}
            {pagina.updated_at ? new Date(pagina.updated_at).toLocaleString('pt-BR') : '—'}
          </span>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Mesma regra do servidor: parágrafos separados por linha(s) em branco. */
function contarParagrafos(texto) {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean).length
}
