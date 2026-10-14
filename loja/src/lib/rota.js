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
 * O que importa: a rolagem volta ao topo a cada troca, âncoras como
 * `/#estrelas` rolam até a SEÇÃO em vez do topo, e o `popstate` funciona,
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

/**
 * Agenda um callback para o próximo quadro — com fallback de relógio.
 *
 * `requestAnimationFrame` é o certo (roda antes da pintura), mas não existe
 * em todo ambiente (jsdom sem `pretendToBeVisual`), e precisa ser chamado
 * como método do `window` — uma referência destacada derruba navegadores com
 * "Illegal invocation". O `setTimeout` de 16 ms é um quadro: a intenção é a
 * mesma.
 */
function agendar(fn) {
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(fn)
  else setTimeout(fn, 16)
}

/**
 * Tenta rolar até a seção da âncora. Devolve `true` quando achou.
 *
 * `scrollIntoView` é opcional na chamada: jsdom não o implementa, e nos
 * testes a ausência dele não pode derrubar a navegação.
 */
function rolarParaSecao(id) {
  const alvo = document.getElementById(decodeURIComponent(id))
  if (!alvo) return false
  alvo.scrollIntoView?.({ behavior: 'smooth' })
  return true
}

/** Navega sem recarregar a página. */
export function navegar(para) {
  const destino = new URL(para, window.location.origin)
  const hash = destino.hash.slice(1)

  /*
   * Âncora (`/#estrelas`): o destino é uma seção de uma tela, não o topo.
   *
   * Na MESMA tela não se empilha histórico (voltar não vira loop) e o scroll
   * resolve o pedido na hora. Ao TROCAR de tela a seção só existe depois do
   * render seguinte, então tentamos já e de novo nos quadros seguintes; se a
   * âncora não existir nunca (endereço digitado à mão), cai no topo — que é
   * o comportamento antigo.
   */
  if (hash) {
    const tentar = (restantes) => {
      if (rolarParaSecao(hash)) return
      if (restantes > 0) agendar(() => tentar(restantes - 1))
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    if (destino.pathname === window.location.pathname) {
      window.history.replaceState(null, '', para)
      tentar(0)
      return
    }

    window.history.pushState(null, '', para)
    // `pushState` não dispara `popstate`; o evento é dispatchado à mão para o
    // `useRota` (que só escuta `popstate`) trocar de tela.
    window.dispatchEvent(new PopStateEvent('popstate'))
    tentar(5)
    return
  }

  if (para === window.location.pathname) {
    // Mesmo caminho: não empilha histórico (o botão "voltar" não viraria um
    // loop) e resolve o que a pessoa queria — voltar pro topo.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  window.history.pushState(null, '', para)
  // Mesmo motivo de cima: `pushState` é silencioso para quem escuta.
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
