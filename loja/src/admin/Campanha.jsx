import { useCallback, useEffect, useMemo, useState } from 'react'
import { chamarAdmin } from '../lib/admin.js'
import { buscarEstrela } from '../lib/catalogo.js'
import { baixarPdf } from '../lib/certificado.js'
import { baixarCarta } from '../lib/carta.js'
import { urlDaPagina } from '../lib/config.js'
import { Folha, FolhaCarta } from '../components/Folha.jsx'
import { paragrafosDaCarta, MAX_PARAGRAFOS_CARTA } from '../../../shared/moderation.js'
import { comporCarta, TONS } from './comporCarta.js'
import { cartasParecidas, MUITO_PARECIDA } from './similaridade.js'
import { tratarErro } from './formatos.js'

/**
 * Aba "Campanha" do painel (0024): as homenagens da PROIMAGEM.
 *
 * Lista (com etapa, estrela, publicação e aviso de carta parecida) e, ao
 * abrir uma, o editor: dados para escrever a carta, a carta (rascunho
 * montado no navegador + edição livre), a mensagem do certificado, as
 * prévias do certificado e da carta com o QR, os PDFs e a publicação.
 *
 * Tudo o que grava passa pelo `admin-api` (validação no servidor); daqui só
 * sai o que o administrador pediu.
 */
const CAMPANHA = 'proimagem'

const ETAPAS = [
  ['rascunho', 'Rascunho'],
  ['revisao', 'Pronta para revisão'],
  ['finalizada', 'Finalizada'],
]

const VAZIA = {
  code: null,
  nome: '',
  nomePreferido: '',
  starSlug: '',
  carta: '',
  mensagem: '',
  assinatura: '',
  data: '',
  etapa: 'rascunho',
  publicada: false,
  notas: { qualidades: '', profissional: '', lembranca: '', tom: 'afetuoso' },
  consentimento: {},
}

export function Campanha({ aoExpirar }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(null)

  const carregar = useCallback(() => {
    setErro('')
    return chamarAdmin('campanha', { campanha: CAMPANHA })
      .then(setDados)
      .catch((e) => setErro(tratarErro(e, aoExpirar)))
  }, [aoExpirar])

  useEffect(() => {
    carregar()
  }, [carregar])

  const parecidas = useMemo(() => cartasParecidas(dados?.homenagens ?? []), [dados])

  if (erro && !dados) return <p className="text-sm text-red-200">{erro}</p>
  if (!dados) return <p className="text-sm text-ivory/55">Carregando a campanha…</p>

  if (aberta) {
    return (
      <Editor
        campanha={dados.campanha}
        inicial={aberta}
        outras={dados.homenagens.filter((h) => h.code !== aberta.code)}
        aoFechar={() => setAberta(null)}
        aoSalvar={async (code) => {
          await carregar()
          return code
        }}
        aoExpirar={aoExpirar}
      />
    )
  }

  const contagem = Object.fromEntries(ETAPAS.map(([id]) => [id, dados.homenagens.filter((h) => h.etapa === id).length]))

  return (
    <div className="space-y-6">
      <Configuracao campanha={dados.campanha} aoSalvar={carregar} aoExpirar={aoExpirar} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ivory">{dados.campanha.nome}</h2>
          <p className="text-xs text-ivory/50">
            {dados.homenagens.length} homenagens · {contagem.rascunho} em rascunho · {contagem.revisao} para revisão ·{' '}
            {contagem.finalizada} finalizadas
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary text-sm"
          onClick={() => setAberta({ ...VAZIA, assinatura: dados.campanha.assinatura })}
        >
          Nova homenagem
        </button>
      </div>

      {dados.homenagens.length === 0 ? (
        <p className="cartao text-sm text-ivory/60">Nenhuma homenagem ainda. Comece por “Nova homenagem”.</p>
      ) : (
        <ul className="grid gap-2">
          {dados.homenagens.map((h) => {
            const parecida = parecidas.get(h.code)
            return (
              <li key={h.code}>
                <button
                  type="button"
                  onClick={() => setAberta(h)}
                  className="cartao flex w-full flex-wrap items-center justify-between gap-3 text-left transition hover:border-gold/40"
                >
                  <span className="min-w-0">
                    <span className="block font-serif text-lg text-ivory">{h.nome}</span>
                    <span className="block text-xs text-ivory/50">
                      {h.estrela?.name ?? h.starSlug} · {h.code}
                      {!h.carta && ' · sem carta'}
                    </span>
                    {parecida && (
                      <span className={`mt-1 block text-xs ${parecida.valor >= MUITO_PARECIDA ? 'text-amber-300' : 'text-ivory/50'}`}>
                        Carta {parecida.valor >= MUITO_PARECIDA ? 'muito ' : ''}parecida com a de {parecida.nome} (
                        {Math.round(parecida.valor * 100)}%)
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs">
                    <Selo cor={h.etapa === 'finalizada' ? 'verde' : h.etapa === 'revisao' ? 'ouro' : 'neutro'}>
                      {ETAPAS.find(([id]) => id === h.etapa)?.[1]}
                    </Selo>
                    <Selo cor={h.publicada ? 'verde' : 'neutro'}>{h.publicada ? 'Página no ar' : 'Página fora do ar'}</Selo>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Selo({ cor, children }) {
  const classes = {
    verde: 'border-emerald-400/40 text-emerald-200',
    ouro: 'border-gold/50 text-gold',
    neutro: 'border-white/15 text-ivory/60',
  }
  return <span className={`rounded-full border px-2.5 py-1 ${classes[cor]}`}>{children}</span>
}

/** Assinatura padrão e frase final da campanha. */
function Configuracao({ campanha, aoSalvar, aoExpirar }) {
  const [assinatura, setAssinatura] = useState(campanha.assinatura)
  const [frase, setFrase] = useState(campanha.fraseFinal)
  const [estado, setEstado] = useState('')

  async function salvar() {
    setEstado('salvando')
    try {
      await chamarAdmin('campanhaConfigurar', { campanha: CAMPANHA, assinatura, fraseFinal: frase })
      await aoSalvar()
      setEstado('salvo')
    } catch (e) {
      setEstado(tratarErro(e, aoExpirar))
    }
  }

  return (
    <details className="cartao">
      <summary className="cursor-pointer text-sm text-ivory/80">Configuração da campanha (assinatura e frase final)</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="rotulo">Assinatura padrão</span>
          <input className="campo" value={assinatura} maxLength={120} onChange={(e) => setAssinatura(e.target.value)} placeholder="Como você assina as cartas" />
        </label>
        <label className="block">
          <span className="rotulo">Frase final da carta (opcional)</span>
          <input className="campo" value={frase} maxLength={200} onChange={(e) => setFrase(e.target.value)} placeholder="Uma linha delicada no pé da carta" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn btn-secundario text-sm" onClick={salvar} disabled={estado === 'salvando'}>
          Salvar configuração
        </button>
        {estado && estado !== 'salvando' && (
          <span className={`text-xs ${estado === 'salvo' ? 'text-emerald-200' : 'text-red-200'}`}>{estado === 'salvo' ? 'Salvo.' : estado}</span>
        )}
      </div>
      <p className="mt-3 text-xs text-ivory/45">
        A assinatura padrão vale para homenagens novas; cada homenagem pode ter a sua. Logo da {campanha.parceiro}:{' '}
        {campanha.logo ? 'autorizada e aplicada.' : 'não autorizada — nada é aplicado.'}
      </p>
    </details>
  )
}

/** Editor de uma homenagem. */
function Editor({ campanha, inicial, outras, aoFechar, aoSalvar, aoExpirar }) {
  const [h, setH] = useState(() => ({ ...VAZIA, ...inicial, notas: { ...VAZIA.notas, ...inicial.notas } }))
  const [estrelas, setEstrelas] = useState(null)
  const [busca, setBusca] = useState('')
  const [estrela, setEstrela] = useState(null)
  const [versao, setVersao] = useState(0)
  const [peca, setPeca] = useState('carta')
  const [claro, setClaro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [baixando, setBaixando] = useState('')

  const mudar = (campo, valor) => setH((atual) => ({ ...atual, [campo]: valor }))
  const mudarNota = (campo, valor) => setH((atual) => ({ ...atual, notas: { ...atual.notas, [campo]: valor } }))
  const mudarConsentimento = (campo, valor) =>
    setH((atual) => ({ ...atual, consentimento: { ...atual.consentimento, [campo]: valor } }))

  // Estrelas com nome próprio ou curadas, livres (e a desta homenagem).
  useEffect(() => {
    let vivo = true
    chamarAdmin('estrelas', { incluir: inicial.starSlug || undefined })
      .then((d) => vivo && setEstrelas(d.estrelas ?? []))
      .catch((e) => vivo && setAviso({ tipo: 'erro', texto: tratarErro(e, aoExpirar) }))
    return () => {
      vivo = false
    }
  }, [inicial.starSlug, aoExpirar])

  // A estrela completa (coordenadas, céu) para as prévias e os PDFs.
  useEffect(() => {
    let vivo = true
    if (!h.starSlug) return undefined
    buscarEstrela(h.starSlug).then((e) => vivo && setEstrela(e))
    return () => {
      vivo = false
    }
  }, [h.starSlug])

  const opcoes = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (estrelas ?? [])
      .filter((e) => e.slug === h.starSlug || !e.status || e.status === 'disponivel')
      .filter((e) => !t || `${e.name} ${e.bayer} ${e.constellation}`.toLowerCase().includes(t))
      .slice(0, 200)
  }, [estrelas, busca, h.starSlug])

  const nomeCurto = h.nomePreferido.trim() || h.nome.trim().split(/\s+/)[0] || ''
  const paragrafos = paragrafosDaCarta(h.carta)
  const parecida = useMemo(() => cartasParecidas([{ ...h, code: h.code ?? 'nova', estrela }, ...outras]).get(h.code ?? 'nova'), [h, estrela, outras])
  const dataPorExtenso = h.data
    ? new Date(`${h.data}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : undefined

  function montarRascunho(proxima = false) {
    if (!estrela) return setAviso({ tipo: 'erro', texto: 'Escolha a estrela antes de montar o rascunho.' })
    const v = proxima ? versao + 1 : versao
    setVersao(v)
    mudar(
      'carta',
      comporCarta({
        nome: nomeCurto || h.nome,
        tom: h.notas.tom,
        qualidades: h.notas.qualidades,
        profissional: h.notas.profissional,
        lembranca: h.notas.lembranca,
        estrela: { nome: estrela.name, constelacao: estrela.constellation },
        versao: v,
      }),
    )
    setPeca('carta')
  }

  async function salvar() {
    setSalvando(true)
    setAviso(null)
    try {
      const r = await chamarAdmin('homenagemSalvar', {
        campanha: CAMPANHA,
        code: h.code,
        nome: h.nome,
        nomePreferido: h.nomePreferido,
        starSlug: h.starSlug,
        carta: h.carta,
        mensagem: h.mensagem,
        assinatura: h.assinatura,
        data: h.data || null,
        etapa: h.etapa,
        publicar: h.publicada,
        notas: h.notas,
        consentimento: h.consentimento,
      })
      await aoSalvar(r.code)
      setH((atual) => ({ ...atual, code: r.code }))
      setAviso({ tipo: 'ok', texto: h.code ? 'Alterações salvas.' : `Homenagem criada: ${r.code}.` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: tratarErro(e, aoExpirar) })
    } finally {
      setSalvando(false)
    }
  }

  const folhaCertificado = estrela && {
    estrela,
    honoreeName: h.nome,
    message: h.mensagem,
    fromName: h.assinatura,
    dedicationDate: dataPorExtenso,
    code: h.code ?? 'SG-XXXX-XXXX',
    campanha,
  }
  const qrUrl = h.code ? urlDaPagina(h.code) : undefined

  async function baixar(qual, versaoClara) {
    if (!estrela || !h.code) return
    setBaixando(`${qual}-${versaoClara}`)
    try {
      if (qual === 'certificado') await baixarPdf(folhaCertificado, { claro: versaoClara, campanha })
      else
        await baixarCarta(
          { paragrafos, titulo: 'Uma carta para você', fromName: h.assinatura, honoreeName: h.nome, estrela, code: h.code, qrUrl },
          { claro: versaoClara, campanha },
        )
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível gerar o PDF agora. Tente de novo.' })
    } finally {
      setBaixando('')
    }
  }

  return (
    <div>
      <button type="button" onClick={aoFechar} className="text-sm text-gold/80 hover:underline">
        ← Voltar para a campanha
      </button>
      <h2 className="font-serif mt-3 text-3xl text-ivory">{h.code ? h.nome || 'Homenagem' : 'Nova homenagem'}</h2>
      {h.code && <p className="text-xs text-ivory/45">{h.code}</p>}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <section className="cartao space-y-4">
            <h3 className="font-display text-ivory">Quem recebe</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome completo" valor={h.nome} aoMudar={(v) => mudar('nome', v)} max={80} />
              <Campo rotulo="Nome preferido (opcional)" valor={h.nomePreferido} aoMudar={(v) => mudar('nomePreferido', v)} max={40} dica="Como ela gosta de ser chamada; vai na página e na carta." />
            </div>
            <label className="block">
              <span className="rotulo">Estrela</span>
              <input className="campo" placeholder="Buscar por nome ou constelação" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <select className="campo mt-2" value={h.starSlug} onChange={(e) => mudar('starSlug', e.target.value)}>
                <option value="">{estrelas === null ? 'Carregando estrelas…' : 'Escolha uma estrela livre'}</option>
                {opcoes.map((e) => (
                  <option key={e.slug} value={e.slug}>
                    {e.name} · {e.bayer} · {e.constellation} · mag {Number(e.magnitude).toLocaleString('pt-BR')}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-ivory/45">Estrelas com nome próprio e livres. Ao salvar, a estrela sai da vitrine da loja.</span>
            </label>
            <Campo rotulo="Data da homenagem" tipo="date" valor={h.data ?? ''} aoMudar={(v) => mudar('data', v)} />
          </section>

          <section className="cartao space-y-4">
            <h3 className="font-display text-ivory">Para escrever a carta</h3>
            <p className="text-xs leading-relaxed text-ivory/50">
              Só o que você conhece de fato. Escreva como trecho de frase (ex.: “a paciência, o bom humor e a atenção aos
              detalhes”). Nada disto aparece na página — fica só no painel.
            </p>
            <Campo multilinha rotulo="Qualidades pessoais" valor={h.notas.qualidades} aoMudar={(v) => mudarNota('qualidades', v)} max={600} />
            <Campo multilinha rotulo="Qualidades no trabalho" valor={h.notas.profissional} aoMudar={(v) => mudarNota('profissional', v)} max={600} />
            <Campo multilinha rotulo="Uma lembrança (opcional)" valor={h.notas.lembranca} aoMudar={(v) => mudarNota('lembranca', v)} max={600} dica="Ex.: “o dia em que você recebeu uma paciente nervosa e a deixou tranquila”." />
            <label className="block">
              <span className="rotulo">Tom</span>
              <select className="campo" value={h.notas.tom} onChange={(e) => mudarNota('tom', e.target.value)}>
                {TONS.map(([id, rotulo]) => (
                  <option key={id} value={id}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secundario text-sm" onClick={() => montarRascunho(false)}>
                Montar rascunho
              </button>
              <button type="button" className="btn btn-secundario text-sm" onClick={() => montarRascunho(true)}>
                Outra versão
              </button>
            </div>
          </section>

          <section className="cartao space-y-4">
            <h3 className="font-display text-ivory">A carta</h3>
            <label className="block">
              <span className="rotulo">
                Carta{' '}
                <span className="float-right font-normal normal-case text-ivory/40">
                  {h.carta.length}/2000 · {paragrafos.length}/{MAX_PARAGRAFOS_CARTA} parágrafos
                </span>
              </span>
              <textarea className="campo" rows={10} maxLength={2000} value={h.carta} onFocus={() => setPeca('carta')} onChange={(e) => mudar('carta', e.target.value)} />
              <span className="mt-1 block text-xs text-ivory/45">Cada linha é um parágrafo; a primeira linha curta vira a saudação.</span>
            </label>
            {parecida && (
              <p className={`rounded-xl border px-3 py-2 text-xs ${parecida.valor >= MUITO_PARECIDA ? 'border-amber-300/40 text-amber-200' : 'border-white/10 text-ivory/60'}`}>
                {Math.round(parecida.valor * 100)}% parecida com a carta de {parecida.nome}.{' '}
                {parecida.valor >= MUITO_PARECIDA ? 'Reescreva alguns trechos para ela ser só desta pessoa.' : 'Vale conferir.'}
              </p>
            )}
            <Campo rotulo="Assinatura" valor={h.assinatura} aoMudar={(v) => mudar('assinatura', v)} max={60} />
            <Campo
              multilinha
              rotulo="Mensagem curta do certificado (opcional)"
              valor={h.mensagem}
              aoMudar={(v) => mudar('mensagem', v)}
              max={600}
              onFocus={() => setPeca('certificado')}
              dica="Uma ou duas linhas; aparece no centro do certificado e na página."
            />
          </section>

          <section className="cartao space-y-4">
            <h3 className="font-display text-ivory">Andamento e publicação</h3>
            <label className="block">
              <span className="rotulo">Etapa</span>
              <select className="campo" value={h.etapa} onChange={(e) => mudar('etapa', e.target.value)}>
                {ETAPAS.map(([id, rotulo]) => (
                  <option key={id} value={id}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>
            <Marcar valor={h.publicada} aoMudar={(v) => mudar('publicada', v)}>
              Página no ar (o link e o QR abrem). Desmarcado, o endereço responde “não existe”.
            </Marcar>
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-ivory/60">
                Consentimento de divulgação (opcional — o presente não depende dele; nada é publicado automaticamente):
              </p>
              <div className="mt-2 space-y-1.5">
                <Marcar valor={Boolean(h.consentimento.redes)} aoMudar={(v) => mudarConsentimento('redes', v)}>
                  Autoriza compartilhar a homenagem nas redes sociais
                </Marcar>
                <Marcar valor={Boolean(h.consentimento.repostagem)} aoMudar={(v) => mudarConsentimento('repostagem', v)}>
                  Autoriza a repostagem no perfil da Stellara
                </Marcar>
                <Marcar valor={Boolean(h.consentimento.imagem)} aoMudar={(v) => mudarConsentimento('imagem', v)}>
                  Autoriza o uso da imagem ou do conteúdo publicado
                </Marcar>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary text-sm" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : h.code ? 'Salvar alterações' : 'Criar homenagem'}
              </button>
              {h.code && h.publicada && (
                <a href={`/p/${h.code}`} target="_blank" rel="noreferrer" className="text-sm text-gold/85 hover:underline">
                  Abrir a página ↗
                </a>
              )}
            </div>
            {aviso && (
              <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${aviso.tipo === 'erro' ? 'text-red-200' : 'text-emerald-200'}`}>
                {aviso.texto}
              </p>
            )}
          </section>
        </div>

        {/* Prévia: o mesmo desenho do PDF. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex rounded-full border border-white/15 p-0.5">
              {[['carta', 'Carta'], ['certificado', 'Certificado']].map(([valor, rotulo]) => (
                <button key={valor} type="button" onClick={() => setPeca(valor)} aria-pressed={peca === valor} className={`rounded-full px-3 py-1.5 ${peca === valor ? 'bg-gold text-night' : 'text-ivory/70'}`}>
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="flex rounded-full border border-white/15 p-0.5">
              {[[false, 'Escura'], [true, 'Clara']].map(([valor, rotulo]) => (
                <button key={rotulo} type="button" onClick={() => setClaro(valor)} aria-pressed={claro === valor} className={`rounded-full px-3 py-1.5 ${claro === valor ? 'bg-gold text-night' : 'text-ivory/70'}`}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {!estrela ? (
              <div className="flex aspect-[210/297] items-center justify-center p-6 text-center text-sm text-ivory/50">Escolha a estrela para ver a prévia.</div>
            ) : peca === 'certificado' ? (
              <Folha {...folhaCertificado} light={claro} />
            ) : (
              <FolhaCarta paragrafos={h.carta || 'Escreva a carta ou monte um rascunho.'} titulo="Uma carta para você" fromName={h.assinatura} starName={estrela.name} code={h.code ?? 'SG-XXXX-XXXX'} qrUrl={qrUrl} campanha={campanha} light={claro} />
            )}
          </div>
          {!h.code && <p className="mt-2 text-xs text-ivory/45">O QR aparece depois de criar a homenagem (ele leva ao endereço definitivo dela).</p>}
          {h.code && estrela && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {[
                ['certificado', false, 'Certificado (escuro)'],
                ['certificado', true, 'Certificado (claro)'],
                ['carta', false, 'Carta (escura)'],
                ['carta', true, 'Carta (clara)'],
              ].map(([qual, versaoClara, rotulo]) => (
                <button key={rotulo} type="button" disabled={Boolean(baixando)} onClick={() => baixar(qual, versaoClara)} className="rounded-full border border-white/20 px-3 py-2 text-ivory/85 transition hover:border-gold hover:text-gold disabled:opacity-50">
                  {baixando === `${qual}-${versaoClara}` ? 'Gerando…' : `Baixar ${rotulo}`}
                </button>
              ))}
            </div>
          )}
          {h.code && <p className="mt-2 text-xs text-ivory/45">Salve antes de baixar: o PDF sai do que está na tela.</p>}
        </div>
      </div>
    </div>
  )
}

function Campo({ rotulo, valor, aoMudar, max, tipo = 'text', multilinha, dica, onFocus }) {
  const Elemento = multilinha ? 'textarea' : 'input'
  return (
    <label className="block">
      <span className="rotulo">{rotulo}</span>
      <Elemento className="campo" type={multilinha ? undefined : tipo} rows={multilinha ? 3 : undefined} maxLength={max} value={valor} onFocus={onFocus} onChange={(e) => aoMudar(e.target.value)} />
      {dica && <span className="mt-1 block text-xs text-ivory/45">{dica}</span>}
    </label>
  )
}

function Marcar({ valor, aoMudar, children }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-ivory/80">
      <input type="checkbox" className="mt-1 accent-[#d8b66a]" checked={valor} onChange={(e) => aoMudar(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}
