import { Reveal } from '../../components/Reveal'
import { kausAustralis } from '../../data/star'
import { useContent } from '../../lib/contentContext'

/**
 * Seção "A estrela": ficha técnica em cartões.
 *
 * Papel na arquitetura: transforma os dados de `loja/src/data/star.js` (que são
 * fatos conferidos no SIMBAD) numa grade de `dl` legível, ao lado da chamada
 * para o certificado. É a prova de que o presente usa coordenadas de verdade.
 *
 * Importado por: `App.jsx`.
 * Exports: `StarDetails`.
 * Invariantes:
 * - os rótulos do `facts` são a `key` do `Reveal`: não podem repetir;
 * - campos ausentes (catálogos, nota de magnitude) são filtrados — nunca podem
 *   aparecer como "undefined" na tela;
 * - o atraso dos cartões (`80 + i * 70`) forma a diagonal de entrada; mudar o
 *   número de fatos muda o ritmo, mas não pode deixar cartões sem animação.
 */
export function StarDetails({ onOpenCertificate }) {
  const { content } = useContent()
  // Ver `Hero.jsx`: no site pessoal a estrela é o import, nas páginas de
  // clientes ela vem no conteúdo.
  const estrela = content.estrela ?? kausAustralis

  /*
   * Montado aqui, e não no módulo, porque "Nome batizado" vem do conteúdo
   * editável — fora do componente ele ficaria preso no valor padrão.
   *
   * Campos que só existem para Kaus Australis (catálogos, nota de magnitude)
   * são condicionais: numa página de outra estrela o que não temos não aparece,
   * em vez de virar "undefined" na tela.
   */
  // Números no padrão brasileiro (vírgula), como no certificado.
  const numero = (v, casas) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).replace('-', '−')
  const facts = [
    // Nome e designação em duas linhas: "Kaus Australis (ε / Sagittarii)"
    // quebrava no meio do parêntese.
    { label: 'Nome oficial', value: estrela.commonName, detalhe: estrela.bayer },
    content.apelidoEstrela
      ? { label: 'Nome nesta homenagem', value: `“${content.apelidoEstrela}”`, detalhe: `Dedicada a ${content.nome}` }
      : { label: 'Dedicada a', value: content.nome },
    { label: 'Constelação', value: estrela.constellation, detalhe: estrela.constellationLatin },
    { label: 'Ascensão reta (J2000)', value: estrela.ra.formatted },
    { label: 'Declinação (J2000)', value: estrela.dec.formatted },
    {
      label: 'Magnitude aparente',
      value: estrela.magnitudeRange ?? numero(estrela.magnitude, 2),
    },
    {
      label: 'Distância',
      value: estrela.distanceLy ? `${numero(estrela.distanceLy, estrela.distanceLy < 100 ? 1 : 0)} anos-luz` : 'não medida com precisão',
      detalhe: estrela.distanceLy && estrela.distancePc ? `cerca de ${numero(estrela.distancePc, 1)} parsecs` : undefined,
    },
    { label: 'Tipo espectral', value: estrela.spectralType },
    estrela.hip && estrela.hd && estrela.hr
      ? { label: 'Catálogos', value: `${estrela.hip} · ${estrela.hd} · ${estrela.hr}` }
      : null,
  ].filter(Boolean)

  return (
    <section id="estrela" className="relative z-10 mx-auto max-w-6xl px-5 py-16">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <Reveal>
            <p className="font-display text-[11px] tracking-[0.35em] text-gold uppercase">A estrela</p>
            <h2 className="font-serif mt-3 text-4xl text-ivory sm:text-5xl">{content.tituloEstrela}</h2>
            <p className="mt-5 max-w-xl text-ivory/70 leading-relaxed">
              {content.descricaoEstrela}
            </p>
            {estrela.magnitudeNote && (
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-ivory/60">
                <span className="text-gold/80">Sobre a magnitude:</span>{' '}
                {estrela.magnitudeNote}
              </p>
            )}
          </Reveal>

          <Reveal delay={160}>
            <button
              type="button"
              onClick={onOpenCertificate}
              className="mt-8 rounded-full bg-gold px-6 py-3 text-sm font-medium text-night transition hover:bg-gold-soft hover:shadow-[0_0_28px_rgba(216,182,106,0.45)]"
            >
              Ver o certificado
            </button>
          </Reveal>
        </div>

        {/* Cada cartão entra com um atraso curto, formando uma diagonal. */}
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact, index) => (
            <Reveal
              key={fact.label}
              delay={80 + index * 70}
              distance={22}
              className="tilt rounded-2xl border border-white/8 bg-white/5 p-4"
            >
              <dt className="text-[11px] tracking-wide text-gold/80 uppercase">{fact.label}</dt>
              <dd className="mt-2 font-serif text-lg leading-snug text-ivory">
                {fact.value}
                {fact.detalhe && <span className="mt-0.5 block font-sans text-xs text-ivory/55">{fact.detalhe}</span>}
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  )
}
