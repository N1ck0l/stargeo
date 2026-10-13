import { useState } from 'react'
import { useRota } from './lib/rota.js'
import { Link } from './lib/Link.jsx'
import Home from './pages/Home.jsx'
import Produto from './pages/Produto.jsx'
import Rastrear from './pages/Rastrear.jsx'
import Obrigado from './pages/Obrigado.jsx'
import Footer from './components/Footer.jsx'

/**
 * Escolhe a tela pelo caminho.
 *
 * Retorna o JSX em vez da referência do componente, por dois motivos: o React
 * só preserva o estado entre trocas de tela se o tipo do elemento for o mesmo
 * (com `<Pagina />`, o linter — com razão — avisa que um componente criado
 * durante o render perde o estado), e fica explícito na tela qual rota abre
 * o quê.
 *
 * Caminho desconhecido vai para a home, que é o que a pessoa queria de
 * qualquer jeito. Não existe 404 nesta loja.
 */
function telaPara(caminho) {
  const limpo = caminho.replace(/\/+$/, '') || '/'

  if (limpo === '/rastrear') return <Rastrear />
  if (limpo === '/obrigado') return <Obrigado />
  if (limpo.startsWith('/produto/')) {
    // O slug é extraído aqui, e não dentro da página: quem descobre o caminho
    // é o roteador.
    return <Produto slug={limpo.slice('/produto/'.length)} />
  }

  return <Home />
}

export default function App() {
  const caminho = useRota()

  return (
    <div className="star-bg flex min-h-dvh flex-col">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-night"
      >
        Pular para o conteúdo
      </a>

      <Cabecalho caminho={caminho} />

      <main id="conteudo" className="flex-1">
        {telaPara(caminho)}
      </main>

      <Footer />
    </div>
  )
}

/**
 * Cabeçalho da loja.
 *
 * O menu mobile fecha sozinho quando a rota muda. Sem isso, a pessoa navega
 * pelo menu, a tela troca, e o menu continua aberto por cima da página nova.
 *
 * O fechamento NÃO é um efeito: um `useState` com "estado anterior" compara o
 * caminho durante o render, que é mais barato e não causa um segundo render.
 * Fazer isso no `useEffect` dispararia um render extra em toda navegação.
 */
function Cabecalho({ caminho }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const [caminhoAnterior, setCaminhoAnterior] = useState(caminho)

  // Ajustar estado durante o render é o padrão do React para "derivar de uma
  // mudança de prop": o React descarta o render e refaz com o valor novo, sem
  // expor o estado inconsistente para a tela.
  if (caminhoAnterior !== caminho) {
    setCaminhoAnterior(caminho)
    setMenuAberto(false)
  }

  return (
    <header className="safe-top sticky top-0 z-40 border-b border-white/8 bg-night/85 backdrop-blur">
      <div className="pilha flex h-16 items-center justify-between gap-4">
        <Link para="/" className="flex items-center gap-2.5" aria-label="StarGeo, página inicial">
          <svg width="28" height="28" viewBox="0 0 72 72" aria-hidden="true" className="text-gold">
            <path
              d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
              fill="currentColor"
            />
          </svg>
          <span className="font-display text-lg tracking-[0.2em] text-ivory">STARGEO</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
          <Link para="/" className="text-sm text-ivory/80 transition hover:text-gold">
            Certificates
          </Link>
          <Link para="/#estrelas" className="text-sm text-ivory/80 transition hover:text-gold">
            Estrelas
          </Link>
          <Link para="/rastrear" className="text-sm text-ivory/80 transition hover:text-gold">
            Rastrear pedido
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link para="/produto/certificado-digital" className="btn btn-primary hidden text-sm sm:inline-flex">
            Comprar certificado
          </Link>

          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1.5 text-sm md:hidden"
            aria-expanded={menuAberto}
            aria-controls="menu-mobile"
            onClick={() => setMenuAberto(!menuAberto)}
          >
            {menuAberto ? 'Fechar' : 'Menu'}
          </button>
        </div>
      </div>

      {menuAberto && (
        <nav id="menu-mobile" className="pilha flex flex-col gap-3 border-t border-white/8 py-4 md:hidden">
          <Link para="/" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Certificados
          </Link>
          <Link para="/#estrelas" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Estrelas
          </Link>
          <Link para="/rastrear" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Rastrear pedido
          </Link>
        </nav>
      )}
    </header>
  )
}
