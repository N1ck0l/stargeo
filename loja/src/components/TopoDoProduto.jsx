import { Link } from '../lib/Link.jsx'

/**
 * Trilha e título da página do produto.
 *
 * Fica FORA do pacote do produto (que carrega sob demanda), no `App`: assim
 * ele vai pintado no HTML pré-renderizado (`produto.html`) e o React o
 * aproveita como está quando assume a página — só o formulário, abaixo dele,
 * chega depois. Dentro do pacote, o título era trocado por um novo assim que
 * o pacote chegava, e o navegador contava a pintura do SEGUNDO (Lighthouse).
 */
export function TopoDoProduto({ nome }) {
  return (
    <div className="pilha">
      <nav aria-label="Trilha" className="mb-8 text-sm text-ivory/50">
        <Link para="/" className="transition hover:text-gold">
          Início
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ivory/80">{nome}</span>
      </nav>

      <h1 className="mb-8 font-display text-3xl text-ivory sm:text-4xl">Monte o seu certificado</h1>
    </div>
  )
}
