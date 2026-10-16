import { useState } from 'react'
import { Reveal } from '../../components/Reveal'
import { useContent } from '../../lib/contentContext'
import { urlDaPagina } from '../../lib/config.js'
import { Link } from '../../lib/Link.jsx'

/**
 * Fecho da página de uma homenagem de campanha (0024), depois da carta: o
 * que a homenagem significa (e o que ela NÃO é), a assinatura, o parceiro,
 * um "copiar link" e — por último, discreto — o convite para conhecer a
 * Stellara. Nenhum pop-up, contador ou chamada de venda: a página é um
 * presente, e quem decide compartilhar é quem recebeu.
 */
export function SobreHomenagem({ codigo }) {
  const { content } = useContent()
  const campanha = content.campanha
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlDaPagina(codigo))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <section id="homenagem" className="relative z-10 mx-auto max-w-3xl px-5 pb-20 text-center">
      <Reveal>
        <p className="font-display text-[11px] tracking-[0.35em] text-gold uppercase">Sobre esta homenagem</p>
        <h2 className="font-serif mt-3 text-3xl text-ivory sm:text-4xl">Uma estrela de verdade, um gesto simbólico</h2>
        <div className="gold-line mx-auto mt-7 w-24" />
      </Reveal>

      <Reveal delay={120} className="mx-auto mt-8 max-w-2xl space-y-4 text-left leading-relaxed text-ivory/75 sm:text-center">
        <p>
          A estrela existe: as coordenadas, o brilho e a distância vêm do catálogo Hipparcos, da Agência Espacial Europeia, e
          ela pode ser encontrada no céu com o mapa acima.
        </p>
        <p>
          A dedicação é simbólica. Nenhuma empresa dá nome oficial a uma estrela — isso cabe à comunidade astronômica, e nos
          catálogos ela continua com o nome de sempre. O que esta página guarda é outra coisa: o reconhecimento de alguém
          que quis registrar, no céu, o quanto você é importante.
        </p>
      </Reveal>

      {content.assinatura && (
        <Reveal delay={200} className="mt-10">
          {/* Só a assinatura, sem "Com carinho" fixo: ela pode já dizer isso. */}
          <span className="text-gold/60" aria-hidden="true">✦</span>
          <p className="font-serif mt-2 text-2xl text-gold italic">{content.assinatura}</p>
        </Reveal>
      )}

      {campanha?.logo && (
        <Reveal delay={260} className="mt-10 flex flex-col items-center gap-3">
          <p className="text-[10px] tracking-[0.3em] text-ivory/45 uppercase">Uma iniciativa com</p>
          {/* A logo do parceiro como ela é — num cartão claro, para o azul da marca não sumir no fundo. */}
          <span className="inline-flex rounded-xl border border-gold/40 bg-[#fbf8f1] px-4 py-3">
            <img src={campanha.logo.src} alt={campanha.parceiro} className="h-12 w-auto sm:h-14" loading="lazy" />
          </span>
        </Reveal>
      )}

      <Reveal delay={320} className="mt-10">
        <button
          type="button"
          onClick={copiar}
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-ivory/85 transition hover:border-gold hover:text-gold"
        >
          {copiado ? 'Link copiado ✓' : 'Copiar o link desta página'}
        </button>
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-ivory/45">
          A página é sua: compartilhe se e quando quiser. Ela não aparece em buscadores — só abre com o link.
        </p>
      </Reveal>

      <Reveal delay={380} className="mt-14 border-t border-white/10 pt-8">
        <p className="text-sm text-ivory/55">
          Quer dedicar uma estrela a alguém?{' '}
          <Link para="/" className="text-gold/85 underline-offset-4 transition hover:text-gold hover:underline">
            Conheça a Stellara
          </Link>
        </p>
      </Reveal>
    </section>
  )
}
