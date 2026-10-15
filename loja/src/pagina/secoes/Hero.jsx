import { Reveal } from '../../components/Reveal'
import { SimboloOficial } from '../../components/SimboloOficial.jsx'
import { kausAustralis } from '../../data/star'
import { useContent } from '../../lib/contentContext'
import { useScroll, useTypewriter } from '../../lib/useReveal'

/**
 * Abertura do presente: estrela com anéis, título, frase digitada e botões.
 *
 * Papel na arquitetura: primeira seção (`#inicio`) e, para muita gente, a
 * única que decide se a pessoa continua. Reúne três efeitos de movimento —
 * anéis orbitais (CSS), parallax de rolagem (`useScroll`) e máquina de
 * escrever (`useTypewriter`) — mais as duas chamadas principais: o céu e o
 * certificado.
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
  const scrollY = useScroll()
  const { output, done } = useTypewriter(content.fraseHero)

  // Parallax: cada camada se move a uma velocidade um pouco diferente,
  // o que dá a sensação de profundidade sem custo de GPU.
  const starShift = scrollY * 0.28
  const titleShift = scrollY * 0.14
  // Opacidade some por completo aos 520px de rolagem — antes disso o título
  // ainda está legível enquanto desliza para fora.
  const fade = Math.max(0, 1 - scrollY / 520)

  return (
    <section
      id="inicio"
      className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 pb-24 pt-28 text-center"
    >
      {/* Estrela com anel orbital girando e brilho pulsante. */}
      <div
        className="relative mb-9 flex size-32 items-center justify-center"
        style={{ transform: `translate3d(0, ${-starShift * 0.25}px, 0)` }}
      >
        {/* Anel externo gira no sentido horário; o interno, tracejado, é
            revertido e mais lento (34s) — dois tempos diferentes evitam que
            os dois alinhem e deem a impressão de estar parado. */}
        <span className="animate-spin-slow absolute inset-0 rounded-full border border-gold/20" />
        <span className="animate-spin-slow absolute inset-3 rounded-full border border-dashed border-gold/15 [animation-direction:reverse] [animation-duration:34s]" />
        <span className="absolute inset-7 rounded-full bg-gold/10 blur-xl" />
        <SimboloOficial className="animate-floaty animate-shimmer relative w-24" />
      </div>

      <Reveal as="p" delay={120} className="mb-4 font-display text-[11px] tracking-[0.22em] text-gold/80 uppercase sm:tracking-[0.42em]">
        Uma estrela, um nome, um céu
      </Reveal>

      <div style={{ transform: `translate3d(0, ${titleShift * 0.3}px, 0)`, opacity: fade }}>
        <Reveal
          as="h1"
          delay={220}
          className="font-serif max-w-4xl text-4xl leading-tight text-ivory sm:text-6xl md:text-7xl"
        >
          Para {content.nomeCurto},
          <span className="mt-3 block italic text-gold-soft">{content.tituloHero}</span>
        </Reveal>

        {/* Frase digitada; reserva a altura final para o layout não pular. */}
        <Reveal as="p" delay={520} className="mt-7 min-h-[3.5rem] max-w-2xl font-serif text-lg italic text-ivory/75 sm:text-xl">
          {content.nome}, este pedaço do universo foi escolhido para você:{' '}
          <span className="text-gold not-italic">{estrela.commonName}</span> (
          {estrela.bayer}), {comoSeVeDaqui(estrela)}.
          {content.apelidoEstrela ? (
            <span className="mt-2 block text-base text-ivory/65 sm:text-lg">
              Nesta homenagem, ela se chama{' '}
              <span className="text-gold not-italic">“{content.apelidoEstrela}”</span>.
            </span>
          ) : null}
        </Reveal>
      </div>

      {/*
        A frase é digitada caractere a caractere. Anunciar isso a cada tecla
        seria um spam para quem usa leitor de tela, então a região fica oculta
        do announce e o texto completo é exposto uma vez, quando termina.
      */}
      <Reveal delay={700} className="mt-6 min-h-[1.75rem] font-serif text-base text-ivory/60 sm:text-lg">
        <span aria-hidden={!done}>{output}</span>
        {!done && <span className="type-cursor" aria-hidden="true" />}
        <span className="sr-only">{done ? output : ''}</span>
      </Reveal>

      <Reveal delay={880} className="w-full">
        <div className="gold-line mx-auto w-40" />
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#ceu"
            className="rounded-full bg-gold px-6 py-3 text-sm font-medium text-night transition hover:bg-gold-soft hover:shadow-[0_0_28px_rgba(216,182,106,0.45)]"
          >
            Ver a estrela no céu
          </a>
          <a
            href="#carta"
            className="rounded-full border border-white/20 px-6 py-3 text-sm text-ivory/90 transition hover:border-gold hover:text-gold"
          >
            Ler a carta
          </a>
          {onOpenFinder && content.mostrarMira !== false && (
            <button
              type="button"
              onClick={onOpenFinder}
              className="animate-pulse-glow rounded-full bg-gold px-6 py-3 text-sm font-medium text-night transition hover:bg-gold-soft"
            >
              ✦ Achar no céu real
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCertificate}
            className="rounded-full border border-gold/50 px-6 py-3 text-sm text-gold transition hover:bg-gold hover:text-night"
          >
            Certificado digital
          </button>
        </div>
      </Reveal>

      {/* Chamada para rolar, que desaparece assim que a pessoa rola. */}
      <a
        href="#ceu"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute bottom-7 flex flex-col items-center gap-2 text-ivory/60 transition-opacity duration-500"
        style={{ opacity: fade * 0.9 }}
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
