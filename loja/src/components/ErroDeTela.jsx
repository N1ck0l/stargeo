import { Component } from 'react'
import { registrarErro } from '../lib/erros.js'

/**
 * Fronteira de erro da loja inteira.
 *
 * Em loja, tela branca custa venda. O que importa aqui não é a exception
 * ser bonita, é a pessoa conseguir sair de lá: um botão que recarrega e um
 * e-mail para falar que algo quebrou, porque quem compra aqui é gente comum
 * e vai achar que a loja aplicou golpe.
 *
 * Quem importa: `loja/src/main.jsx`, que envolve a `<App />` inteira.
 * Export: `ErroDeTela` — classe, porque `componentDidCatch` não existe em
 * componente function.
 *
 * Invariantes: esta tela não pode depender de nada da loja (sem rota, sem
 * API, sem CSS novo) — se ela falhar, não sobra por onde a pessoa sair;
 * o stack trace fica escondido num `<details>` fechado; e sempre há saída,
 * nos dois sentidos (e-mail e recarregar).
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
    // O detalhe técnico vai para o console e para o painel; a tela continua
    // genérica de propósito.
    console.error('[stellara-loja] falha na tela:', erro, info?.componentStack)
    // E vai para o painel (Visão geral → Erros no site), sem dado pessoal.
    registrarErro(erro, 'tela')
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

          <a href="mailto:nickolasfelipe225@gmail.com" className="btn btn-secundario mt-8">
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
