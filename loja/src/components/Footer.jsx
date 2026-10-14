import { Link } from '../lib/Link.jsx'
import { Simbolo } from './Simbolo.jsx'

// O ano do rodapé é fixo na sessão: nada aqui depende da virada do ano, e um
// cálculo por render só serviria para gerar um número idêntico.
const ANO = new Date().getFullYear()

/**
 * Rodapé da loja: marca, a frase que resume o produto (não é posse, é
 * dedicação), os atalhos de compra e a saída de ajuda.
 *
 * Quem importa: `loja/src/App.jsx`. Export default `Footer`.
 *
 * Invariantes: o link de produto do rodapé bate com o slug de
 * `pages/Home.jsx` e `pages/Produto.jsx` (só existe o certificado digital);
 * o aviso de arrependimento (7 dias) é obrigatório em venda fora do
 * estabelecimento físico e não pode sair dali; e o contato por e-mail fica
 * visível, sem formulário — quem reclama aqui é gente mandando e-mail do
 * celular.
 */
export default function Footer() {
  return (
    <footer className="safe-bottom relative z-10 mt-16 border-t border-white/8">
      <div className="pilha py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <Simbolo size={24} className="text-gold" />
              <span className="font-display tracking-[0.16em] text-ivory uppercase">Stellara</span>
            </div>
            <p className="mt-1 text-[11px] tracking-[0.28em] text-gold/70 uppercase">A star of your own</p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ivory/60">
              Certificados de estrela com coordenadas reais, conferidas com o SIMBAD. Ninguém é dono
              de uma estrela — mas todo mundo pode ter uma dedicada com nome.
            </p>
          </div>

          <nav aria-label="Comprar">
            <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Comprar</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link para="/produto/certificado-digital" className="text-ivory/70 transition hover:text-gold">
                  Certificado digital
                </Link>
              </li>
              <li>
                <Link para="/estrelas" className="text-ivory/70 transition hover:text-gold">
                  Catálogo de estrelas
                </Link>
              </li>
              <li>
                <Link para="/#como-funciona" className="text-ivory/70 transition hover:text-gold">
                  Como funciona
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Ajuda">
            <h2 className="font-display text-xs tracking-[0.2em] text-gold uppercase">Ajuda</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link para="/rastrear" className="text-ivory/70 transition hover:text-gold">
                  Rastrear pedido
                </Link>
              </li>
              <li>
                <Link para="/editar" className="text-ivory/70 transition hover:text-gold">
                  Editar minha página
                </Link>
              </li>
              <li>
                <a
                  href="mailto:nickolasfelipe225@gmail.com"
                  className="text-ivory/70 transition hover:text-gold"
                >
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
          <p>© {ANO} Stellara · Documento simbólico, com dados astronômicos conferidos.</p>
          <p>
            7 dias para arrependimento ·{' '}
            <span className="text-gold/70">nickolasfelipe225@gmail.com</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
