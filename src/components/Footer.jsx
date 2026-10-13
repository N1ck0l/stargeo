import { kausAustralis } from '../data/star'

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
