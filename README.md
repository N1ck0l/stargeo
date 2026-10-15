# Stellara

Loja de certificados de estrela: a pessoa escolhe uma estrela do catálogo
Hipparcos (~118 mil, cada uma exclusiva, com preço por faixa de brilho),
escreve o nome de quem vai receber (e, se quiser, um nome para a estrela),
paga pelo Mercado Pago e recebe o certificado em PDF e uma página dedicada (`/p/SG-XXXX-XXXX`) com a estrela, o
mapa do céu, a carta e a Mira celeste (câmera + bússola apontando a estrela).

- **O que falta para vender:** [PENDENCIAS.md](PENDENCIAS.md)
- **Arquitetura, banco, configuração e publicação:** [LOJA.md](LOJA.md)

## Como rodar

```bash
npm install
cp .env.example .env   # preencha as VITE_* para falar com o Supabase
npm run dev            # http://localhost:5173
```

Sem `.env`, a loja abre e a prévia do certificado funciona; checkout,
rastreio e páginas dedicadas pedem o Supabase.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Loja em desenvolvimento (porta 5173, a que o CORS das funções libera) |
| `npm run build` | Build de produção em `dist-loja/` (é o que a Netlify roda) |
| `npm run preview` | Serve o build localmente (porta 4173) |
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
  migrations/      schema, RLS, seeds, catálogo, busca, métricas,
                   depoimentos, revelação na data e par (0001–0020)
netlify/
  edge-functions/  prévia social por página (/p/CODE no WhatsApp), título e
                   canônico de /estrelas/<slug>, sitemap.xml e robots.txt
test/              vitest: componentes, e-mail, webhook, reenvio, prévia
```

## Marca

A logo oficial fica em [`marca/`](marca/) — SVG vetorial, com o texto já em
curvas (abre igual em qualquer programa, sem precisar das fontes):

| Arquivo | Uso |
| --- | --- |
| `stellara-simbolo.svg` | Símbolo isolado, dourado com facetas |
| `stellara-horizontal.svg` | Símbolo + STELLARA + slogan, em linha |
| `stellara-vertical.svg` | Símbolo em cima, nome e slogan embaixo |
| `*-mono-marfim.svg` | Uma cor, para fundo escuro |
| `*-mono-noite.svg` | Uma cor, para papel claro e impressão |
| `stellara-simbolo-reduzido.svg` | Até ~48 px: favicon, cabeçalho, rodapé |

Tudo sai de `npm run marca` (`scripts/gerar-marca.mjs`), que também gera o
`favicon.svg` e a geometria do símbolo do site — mudou a marca, rode de novo
em vez de editar os SVGs. `marca/index.html` mostra todas as versões lado a
lado. Paleta: azul-noite `#090B20`, dourado `#D8B66A`, marfim `#F6F1E7`;
tipografia: Playfair Display (nome) e Montserrat (slogan e textos).

## Pontos que valem saber antes de mexer

- **Preço vive no banco** (`products.price_cents`). O checkout lê no servidor;
  a tela lê pelo Data API (`loja/src/lib/catalogo.js`). Nenhum dos dois confia no
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

## História

A loja nasceu de um presente: um site feito para a Geovanna, com Kaus Australis,
o mapa do céu e a Mira celeste. Esse site original não está mais na `main`; o
código e a documentação dele estão na tag `site-pessoal-legado`
(`git checkout site-pessoal-legado`). A página dedicada dela continua no ar
dentro da loja, em `/p/SG-GEOV-ANNA`.
