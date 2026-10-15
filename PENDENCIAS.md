# Pendências

Estado em 14 de outubro de 2026 (depois da rodada de correções da loja). A plataforma está completa: loja, páginas
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

### 1.7 Publicar a rodada de correções de 14/10

O código está no repositório, mas o Supabase não publica sozinho com o push:

1. `supabase db push` — aplica a migration `0009` (trava de entrega,
   `rate_limits`, `resumo_pedidos()`). **Antes das funções**: o webhook novo
   grava `delivery_started_at`, e sem a coluna ele responde 500.
2. Republicar as funções que mudaram: `mp-webhook`, `resend-certificate`,
   `create-checkout`, `track-order`, `page-auth`, `admin-api` (comandos em
   `LOJA.md`).
3. Depois do domínio e do e-mail: `supabase secrets set EDICAO_POR_EMAIL=1`.

A prévia de `/p/CODE` já está funcionando no ar (a `VITE_FUNCTIONS_URL` da
Netlify já vale para Functions), e a CSP está ATIVA — testada em modo
bloqueante antes, sem nenhuma violação.

---

### 1.8 Revisar as decisões do catálogo completo

- **Preços das faixas** (tabela `faixas`, mude a linha e pronto): lendária
  R$ 249 (23 estrelas), nomeada R$ 149 (577), brilhante R$ 99 (215), visível
  R$ 69 (8.150), profunda R$ 49 (109 mil). São um ponto de partida.
- **Sem boleto**: a estrela fica reservada só durante o prazo de pagamento
  (30 min), e boleto leva dias. Pix e cartão em até 12x continuam.
- **Promessas da home que só você pode garantir**: "7 dias para desistir"
  (é direito do consumidor em compra on-line) e "uma pessoa responde no mesmo
  dia". Se alguma não valer, tire ou ajuste em `loja/src/pages/Home.jsx`.
- **Celular**: a ordem nova da home (herói → certificado → estrelas e preços →
  como funciona → confiança) não pôde ser conferida visualmente no aparelho
  nesta rodada — vale abrir no telefone.

### 1.9 Antes de abrir as vendas (rodada "experiência premium", 14/10)

- **E-mail**: o site diz que o link da página "também vai para o e-mail da
  compra" (FAQ, resumo do pedido, políticas). Hoje o e-mail não sai (ver 1.4):
  a entrega real é a página da estrela + PDF, que funciona. Com o domínio, a
  frase passa a valer; sem ele, tire-a.
- **Políticas** (`/politicas`): redigidas sobre o que a loja faz hoje —
  entrega digital, Mercado Pago, 7 dias de arrependimento (art. 49 do CDC),
  LGPD, fontes dos dados. Peça a revisão de um advogado antes de vender em
  escala, e confirme que o e-mail de contato é o certo.
- **Reembolso**: o estorno feito no Mercado Pago já devolve a estrela ao
  catálogo e tira a página do ar sozinho (webhook). O estorno em si continua
  sendo feito por você, no painel do Mercado Pago.
- **Não implementado de propósito**: produto impresso, moldura e embalagem —
  o site deixa claro que o certificado é digital e que a moldura da prévia é
  só ilustração.

### 1.10 Nome da estrela, funil e depoimentos (15/10)

- **Nome dado à estrela** (opcional, até 40 caracteres): sai no certificado
  ("chamada, nesta homenagem, de “…”"), no e-mail e na página; o nome oficial
  continua na folha. Corrigir um nome errado: painel → página → "Nome dado à
  estrela" (a página muda na hora; o PDF já enviado não — reenvie pelo painel
  depois de corrigir o pedido no banco, se precisar).
- **Funil** (painel → Visão geral): contadores anônimos por dia — visitas,
  produto aberto, personalização, ida ao pagamento — e as compras pagas, lidas
  dos pedidos. Sem cookie, sem IP, sem serviço externo, sem conta nova; quem
  usa "não rastrear" não é contado. As etapas do navegador são aproximadas
  (bloqueadores), as compras são exatas.
- **Depoimentos**: o comprador escreve na edição da página dele (só pedido
  pago, um por pedido, com autorização explícita). Você aprova ou recusa no
  painel → Depoimentos. A home só mostra a seção quando há ao menos um
  aprovado — hoje não há nenhum, e nenhum foi inventado. Vale pedir, no
  contato pós-venda, que a pessoa conte como foi.

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
~137 KB para ~9 KB. Ficam em `loja/public/`. Se a arte mudar de novo, a geração é
reproduzível a partir do `favicon.svg` e da prancha da marca.

### 2.3 Tipos gerados do banco

As Edge Functions fazem `as unknown as` nas linhas do banco. `supabase gen
types typescript --linked > supabase/functions/_shared/database.types.ts` e
`createClient<Database>` em `_shared/supabase.ts` tiram os casts e pegam nome
de coluna errado no typecheck. Precisa do CLI logado no projeto.

---

## 3. Entrega e experiência pós-compra (14/10)

- **Baixar PDF na página dedicada**, gerado no navegador com o mesmo código
  do servidor — o cliente tem o certificado mesmo com o e-mail bloqueado.
- **"Obrigado" leva até a página**: consulta o pedido até a página existir
  (antes: duas tentativas) e o botão principal é "Abrir a página da estrela".
  Bug corrigido: `in_process` (pagamento em análise) aparecia como aprovado.
- **Rastreio** com atalho para a página; "em análise" deixou de ficar verde;
  texto com "quoting" corrigido.
- **E-mail de entrega** na marca: logo, miniatura da folha, página e os dois
  PDFs. Bug corrigido: só a versão CLARA era enviada (o webhook guardava o
  caminho do último PDF gerado). O e-mail do link de edição também.
- **Produto**: mini mapa do céu real da estrela escolhida (o mesmo da folha),
  coluna da prévia no tamanho da folha em retrato, "até 12x" no texto.
- Nomes de arquivo legíveis: `certificado-geovanna-kaus-australis.pdf`.

## 4. Certificado Edição Midnight (14/10)

O PDF que o cliente recebia era bem pior que a prévia: Montserrat **Thin** em
tudo (a fonte variável embutida na instância padrão), rótulos dos dados por
cima dos valores, filetes tortos (o pdf-lib ignorava o espaçamento entre
letras), ★ genérica. A causa era ter dois desenhos mantidos à mão.

Agora a folha é UMA lista de itens (`shared/certificado/desenho.js`) que vira
SVG na loja e PDF no servidor, com as mesmas larguras de texto — e segue a
prancha: A4 retrato, logo oficial, nome em Playfair itálica e o mapa do céu
real da estrela (Hipparcos). Testes garantem que nenhum texto encosta em
outro nem sai da moldura no pior caso da moderação (nome de 80, mensagem de
600, assinatura de 60) e que as fontes do PDF são estáticas no peso certo.

## 5. O que foi corrigido (rodada de 14/10 — loja)

| O que era | Consequência |
| --- | --- |
| `resend-certificate` confiava só no `verify_jwt` | A chave anon (pública, no bundle) passava: qualquer um com o id do pedido disparava reenvio. Também aceitava pedido `in_process` (não pago) |
| Webhook entregava a cada evento aprovado | `payment.created` + `payment.updated` + reenvios = PDF regerado e **e-mail repetido**; eventos simultâneos entregavam em paralelo |
| Escritas no banco sem checar erro | O supabase-js devolve o erro em vez de lançar: status não gravado passava calado, o webhook respondia 200 e o Mercado Pago não reenviava |
| Upsert em `certificate_drafts` sem `onConflict` | Conflitava na chave errada e falhava na segunda entrega, em silêncio |
| Valor pago não era conferido | `approved` bastava, qualquer que fosse o valor ou a moeda |
| Sem limite de requisições | Checkout, rastreio e login de edição aceitavam chamadas em laço |
| `meta.js` nunca rodava | `window.__STELLARA_ENV__` não existia: a loja **nunca teve og:image**. E robô de prévia não executa JS — agora as tags saem no HTML pelo build |
| `/p/CODE` sem prévia própria | O link do presente no WhatsApp mostrava o cartão genérico; agora mostra "Uma estrela para Geovanna · Kaus Australis" |
| Preço escrito no front | Mudar o preço no banco deixaria o botão mostrando um valor e o Mercado Pago cobrando outro |
| "Em até 3x sem juros" | O checkout só aceitava 1 parcela — agora até 12x no cartão (juros por conta de quem compra, padrão do Mercado Pago; "sem juros" é configuração da conta) |
| Receita do painel sobre 500 pedidos | A partir do pedido 501 o total e a receita mentiam |
| Deploy sem teste | A Netlify publicava commit com teste vermelho |

E de estrutura: a loja deixou de importar do site pessoal (componentes e
dados movidos para `loja/src/`) e o site pessoal saiu da `main` (tag
`site-pessoal-legado`), CI no GitHub Actions, CSP ativa, `npm run dev` na porta
que o CORS libera (era 5174, e nenhuma chamada ao Supabase funcionava em
desenvolvimento), link de edição por e-mail pronto para ligar, README da loja.
Testes: 94 → **112** no vitest com webhook, reenvio e prévia social novos; **91** depois de sair o site pessoal (os 21 testes dele foram junto).

---

## 6. O que foi corrigido (rodada anterior — site pessoal)

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

## 7. Estado atual, para conferência

| Item | Situação |
| --- | --- |
| Build | limpo, deploy automático no push — só depois de `verificar` passar |
| Lint | limpo, zero warnings (oxlint) |
| Testes | **254 verificações** — 108 no vitest + astro (39) + céu (82) + moderação (25); também no GitHub Actions |
| E2E no navegador | compra→página, página pública (30), edição do cliente (22), painel (25) — todos verdes |
| Pacote inicial | 111 kB gzip de JS + 11,4 de CSS (chunk do Supabase só em `/admin` e `/editar`) |
| `/admin` | painel Supabase Auth (conta + linha em `admins`), sem senha no código |
| Conteúdo | páginas no banco (`pages`); seed Geovanna `SG-GEOV-ANNA` publicada |
| Loja e páginas | prontas e verificadas; Mercado Pago ainda em ambiente de teste |
| E-mail | **bloqueado**: o Resend recusa remetente Gmail (403 `gmail.com domain is not verified`) — testado em 14/10, só sai com domínio verificado; template novo confirmado via remetente de cortesia |

### Fluxo para mudar um texto

1. Abrir `/admin`, entrar com a conta de admin
2. Em **Páginas**, abrir a página, editar e **Salvar** — publica na hora
3. **Páginas** também tem criar manual, publicar/despublicar; **Pedidos**
   reenvia o e-mail e cria página de pedido pago

Nada de build nem de deploy para mudar texto: tudo vive no banco.

### Onde mexer

- `loja/src/admin/` — o painel (visão geral, pedidos, páginas, editor)
- `loja/src/pagina/` — página dedicada e edição do cliente
- `loja/src/lib/admin.js` — sessão/autenticação do painel
- `supabase/functions/` — `get-page`, `page-auth`, `page-update`, `admin-api`
- `supabase/functions/mp-webhook/webhook.ts` — a entrega (reserva, valor, PDF, e-mail)
- `supabase/migrations/0004–0006` — `pages`, `page_edit_tokens`, `admins`, seed
- `supabase/migrations/0009` — trava de entrega, `rate_limits`, `resumo_pedidos()`
- `shared/moderation.js` — termos bloqueados (compra e webhook)
- `loja/src/data/star.js` / `defaults.js` — dados da estrela e texto padrão da página
- `netlify/edge-functions/pagina-og.ts` — prévia social de `/p/CODE`
