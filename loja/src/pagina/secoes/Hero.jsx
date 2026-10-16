import { Reveal } from '../../components/Reveal'
import { SimboloOficial } from '../../components/SimboloOficial.jsx'
import { kausAustralis } from '../../data/star'
import { useRef } from 'react'
import { useContent } from '../../lib/contentContext'
import { useParallaxDoTopo } from '../../lib/parallax.js'
import { useTypewriter } from '../../lib/useReveal'

/**
 * Abertura do presente: estrela com anéis, título, frase digitada e botões.
 *
 * Papel na arquitetura: primeira seção (`#inicio`) e, para muita gente, a
 * única que decide se a pessoa continua. Reúne três efeitos de movimento —
 * anéis orbitais (CSS), parallax de rolagem (`useParallaxDoTopo`, escrito
 * direto nos elementos: antes cada quadro da rolagem redesenhava o topo, e o
 * iPhone engasgava) e máquina de escrever (`useTypewriter`).
 *
 * Hierarquia: o nome e o título; a frase de quem dá (digitada); a estrela em
 * uma linha de fatos; e UMA chamada principal (o céu), com as outras três do
 * mesmo peso entre si.
 *
 * Importado por: `App.jsx`.
 * Exports: `Hero`.
 *
 * Decisões que não podem quebrar:
 * - `min-h` nas linhas animadas: sem a altura reservada o layout pula a cada
 *   caractere digitado e a página inteira "respira";
 * - o typewriter é ocultado do leitor de tela enquanto digita (`aria-hidden`)
 *   e exposto uma vez, completo, no `.sr-only` — anunciar tecla por tecla é
 *   spam;
 * - a chamada "Explore" é `aria-hidden` + `tabIndex={-1}` porque é só
 *   decoração: o mesmo destino já existe no botão "Ver a estrela no céu";
 * - `content.mostrarMira !== false` decide se o botão da mira aparece.
 */
export function Hero({ onOpenCertificate, onOpenFinder }) {
  const { content } = useContent()
  /*
   * A estrela chega no conteúdo quando a página é de um cliente (a loja monta
   * `content.estrela`); no site pessoal ela continua vindo do import — o
   * fallback mantém o comportamento de antes, byte a byte.
   */
  const estrela = content.estrela ?? kausAustralis
  // "ε Sagittarii" nunca se separa no fim da linha: letra grega + espaço duro.
  const { output, done } = useTypewriter(semQuebrarDesignacao(content.fraseHero))
  const textoRef = useRef(null)
  const arteRef = useRef(null)
  const rolarRef = useRef(null)
  useParallaxDoTopo(textoRef, arteRef, rolarRef)

  // Botões: um principal (o céu) e os outros com o mesmo peso. No celular,
  // grade de duas colunas — o principal ocupa a linha toda, e se sobrar um
  // botão sozinho ele também ocupa (nada de botão órfão de meia largura).
  const secundarios = [
    { chave: 'carta', href: '#carta', rotulo: 'Ler a carta' },
    onOpenFinder && content.mostrarMira !== false ? { chave: 'mira', onClick: onOpenFinder, rotulo: '✦ Achar no céu' } : null,
    { chave: 'certificado', onClick: onOpenCertificate, rotulo: 'Ver o certificado' },
  ].filter(Boolean)
  const classeSecundario =
    'whitespace-nowrap rounded-full border border-white/20 px-4 py-3 text-center text-sm text-ivory/90 transition hover:border-gold hover:text-gold sm:px-6'

  return (
    <section
      id="inicio"
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 pb-20 pt-24 text-center"
    >
      {/* Estrela com anel orbital girando e brilho pulsante. */}
      <div ref={arteRef} className="relative mb-7 flex size-28 items-center justify-center will-change-transform sm:size-32">
        {/* Anel externo gira no sentido horário; o interno, tracejado, é
            revertido e mais lento (34s) — dois tempos diferentes evitam que
            os dois alinhem e deem a impressão de estar parado. */}
        <span className="animate-spin-slow absolute inset-0 rounded-full border border-gold/20" />
        <span className="animate-spin-slow absolute inset-3 rounded-full border border-dashed border-gold/15 [animation-direction:reverse] [animation-duration:34s]" />
        {/* Brilho por degradê, sem `blur` (caro de desenhar no celular). */}
        <span
          className="absolute -inset-2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(216,182,106,0.16), transparent 62%)' }}
        />
        <SimboloOficial className="animate-floaty animate-shimmer relative w-20 sm:w-24" />
      </div>

      <Reveal as="p" delay={120} className="mb-4 font-display text-[11px] tracking-[0.22em] text-gold/80 uppercase sm:tracking-[0.42em]">
        {content.campanha ? `Uma homenagem ${content.campanha.parceiro}` : 'Uma estrela, um nome, um céu'}
      </Reveal>

      <div ref={textoRef} className="flex flex-col items-center will-change-transform">
        <Reveal
          as="h1"
          delay={220}
          className="font-serif max-w-4xl text-4xl leading-tight text-ivory sm:text-6xl md:text-7xl"
        >
          Para {content.nomeCurto},
          <span className="mt-3 block italic text-gold-soft">{content.tituloHero}</span>
        </Reveal>

        {/*
          A frase de quem dá, digitada caractere a caractere. Anunciar isso a
          cada tecla seria spam para quem usa leitor de tela: a região fica
          oculta enquanto digita e o texto completo é exposto uma vez, no fim.
          A altura fica reservada para nada pular.
        */}
        <Reveal
          as="p"
          delay={520}
          className="mt-6 min-h-[3.75rem] max-w-2xl text-balance font-serif text-lg italic leading-relaxed text-ivory/80 sm:min-h-[2rem] sm:text-xl"
        >
          <span aria-hidden={!done}>{output}</span>
          {!done && <span className="type-cursor" aria-hidden="true" />}
          <span className="sr-only">{done ? output : ''}</span>
        </Reveal>

        {/* A estrela, em uma linha de fatos — sem repetir a frase de cima. */}
        <Reveal as="p" delay={700} className="mt-4 max-w-2xl text-balance text-sm leading-relaxed text-ivory/60 sm:text-[15px]">
          <span className="font-serif text-base text-gold sm:text-lg">{estrela.commonName}</span>
          <span className="mx-2 text-gold/40" aria-hidden="true">·</span>
          <span className="whitespace-nowrap">{estrela.bayer}</span>
          <span className="mt-1 block first-letter:uppercase">{comoSeVeDaqui(estrela)}</span>
          {content.apelidoEstrela ? (
            <span className="mt-1.5 block">
              Nesta homenagem, ela se chama <span className="font-serif text-base text-gold">“{content.apelidoEstrela}”</span>
            </span>
          ) : null}
        </Reveal>
      </div>

      <Reveal delay={880} className="w-full">
        <div className="gold-line mx-auto mt-7 w-40" />
        <div className="mx-auto mt-7 grid w-full max-w-sm grid-cols-2 gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
          <a
            href="#ceu"
            className="col-span-2 rounded-full bg-gold px-6 py-3 text-center text-sm font-medium text-night transition hover:bg-gold-soft hover:shadow-[0_0_28px_rgba(216,182,106,0.45)]"
          >
            Ver a estrela no céu
          </a>
          {secundarios.map((b, i) => {
            const sozinho = secundarios.length % 2 === 1 && i === secundarios.length - 1
            const classe = `${classeSecundario} ${sozinho ? 'col-span-2' : ''}`
            return b.href ? (
              <a key={b.chave} href={b.href} className={classe}>
                {b.rotulo}
              </a>
            ) : (
              <button key={b.chave} type="button" onClick={b.onClick} className={classe}>
                {b.rotulo}
              </button>
            )
          })}
        </div>
      </Reveal>

      {/* Chamada para rolar, que desaparece assim que a pessoa rola. */}
      <a
        href="#ceu"
        aria-hidden="true"
        tabIndex={-1}
        ref={rolarRef}
        className="absolute bottom-7 hidden flex-col items-center gap-2 text-ivory/60 opacity-90 transition-opacity duration-500 sm:flex"
      >
        <span className="text-[10px] tracking-[0.3em] uppercase">Explore</span>
        <span className="block h-8 w-px bg-gradient-to-b from-gold to-transparent" />
      </a>
    </section>
  )
}
/**
 * Como ver a estrela daqui — pelo brilho real e pela posição. Com o catálogo
 * completo há estrelas que só um telescópio mostra, e algumas que nunca sobem
 * no céu do Brasil: dizer "visível a olho nu" para todas seria mentir no
 * presente de alguém.
 */
function comoSeVeDaqui(estrela) {
  if (estrela.visibility === 'nunca') return 'uma estrela do céu do hemisfério norte'
  const onde = estrela.visibility === 'norte' ? 'no céu do norte do Brasil' : 'no céu do Brasil'
  if (estrela.magnitude <= 6.5) return `visível a olho nu ${onde}`
  if (estrela.magnitude <= 9) return `visível com binóculo ${onde}`
  return `visível com telescópio ${onde}`
}

/** Espaço duro depois de letra grega ("ε Sagittarii"): a designação não quebra. */
function semQuebrarDesignacao(texto) {
  return String(texto ?? '').replace(/([\u0370-\u03ff]) /g, '$1\u00a0')
}
