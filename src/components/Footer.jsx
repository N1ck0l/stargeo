import { kausAustralis } from '../data/star'

/**
 * Rodapé do site.
 *
 * Papel na arquitetura: fecha a página com a assinatura da marca e a linha de
 * dados da estrela, sempre a partir dos dados reais de `src/data/star.js` —
 * se um dia o nome mudar no catálogo, o rodapé acompanha sozinho.
 *
 * Importado por: `App.jsx`.
 * Exports: `Footer`.
 * Invariante: é o último elemento antes do fim do `<div class="star-bg">`;
 * precisa do `relative z-10` para ficar acima do canvas do `Starfield`.
 */
export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 px-5 py-10 text-center text-sm text-ivory/60">
      <p className="font-display tracking-[0.3em] text-gold/70">STARGEO</p>
      <p className="mt-3">
        {kausAustralis.commonName} · {kausAustralis.bayer} · {kausAustralis.constellationLatin}
      </p>
      <p className="mt-2">Um presente escrito no céu, com coordenadas de verdade.</p>
    </footer>
  )
}
