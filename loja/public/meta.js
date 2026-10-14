/*
 * Metadados sociais, montados em tempo de build.
 *
 * O Open Graph exige URL ABSOLUTA na imagem e no `canonical`: com caminho
 * relativo, o WhatsApp e o Twitter simplesmente não mostram a prévia. Como o
 * domínio da loja só é conhecido na hora de publicar, os valores vêm do
 * ambiente em vez de ficarem escritos no `index.html` — e é só este arquivo que
 * precisa ser trocado quando o domínio mudar.
 *
 * Carregado como `<script>` clássico (não module) no `<head>` do
 * `loja/index.html`, de forma síncrona: as tags existem antes de qualquer
 * rede social pedir a prévia. O valor de `window.__STELLARA_ENV__` é exposto
 * pelo passo que publica a loja; sem ele (build local puro), o script sai
 * sem tocar no head e as tags estáticas do HTML continuam valendo.
 *
 * Este arquivo é público por definição: ele vira um `<script>` na página, então
 * nada de segredo aqui. A chave pública do Mercado Pago também entra, e é
 * pública por desenho.
 */
(function () {
  var site = (window.__STELLARA_ENV__ && window.__STELLARA_ENV__.SITE_URL) || ''
  // A barra final é removida antes de concatenar: `SITE_URL` pode chegar com
  // ou sem ela, e a imagem viraria `//og-image.png`.
  var imagem = site ? site.replace(/\/$/, '') + '/og-image.png' : '/og-image.png'

  // `og:*` vai no atributo `property`; o resto do mundo usa `name`. Trocar
  // os dois faz o Facebook ignorar a tag em silêncio.
  function tag(prop, content) {
    var el = document.createElement('meta')
    el.setAttribute(prop.indexOf('og:') === 0 ? 'property' : 'name', prop)
    el.setAttribute('content', content)
    document.head.appendChild(el)
  }

  if (!site) return

  tag('og:url', site + '/')
  tag('og:image', imagem)
  tag('og:image:alt', 'Cartão da Stellara com o céu de Sagitário')
  tag('og:image:width', '1200')
  tag('og:image:height', '630')
  tag('twitter:image', imagem)

  // Canonical aponta para a home em vez da rota do produto: a loja é uma
  // SPA, e o crawler não executa o bundle para descobrir a URL canônica de
  // cada página.
  var canonical = document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = site + '/'
  document.head.appendChild(canonical)
})()
