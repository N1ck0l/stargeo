-- ============================================================================
-- Páginas dedicadas — a "geovanna" vira um produto da plataforma
--
-- Cada pedido aprovado ganha uma página própria, no mesmo formato do presente
-- que deu origem a tudo: hero, estrela, carta e mensagem pessoal. O endereço
-- leva o CÓDIGO DO PEDIDO (`/p/SG-XXXX-XXXX`), que é o mesmo do rastreio —
-- 40 bits de entropia, o mesmo segredo que já protege o pedido.
--
-- Três decisões que merecem explicação:
--
-- 1. Nenhuma leitura pública pelo Data API. `pages` espelha o nome de quem
--    recebe e a mensagem de quem comprou — mesmo nível de sensibilidade de
--    `orders`. Quem tem o código lê a página pela Edge Function `get-page`;
--    abrir `select *` no anon daria para VARRER todas as páginas de uma vez.
--
-- 2. `order_id` anulável: a página do pedido nasce do pedido, mas a da
--    Geovanna (e qualquer criação manual) não tem compra por trás. A coluna
--    é `unique`, então um pedido nunca vira duas páginas — o webhook pode
--    chegar duplicado e o upsert é natural.
--
-- 3. A edição do cliente não entra por Supabase Auth: não existe conta para
--    quem compra um presente. O acesso é o par (código, e-mail) que o cliente
--    já tem, trocado por um token de edição (`page_edit_tokens`) com hash
--    guardado — o bruto só existe na resposta do login.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Página dedicada
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id                  uuid primary key default gen_random_uuid(),

  -- Mesmo formato do código de pedido: a URL é o código, e o código é o que
  -- o cliente já recebeu no e-mail e no rastreio.
  code                text        not null unique
                      check (code ~ '^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$'),

  -- published = no ar em /p/; draft = só o admin vê.
  status              text        not null default 'published'
                      check (status in ('published', 'draft')),

  -- Origem. NULL = página criada manualmente pelo admin.
  order_id            uuid        unique references public.orders (id) on delete set null,
  -- Quem pode editar (login com código + e-mail). Anulável para páginas
  -- manuais sem um dono identificado; sem e-mail, só o admin edita.
  customer_email      citext,

  -- Dados da dedicação. Resolvidos no nascimento da página (vêm do pedido)
  -- e depois independentes: mudar o pedido não pode reescrever a página.
  star_slug           text        not null references public.stars (slug),
  honoree_name        text        not null check (length(honoree_name) between 1 and 120),
  from_name           text,
  dedication_date     date,

  -- Conteúdo editorial — os mesmos campos do antigo conteudo.json do site
  -- pessoal, para a página da Geovanna migrar sem perda.
  titulo_hero         text        not null default '',
  frase_hero          text        not null default '',
  titulo_estrela      text        not null default '',
  descricao_estrela   text        not null default '',
  titulo_carta        text        not null default '',
  carta               text[]      not null default '{}',
  mensagem_pessoal    text        not null default '',
  mostrar_mensagem    boolean     not null default true,
  mostrar_mira        boolean     not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint pages_mensagem_length check (length(mensagem_pessoal) <= 4000),
  constraint pages_from_length check (from_name is null or length(from_name) <= 120)
);

comment on table public.pages is
  'Página dedicada de cada cliente (/p/SG-XXXX-XXXX). Sem leitura pública por RLS: get-page é o único caminho.';

-- A URL é o código: formato conferido na borda (índice do PostgREST).
create index if not exists pages_created_at_idx
  on public.pages (created_at desc);

create index if not exists pages_customer_idx
  on public.pages (customer_email)
  where customer_email is not null;

-- ---------------------------------------------------------------------------
-- Tokens de edição do cliente
--
-- O bruto (32 bytes aleatórios) só viaja na resposta do `page-auth`; aqui fica
-- o SHA-256. Com o banco comprometido o invasor não tem o token — só o hash —,
-- e o token expira mesmo que ninguém o use.
-- ---------------------------------------------------------------------------
create table if not exists public.page_edit_tokens (
  id                  uuid primary key default gen_random_uuid(),
  page_id             uuid        not null references public.pages (id) on delete cascade,
  token_hash          text        not null unique,
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

comment on table public.page_edit_tokens is
  'Hash dos tokens de edição do cliente. O valor bruto nunca é gravado.';

create index if not exists page_edit_tokens_page_idx
  on public.page_edit_tokens (page_id, expires_at desc);

-- ---------------------------------------------------------------------------
-- Administradores
--
-- `auth.users` é onde o Supabase Auth grava as contas; o uuid daqui é a lista
-- branca de quem pode chamar `admin-api`. Um id fora desta tabela recebe 403
-- mesmo com sessão válida — criar conta não é suficiente.
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  email               citext      not null,
  created_at          timestamptz not null default now()
);

comment on table public.admins is
  'Lista branca de administradores. Sessão Supabase Auth sem linha aqui = 403.';

-- ---------------------------------------------------------------------------
-- updated_at — mesma função de 0001
-- ---------------------------------------------------------------------------
drop trigger if exists pages_touch_updated_at on public.pages;
create trigger pages_touch_updated_at
  before update on public.pages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS fechado, como todo dado sensível deste esquema
--
-- Nenhuma política para anon, authenticated ou qualquer papel: leitura e
-- escrita acontecem só pela service_role, dentro das Edge Functions. É o que
-- mantém `select * from pages` inútil mesmo com a chave pública do Supabase.
-- ---------------------------------------------------------------------------
alter table public.pages            enable row level security;
alter table public.page_edit_tokens enable row level security;
alter table public.admins           enable row level security;

revoke all on public.pages            from anon, authenticated;
revoke all on public.page_edit_tokens from anon, authenticated;
revoke all on public.admins           from anon, authenticated;
