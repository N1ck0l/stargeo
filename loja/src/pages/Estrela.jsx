import { useEffect, useState } from 'react'
import { MiniCeuSobDemanda } from '../components/MiniCeuSobDemanda.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { buscarEstrela, buscarEstrelas, comoSeVe, reais } from '../lib/catalogo.js'
import { Link } from '../lib/Link.jsx'
import { useMetaPagina } from '../lib/meta.js'

/**
 * A página pública de uma estrela — `/estrelas/<slug>`.
 *
 * Existe para quem chega pela busca ("estrela Antares", "Vega constelação"):
 * a história da estrela, onde ela fica, como se vê do Brasil, o céu em volta
 * e, se ainda estiver livre, o preço e o caminho para dedicá-la. As estrelas
 * com nome próprio entram no `sitemap.xml`; o título e o canônico para robôs
 * sem JavaScript vêm da edge function `estrela-og.ts`.
 *
 * Nada aqui fala de quem recebeu uma estrela já dedicada: isso é da página do
 * presente (`/p/…`), que é privada por endereço.
 */
export default function Estrela({ slug }) {
  const [estrela, setEstrela] = useState(undefined) // undefined = carregando, null = não existe
  const [vizinhas, setVizinhas] = useState([])

  useEffect(() => {
    let vivo = true
    buscarEstrela(slug)
      .then((e) => vivo && setEstrela(e ?? null))
      .catch(() => vivo && setEstrela(null))
    return () => {
      vivo = false
    }
  }, [slug])

  const sigla = estrela?.sigla
  useEffect(() => {
    if (!sigla) return undefined
    let vivo = true
    buscarEstrelas({ sigla, limite: 7 })
      .then((r) => vivo && setVizinhas(r.estrelas.filter((e) => e.slug !== slug).slice(0, 6)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [sigla, slug])

  useMetaPagina({
    titulo: estrela ? `${estrela.name}, em ${estrela.constellation} · Dedique esta estrela | Stellara` : '',
    descricao: estrela?.story,
  })

  if (estrela === undefined) {
    return <div className="espaco-secao min-h-[60vh]" aria-busy="true" />
  }

  if (!estrela) {
    return (
      <div className="pilha espaco-secao text-center">
        <h1 className="font-display text-3xl text-ivory">Estrela não encontrada</h1>
        <p className="mt-3 text-ivory/70">Este endereço não corresponde a nenhuma estrela do catálogo.</p>
        <Link para="/estrelas" className="btn btn-primary mt-8">
          Explorar o catálogo
        </Link>
      </div>
    )
  }

  const livre = !estrela.status || estrela.status === 'disponivel'
  const dados = [
    ['Constelação', `${estrela.constellation}${estrela.constellationLatin ? ` (${estrela.constellationLatin})` : ''}`],
    ['Designação', estrela.bayer],
    ['Brilho', `magnitude ${estrela.magnitude.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} — ${comoSeVe(estrela.magnitude)}`],
    [
      'Distância',
      estrela.distanceLy
        ? `${estrela.distanceLy.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos-luz`
        : 'não medida com precisão',
    ],
    ['No céu do Brasil', ondeSeVe(estrela.visibility)],
    ['Melhor época', estrela.bestMonth],
    ['Tipo espectral', estrela.spectralType],
  ].filter(([, valor]) => valor)

  return (
    <div className="espaco-secao">
      <div className="pilha">
        <nav aria-label="Trilha" className="mb-8 text-sm text-ivory/50">
          <Link para="/" className="transition hover:text-gold">
            Início
          </Link>
          <span className="mx-2">/</span>
          <Link para="/estrelas" className="transition hover:text-gold">
            Catálogo
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ivory/80">{estrela.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Reveal>
            <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">
              Uma estrela de {estrela.constellation}
            </p>
            <h1 className="mt-3 font-serif text-4xl text-ivory sm:text-5xl">{estrela.name}</h1>
            <p className="mt-2 text-gold/80">{estrela.bayer}</p>
            {estrela.story && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ivory/75">{estrela.story}</p>}

            <dl className="mt-8 grid max-w-2xl gap-x-8 gap-y-4 sm:grid-cols-2">
              {dados.map(([rotulo, valor]) => (
                <div key={rotulo}>
                  <dt className="text-[11px] tracking-[0.2em] text-gold/70 uppercase">{rotulo}</dt>
                  <dd className="mt-1 text-sm text-ivory/85">{valor}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <Reveal delay={120} as="aside" className="cartao h-fit">
            <figure className="text-center">
              <MiniCeuSobDemanda estrela={estrela} className="mx-auto aspect-square w-48" />
              <figcaption className="mt-3 text-[11px] text-ivory/50">
                O céu real em volta de {estrela.name}, como sai no certificado
              </figcaption>
            </figure>

            {livre ? (
              <>
                <p className="mt-6 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ivory/60">Dedicar esta estrela</span>
                  <span className="font-display text-2xl text-gold">{reais(estrela.precoCentavos)}</span>
                </p>
                <p className="mt-1 text-right text-[11px] text-ivory/45">Pix ou até 12x no cartão, pelo Mercado Pago</p>
                <Link
                  para={`/produto/certificado-digital?estrela=${estrela.slug}`}
                  className="btn btn-primary mt-4 w-full"
                >
                  Dedicar {estrela.name} a alguém
                </Link>
                <p className="mt-3 text-xs leading-relaxed text-ivory/50">
                  Exclusiva: depois de dedicada, sai do catálogo. Certificado em PDF e página da estrela,
                  prontos em minutos. A homenagem é simbólica — o nome oficial continua o dos catálogos.
                </p>
              </>
            ) : (
              <p className="mt-6 rounded-xl border border-white/10 px-4 py-3 text-sm text-ivory/70">
                {estrela.name} já foi dedicada a alguém — cada estrela da Stellara é de uma pessoa só.{' '}
                <Link para="/estrelas" className="text-gold hover:underline">
                  Ver as que estão livres
                </Link>
              </p>
            )}
          </Reveal>
        </div>

        {vizinhas.length > 0 && (
          <section aria-labelledby="vizinhas-titulo" className="mt-16">
            <h2 id="vizinhas-titulo" className="font-serif text-2xl text-ivory">
              Outras estrelas livres em {estrela.constellation}
            </h2>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {vizinhas.map((v) => (
                <li key={v.slug}>
                  <Link
                    para={`/estrelas/${v.slug}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/25"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-sm text-ivory">{v.name}</span>
                      <span className="mt-0.5 block text-[11px] text-ivory/45">{comoSeVe(v.magnitude)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ivory/80">{reais(v.precoCentavos)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function ondeSeVe(visibilidade) {
  if (visibilidade === 'nunca') return 'não sobe no céu do Brasil (é do hemisfério norte)'
  if (visibilidade === 'norte') return 'visível do norte do Brasil'
  return 'visível de todo o Brasil'
}
