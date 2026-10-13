/*
 * Metadados sociais, montados em tempo de build.
 *
 * O Open Graph exige URL ABSOLUTA na imagem e no `canonical`: com caminho
 * relativo, o WhatsApp e o Twitter simplesmente não mostram a prévia. Como o
 * domínio da loja só é conhecido na hora de publicar, os valores vêm do
 * ambiente em vez de ficarem escritos no `index.html` — e é só este arquivo que
 * precisa ser trocado quando o domínio mudar.
 *
 * Este arquivo é público por definição: ele vira um `<script>` na página, então
 * nada de segredo aqui. A chave pública do Mercado Pago também entra, e é
 * pública por desenho.
 */
(function () {
  var site = (window.__STARGEO_ENV__ && window.__STARGEO_ENV__.SITE_URL) || ''
  var imagem = site ? site.replace(/\/$/, '') + '/og-image.png' : '/og-image.png'

  function tag(prop, content) {
    var el = document.createElement('meta')
    el.setAttribute(prop.indexOf('og:') === 0 ? 'property' : 'name', prop)
    el.setAttribute('content', content)
    document.head.appendChild(el)
  }

  if (!site) return

  tag('og:url', site + '/')
  tag('og:image', imagem)
  tag('og:image:alt', 'Cartão da StarGeo com o céu de Sagitário')
  tag('og:image:width', '1200')
  tag('og:image:height', '630')
  tag('twitter:image', imagem)

  var canonical = document.createElement('link')
  canonical.rel = 'canonical'
  canonical.href = site + '/'
  document.head.appendChild(canonical)
})()
