import { useEffect, useId, useRef, useState } from 'react'
import { CONSTELACOES } from '../../../shared/constelacoes.js'
import { buscarEstrela, buscarEstrelas, buscarVitrine, comoSeVe, estrelaAleatoria, reais, useFaixas } from '../lib/catalogo.js'

/**
 * Explorar o catálogo — ~118 mil estrelas do Hipparcos.
 *
 * Busca por nome ou designação ("Antares", "ε Sagittarii", "HIP 12345"); se
 * o texto for o nome de uma constelação ("Escorpião"), vira filtro de
 * constelação. Filtros de faixa (preço) e de visibilidade, e o
 * "Surpreenda-me". Sem nada digitado, as mais brilhantes ainda livres.
 *
 * Só aparecem estrelas que dá para comprar: cada uma é exclusiva, e as já
 * dedicadas (ou reservadas no meio de um pagamento) saem da lista.
 *
 * `aoEscolher(estrela)` recebe a estrela já normalizada (`lib/catalogo.js`).
 * Usado no configurador (`pages/Produto.jsx`) e no catálogo (`pages/Catalogo.jsx`).
 */
const POR_PAGINA = 12

/** Constelação digitada por nome, sem acento nem caixa ("escorpiao" → Sco). */
function constelacaoDoTexto(texto) {
  const limpo = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const t = limpo(texto)
  if (t.length < 3) return null
  return CONSTELACOES.find((c) => limpo(c.pt) === t || limpo(c.latim) === t) ?? null
}

const ORDEM_PT = [...CONSTELACOES].sort((a, b) => a.pt.localeCompare(b.pt, 'pt-BR'))

export function ExploradorDeEstrelas({ selecionada, aoEscolher, titulo = 'Buscar no catálogo' }) {
  const id = useId()
  const faixas = useFaixas()
  const [texto, setTexto] = useState('')
  const [sigla, setSigla] = useState('')
  const [faixa, setFaixa] = useState('')
  const [soBrasil, setSoBrasil] = useState(true)
  const [resultado, setResultado] = useState({ estrelas: [], total: 0 })
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [sorteando, setSorteando] = useState(false)
  // A última resposta foi a vitrine (amostra de cada faixa), não uma busca.
  const [emVitrine, setEmVitrine] = useState(false)
  const pedido = useRef(0)

  const constelacaoDigitada = constelacaoDoTexto(texto)

  // Busca com espera curta depois da última tecla; a resposta velha que
  // chegar depois de uma nova é descartada (`pedido`).
  useEffect(() => {
    const numero = ++pedido.current
    const espera = setTimeout(
      () => {
        setCarregando(true)
        // Sem nada escolhido: a vitrine com todas as faixas de preço.
        const vitrine = !texto && !sigla && !faixa && !constelacaoDigitada && pagina === 0
        const consulta = vitrine
          ? buscarVitrine({ visivelBrasil: soBrasil })
          : buscarEstrelas({
              texto: constelacaoDigitada ? '' : texto,
              sigla: constelacaoDigitada?.sigla ?? (sigla || null),
              faixa: faixa || null,
              visivelBrasil: soBrasil,
              limite: POR_PAGINA,
              deslocamento: pagina * POR_PAGINA,
            })
        consulta
          .then((r) => {
            if (numero !== pedido.current) return
            setEmVitrine(vitrine)
            setResultado((anterior) => (pagina > 0 ? { estrelas: [...anterior.estrelas, ...r.estrelas], total: r.total } : r))
            setErro('')
          })
          .catch(() => {
            if (numero === pedido.current) setErro('Não foi possível buscar agora. Tente de novo em instantes.')
          })
          .finally(() => {
            if (numero === pedido.current) setCarregando(false)
          })
      },
      texto ? 280 : 0,
    )
    return () => clearTimeout(espera)
  }, [texto, sigla, faixa, soBrasil, pagina, constelacaoDigitada])

  // Filtro novo recomeça da primeira página.
  const filtrar = (fn) => (valor) => {
    setPagina(0)
    fn(valor)
  }

  async function surpreender() {
    setSorteando(true)
    try {
      const slug = await estrelaAleatoria({ faixa: faixa || null })
      const estrela = slug ? await buscarEstrela(slug) : null
      if (estrela) aoEscolher(estrela)
    } catch {
      setErro('Não foi possível sortear agora. Tente de novo.')
    } finally {
      setSorteando(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-busca`} className="rotulo">
            {titulo}
          </label>
          <input
            id={`${id}-busca`}
            type="search"
            className="campo"
            value={texto}
            onChange={(e) => filtrar(setTexto)(e.target.value)}
            placeholder="Nome, designação ou constelação — ex.: Antares, ε Sagittarii, Órion"
            autoComplete="off"
          />
        </div>
        <button type="button" onClick={surpreender} disabled={sorteando} className="btn btn-secundario whitespace-nowrap">
          {sorteando ? 'Sorteando…' : '✦ Surpreenda-me'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Constelação"
          value={constelacaoDigitada?.sigla ?? sigla}
          onChange={(e) => {
            setTexto('')
            filtrar(setSigla)(e.target.value)
          }}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-ivory"
        >
          <option value="">Todas as constelações</option>
          {ORDEM_PT.map((c) => (
            <option key={c.sigla} value={c.sigla}>
              {c.pt}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Faixa de preço" className="flex flex-wrap gap-1.5">
          {[{ slug: '', nome: 'Todas' }, ...faixas].map((f) => (
            <button
              key={f.slug || 'todas'}
              type="button"
              onClick={() => filtrar(setFaixa)(f.slug)}
              aria-pressed={faixa === f.slug}
              title={f.descricao}
              className={`rounded-full border px-3 py-1.5 transition ${
                faixa === f.slug ? 'border-gold/70 bg-gold/15 text-gold' : 'border-white/12 text-ivory/70 hover:border-white/30'
              }`}
            >
              {f.nome}
              {f.precoCentavos ? <span className="ml-1 text-ivory/45">{reais(f.precoCentavos)}</span> : null}
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-ivory/65">
          <input type="checkbox" checked={soBrasil} onChange={(e) => filtrar(setSoBrasil)(e.target.checked)} className="accent-[#d8b66a]" />
          Visíveis em todo o Brasil
        </label>
      </div>

      <p aria-live="polite" className="mt-4 text-xs text-ivory/50">
        {erro ||
          (carregando && pagina === 0
            ? 'Procurando no céu…'
            : resultado.total
              ? `${resultado.total.toLocaleString('pt-BR')} ${resultado.total === 1 ? 'estrela livre' : 'estrelas livres'}${
                  constelacaoDigitada ? ` em ${constelacaoDigitada.pt}` : ''
                } — cada uma só pode ser dedicada uma vez`
              : 'Nenhuma estrela livre com esses filtros.')}
      </p>

      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {resultado.estrelas.map((estrela) => {
          const ativa = estrela.slug === selecionada
          return (
            <li key={estrela.slug}>
              <button
                type="button"
                onClick={() => aoEscolher(estrela)}
                aria-pressed={ativa}
                className={`flex w-full items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${
                  ativa ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-serif text-sm leading-tight text-ivory">{estrela.name}</span>
                  <span className="mt-1 block truncate text-[11px] text-gold/70">
                    {estrela.bayer} · {estrela.constellation}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ivory/45">{comoSeVe(estrela.magnitude)}</span>
                </span>
                <span className="shrink-0 text-xs text-ivory/80">{reais(estrela.precoCentavos)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {emVitrine && (
        <p className="mt-3 text-center text-xs text-ivory/50">
          Uma amostra de cada faixa. Busque um nome, escolha uma constelação ou uma faixa para ver todas.
        </p>
      )}

      {!emVitrine && resultado.estrelas.length < resultado.total && (
        <button
          type="button"
          onClick={() => setPagina((p) => p + 1)}
          disabled={carregando}
          className="mt-3 w-full rounded-xl border border-white/10 py-2.5 text-sm text-ivory/70 transition hover:border-gold/50 hover:text-gold"
        >
          {carregando ? 'Carregando…' : 'Ver mais estrelas'}
        </button>
      )}
    </div>
  )
}
