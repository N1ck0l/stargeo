# Stellara

Loja de certificados de estrela: a pessoa escolhe uma das 12 estrelas, escreve
o nome de quem vai receber, paga pelo Mercado Pago e recebe por e-mail o
certificado em PDF e uma página dedicada (`/p/SG-XXXX-XXXX`) com a estrela, o
mapa do céu, a carta e a Mira celeste (câmera + bússola apontando a estrela).

- **O que falta para vender:** [PENDENCIAS.md](PENDENCIAS.md)
- **Arquitetura, banco, configuração e publicação:** [LOJA.md](LOJA.md)

## Como rodar

```bash
npm install
cp .env.example .env   # preencha as VITE_* para falar com o Supabase
npm run dev:loja       # http://localhost:5174
```

Sem `.env`, a loja abre e a prévia do certificado funciona; checkout,
rastreio e páginas dedicadas pedem o Supabase.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev:loja` | Loja em desenvolvimento (porta 5174) |
| `npm run build:loja` | Build de produção em `dist-loja/` (é o que a Netlify roda) |
| `npm run verificar` | Lint (oxlint) + typecheck das Edge Functions + todos os testes |
| `npm test` | Testes numéricos (`shared/*.test.mjs`) + vitest (`test/`) |

`verificar` roda no CI (GitHub Actions) e **antes de todo deploy** na Netlify:
teste vermelho não vai para o ar.

## Estrutura

```
loja/src/          app React (Vite): home, produto, rastreio, obrigado,
  pages/           página dedicada (pagina/), edição do cliente e /admin
  pagina/secoes/   seções da página dedicada: Hero, mapa do céu, carta, Mira
  admin/           painel (Supabase Auth + linha em `admins`)
shared/            núcleo usado pela loja e pelo servidor: estrelas, projeção
                   celeste, desenho e PDF do certificado, moderação do texto
supabase/
  functions/       Edge Functions (Deno): checkout, webhook, rastreio,
                   páginas, edição, painel, reenvio
  migrations/      schema, RLS, seeds (0001–0009)
netlify/
  edge-functions/  prévia social por página (/p/CODE no WhatsApp)
test/              vitest: componentes, e-mail, webhook, reenvio, prévia
```

## Pontos que valem saber antes de mexer

- **Preço vive no banco** (`products.price_cents`). O checkout lê no servidor;
  a tela lê pelo Data API (`loja/src/lib/preco.js`). Nenhum dos dois confia no
  navegador.
- **O webhook é a única porta de entrega.** Confere a assinatura, consulta o
  pagamento na API do Mercado Pago, confere valor e moeda, reserva o pedido e
  só então gera PDF e manda e-mail — uma vez só, mesmo com eventos repetidos
  ou simultâneos (`supabase/functions/mp-webhook/webhook.ts`).
- **Toda escrita no banco das Edge Functions que importa usa
  `throwOnError()`**: o supabase-js devolve o erro em vez de lançar.
- **Funções públicas têm limite de requisições** por IP e por código
  (`_shared/limite.ts`, tabela `rate_limits`).
- **Texto do cliente é moderado duas vezes** (checkout e webhook) com a mesma
  regra (`shared/moderation.js`), e escapado em todo HTML.

## Site pessoal (legado)

`src/`, o `index.html` da raiz e `public/` são o site-presente original
(Kaus Australis para Geovanna), que deu origem à loja e não é mais publicado.
O estado dele está guardado na tag `site-pessoal-legado`; a documentação
completa dele está no README dessa tag (`git show site-pessoal-legado:README.md`).
`npm run dev` / `npm run build` ainda o rodam.
