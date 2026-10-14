import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { renameSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Configuração da loja.
 *
 * App Vite separado do site pessoal (que fica na raiz), porque os dois têm
 * deploys independentes: o presente continua no Netlify Drop atual, e a loja
 * vai para o domínio próprio.
 *
 * `root` é a RAIZ DO REPOSITÓRIO, e não `loja/`. Parece contra intuitivo, mas
 * foi a única configuração que resolveu: com `root` em `loja/`, o Rolldown
 * (usado pelo Vite 8) falha em resolver `../lib/rota.jsx` a partir de
 * `loja/src/App.jsx`, mesmo com o arquivo existindo e com `fs.allow`
 * liberado. O sintoma é um "Module not found" em imports que estão lá.
 *
 * Consequências de usar a raiz, e como cada uma é tratada:
 *
 * - O `publicDir` padrão seria o do site pessoal, e o `conteudo.json` dele
 *   acabaria na build da loja. Por isso `publicDir` aponta para `loja/public`.
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
    name: 'stargeo-achatar-html',
    apply: 'build',
    // `closeBundle` roda depois que todo o bundle já está escrito em disco
    // (em `generateBundle` o `index.html` ainda não seria arquivo nenhum).
    closeBundle() {
      const saida = resolve(raiz, 'dist-loja')
      const aninhado = resolve(saida, 'loja', 'index.html')
      const final = resolve(saida, 'index.html')

      if (existsSync(aninhado)) {
        renameSync(aninhado, final)
        // A pasta `loja/` agora está vazia; `assets/` e o resto ficam na raiz.
      }
    },
  }
}

export default defineConfig({
  root: raiz,
  base: process.env.BASE_URL || '/',

  // Só os assets da loja. Sem isto, `conteudo.json` e os ícones do site
  // pessoal iam junto.
  publicDir: resolve(loja, 'public'),

  server: {
    // O site pessoal e a loja importam `shared/` por caminho relativo. Por
    // ficarem fora da raiz deste projeto, o Vite precisa de autorização
    // explícita — sem isso o dev server devolve 403 ao ler o arquivo.
    fs: {
      allow: [raiz],
    },
    // Porta separada: dá para rodar o site pessoal (5173) e a loja (5174) ao
    // mesmo tempo durante o desenvolvimento.
    port: 5174,
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

  plugins: [react(), tailwindcss(), achatarHtml()],
})
