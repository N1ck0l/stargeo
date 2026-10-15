/**
 * Gera `dist-loja/produto.html`: a página do produto com a casca (cabeçalho,
 * trilha, título, rodapé) já no HTML. Roda depois do `vite build`
 * (`npm run build`); a Netlify serve este arquivo em `/produto/*`
 * (`loja/public/_redirects` e `netlify.toml`).
 *
 * Por quê: numa SPA o HTML chega vazio, e o título do produto só aparecia
 * depois de o JavaScript baixar, rodar e pedir o pacote da página — ~3,6 s
 * num celular lento (Lighthouse). Com a casca, ele vem pintado no HTML, e o
 * React aproveita o que já está na tela (`hydrateRoot` em `main.jsx`).
 *
 * O componente é renderizado pelo próprio Vite (`ssrLoadModule`): o mesmo
 * JSX, os mesmos aliases, sem um segundo build.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const raiz = resolve(import.meta.dirname, '..')
const saida = join(raiz, 'dist-loja')

// O roteador lê o endereço na primeira renderização (`useRota`).
globalThis.window = { location: { pathname: '/produto/certificado-digital', search: '', origin: 'https://stellara.invalid' } }

const vite = await createServer({
  configFile: join(raiz, 'loja/vite.config.js'),
  mode: 'production',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

try {
  const { renderizarCascaDoProduto } = await vite.ssrLoadModule('/loja/src/prerender.jsx')
  const corpo = renderizarCascaDoProduto()
  if (!corpo.includes('Monte o seu certificado')) throw new Error('a casca saiu sem o título do produto')

  const titulo = 'Monte seu certificado de estrela | Stellara'
  const descricao =
    'Escolha uma estrela real, escreva o nome de quem você ama e a sua dedicatória, e veja a prévia do certificado antes de pagar. Pix ou até 12x no cartão.'

  const html = readFileSync(join(saida, 'index.html'), 'utf8')
  const pagina = html
    .replace('<div id="root"></div>', `<div id="root">${corpo}</div>`)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${descricao}$2`)
  if (pagina === html || !pagina.includes('Monte o seu certificado')) throw new Error('não foi possível injetar a casca no index.html')

  writeFileSync(join(saida, 'produto.html'), pagina)
  console.log(`produto.html: casca pré-renderizada (${Math.round(corpo.length / 1024)} KB de HTML)`)
} finally {
  await vite.close()
}
