import { Reveal } from '../../components/Reveal'
import { useContent } from '../../lib/contentContext'

/**
 * Mensagem pessoal — o espaço para escrever com as suas palavras.
 *
 * Só aparece se `mensagemPessoal` estiver preenchida no conteúdo, editável em
 * `/admin`. Enquanto estiver vazia, nada é desenhado.
 */
export function PersonalMessage() {
  const { content } = useContent()
  const raw = content.mensagemPessoal?.trim()
  if (content.mostrarMensagem === false) return null
  if (!raw) return null

  // Duas ou mais quebras de linha viram parágrafo; uma única quebra é só
  // quebra de linha dentro do mesmo parágrafo. É o mesmo critério que o
  // painel de admin usa para juntar o texto de volta.
  const paragraphs = raw.split(/\n{2,}/).filter(Boolean)

  return (
    <section id="mensagem" className="relative z-10 mx-auto max-w-3xl px-5 py-16">
      <Reveal className="text-center">
        <p className="font-display text-[11px] tracking-[0.35em] text-gold uppercase">
          Palavras minhas
        </p>
        <div className="gold-line mx-auto mt-5 w-20" />
      </Reveal>

      {/*
        O papel é levemente rotacionado e "descola" ao passar o ponteiro —
        como um bilhete deixado sobre a mesa.
      */}
      <Reveal
        delay={140}
        distance={40}
        className="shimmer-border group relative mx-auto mt-10 max-w-2xl"
      >
        <div
          className="relative rotate-[-0.6deg] rounded-sm border border-gold/20 bg-[#fffaf0] px-7 py-9 text-[#1b1d33] shadow-[0_18px_50px_rgba(0,0,0,0.45)] transition duration-500 ease-out group-hover:rotate-0 group-hover:scale-[1.015] sm:px-12 sm:py-12"
        >
          {/* A dobra do papel, no canto. */}
          <span
            aria-hidden="true"
            className="absolute right-0 bottom-0 h-12 w-12 bg-gradient-to-tl from-[#e8dcc4] to-transparent"
            style={{
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            }}
          />

          <div className="relative space-y-5 font-serif text-lg leading-8 sm:text-xl sm:leading-9">
            {paragraphs.map((paragraph, index) => (
              <Reveal
                key={paragraph}
                as="p"
                delay={260 + index * 180}
                distance={16}
                className={index === 0 ? '' : 'pt-1'}
              >
                {paragraph}
              </Reveal>
            ))}
          </div>

          {content.assinatura && (
            <p className="relative mt-8 text-right font-serif text-lg text-[#8f6f1f] italic">
              {content.assinatura}
            </p>
          )}
        </div>
      </Reveal>
    </section>
  )
}