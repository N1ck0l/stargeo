import { navegar } from './rota.js'

/**
 * Link de navegação interna.
 *
 * Fica em arquivo separado do `rota.js` porque este exporta um COMPONENTE e
 * aquele exporta funções: misturar os dois quebra a recarga automática do Vite
 * durante o desenvolvimento, que é o único efeito de `only-export-components`.
 */
export function Link({ para, children, onClick, ...resto }) {
  return (
    <a
      href={para}
      onClick={(evento) => {
        /*
         * O `onClick` do chamador roda PRIMEIRO (ex.: fechar o menu mobile),
         * e pode cancelar a navegação com `preventDefault` — é o mesmo
         * contrato do `onClick` nativo de uma `<a>`.
         */
        onClick?.(evento)

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

/*
 * `onClick` é desestruturado de propósito: se ele entrasse em `{...resto}`,
 * que viria depois do handler, substituiria a navegação — e o link do menu
 * mobile (que passa `onClick` para fechar o menu) voltaria a ser `<a>` nativa,
 * recarregando a SPA inteira. Com a desestruturação, quem passa `onClick` e
 * quem não passa navegam igual; para cancelar, basta `preventDefault()` dentro
 * do próprio `onClick`.
 */
