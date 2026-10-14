import { useEffect, useState } from 'react'

/**
 * Roteador mínimo, baseado na History API.
 *
 * Uma biblioteca de roteamento traria 15 KB por uma coisa que aqui cabe em
 * trinta linhas. O que este roteador NÃO faz — e por quê:
 *
 * - Não há rota 404. A loja tem quatro telas; qualquer caminho desconhecido
 *   manda para a home, que é o que a pessoa queria de qualquer jeito.
 * - Não há guarda de rota. Nenhuma tela é privada.
 * - Não há rota aninhada. A página de produto é `/produto/:slug`, e é lida
 *   direto do `pathname`.
 *
 * O que importa: a rolagem volta ao topo a cada troca, e o `popstate` funciona,
 * porque sem isso o botão "voltar" do celular deixa a página rolada no meio.
 */

/** Caminho atual, atualizado quando o histórico muda. */
export function useRota() {
  const [caminho, setCaminho] = useState(() => window.location.pathname)

  useEffect(() => {
    const aoVoltar = () => setCaminho(window.location.pathname)
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  return caminho
}

/** Navega sem recarregar a página. */
export function navegar(para) {
  if (para === window.location.pathname) {
    // Mesmo caminho: não empilha histórico (o botão "voltar" não viraria um
    // loop) e resolve o que a pessoa queria — voltar pro topo.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  window.history.pushState(null, '', para)
  // `pushState` não dispara `popstate`; o evento é dispatchado à mão para o
  // `useRota` (que só escuta `popstate`) trocar de tela.
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
