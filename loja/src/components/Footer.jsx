import { Link } from '../lib/Link.jsx'

export default function Footer() {
  return (
    <footer className="safe-bottom mt-16 border-t border-white/8">
      <div className="pilha py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <svg width="24" height="24" viewBox="0 0 72 72" aria-hidden="true" className="text-gold">
                <path
                  d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
                  fill="currentColor"
                />
              </svg>
              <span className="font-display tracking-[0.2em] text-ivory">STARGEO</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ivory/60">
              Certificados de estrela com coordenadas reais, conferidas com o SIMBAD. Ninguém é dono
              de uma estrela — mas todo mundo pode ter uma dedicada com nome.
            </p>
          </div>

          <nav aria-label="Ajuda">
            <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Comprar</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link para="/produto/certificado-digital" className="text-ivory/70 transition hover:text-gold">
                  Certificado digital
                </Link>
              </li>
              <li>
                <Link para="/produto/certificado-mapa-impresso" className="text-ivory/70 transition hover:text-gold">
                  Com mapa impresso
                </Link>
              </li>
              <li>
                <Link para="/produto/certificado-premium" className="text-ivory/70 transition hover:text-gold">
                  Premium
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Conta">
            <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Ajuda</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link para="/rastrear" className="text-ivory/70 transition hover:text-gold">
                  Rastrear pedido
                </Link>
              </li>
              <li>
                <a href="mailto:contato@stargeo.com.br" className="text-ivory/70 transition hover:text-gold">
                  Falar com a gente
                </a>
              </li>
              <li>
                <Link para="/#faq" className="text-ivory/70 transition hover:text-gold">
                  Perguntas frequentes
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/*
          A política de privacidade e o direito de arrependimento não são
          rodapé: no Brasil, compra online fora do estabelecimento físico tem
          7 dias de arrependimento por lei, e a pessoa tem que achar isso.
        */}
        <div className="mt-10 flex flex-col gap-3 border-t border-white/8 pt-6 text-xs text-ivory/45 md:flex-row md:items-center md:justify-between">
          <p>© {ANO} StarGeo · Documento simbólico, com dados astronômicos conferidos.</p>
          <p>
            7 dias para arrependimento · <span className="text-gold/70">contato@stargeo.com.br</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
