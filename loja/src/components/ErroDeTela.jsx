import { Component } from 'react'

/**
 * Fronteira de erro da loja inteira.
 *
 * Em loja, tela branca custa venda. O que importa aqui não é a exception
 * ser bonita, é a pessoa conseguir sair de lá: um botão que recarrega e um
 * e-mail para falar que algo quebrou, porque quem compra aqui é gente comum
 * e vai achar que a loja aplicou golpe.
 */
export class ErroDeTela extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    // O console é o único lugar onde o detalhe técnico chega hoje. Numa loja
    // real, este é o ponto para onde vai o Sentry — o resto da tela continua
    // genérico de propósito.
    console.error('[stargeo-loja] falha na tela:', erro, info?.componentStack)
  }

  render() {
    const { erro } = this.state
    if (!erro) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <svg width="48" height="48" viewBox="0 0 72 72" aria-hidden="true" className="mx-auto mb-6 text-gold/60">
            <path
              d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
              fill="currentColor"
            />
          </svg>

          <h1 className="font-display text-2xl text-ivory">Algo saiu errado por aqui</h1>
          <p className="mt-3 leading-relaxed text-ivory/70">
            Não foi nada que você fez. Recarregue a página — se continuar assim, é só falar com a
            gente.
          </p>

          <a href="mailto:contato@stargeo.com.br" className="btn btn-secundario mt-8">
            Falar com a gente
          </a>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary mt-3">
            Recarregar a página
          </button>

          {/* O detalhe técnico fica escondido: ajuda a depurar, atrapalha quem
              está tentando comprar. */}
          <details className="mt-8 text-left">
            <summary className="cursor-pointer text-xs text-ivory/40">Detalhe técnico</summary>
            <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-ivory/60">
              {String(erro?.message ?? erro)}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
