/**
 * Páginas que chegam PRONTAS no HTML. Roda depois do `vite build`
 * (`npm run build`) e gera, em `dist-loja/`:
 *
 * - `index.html` — a home com textos e estrutura prontos (as folhas do
 *   certificado de exemplo chegam logo depois). A Netlify serve em `/`.
 * - `produto.html` — cabeçalho, trilha e título do produto; o formulário vem
 *   depois. Servido em `/produto/*` (`_redirects` e `netlify.toml`).
 * - `app.html` — o HTML vazio de sempre, para as outras telas (`/*`).
 *
 * Por quê: numa SPA o HTML chega vazio e nada aparece até o JavaScript baixar
 * e rodar — num celular lento, ~3–4 s até o título (Lighthouse). Com o HTML
 * pronto, o título aparece com a página, e o React APROVEITA o que já está na
 * tela (`hydrateRoot` em `main.jsx`). O estilo vai embutido nas duas páginas
 * prontas: uma ida e volta à rede a menos antes da primeira pintura.
 *
 * Renderizado pelo próprio Vite (`ssrLoadModule`): o mesmo JSX, sem um segundo
 * build. O nome do arquivo ficou do começo, quando só havia o produto.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'

const raiz = resolve(import.meta.dirname, '..')
const saida = join(raiz, 'dist-loja')

const vite = await createServer({
  configFile: join(raiz, 'loja/vite.config.js'),
  mode: 'production',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
})

/** Troca o `<link>` do CSS pelo próprio CSS (CSP permite `<style>`). */
function embutirEstilo(html) {
  const css = readdirSync(join(saida, 'assets')).find((f) => /^index-.*\.css$/.test(f))
  const link = new RegExp(`<link rel="stylesheet"[^>]*href="/assets/${css.replace('.', '\\.')}"[^>]*>`)
  if (!link.test(html)) throw new Error('não achei o <link> do CSS no index.html')
  const conteudo = readFileSync(join(saida, 'assets', css), 'utf8')
  return html.replace(link, () => `<style>${conteudo}</style>`)
}

/**
 * JavaScript em prioridade BAIXA nas páginas prontas: o texto já vem no HTML e
 * não precisa dele para aparecer — precisa das FONTES. No 4G lento os dois
 * disputavam a mesma conexão, e o texto só ganhava a fonte certa (a pintura
 * que o Lighthouse conta) depois dos 84 KB de JavaScript. Interação continua
 * igual: o script chega logo em seguida.
 */
function javascriptDepois(html) {
  const novo = html
    .replace(/<script type="module" crossorigin src=/g, '<script type="module" crossorigin fetchpriority="low" src=')
    .replace(/<link rel="modulepreload" crossorigin href=/g, '<link rel="modulepreload" crossorigin fetchpriority="low" href=')
  if (novo === html) throw new Error('não achei o <script> da loja no index.html')
  return novo
}

function comCorpo(modelo, corpo) {
  const html = modelo.replace('<div id="root"></div>', () => `<div id="root">${corpo}</div>`)
  if (html === modelo) throw new Error('não achei o <div id="root"> no index.html')
  return html
}

try {
  const { renderizarCascaDoProduto, renderizarHome } = await vite.ssrLoadModule('/loja/src/prerender.jsx')
  const modelo = readFileSync(join(saida, 'index.html'), 'utf8')

  // As outras telas: o HTML vazio, como sempre foi.
  writeFileSync(join(saida, 'app.html'), modelo)

  // Home.
  const home = renderizarHome()
  if (!home.includes('entre as estrelas')) throw new Error('a home saiu sem o título')
  writeFileSync(join(saida, 'index.html'), javascriptDepois(embutirEstilo(comCorpo(modelo, home))))

  // Produto.
  const produto = renderizarCascaDoProduto()
  if (!produto.includes('Monte o seu certificado')) throw new Error('a casca saiu sem o título do produto')
  const titulo = 'Monte seu certificado de estrela | Stellara'
  const descricao =
    'Escolha uma estrela real, escreva o nome de quem você ama e a sua dedicatória, e veja a prévia do certificado antes de pagar. Pix ou até 12x no cartão.'
  const paginaProduto = comCorpo(modelo, produto)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${descricao}$2`)
  writeFileSync(join(saida, 'produto.html'), javascriptDepois(embutirEstilo(paginaProduto)))

  console.log(`páginas prontas: index.html (home, ${Math.round(home.length / 1024)} KB de HTML), produto.html, app.html`)
} finally {
  await vite.close()
}
