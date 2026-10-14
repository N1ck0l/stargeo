/**
 * Conteúdo editável do site.
 *
 * Há duas camadas:
 *
 * 1. `DEFAULTS` — embutidos no pacote. O site funciona mesmo sem rede, sem
 *    arquivo de conteúdo, e sem piscada enquanto carrega.
 * 2. `conteudo.json` — opcional, fica em `public/`. Se existir, sobrescreve os
 *    padrão. É esse arquivo que o painel de admin gera.
 *
 * Assim mudar um texto é: abrir `/admin`, editar, baixar o JSON, colocar em
 * `public/` e publicar de novo. Sem servidor, sem banco.
 */
import { useEffect, useState } from 'react'
import { DEFAULTS } from '../data/defaults'
import { ContentContext } from './contentContext.js'

/**
 * Carrega o conteúdo e o oferece para a aplicação.
 *
 * `editable` fica `true` quando a origem é a página de admin, para o painel
 * conseguir escrever em cima sem recarregar o site.
 *
 * `initial` permite começar de um conteúdo pronto — é o que os testes usam para
 * verificar que um campo editado chega ao componente que o exibe.
 */
export function ContentProvider({ children, editable = false, initial = DEFAULTS }) {
  const [content, setContent] = useState(initial)

  useEffect(() => {
    if (editable) return
    let cancelled = false
    // `BASE_URL` faz o caminho funcionar também quando o site é publicado em
    // subpasta. `no-cache` é obrigatório: um `conteudo.json` em cache faria o
    // presente antigo aparecer depois de uma nova publicação.
    fetch(`${import.meta.env.BASE_URL}conteudo.json`, { cache: 'no-cache' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        // Só campos conhecidos, para um arquivo antigo ou adulterado não
        // quebrar o site.
        const merged = { ...DEFAULTS }
        for (const key of Object.keys(DEFAULTS)) {
          if (data[key] !== undefined) merged[key] = data[key]
        }
        setContent(merged)
      })
      .catch(() => {
        // Sem arquivo de conteúdo: os padrões embutidos já valem.
      })
    return () => {
      cancelled = true
    }
  }, [editable])

  return (
    <ContentContext.Provider value={{ content, setContent, editable }}>
      {children}
    </ContentContext.Provider>
  )
}