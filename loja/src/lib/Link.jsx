import { navegar } from './rota.js'

/**
 * Link de navegação interna.
 *
 * Fica em arquivo separado do `rota.js` porque este exporta um COMPONENTE e
 * aquele exporta funções: misturar os dois quebra a recarga automática do Vite
 * durante o desenvolvimento, que é o único efeito de `only-export-components`.
 */
export function Link({ para, children, ...resto }) {
  return (
    <a
      href={para}
      onClick={(evento) => {
        /*
         * Só o clique simples é interceptado. Botão do meio, ctrl+clique,
         * shift e alt querem abrir em outra aba ou janela, e o navegador sabe
         * disso melhor do que a gente.
         */
        if (evento.defaultPrevented) return
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
        if (evento.button !== 0) return
        evento.preventDefault()
        navegar(para)
      }}
      {...resto}
    >
      {children}
    </a>
  )
}
