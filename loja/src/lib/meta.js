import { useEffect } from 'react'

/**
 * Título, descrição e endereço canônico da tela, no `<head>`.
 *
 * O `index.html` é um só para a loja inteira, com o canônico apontando para
 * `/`: sem isto, o Google (que executa o JavaScript) leria `/estrelas` e
 * `/politicas` como cópias da home. Os robôs que NÃO executam JavaScript
 * (prévia do WhatsApp) recebem o mesmo nas páginas de estrela pela edge
 * function `estrela-og.ts`.
 *
 * Ao sair da tela, volta ao que estava — a home não herda o título da estrela.
 */
export function useMetaPagina({ titulo, descricao }) {
  useEffect(() => {
    if (!titulo) return undefined
    const descricaoTag = document.querySelector('meta[name="description"]')
    const canonico = document.querySelector('link[rel="canonical"]')
    const antes = {
      titulo: document.title,
      descricao: descricaoTag?.getAttribute('content'),
      canonico: canonico?.getAttribute('href'),
    }
    document.title = titulo
    if (descricao && descricaoTag) descricaoTag.setAttribute('content', descricao)
    if (canonico) canonico.setAttribute('href', `${window.location.origin}${window.location.pathname}`)
    return () => {
      document.title = antes.titulo
      if (descricaoTag && antes.descricao != null) descricaoTag.setAttribute('content', antes.descricao)
      if (canonico && antes.canonico != null) canonico.setAttribute('href', antes.canonico)
    }
  }, [titulo, descricao])
}
