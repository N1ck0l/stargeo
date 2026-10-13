import { Component } from 'react'

/**
 * Rede de segurança do aplicativo inteiro.
 *
 * Sem isto, um erro em qualquer componente deixa a página em branco — e uma
 * tela branca numa noite de céu não dá para depurar depois. Aqui a falha vira
 * uma tela legível, com a opção de tentar de novo.
 *
 * Precisa ser classe, e não função: o React só reconhece error boundaries
 * como componentes de classe.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Fica no console para quem estiver olhando, mas nunca quebra a tela.
    console.error('[StarGeo] falha ao renderizar:', error, info?.componentStack)
  }

  handleReset() {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="star-bg flex min-h-dvh flex-col items-center justify-center px-6 text-center text-ivory">
        <svg width="52" height="52" viewBox="0 0 72 72" aria-hidden="true" className="text-gold/80">
          <path
            d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
            fill="currentColor"
          />
        </svg>

        <h1 className="font-serif mt-6 text-3xl sm:text-4xl">O céu se escondeu</h1>
        <p className="mt-4 max-w-md text-ivory/70">
          Algo travou ao desenhar esta página. Ela já estava com um problema — recarregar
          costuma resolver.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-full bg-gold px-6 py-3 text-sm font-medium text-night transition hover:bg-gold-soft"
          >
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-white/20 px-6 py-3 text-sm text-ivory/90 transition hover:border-gold hover:text-gold"
          >
            Recarregar a página
          </button>
        </div>

        <details className="mt-8 max-w-md text-left text-xs text-ivory/50">
          <summary className="cursor-pointer text-center">Detalhes técnicos</summary>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 whitespace-pre-wrap">
            {String(error?.message ?? error)}
          </pre>
        </details>
      </div>
    )
  }
}