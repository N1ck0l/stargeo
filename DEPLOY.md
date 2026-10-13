# Publicar o StarGeo

O projeto é uma página estática: não há servidor, banco de dados nem API.
Tudo o que você precisa é gerar a pasta `dist/` e Placesem qualquer hospedagem
de arquivos estáticos.

## Antes de começar

```bash
npm install
npm run build
```

Isso cria a pasta `dist/`. É ela — e só ela — que vai para o ar.

## Opção 1 — Netlify Drop (mais rápida, sem conta de desenvolvedor)

1. Rode `npm run build`.
2. Abra <https://app.netlify.com/drop>.
3. Arraste a pasta `dist` inteira para a página.
4. Você recebe uma URL tipo `https://aleatorio-1234.netlify.app`.

Para trocar por um endereço próprio: **Site settings → Domain management →
Add custom domain**. O certificado HTTPS vem automático.

Para atualizar o site depois, é só arrastar a `dist/` nova de novo.

> **Cuidado com o `netlify.toml`.** Ele está na raiz do repositório, mas
> constrói a **loja** (`dist-loja`), não o site pessoal. Conectar o repositório
> ao Netlify publica a loja — não este presente. Os cabeçalhos de segurança e
> o cache valem para qualquer um, mas não são aplicados enquanto nada do
> repositório estiver conectado: só o Drop lê a pasta `dist/`, que não
> contém o arquivo.

## Opção 2 — Vercel

```bash
npm i -g vercel
vercel
```

Na primeira pergunta sobre o preset, escolha **Vite**. O resto é padrão:
build `npm run build`, saída `dist`. Para produção, `vercel --prod`.

## Opção 3 — GitHub Pages (grátis, com conta no GitHub)

Dá um pouco mais de trabalho porque o Pages publica em subpasta.

**1. Prepare o build** — neste repositório, ao publicar em subpasta os
arquivos precisam do prefixo `/<nome-do-repo>/`:

```bash
# troque "stargeo" pelo nome do seu repositório
$env:BASE_URL="/stargeo/"
npm run build
```

> No Linux/macOS: `BASE_URL=/stargeo/ npm run build`

**2. Publique pelo GitHub Actions.** Crie `.github/workflows/deploy.yml`:

```yaml
name: Publicar no GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          BASE_URL: /stargeo/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**3. Ative o Pages** no repositório:
**Settings → Pages → Build and deployment → Source: *GitHub Actions***.

O site sai em `https://<seu-usuario>.github.io/stargeo/`.

## Detalhes que costumam dar problema

> **⚠️ Precisa de HTTPS.** A "Mira celeste" usa câmera, localização e bússola —
> recursos que os navegadores bloqueiam fora de um contexto seguro. Publicada em
> `http://`, ela abre mas a câmera não liga. Netlify e Vercel emitem HTTPS
> automático; no GitHub Pages também vem por padrão. Em casa, na rede local,
> `http://192.168.x.x:4173` **não** funciona — só `localhost` no próprio aparelho.

**Não precisa configurar "rewrite"** para SPA. O site usa âncoras
(`#ceu`, `#estrela`, `#carta`), não rotas de caminho — não há tela que dependa
de URL para carregar.

**As fontes vêm do Google Fonts.** Se a página for aberta sem internet, ou em
rede que bloqueie o Google, ela cai para uma fonte serifada padrão. Ainda fica
bonita, mas muda o desenho. Para funcionar 100% offline seria preciso baixar
as fontes e servi-las junto — dá para fazer depois, se quiser.

**Não versione `dist/`.** Ele já está no `.gitignore`.

**O certificado usa fontes e canvas**, então a impressão em PDF funciona melhor
pelo botão "Imprimir" do que por "Salvar como PDF" direto do navegador.

## Depois de publicar

Confira nesta ordem, no celular e no computador:

1. A página abre e o título está certo.
2. O mapa do céu carrega e Kaus Australis aparece com o anel dourado.
3. O botão de certificado abre, e "Baixar PNG" e "Imprimir" funcionam.
4. Os links do menu rolam até as seções.

Se algo estiver em branco, abra o console do navegador (F12): quase sempre é
`BASE_URL` com valor errado ou faltando.