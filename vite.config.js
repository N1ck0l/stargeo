/**
 * Configuração de build do SITE PESSOAL (o presente dedicado).
 *
 * Este é o app Vite da raiz — não confundir com `loja/vite.config.js`, que é
 * um projeto separado com deploy separado (`npm run dev` / `npm run build`
 * usam este; `npm run dev:loja` / `npm run build:loja` usam o da loja).
 *
 * Além do `defineConfig` comum (base, dev server, plugins), este arquivo
 * registra o plugin `serviceWorkerPlugin`, que só existe por causa do
 * requisito "funciona offline": ele gera o `sw.js` com a lista real de
 * arquivos do bundle e escreve o `admin/index.html` como arquivo físico.
 *
 * Não edite os limites de cache nem a estratégia do SW sem ler o comentário
 * de cada bloco: vários deles documentam bugs que já aconteceram (cache
 * envenenado por 404, worker que se assume no meio do uso, precache 404 em
 * GitHub Pages).
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Gera o service worker com a lista real de arquivos do build.
 *
 * Um SW escrito à mão não sabe quais arquivos existem, e só cacheia o que já
 * foi visitado — o que não é "funcionar offline". Aqui o Vite avisa quais
 * arquivos ele produziu e o SW é escrito com essa lista, então a segunda
 * visita abre sem internet mesmo sem ter usado antes cada parte do site.
 *
 * A lista inclui os nomes com hash, então o cache é invalidado sozinho a cada
 * publicação nova: o SW troca de versão quando o conteúdo muda.
 */
function serviceWorkerPlugin() {
  return {
    name: 'stargeo-service-worker',
    // Só no build: o dev server não gera sw.js, e um SW no modo de
    // desenvolvimento ficaria servindo bundle antigo por cima do HMR.
    apply: 'build',
    generateBundle(_options, bundle) {
      /*
       * Caminhos com o mesmo `base` do site. Um provedor que publica na raiz
       * usa '/'; o GitHub Pages em repositório publica sob '/<repo>/', e um
       * precache com '/' na frente daria 404 em tudo — engolido pelo `.catch`
       * abaixo, e o modo offline simplesmente nunca funcionaria.
       */
      const base = _options.base ?? '/'
      const files = Object.keys(bundle)
        .map((name) => `${base}${name}`)
        .filter((name) => !name.endsWith('.map'))

      // Arquivos da pasta public/ são copiados, não entram no bundle; entram
      // na lista à mão, e os que interessam ao offline são fontes e ícones.
      // Uma fonte por família e estilo: os arquivos de pesos diferentes eram
      // idênticos (mesmo SHA-256), então guardar os demais só ocupava disco e
      // fazia o precache baixar o mesmo desenho várias vezes.
      const publicFiles = [
        'index.html',
        'fonts/cinzel-400.woff2',
        'fonts/cormorant-garamond-400.woff2',
        'fonts/cormorant-garamond-400i.woff2',
        'fonts/outfit-400.woff2',
        'icon-192.png',
        'icon-512.png',
        'manifest.webmanifest',
      ].map((name) => `${base}${name}`)

      const indexHtml = `${base}index.html`
      const adminHtml = `${base}admin/index.html`
      const precache = [...new Set([...files, ...publicFiles, adminHtml])]      /*
       * Hash do próprio conteúdo do service worker, não a hora do build.
       * Com `Date.now()`, publicar qualquer coisa — até um deploy idêntico —
       * invalidava o cache inteiro. Como este arquivo é gerado a partir do
       * conteúdo real dos arquivos, a soma deles é o sinal certo.
       */
      const version = createHash('sha256')
        .update(files.join('|') + publicFiles.join('|'))
        .digest('hex')
        .slice(0, 12)

      const source = `// Gerado automaticamente durante o build. Não edite à mão.
const CACHE = 'stargeo-${version}';
const INDEX = ${JSON.stringify(indexHtml)};
// Conteúdo editável: o arquivo é trocado a cada publicação e não leva hash no
// nome, então cache-first serviria sempre a versão antiga.
const NETWORK_FIRST = [/conteudo\\.json$/];
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falha inteiro se um arquivo falhar; feito um a um, um 404 não
      // impede o site de funcionar offline.
      .then((cache) => Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => {})),
      ))
  );
});

/*
 * O worker novo NÃO se assume sozinho.
 *
 * Trocar o JavaScript enquanto a página está em uso deixaria a pessoa com uma
 * versão misturada — o HTML antigo com o código novo. Sem "skipWaiting" no
 * install, o worker fica em espera e o aviso "Atualizar agora" oferece a troca
 * num botão, na hora em que ela decidir.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // Sem "clients.claim": assumir abas abertas é justamente o que se quer
      // evitar sem a permissão da pessoa.
  );
});

// A página pede isto quando a pessoa clica em "Atualizar agora": o worker novo
// assume, o "controllerchange" recarrega e o site novo aparece.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: tenta a rede primeiro (para pegar atualizações) e cai no
  // cache quando está sem internet.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          /*
           * "fetch" resolve em 404 e 5xx; só rejeita em erro de rede. Gravar
           * uma página de erro no cache envenenava a navegação offline: de
           * então em diante, sem internet, qualquer endereço mostrava o 404 do
           * servidor em vez do site.
           */
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(INDEX, copy));
          }
          return response;
        })
        .catch(() => caches.match(INDEX)),
    );
    return;
  }

  // Conteúdo editável: rede primeiro, cache só como reserva.
  if (NETWORK_FIRST.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Demais arquivos: cache primeiro. São imutáveis (têm hash no nome), então
  // não há risco de servir algo velho.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },

    /**
     * O painel de edição precisa existir como ARQUIVO, não como rota.
     *
     * Publicar arrastando a pasta (Netlify Drop) não aplica o `netlify.toml`,
     * então não há rewrite de SPA e `/admin` daria 404. Escrevendo um
     * `admin/index.html` de verdade, o servidor encontra o arquivo e entrega a
     * página sem depender de nenhuma regra — funciona nos dois modos de
     * publicação.
     *
     * Fica em `writeBundle` porque é aí que o index.html já existe no bundle;
     * em `generateBundle` o plugin de HTML ainda não o adicionou.
     */
    writeBundle(options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') return
      const dir = join(options.dir ?? 'dist', 'admin')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'index.html'), html.source)
    },
  }
}

export default defineConfig({
  /**
   * Domínio base dos assets.
   *
   * Quase todo provedor serve na raiz (`/`), que é o padrão. A exceção é o
   * GitHub Pages em repositório, que publica sob `/<nome-do-repo>/` — lá é
   * preciso passar `BASE_URL=/<nome-do-repo>/` no build, senão os scripts
   * são pedidos de um caminho que não existe e a página fica em branco.
   */
  base: process.env.BASE_URL || '/',
  server: {
    /**
     * O Vite bloqueia hosts desconhecidos por padrão (proteção contra DNS
     * rebinding). Só para desenvolvimento, liberamos os domínios de túnel
     * HTTPS, porque a câmera e a bússola exigem contexto seguro e não
     * funcionam em http://localhost pela rede.
     *
     * O ponto inicial casa com qualquer subdomínio. Nada disso afeta o build
     * de produção, que é servido pelo provedor e não pelo Vite.
     */
    allowedHosts: ['.trycloudflare.com', '.loca.lt'],
  },
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
})
