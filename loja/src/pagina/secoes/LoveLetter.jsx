import { useState } from 'react'
import { Reveal } from '../../components/Reveal'
import { baixarCarta } from '../../lib/carta.js'
import { useContent } from '../../lib/contentContext'
import { estrelaDaFolha } from '../../lib/conteudoPagina.js'

/** Primeiro parágrafo com até isto vira saudação — a mesma regra do PDF da carta. */
const SAUDACAO_MAX = 80

/**
 * Seção da carta.
 *
 * Papel na arquitetura: imprime na tela os parágrafos de `content.carta`
 * (padrão: `letterParagraphs`, de `loja/src/data/star.js`) dentro de um "papel"
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
 * - a carta também sai em PDF (`baixarCarta`, `shared/carta/desenho.js`), a
 *   segunda peça do presente, ao lado do certificado.
 */
export function LoveLetter() {
  const { content } = useContent()
  const paragrafos = Array.isArray(content.carta) ? content.carta : []
  const comSaudacao = paragrafos.length > 1 && String(paragrafos[0]).length <= SAUDACAO_MAX
  const [baixando, setBaixando] = useState(null)
  const [falha, setFalha] = useState('')

  async function baixar(claro) {
    if (baixando !== null) return
    setBaixando(claro)
    setFalha('')
    try {
      await baixarCarta(
        {
          paragrafos,
          titulo: content.tituloCarta,
          fromName: content.assinatura,
          honoreeName: content.nome,
          estrela: estrelaDaFolha(content.estrela),
          code: content.registro,
        },
        { claro },
      )
    } catch {
      setFalha('Não foi possível gerar o PDF agora. Confira a conexão e tente de novo.')
    } finally {
      setBaixando(null)
    }
  }

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
            className={index === 0 ? (comSaudacao ? 'mt-0 text-2xl text-gold not-italic' : 'mt-0') : 'mt-6'}
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

      {paragrafos.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={baixando !== null}
            onClick={() => baixar(false)}
            className="rounded-full bg-gold px-5 py-2.5 font-medium text-night transition hover:bg-gold-soft disabled:opacity-60"
          >
            {baixando === false ? 'Gerando o PDF…' : 'Baixar a carta (PDF)'}
          </button>
          <button
            type="button"
            disabled={baixando !== null}
            onClick={() => baixar(true)}
            className="rounded-full border border-white/25 px-4 py-2.5 text-ivory transition hover:border-gold hover:text-gold disabled:opacity-60"
          >
            {baixando === true ? 'Gerando…' : 'Versão para imprimir'}
          </button>
        </div>
      )}
      {falha && (
        <p role="alert" className="mt-3 text-center text-sm text-red-200">
          {falha}
        </p>
      )}
    </section>
  )
}