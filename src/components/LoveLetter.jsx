import { Reveal } from './Reveal'
import { useContent } from '../lib/contentContext'

/**
 * Seção da carta.
 *
 * Papel na arquitetura: imprime na tela os parágrafos de `content.carta`
 * (padrão: `letterParagraphs`, de `src/data/star.js`) dentro de um "papel"
 * com borda dourada brilhante. É a única seção que usa a classe
 * `shimmer-border` no corpo do texto.
 *
 * Importado por: `App.jsx`.
 * Exports: `LoveLetter`.
 * Invariantes:
 * - a entrada de cada parágrafo é escalonada pelo índice (`260 + i * 160 ms`);
 *   acrescentar muitos parágrafos empurra a assinatura para muito depois —
 *   por isso ela tem o próprio atraso calculado a partir do tamanho da lista;
 * - `content.carta` pode não ser array (JSON adulterado): o guard `Array.isArray`
 *   mantém a seção vazia em vez de quebrar a página.
 */
export function LoveLetter() {
  const { content } = useContent()
  const paragrafos = Array.isArray(content.carta) ? content.carta : []

  return (
    <section id="carta" className="relative z-10 mx-auto max-w-3xl px-5 py-20">
      <Reveal className="text-center">
        <p className="font-display text-[11px] tracking-[0.35em] text-gold uppercase">Carta</p>
        <h2 className="font-serif mt-3 text-center text-4xl text-ivory sm:text-5xl">
          {content.tituloCarta}
        </h2>
        <div className="gold-line mx-auto mt-8 w-24" />
      </Reveal>

      {/*
        O papel entra com uma leve inclinação e cada parágrafo surge sozinho,
        como se a carta estivesse sendo escrita enquanto se lê.
      */}
      <Reveal
        delay={140}
        distance={40}
        className="shimmer-border mt-10 rounded-3xl border border-gold/15 bg-[#120c28]/70 p-8 font-serif text-lg leading-8 text-ivory/85 italic sm:p-12"
      >
        {paragrafos.map((paragraph, index) => (
          <Reveal
            key={paragraph}
            as="p"
            delay={260 + index * 160}
            distance={18}
            className={index === 0 ? 'mt-0 text-2xl text-gold not-italic' : 'mt-6'}
          >
            {paragraph}
          </Reveal>
        ))}

        {content.assinatura ? (
          <Reveal
            as="p"
            delay={260 + paragrafos.length * 160}
            className="pt-4 text-gold not-italic"
          >
            {content.assinatura}
          </Reveal>
        ) : null}
      </Reveal>
    </section>
  )
}