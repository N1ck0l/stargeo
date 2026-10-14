import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, renameSync, rmdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Configuração da loja (`npm run dev`, `npm run build`).
 *
 * `root` é a RAIZ DO REPOSITÓRIO, e não `loja/`. Parece contra intuitivo, mas
 * foi a única configuração que resolveu: com `root` em `loja/`, o Rolldown
 * (usado pelo Vite 8) falha em resolver `../lib/rota.jsx` a partir de
 * `loja/src/App.jsx`, mesmo com o arquivo existindo e com `fs.allow`
 * liberado. O sintoma é um "Module not found" em imports que estão lá.
 *
 * Consequências de usar a raiz, e como cada uma é tratada:
 *
 * - O `publicDir` padrão seria o `public/` da raiz. Por isso `publicDir`
 *   aponta para `loja/public`.
 * - O `index.html` da loja é emitido em `dist-loja/loja/index.html`, preservando
 *   o caminho relativo ao `root`. O plugin abaixo o move para a raiz da saída,
 *   onde um SPA com rotas precisa que ele esteja.
 *
 * Os `node_modules` são os da raiz: o Node resolve subindo a árvore de
 * diretórios, então não há uma segunda instalação.
 */

const loja = resolve(import.meta.dirname)
const raiz = resolve(loja, '..')

/** Move o HTML gerado da raiz da saída. Ver a nota no topo do arquivo. */
function achatarHtml() {
  return {
    name: 'stellara-achatar-html',
    apply: 'build',
    // `closeBundle` roda depois que todo o bundle já está escrito em disco
    // (em `generateBundle` o `index.html` ainda não seria arquivo nenhum).
    closeBundle() {
      const saida = resolve(raiz, 'dist-loja')
      const aninhado = resolve(saida, 'loja', 'index.html')
      const final = resolve(saida, 'index.html')

      if (existsSync(aninhado)) {
        renameSync(aninhado, final)
        // A pasta `loja/` ficou vazia; `assets/` e o resto já estão na raiz.
        rmdirSync(resolve(saida, 'loja'))
      }
    },
  }
}

/**
 * Escreve no `<head>` as URLs absolutas da prévia social.
 *
 * O Open Graph exige URL ABSOLUTA na imagem e no `canonical`, e os robôs de
 * prévia (WhatsApp, Facebook, Telegram) leem o HTML cru — não executam
 * JavaScript. Por isso a troca é aqui, no build, e não num script da página.
 *
 * O domínio vem de `SITE_URL` e, sem ela, de `URL` — a variável que a Netlify
 * define em todo build com o endereço principal do site. Build local sem
 * nenhuma das duas sai sem as tags (não há endereço certo para pôr).
 */
function metaSocial() {
  return {
    name: 'stellara-meta-social',
    transformIndexHtml() {
      const site = (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '')
      if (!site) return []
      const imagem = `${site}/og-image.png`
      const meta = (atributo, nome, conteudo) => ({
        tag: 'meta',
        attrs: { [atributo]: nome, content: conteudo },
        injectTo: 'head',
      })
      return [
        meta('property', 'og:url', `${site}/`),
        meta('property', 'og:image', imagem),
        meta('property', 'og:image:alt', 'Logo da Stellara sobre o céu noturno: dedique uma estrela no céu do Brasil'),
        meta('property', 'og:image:width', '1200'),
        meta('property', 'og:image:height', '630'),
        meta('name', 'twitter:image', imagem),
        { tag: 'link', attrs: { rel: 'canonical', href: `${site}/` }, injectTo: 'head' },
      ]
    },
  }
}

export default defineConfig({
  root: raiz,
  base: process.env.BASE_URL || '/',

  // Com `root` na raiz, o padrão seria `public/` da raiz — os assets da loja
  // ficam em `loja/public`.
  publicDir: resolve(loja, 'public'),

  server: {
    // A loja importa `shared/` por caminho relativo, fora de `loja/`: o Vite
    // precisa de autorização explícita — sem isso o dev server devolve 403.
    fs: {
      allow: [raiz],
    },
    // 5173 é a porta que o CORS das Edge Functions libera para
    // desenvolvimento (`ORIGENS_DEV` em `_shared/http.ts`); outra porta faria
    // toda chamada ao Supabase falhar no `npm run dev`.
    port: 5173,
    strictPort: true,
  },

  build: {
    outDir: resolve(raiz, 'dist-loja'),
    emptyOutDir: true,
    rollupOptions: {
      /*
       * Caminho RELATIVO ao `root`. Passar o absoluto aqui não funciona: o
       * Vite junta os dois e resolve `loja/loja/index.html`, que não existe.
       */
      input: 'loja/index.html',
    },
  },

  plugins: [react(), tailwindcss(), metaSocial(), achatarHtml()],
})
