# StarGeo — Loja

Transformação do projeto de presente pessoal em loja de certificados de estrela.
O site pessoal continua existindo, intocado, em `src/` — esta é a estrutura de
cima dele.

```
shared/              núcleo usado pelo site, pela loja e pelo servidor
├── stars.js         12 estrelas vendáveis, dados conferidos com o SIMBAD
├── moderation.js    filtro do texto que o cliente escreve no certificado
├── certificate.js   desenho do certificado, em milímetros
├── pdf.js           geração do PDF (pdf-lib, sem navegador)
├── astro.js         projeção gnomônica (também usada pelo site pessoal)
└── sky.js           posição celeste no céu, agora e aqui

supabase/
├── migrations/      schema: stars, products, orders, pages, page_edit_tokens,
│                    admins (0001–0006, inclui registro do certificado e seed
│                    da primeira página)
└── functions/       create-checkout, mp-webhook, track-order,
│                    resend-certificate, get-page, page-auth, page-update,
│                    admin-api

loja/                app da loja (Vite + React)
└── src/             home, produto, rastreio, obrigado, prévia do certificado,
                     página dedicada (/p/SG-XXXX-XXXX), edição do cliente
                     (/p/…/editar) e painel administrativo (/admin)
```

## O que já está pronto

**Catálogo e certificado.** O PDF é gerado no servidor em ~400 ms, tem 24 KB e
sai nas duas versões: escura (original) e clara (papel, economiza tinta). As
fontes do site são embutidas no PDF — as padrão do `pdf-lib` não escrevem
`ε Sagittarii` nem `−34° 23′ 04.62″`, que são justamente os dados que o
certificado existe para mostrar.

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
descubra a URL, então ele nunca é a fonte da verdade.

**Loja.** O app em `loja/` tem home, configurador com prévia em A4 que atualiza
a cada tecla, rastreio de pedido por código + e-mail e página de obrigado. A
prévia usa as mesmas medidas do PDF (`shared/certificate.js`), então o que a
pessoa vê antes de pagar é o que ela recebe. O roteador é próprio — quatro
telas não justificam o peso de uma biblioteca.

**Plataforma.** Cada pedido vira uma página própria em
`/p/SG-XXXX-XXXX`, criada pelo `mp-webhook` no pagamento, com a estrela, a
carta e o registro (`pages.certificate_id`, que pode ser diferente do código da
URL). Quem comprou edita em `/p/…/editar` com o par código + e-mail (token de
30 dias, sem senha); o cliente alcança só assinatura, carta e mensagem pessoal
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

Preencha o `.env`. As variáveis sem prefixo `VITE_` vão para as Edge Functions:

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
  MP_STATEMENT_DESCRIPTOR=STARGEO \
  RESEND_API_KEY=... \
  EMAIL_FROM="StarGeo <certificado@seudominio.com.br>" \
  PUBLIC_SITE_URL=https://seudominio.com.br \
  FONTS_BASE_URL=https://seudominio.com.br \
  ORIGENS_PERMITIDAS=https://seudominio.com.br
```

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
incluindo bypass por acento e caixa), os componentes do site pessoal e os da
loja (prévia do certificado, validação do configurador, rastreio, páginas
dedicadas, edição e o painel). São **224 verificações** ao todo (78 no vitest,
mais as três suítes de núcleo).

Além disso, o fluxo completo da plataforma é verificado E2E no navegador
(Playwright): compra → página criada, edição do cliente (22 asserções), página
pública (30) e painel `/admin` (25) — login, editor, publicação, reenvio e
logout.

## Publicar a loja

O build é separado do site pessoal, porque o `root` do Vite precisa ser a raiz
do repositório para resolver `shared/`. O comando já existe:

```bash
npm run build:loja   # gera dist-loja/
```

No host (Netlify), configure **publish** `dist-loja` e **build**
`npm run build:loja`, e defina as variáveis `VITE_*` do `.env.example` em
*Environment variables* — elas entram no bundle em tempo de build.

O `loja/public/_redirects` (copiado para `dist-loja/` no build) faz o rewrite
de SPA: sem ele, abrir um link direto de `/rastrear` ou `/produto/...` devolve
404, porque essas rotas só existem no JavaScript. O site pessoal não precisa
disso — ele usa âncoras.

