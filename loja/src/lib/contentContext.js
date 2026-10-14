/**
 * O contexto de conteúdo, separado do provedor.
 *
 * O hook `useContent` precisa morar em um módulo que não exporta componentes:
 * o recarregamento automático do Vite só funciona em arquivos que exportam
 * apenas componentes, e misturar os dois fazia `npm run dev` recarregar a
 * página inteira a cada alteração neste arquivo.
 */
import { createContext, useContext } from 'react'
import { DEFAULTS } from '../data/defaults'

export const ContentContext = createContext({
  content: DEFAULTS,
  setContent: () => {},
  editable: false,
})

/** Acesso ao conteúdo editável do site. */
export function useContent() {
  return useContext(ContentContext)
}
