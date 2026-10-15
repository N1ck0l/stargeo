/**
 * Casca da loja — árvore única da SPA.
 *
 * A loja é um app React separado (build própria em `dist-loja`, publicada na
 * Netlify) e este é o componente raiz: monta o céu fixo, o cabeçalho, a área
 * de conteúdo e o rodapé, e escolhe a TELA a partir do caminho do histórico.
 *
 * Quem importa: `main.jsx` (o único ponto de entrada, dentro da fronteira de
 * erro). Exporta `default App`.
 *
 * Rotas internas, todas em `telaPara` abaixo: `/` (home), `/produto/:slug`,
 * `/obrigado`, `/rastrear`, `/editar` (acesso do cliente à página própria),
 * `/admin`, `/p/:code` (página dedicada) e `/p/:code/editar`. Não existe rota
 * 404 — caminho desconhecido cai na home.
 *
 * Invariantes: a troca de tela é toda SPA (`lib/rota.js` + `lib/Link.jsx`);
 * os poucos `<a>` que existem são o link de pular conteúdo (rolagem interna)
 * e os de "ver página" (nova aba, de propósito). O cabeçalho fica em `z-40` e
 * o `main` em `z-10` porque o `Starfield` é um canvas fixo atrás de tudo.
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { useRota } from './lib/rota.js'
import { registrar } from './lib/metricas.js'
import { Link } from './lib/Link.jsx'
import Home from './pages/Home.jsx'
/*
 * Só a home vai no pacote de abertura. Cada outra tela é um pedaço próprio,
 * baixado quando alguém entra nela — quem abre a loja pelo celular não paga
 * pelo painel, pela página dedicada nem pelo rastreio. O produto, que é o
 * próximo passo de quase todo mundo, é pré-carregado assim que a home fica
 * ociosa (`preCarregarProduto`), para o clique em "Dedicar" não esperar.
 */
const carregarProduto = () => import('./pages/Produto.jsx')
const Produto = lazy(carregarProduto)
const Rastrear = lazy(() => import('./pages/Rastrear.jsx'))
const Obrigado = lazy(() => import('./pages/Obrigado.jsx'))
const Editar = lazy(() => import('./pages/Editar.jsx'))
const Catalogo = lazy(() => import('./pages/Catalogo.jsx'))
const Estrela = lazy(() => import('./pages/Estrela.jsx'))
const Politicas = lazy(() => import('./pages/Politicas.jsx'))
const PaginaDedicada = lazy(() => import('./pagina/PaginaDedicada.jsx').then((m) => ({ default: m.PaginaDedicada })))
const PaginaGrupo = lazy(() => import('./pagina/PaginaGrupo.jsx').then((m) => ({ default: m.PaginaGrupo })))
const CartaoPresente = lazy(() => import('./pagina/CartaoPresente.jsx').then((m) => ({ default: m.CartaoPresente })))
const EdicaoPagina = lazy(() => import('./pagina/EdicaoPagina.jsx').then((m) => ({ default: m.EdicaoPagina })))
const AdminPagina = lazy(() => import('./admin/AdminPagina.jsx').then((m) => ({ default: m.AdminPagina })))

function preCarregarProduto() {
  const agendar = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500))
  agendar(() => {
    carregarProduto().catch(() => {})
  })
}
import Footer from './components/Footer.jsx'
import { ScrollProgress } from './components/ScrollProgress.jsx'
import { Simbolo } from './components/Simbolo.jsx'
import { Starfield } from './components/Starfield.jsx'

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
  if (limpo === '/estrelas') return <Catalogo />
  // Página pública de uma estrela (busca do Google, sitemap): o slug é o do catálogo.
  if (limpo.startsWith('/estrelas/')) return <Estrela key={limpo} slug={limpo.slice('/estrelas/'.length).toLowerCase()} />
  if (limpo === '/politicas') return <Politicas />
  if (limpo === '/obrigado') return <Obrigado />
  // Acesso do cliente à própria página: só resolve o código e passa para
  // `/p/:code/editar`, que é onde o login de verdade (e-mail + token) mora.
  if (limpo === '/editar') return <Editar />
  // Painel administrativo: fora do menu, fora do SEO — quem sabe o endereço
  // é quem tem conta (e a lista branca do servidor deixa entrar).
  if (limpo === '/admin') return <AdminPagina />
  if (limpo.startsWith('/produto/')) {
    // O slug é extraído aqui, e não dentro da página: quem descobre o caminho
    // é o roteador.
    return <Produto slug={limpo.slice('/produto/'.length)} />
  }
  // Grupo de estrelas compradas juntas: todas no mesmo céu (0021).
  if (limpo.startsWith('/g/')) return <PaginaGrupo codigo={limpo.slice('/g/'.length).toUpperCase()} />
  if (limpo.startsWith('/p/')) {
    // Página dedicada de um cliente, ou a edição dela. O código é o do pedido
    // (`SG-XXXX-XXXX`); a validação de formato é do servidor, aqui só
    // normalizamos para maiúsculas porque o endereço pode chegar digitado à
    // mão — e a edição vive sob o mesmo código, mais `/editar`.
    const resto = limpo.slice('/p/'.length).toUpperCase()
    if (resto.endsWith('/CARTAO')) {
      return <CartaoPresente codigo={resto.slice(0, -'/CARTAO'.length)} />
    }
    if (resto.endsWith('/EDITAR')) {
      return <EdicaoPagina codigo={resto.slice(0, -'/EDITAR'.length)} />
    }
    return <PaginaDedicada codigo={resto} />
  }

  return <Home />
}

export default function App() {
  const caminho = useRota()

  // Uma visita por carregamento da loja (anônima — `lib/metricas.js`). A
  // página dedicada e o painel não são funil de compra: ficam de fora.
  useEffect(() => {
    const p = window.location.pathname
    if (!p.startsWith('/p/') && !p.startsWith('/g/') && !p.startsWith('/admin')) {
      registrar('visita')
      preCarregarProduto()
    }
  }, [])

  return (
    <div className="star-bg relative flex min-h-dvh flex-col overflow-x-clip">
      {/*
        O céu animado fica POR TRÁS de tudo: é um canvas fixo com z-0, e o
        conteúdo precisa de z-10 para não ser pintado por baixo das estrelas.
        `overflow-x-clip` (e não `hidden`) — `hidden` cria uma âncora de
        rolagem e mata o `position: sticky` do cabeçalho.
      */}
      <Starfield />
      <ScrollProgress />

      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-night"
      >
        Pular para o conteúdo
      </a>

      <Cabecalho caminho={caminho} />

      <main id="conteudo" className="relative z-10 flex-1">
        {/*
          A troca de tela entra com um fade curto. A chave garante que o
          componente novo nasça junto com a animação — sem ela, o React
          reaproveitaria a árvore e o `animation` não dispararia.
        */}
        <div key={caminho} className="animate-fade-in">
          <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>{telaPara(caminho)}</Suspense>
        </div>
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
  const [condensado, setCondensado] = useState(false)

  // Ajustar estado durante o render é o padrão do React para "derivar de uma
  // mudança de prop": o React descarta o render e refaz com o valor novo, sem
  // expor o estado inconsistente para a tela.
  if (caminhoAnterior !== caminho) {
    setCaminhoAnterior(caminho)
    setMenuAberto(false)
  }

  /*
   * A barra ganha sombra assim que a pessoa começa a rolar — o mesmo "encolhe"
   * do site pessoal. Aqui a ALTURA não muda: o cabeçalho é `sticky`, então
   * encolher empurraria a página inteira para cima no meio da leitura.
   */
  useEffect(() => {
    const aoRolar = () => setCondensado(window.scrollY > 40)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  const limpo = caminho.replace(/\/+$/, '') || '/'

  return (
    <header
      className={`safe-top sticky top-0 z-40 border-b bg-night/85 backdrop-blur transition-all duration-300 ${
        condensado ? 'border-white/12 shadow-[0_8px_30px_rgba(0,0,0,0.45)]' : 'border-white/8'
      }`}
    >
      <div className="pilha flex h-16 items-center justify-between gap-4">
        <Link para="/" className="flex items-center gap-2.5" aria-label="Stellara, página inicial">
          <Simbolo size={28} className="animate-shimmer text-gold" />
          <span className="font-display text-lg tracking-[0.16em] text-ivory uppercase">Stellara</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Principal">
          <Link
            para="/"
            className={`nav-link text-sm text-ivory/80 transition hover:text-gold ${limpo === '/' ? 'is-active' : ''}`}
          >
            Certificados
          </Link>
          <Link
            para="/estrelas"
            className={`nav-link text-sm text-ivory/80 transition hover:text-gold ${limpo === '/estrelas' ? 'is-active' : ''}`}
          >
            Catálogo
          </Link>
          <Link
            para="/rastrear"
            className={`nav-link text-sm text-ivory/80 transition hover:text-gold ${limpo === '/rastrear' ? 'is-active' : ''}`}
          >
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
        <nav
          id="menu-mobile"
          className="animate-dialog-in pilha flex flex-col gap-3 border-t border-white/8 py-4 md:hidden"
        >
          <Link
            para="/produto/certificado-digital"
            onClick={() => setMenuAberto(false)}
            className="btn btn-primary w-full text-sm"
          >
            Comprar certificado
          </Link>
          <Link para="/" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Certificados
          </Link>
          <Link para="/estrelas" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Catálogo
          </Link>
          <Link para="/rastrear" onClick={() => setMenuAberto(false)} className="text-sm text-ivory/85">
            Rastrear pedido
          </Link>
        </nav>
      )}
    </header>
  )
}
