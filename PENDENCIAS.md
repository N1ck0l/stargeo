# Pendências

Estado em 14 de outubro de 2026. A plataforma está completa: loja, páginas
dedicadas, edição do cliente e painel `/admin` (Supabase Auth), tudo verificado
com E2E no navegador. O que sobra divide-se entre o que só o dono pode fazer e
o que dá para melhorar.

---

## 1. Só você pode fazer

### 1.1 Escrever a mensagem pessoal  ← o mais importante

A seção existe e só aparece quando está preenchida. Abra `/admin` (painel
novo, Supabase Auth), vá em **Páginas**, abra `SG-GEOV-ANNA`, escreva em
**Mensagem pessoal** e salve — a página pública passa a mostrar na hora. Hoje
ela está vazia; enquanto isso, o presente entrega sem o pedaço mais pessoal.

### 1.2 Testar no iPhone

É o maior risco técnico em aberto. Todo o código de iOS (permissão de
movimento, área segura, `play()` da câmera, `text-size-adjust`) foi escrito a
partir de documentação, **nunca executado num iPhone**.

Verifique com atenção:

- a câmera liga e mostra o céu
- o menu não fica embaixo do entalhe nem da barra de gesto
- a bússola responde (no Safari é preciso **Configurações → Safari →
   Movimentação e Orientação**)
- o certificado abre e os dois botões de impressão funcionam

### 1.3 Testar a Mira celeste de noite, ao ar livre

Os rastros de estrelas e a bússola só podem ser julgados de verdade no
celular dela, à noite. Bússola dentro de casa erra ±20° ou mais — isso é
esperado, não é defeito.

Nesta versão a seta de direção foi corrigida: antes, em metade das posições
(quando o aparelho apontava para o lado oposto ao da estrela, atravessando o
norte) ela mandava virar para o lado errado. Ainda vale confirmar no escuro.

### 1.4 Domínio e Netlify

O repositório já publica sozinho na Netlify (site `stellara-loja`, publish
`dist-loja`) — commit com push é deploy. O nome `stellara` puro estava em uso
na plataforma, daí o sufixo. Os projetos antigos
`luxury-lamington-97da01` (duplicata) e `papaya-dieffenbachia-483678` (site
pessoal, build manual) foram apagados; `leafy-jelly-5aac6d` não é deste
projeto e segue intocado.

O site pessoal não está publicado em lugar nenhum. O `og:url`, o `canonical`
e o `og:image` dele apontam para `https://n1ck0l.github.io/stellara/`
(GitHub Pages, a opção 3 do DEPLOY.md) — ative o Pages e a prévia passa a
funcionar sem mexer em código.

Não existe domínio próprio da marca ainda: a loja vive em `*.netlify.app`.
Quando o domínio chegar, aponte-o (A/ALIAS ou CNAME para o Netlify), troque
`PUBLIC_SITE_URL`, `FONTS_BASE_URL` e `ORIGENS_PERMITIDAS` nos *secrets* do
Supabase (`supabase secrets set`) e faça um deploy. As variáveis `VITE_*`
ficam nos *Environment variables* do site na Netlify.

> A prévia ao compartilhar (`og:image`, `canonical`) é URL absoluta: confira
> depois do domínio novo que o WhatsApp mostra a imagem.

### 1.5 Conta do painel

O `/admin` da loja usa Supabase Auth — não há senha escrita no código. A conta
é `nickolasfelipe225@gmail.com` (a migration `0008` trocou o endereço antigo do
domínio removido; a senha continua sendo a entregue fora do repositório —
troque no dashboard → Authentication → Users → *Reset password* se quiser).
Permissão é a linha em `public.admins`; sem ela, a conta loga e recebe 403.

O `/admin` antigo do site pessoal (`src/components/Admin.jsx`, senha
`stellara`) só existe no build do site pessoal, que não é mais publicado.

### 1.6 Mercado Pago real

Já rodou contra o ambiente de **teste** do Mercado Pago: webhook entrega,
e-mail sai, PDF baixa (pedido `SG-RT65-DNDG` aprovado e entregue). O que falta
para vender:

1. Trocar a conta do MP (teste → produção): novo `MERCADO_PAGO_ACCESS_TOKEN`
   e recriar o webhook (o segredo muda).
2. Conferir os preços em `migrations/0002_seed.sql` e a lista de termos
   bloqueados em `shared/moderation.js` antes do primeiro cliente de verdade.

O ponto mais frágil é a moderação: o certificado vende texto impresso que o
cliente escreve e o vendedor não lê antes de entregar. O filtro roda duas
vezes (na compra e no webhook), mas nenhuma lista de termos é completa — vale
acompanhar os primeiros pedidos de perto. O painel mostra todos os pedidos em
tempo quase real.

---

## 2. Melhorias que dá para fazer

Nada de bloqueante. Só polimento:

### 2.1 Cabeçalhos de segurança

O `netlify.toml` tem `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy` e `Strict-Transport-Security`. O
repositório já está conectado à Netlify (deploy automático), então eles valem
— conferir no navegador após o domínio novo, quando o HTTPS passa a valer de
verdade.

### 2.2 Os ícones e a imagem de prévia — resolvidos no rebrand

Os PNGs (`og-image`, `icon-192`, `icon-512`, `icon-maskable-512`,
`favicon-32`, `apple-touch-icon`) foram regenerados na marca Stellara —
símbolo, noite e dourado, com Playfair/Montserrat embutidas — e ficaram bem
menores: o og-image caiu de 201 KB para ~32 KB e o ícone de 512 px de
~137 KB para ~9 KB. Os arquivos valem para os dois sites (a pasta `public/`
de cada build recebeu os mesmos). Se a arte mudar de novo, a geração é
reproduzível a partir do `favicon.svg` e da prancha da marca.

---

## 3. O que foi corrigido (rodada anterior — site pessoal)

Uma revisão completa do código do site pessoal encontrou problemas reais,
todos resolvidos:

| O que era | Consequência |
| --- | --- |
| `wrap180` não normalizava entrada negativa | A Mira celeste **invertia a seta** e nunca alinhava quando o aparelho apontava para o lado oposto ao da estrela |
| Aviso de "versão nova" nunca aparecia | Publicar texto novo dependia de a pessoa recarregar sozinha |
| 4 campos do `/admin` sem efeito | "Data da dedicação", "Registro", título e descrição da estrela eram editáveis e **não apareciam** |
| Mapa ignorava botão e teclado sob movimento reduzido | Quem pediu menos movimento perdia o controle por teclado |
| Corrida no `getUserMedia` | A câmera podia ficar **ligada em segundo plano** ao fechar a Mira no meio da permissão |
| Fontes: 14 arquivos, 5 conteúdos idênticos | Peso baixado duas vezes e peso tipográfico não era o pedido |
| SW gravava 404 no cache offline | Sem internet, qualquer endereço mostrava a página de erro |
| `conteudo.json` servia do cache primeiro | Texto novo só aparecia na publicação *seguinte* |
| Versão clara do certificado saía com folha escura | "Imprimir claro" gastava tinta como se fosse a escura |
| Mira celeste não era um diálogo | Sem `Esc`, foco preso ou trava de rolagem; o teclado vazava para o site |
| Pinça trocava a estrela selecionada | Zoom com dois dedos mudava o painel sem querer |
| Bilhete rotacionado duas vezes | Inclinação de -1,2° em vez de -0,6°, e o hover não endireitava |
| 42 estrelas com ascensão reta inválida | Kaus Australis era desenhada **duas vezes** na Mira |
| `og:image` relativa | Sem prévia no WhatsApp/Twitter |
| Conteúdo invisível sem JavaScript | Página em branco se o JS falhasse |

Ganhos: **6 correções de bug** (com testes que falham se voltarem), lint limpo
pela primeira vez, **10 arquivos de fonte a menos**, e a bateria de testes foi
de 95 para **151 verificações**.

---

## 4. Estado atual, para conferência

| Item | Situação |
| --- | --- |
| Build | limpo (site pessoal e loja), deploy automático no push |
| Lint | limpo, zero warnings (oxlint) |
| Testes | **224 verificações** — 78 no vitest + astro (39) + céu (82) + moderação (25) |
| E2E no navegador | compra→página, página pública (30), edição do cliente (22), painel (25) — todos verdes |
| Pacote inicial | 111 kB gzip de JS + 11,4 de CSS (chunk do Supabase só em `/admin` e `/editar`) |
| PWA / offline | do site pessoal (`dist/`), funcionando — a loja não usa service worker |
| `/admin` | painel Supabase Auth (conta + linha em `admins`), sem senha no código |
| Conteúdo | páginas no banco (`pages`); seed Geovanna `SG-GEOV-ANNA` publicada |
| Loja e páginas | prontas e verificadas; Mercado Pago ainda em ambiente de teste |
| E-mail | saindo do endereço pessoal (`EMAIL_FROM` com Gmail); domínio próprio da marca pendente |

### Fluxo para mudar um texto

1. Abrir `/admin`, entrar com a conta de admin
2. Em **Páginas**, abrir a página, editar e **Salvar** — publica na hora
3. **Páginas** também tem criar manual, publicar/despublicar; **Pedidos**
   reenvia o e-mail e cria página de pedido pago

Nada de build nem de arrastar pasta para mudar texto — `conteudo.json` só vale
para o site pessoal (`src/`), que hoje é build legado.

### Onde mexer

- `loja/src/admin/` — o painel (visão geral, pedidos, páginas, editor)
- `loja/src/pagina/` — página dedicada e edição do cliente
- `loja/src/lib/admin.js` — sessão/autenticação do painel
- `supabase/functions/` — `get-page`, `page-auth`, `page-update`, `admin-api`
- `supabase/migrations/0004–0006` — `pages`, `page_edit_tokens`, `admins`, seed
- `shared/moderation.js` — termos bloqueados (compra e webhook)
- `src/data/star.js` / `defaults.js` — dados do site pessoal (legado)
