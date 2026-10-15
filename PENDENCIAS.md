# Pendências

Estado em 15 de outubro de 2026. A loja está completa e no ar em
<https://stellara-loja.netlify.app>: catálogo de ~118 mil estrelas, compra de
1 a 6 estrelas com desconto de grupo, cupons, certificado em PDF, página da
estrela, página do grupo, revelação na data, edição do cliente, depoimentos e
painel `/admin` com pedidos, relatórios, cupons e erros do site. O que falta é
quase todo do dono — está aqui na ordem em que destrava a venda.

O histórico de cada rodada está no `git log`.

---

## 1. Checklist de lançamento

### 1.1 Mercado Pago em produção — bloqueia a primeira venda

O fluxo inteiro já rodou no ambiente de **teste** do Mercado Pago (pedido
`SG-RT65-DNDG` aprovado e entregue) e tem teste automático de ponta a ponta
(`test/fluxo.test.js`). Falta a conta de verdade:

- [ ] Trocar `MERCADO_PAGO_ACCESS_TOKEN` pelo de produção nos secrets do
      Supabase (dashboard → Edge Functions → Secrets, ou `supabase secrets set`).
- [ ] No painel do Mercado Pago, recriar o webhook apontando para
      `https://cdrkykbtjjgvilgvyrve.supabase.co/functions/v1/mp-webhook` e pôr o
      segredo novo em `MERCADO_PAGO_WEBHOOK_SECRET`.
- [ ] Fazer uma compra real pequena (uma estrela "profunda", R$ 49), conferir a
      tela de obrigado, a página da estrela e o pedido "Pago" no painel — e
      reembolsar pelo Mercado Pago (a estrela volta ao catálogo sozinha).
- [ ] Opcional antes disso: a mesma compra no sandbox com o cartão de teste
      (titular `APRO`), inclusive de um grupo de 2+ estrelas.

### 1.2 Nota fiscal — antes das primeiras vendas

- [ ] Combinar com um contador o enquadramento (MEI ou outro) e a emissão.
      O painel → **Relatórios** → "Baixar planilha (CSV)" traz o que ele vai
      pedir: comprador, CPF (quando informado), valor, cupom, forma e ID do
      pagamento no Mercado Pago.

### 1.3 Domínio próprio e e-mail de entrega — antes de divulgar

Hoje a loja vive em `*.netlify.app` e o e-mail de entrega não sai (o Resend
só envia de domínio verificado). O site já não promete e-mail enquanto a chave
`VITE_EMAIL_ATIVO` estiver desligada: a entrega é a página da estrela com o PDF.

- [ ] Comprar o domínio e apontar para a Netlify (Domain management).
- [ ] Verificar o domínio no Resend e definir `EMAIL_FROM` com ele.
- [ ] Trocar nos secrets do Supabase: `PUBLIC_SITE_URL`, `FONTS_BASE_URL` e
      `ORIGENS_PERMITIDAS` (o domínio novo, com `https://`).
- [ ] Mandar um e-mail de teste (painel → Pedidos → Reenviar e-mail de um pedido
      de teste) e, chegando, ligar `VITE_EMAIL_ATIVO=1` (Netlify → Environment
      variables) e `EDICAO_POR_EMAIL=1` (secrets do Supabase), e refazer o deploy.
- [ ] Conferir a prévia do link no WhatsApp (imagem e título) com o domínio novo.
- [ ] Cadastrar o site no Google Search Console e enviar `/sitemap.xml`.

Com os tokens no `.env` (Supabase e Netlify), o Claude faz as trocas de
variáveis e o deploy assim que o domínio existir.

### 1.4 Testes que só um celular de verdade faz

- [ ] **iPhone** (o maior risco técnico em aberto — todo o código de iOS foi
      escrito pela documentação, nunca rodou num): a câmera da Mira celeste liga,
      a bússola responde (Safari: Ajustes → Safari → Movimento e Orientação), o
      menu não fica sob o entalhe, o "Baixar PDF" e o cartão com QR funcionam.
- [ ] **Mira celeste à noite, ao ar livre** (dentro de casa a bússola erra ±20°,
      é esperado).
- [ ] **Leitor de tela** (TalkBack ou VoiceOver) numa compra inteira — a auditoria
      automática (axe, Lighthouse) está limpa, mas não substitui.
- [ ] **A primeira página de grupo de verdade** (`/g/GR-…`): só existe depois de
      uma compra paga de 2+ estrelas.

### 1.5 Decisões comerciais para conferir

- [ ] **Preços das faixas** (tabela `faixas` no banco — mude a linha e pronto):
      lendária R$ 249, nomeada R$ 149, brilhante R$ 99, visível R$ 69, profunda
      R$ 49.
- [ ] **Desconto de grupo**: 2 estrelas 10%, 3 15%, 4 a 6 20%
      (`descontoPara` em `shared/preco.js`; muda no site e na cobrança juntos —
      depois, `npm run publicar:supabase -- --so-funcoes` e push).
- [ ] **Palavras bloqueadas** do certificado (`shared/moderation.js`): o texto
      do cliente é impresso sem ninguém ler antes — acompanhe os primeiros
      pedidos no painel.
- [ ] **Promessas do site**: "7 dias para desistir" (direito do consumidor em
      compra on-line) e o e-mail de contato `nickolasfelipe225@gmail.com`.

### 1.6 Revisão jurídica

- [ ] Pedir a um advogado a revisão de `/politicas` (entrega digital, pagamento,
      arrependimento, LGPD, registro anônimo de erros e de visitas).

### 1.7 Pequenos

- [ ] Escrever a mensagem pessoal da página da Geovanna: painel → Páginas →
      `SG-GEOV-ANNA` → Mensagem pessoal.
- [ ] Revogar o `NETLIFY_AUTH_TOKEN` (Netlify → User settings → Applications)
      quando não quiser mais que o Claude leia logs e publique — ele está só no
      `.env`, fora do repositório.

---

## 2. Como operar a loja

Tudo pelo painel `/admin` (conta `nickolasfelipe225@gmail.com`, Supabase Auth;
a permissão é a linha em `public.admins`). Mudar texto não precisa de deploy.

| Aba | Para quê |
| --- | --- |
| Visão geral | Pedidos, receita, funil dos últimos 30 dias (anônimo), **entregas travadas** (pedido pago sem PDF ou página → "Refazer entrega"), **erros no site** dos últimos 7 dias, depoimentos esperando revisão |
| Pedidos | Buscar, reenviar e-mail, criar a página de um pedido, **Corrigir texto** (nome, nome da estrela, assinatura, mensagem — refaz os PDFs e, se marcado, reenvia) |
| Páginas | Editar qualquer página, criar página manual, publicar/despublicar |
| Relatórios | Vendas por período, por faixa e por forma de pagamento; planilha CSV para o contador |
| Cupons | Criar (percentual até 50% ou valor fixo, validade, limite de usos), pausar, ver desempenho, **copiar o link de parceria** (`/produto/certificado-digital?cupom=CODIGO`, que já abre com o cupom) |
| Depoimentos | Aprovar ou recusar o que os compradores escrevem; a home só mostra a seção com algum aprovado |

- **Reembolso**: faça o estorno no painel do Mercado Pago. O webhook devolve a(s)
  estrela(s) ao catálogo e tira a(s) página(s) do ar sozinho.
- **Erro no painel "Erros no site"**: mande a mensagem para o Claude.

---

## 3. Referência técnica

### Publicar

1. Mudou banco ou funções? `npm run publicar:supabase` **antes** do push
   (aplica as migrations e publica as funções; lê o token do `.env`).
2. `git push` na `main` → a Netlify roda `npm run verificar && npm run build`
   e publica. Teste vermelho segura o deploy (a versão anterior fica no ar).
3. Push que só mexe em documentação, testes, CI, Supabase ou scripts de
   manutenção **não gasta build** na Netlify (`ignore` no `netlify.toml`).
4. Deploy falhou? Com o `NETLIFY_AUTH_TOKEN` no `.env`, o Claude lê o log.

### Variáveis

| Onde | Nome | Para quê |
| --- | --- | --- |
| Netlify | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FUNCTIONS_URL` | Loja falar com o Supabase (as `VITE_*` valem também para as edge functions) |
| Netlify | `VITE_EMAIL_ATIVO` | `1` só com o e-mail funcionando (1.3) |
| Supabase (secrets) | `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MP_STATEMENT_DESCRIPTOR` | Pagamento |
| Supabase (secrets) | `RESEND_API_KEY`, `EMAIL_FROM` | E-mail |
| Supabase (secrets) | `PUBLIC_SITE_URL`, `FONTS_BASE_URL`, `ORIGENS_PERMITIDAS`, `EDICAO_POR_EMAIL` | Domínio e CORS |
| `.env` local | `SUPABASE_ACCESS_TOKEN`, `NETLIFY_AUTH_TOKEN` | O Claude publicar e ler logs |

### Decisões que valem lembrar

- **Sem boleto**: a estrela fica reservada só durante o pagamento (30 min).
- **Preço sempre do servidor**: faixa da estrela, desconto de grupo e cupom são
  calculados no `create-checkout` (a mesma conta de `shared/preco.js` que o site
  mostra). Cupom vale sobre o total já com desconto de grupo, nunca deixa uma
  estrela abaixo de R$ 1, e o uso só conta na compra paga.
- **Medição sem rastreador**: funil por contadores diários e erros sem dado
  pessoal, no próprio banco; quem pede "não rastrear" não entra no funil.
- **Velocidade**: o produto tem HTML pré-renderizado no build
  (`scripts/prerender-produto.mjs` → `produto.html`, servido em `/produto/*`);
  Lighthouse no celular ~90 na home e no produto. O próximo ganho seria a
  estratégia de fontes ou dividir o JavaScript — décimos de segundo.

### Melhorias técnicas possíveis (nada bloqueia)

- Tipos gerados do banco (`supabase gen types`) para tirar os `as unknown as`
  das Edge Functions.
- Conferir os cabeçalhos de segurança (HSTS etc.) depois do domínio novo.

### Onde mexer

- `loja/src/pages/` — home, produto, catálogo, estrela, políticas, obrigado, rastreio
- `loja/src/pagina/` — página dedicada, do grupo, cartão com QR, edição do cliente
- `loja/src/admin/` — o painel
- `shared/` — preço (`preco.js`), moderação, certificado (`certificado/`), céu e marca
- `supabase/functions/` — checkout, webhook, páginas, grupo, depoimento, painel
- `supabase/migrations/` — o banco (0001–0022)
- `netlify/edge-functions/` — prévia social, sitemap e robots
