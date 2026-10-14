# Stellara — Loja

Loja de certificados de estrela, nascida do site-presente original (guardado
na tag `site-pessoal-legado`).

```
shared/              núcleo usado pela loja e pelo servidor
├── stars.js         12 estrelas vendáveis, dados conferidos com o SIMBAD
├── moderation.js    filtro do texto que o cliente escreve no certificado
├── certificado/     a folha (Edição Midnight, A4 retrato) como lista de
│                    itens em mm + larguras das fontes (metricas.js)
├── pdf.js           traduz a folha para PDF (pdf-lib, sem navegador)
├── marca.js         geometria do símbolo; marcaTexto.js = nome em curvas
├── ceu.js           céu em volta das 12 estrelas (Hipparcos), p/ o mapa
├── astro.js         projeção gnomônica do mapa do céu
└── sky.js           posição celeste no céu, agora e aqui

supabase/
├── migrations/      schema: stars, products, orders, pages, page_edit_tokens,
│                    admins, rate_limits (0001–0009, inclui registro do
│                    certificado, seed da primeira página, trava de entrega,
│                    limite de requisições e resumo do painel)
└── functions/       create-checkout, mp-webhook, track-order,
│                    resend-certificate, get-page, page-auth, page-update,
│                    admin-api

loja/                app da loja (Vite + React)
└── src/             home, produto, rastreio, obrigado, prévia do certificado,
                     página dedicada (/p/SG-XXXX-XXXX), edição do cliente
                     (/p/…/editar) e painel administrativo (/admin)

netlify/edge-functions/
└── pagina-og.ts     prévia social de /p/CODE (título com o nome de quem recebe)
```

## O que já está pronto

**Catálogo e certificado.** A folha é a Edição Midnight da prancha da marca:
A4 retrato, logo oficial, nome em Playfair itálica, dados astronômicos e o
mapa do céu REAL em volta da estrela (catálogo Hipparcos, linhas da
constelação). Ela existe uma vez só — `shared/certificado/desenho.js` devolve
uma lista de itens em milímetros — e dois tradutores a desenham: SVG na loja
(`CertificadoPreview`) e PDF no servidor (`shared/pdf.js`, ~150 ms, ~85 KB).
As duas medem o texto com a mesma tabela de larguras, então a quebra de linha
é idêntica. Sai em duas versões: escura (original) e clara (papel).

**Catálogo: ~118 mil estrelas, exclusivas.** A tabela `stars` tem o
Hipparcos inteiro. Cada estrela passa por `disponivel → reservada → dedicada`
(funções atômicas da migration 0010): o checkout reserva por 40 min (o
pagamento expira em 30, e por isso o boleto saiu), o webhook dedica no
aprovado e libera no recusado. O preço é o da FAIXA da estrela (tabela
`faixas`, editável sem deploy): lendária, nomeada, brilhante, visível e
profunda. A loja busca pelo Data API (`buscar_estrelas`, `estrela_aleatoria`).

Para refazer o catálogo (dados novos, regra de faixa diferente):

```bash
# dados: d3-celestial (npm pack d3-celestial@0.7.35, pasta package/data),
# Hipparcos via VizieR (I/239/hip_main: HIP, Vmag, Plx, e_Plx, SpType, HD)
# e os limites das constelações (cdsarc.cds.unistra.fr/ftp/VI/42/data.dat)
node scripts/gerar-catalogo.mjs <pasta-de-dados> <saida>   # + shared/ceu.js
node scripts/carregar-catalogo.mjs <saida>/catalogo.ndjson  # nunca mexe em quem já é dono
```

**Entrega sem depender do e-mail.** A página dedicada tem "Baixar PDF": o
mesmo `shared/pdf.js`, rodando no navegador (fontes em TTF, pdf-lib carregado
só no clique). O "obrigado" consulta o pedido até a página existir e leva até
ela; o rastreio (`track-order` devolve `pagina`) também. O e-mail de entrega
traz a logo (PNG em `loja/public/email/`), uma miniatura da folha em HTML, a
página e as DUAS versões do PDF — antes ia só a clara, por acidente.

O PDF embute instâncias ESTÁTICAS das fontes (`loja/public/fonts/pdf/`): as do
site são variáveis, e o pdf-lib usaria a instância padrão — a Thin, no caso da
Montserrat. Para refazer fontes e larguras: `python scripts/gerar-fontes.py`
(precisa de `pip install fonttools brotli`). As fontes padrão do pdf-lib não
serviriam: não escrevem `ε Sagittarii` nem `−34° 23′ 04.62″`.

**Banco.** `orders` não tem nenhuma política de RLS para `anon`: nem com a
chave pública do Supabase dá para ler um pedido pelo Data API. Preço vive no
banco e nunca vem do navegador — o cliente manda o *slug* do produto, e o valor
é lido no servidor.

**Moderação.** O texto que o cliente escreve passa por filtro de termo e por
padrão de contato (telefone, e-mail, site, @, chave Pix). O certificado sai
impresso com o nome de quem recebe, e é isso que transforma um pedido em
vetor de golpe — o filtro é o que fecha a porta. A regra roda na criação do
pedido e **de novo no webhook**: se um pedido pago for barrado na entrega, o
erro fica registrado para o admin resolver, e o cliente recebe o e-mail.

**Pagamento.** Mercado Pago com `external_reference` ligando a preferência ao
pedido. O webhook confere a assinatura HMAC e **consulta a API antes de
entregar** — o corpo do webhook pode ser forjado por qualquer um que
descubra a URL, então ele nunca é a fonte da verdade. Depois confere **valor e
moeda** contra o pedido e **reserva a entrega** (`orders.delivery_started_at`,
update condicional): o Mercado Pago manda mais de um evento por pagamento, e
só um deles gera o PDF e manda o e-mail. Pedido com `delivered_at` não é
entregue de novo.

**Limites.** `create-checkout`, `track-order` e o login do `page-auth` contam
chamadas por IP (e por código, nos dois últimos) na tabela `rate_limits`, e
respondem 429 acima do teto. O `resend-certificate` confere dentro dele que o
Bearer é a service_role — o `verify_jwt` sozinho aceitaria a chave anon, que
está no bundle público.

**Loja.** O app em `loja/` tem home, configurador com prévia em A4 que atualiza
a cada tecla, rastreio de pedido por código + e-mail e página de obrigado. A
prévia é a mesma folha do PDF (`shared/certificado/desenho.js`), então o que a
pessoa vê antes de pagar é o que ela recebe. O roteador é próprio — quatro
telas não justificam o peso de uma biblioteca.

**Plataforma.** Cada pedido vira uma página própria em
`/p/SG-XXXX-XXXX`, criada pelo `mp-webhook` no pagamento, com a estrela, a
carta e o registro (`pages.certificate_id`, que pode ser diferente do código da
URL). Quem comprou edita em `/p/…/editar` com o par código + e-mail (token de
30 dias, sem senha) — ou, com `EDICAO_POR_EMAIL=1`, por um link de acesso
mandado ao e-mail do pedido, que é o modo certo assim que o e-mail entregar; o cliente alcança só assinatura, carta e mensagem pessoal
— o resto é lista branca do servidor. O painel `/admin` é Supabase Auth: a
conta loga, mas só quem tem linha em `admins` passa, porque o `admin-api`
confere a lista antes de qualquer ação. Nele ficam visão geral, pedidos
(busca, reenvio de e-mail, criar página do pedido), páginas (criar manual,
publicar/despublicar) e o editor completo da página. `get-page` só devolve
`published`; rascunho é invisível para o público.

## O que falta

Nada de código para a plataforma funcionar de ponta a ponta — loja, páginas,
edição e painel estão prontos e verificados (E2E no navegador). O que resta é
de operação: domínio e DNS (sem ele o `EMAIL_FROM` não entrega), conta real do
Mercado Pago (a atual é de teste) e publicar o Netlify pelo repositório (ver
`PENDENCIAS.md`).

## Configuração

```bash
npm install
cp .env.example .env
```

Preencha o `.env`. Para publicar banco e funções de uma vez, com
`SUPABASE_ACCESS_TOKEN` no `.env`:

```bash
npm run publicar:supabase   # migrations pendentes + todas as Edge Functions
```

Rode isso ANTES do push quando a mudança mexer nos dois lados: o push publica
só a loja, e a loja nova pode depender da função ou da coluna nova.

O mesmo passo à mão, função por função (o `verify_jwt` de cada uma está fixado
no `supabase/config.toml`). As variáveis sem prefixo `VITE_` vão para as Edge
Functions:

```bash
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy track-order --no-verify-jwt
supabase functions deploy mp-webhook --no-verify-jwt
supabase functions deploy resend-certificate
supabase functions deploy get-page --no-verify-jwt
supabase functions deploy page-auth --no-verify-jwt
supabase functions deploy page-update --no-verify-jwt
supabase functions deploy admin-api --no-verify-jwt

supabase secrets set \
  MERCADO_PAGO_ACCESS_TOKEN=... \
  MERCADO_PAGO_WEBHOOK_SECRET=... \
  MP_STATEMENT_DESCRIPTOR=STELLARA \
  RESEND_API_KEY=... \
  EMAIL_FROM="Stellara <nickolasfelipe225@gmail.com>" \
  PUBLIC_SITE_URL=https://seudominio.com.br \
  FONTS_BASE_URL=https://seudominio.com.br \
  ORIGENS_PERMITIDAS=https://seudominio.com.br   EDICAO_POR_EMAIL=          # 1 depois que o e-mail entregar (ver .env.example)

supabase db push             # aplica as migrations novas (0009 em diante)
```

Na Netlify, `VITE_FUNCTIONS_URL` precisa valer também para **Functions** (não
só Builds): a edge function `pagina-og` a lê em tempo de execução.

`ORIGENS_PERMITIDAS` é a lista de `Origin` que o CORS aceita — sem o domínio
real, a loja só funciona em `http://localhost:5173`.

### Conta do painel

O `/admin` não tem cadastro aberto: a conta nasce no Supabase Auth (dashboard
→ Authentication → Users → *Add user*) e a permissão é a linha em `public.admins`
(SQL: `insert into public.admins (user_id, email) select id, 'seu@email' from
auth.users where email = 'seu@email';`). Conta sem linha recebe 403 na primeira
chamada.

### Ordem de testes

O teste do webhook é o passo que mais trava gente nova, porque ele só funciona
com o **ambiente de teste** do Mercado Pago:

1. Suba a loja em `http://localhost:5173`.
2. Publique as funções.
3. Configure as funções no painel do Mercado Pago com
   `https://<ref>.supabase.co/functions/v1/mp-webhook`.
4. Copie o *segredo do webhook* do painel para `MERCADO_PAGO_WEBHOOK_SECRET`.
5. Compre usando o **cartão de teste** `1111 1111 1111 1111` (aprovado),
   `4000 0000 0000 0002` (recusado) ou `1111 2222 3333 4444` (saldo
   insuficiente).
6. Veja o log da função: `supabase functions logs mp-webhook`.

### Antes de publicar

- **Domínio** troque `PUBLIC_SITE_URL` e `FONTS_BASE_URL` em todos os lugares
- **Preços** em `migrations/0002_seed.sql` — os valores atuais são de exemplo
- **CORS** defina `ORIGENS_PERMITIDAS` com o domínio da loja (segredo do
  Supabase). Sem ela, só `localhost` passa e o navegador bloqueia tudo em
  produção
- **Termos bloqueados** em `shared/moderation.js` — a lista é curta de
  propósito; ajuste ao seu contexto antes de abrir para o público
- **Compra de teste ponta a ponta**: confirmar que o e-mail chega, que o link
  baixa o PDF e que o PDF está correto

## Verificação

```bash
npm run verificar   # lint + tipos das Edge Functions + todos os testes
```

Os testes cobrem a projeção celeste, a posição no céu, a moderação (25 casos,
incluindo bypass por acento e caixa), os componentes da página dedicada e da
loja (prévia do certificado, validação do configurador, rastreio, páginas
dedicadas, edição e o painel), o webhook (entrega única com eventos repetidos
e simultâneos, valor divergente, falha de gravação, e-mail falho), a
autorização do reenvio e a prévia social de `/p/CODE`. São **108 testes no
vitest**, mais as três suítes de núcleo.

Além disso, o fluxo completo da plataforma é verificado E2E no navegador
(Playwright): compra → página criada, edição do cliente (22 asserções), página
pública (30) e painel `/admin` (25) — login, editor, publicação, reenvio e
logout.

## Publicar a loja

O `root` do Vite é a raiz do repositório (para resolver `shared/`), e a
configuração fica em `loja/vite.config.js`:

```bash
npm run build   # gera dist-loja/
```

O `netlify.toml` já configura **publish** `dist-loja` e **build**
`npm run verificar && npm run build` (teste vermelho não publica); defina as variáveis `VITE_*` do `.env.example` em
*Environment variables* — elas entram no bundle em tempo de build.

O `loja/public/_redirects` (copiado para `dist-loja/` no build) faz o rewrite
de SPA: sem ele, abrir um link direto de `/rastrear` ou `/produto/...` devolve
404, porque essas rotas só existem no JavaScript.

