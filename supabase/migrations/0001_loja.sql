-- ============================================================================
-- StarGeo — esquema da loja de certificados de estrela
--
-- Decisões que valem explicação, porque não são óbvias:
--
-- 1. Nenhuma tabela de pedido é legível pelo público. O `anon` não lê pedido
--    nenhum, nem com o código certo: o rastreamento passa por uma Edge Function
--    que exige e-mail + código, e é ela quem confere. Se a tabela fosse
--    pública, bastaria um `GET /rest/v1/orders?select=*` para vazar o nome e o
--    e-mail de quem comprou um presente — e presente é dado sensível.
--
-- 2. Os preços vivem no banco, mas NUNCA são aceitos do cliente. O valor do
--    pedido é lido de `products` no servidor. Aceitar o preço no front é o erro
--    clássico: qualquer um edita um campo no navegador e paga R$ 0,01.
--
-- 3. A personalização fica em colunas tipadas, não em JSON solto, quando dá
--    para tipar. `star_slug` com FK garante que ninguém "dedica" o certificado
--    a uma estrela inventada.
-- ============================================================================

-- E-mail sem distinção de maiúsculas: o rastreio precisa funcionar quando a
-- pessoa digita o endereço de outro jeito do que cadastrou.
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Estrelas
--
-- Espelho do catálogo de `shared/stars.js`, no banco, para que o admin possa
-- mudar preço e destaque sem deploy, e para que a FK seja real. O slug é a
-- chave natural: é o que está na URL e no certificado.
-- ---------------------------------------------------------------------------
create table if not exists public.stars (
  slug                text primary key
                      check (slug ~ '^[a-z0-9-]+$'),
  name                text        not null,
  bayer               text        not null,
  constellation       text        not null,
  constellation_latin text        not null,
  spectral_type       text        not null,
  -- Ascensão reta em HORAS e declinação em GRAUS, J2000. As mesmas unidades de
  -- `shared/stars.js`: converto no servidor, e nunca no cliente.
  ra_hours            double precision not null
                      check (ra_hours >= 0 and ra_hours < 24),
  dec_degrees         double precision not null
                      check (dec_degrees >= -90 and dec_degrees <= 90),
  magnitude           double precision not null,
  distance_ly         double precision not null check (distance_ly > 0),
  best_month          text        not null,
  story               text        not null,
  featured            boolean     not null default false,
  active              boolean     not null default true,
  created_at          timestamptz not null default now()
);

comment on table public.stars is
  'Catálogo de estrelas vendáveis. Espelho de shared/stars.js, com preço e destaque controlados pelo admin.';

-- ---------------------------------------------------------------------------
-- Produtos (os "kits" da vitrine)
--
-- Preço em CENTAVOS, como inteiro. Dinheiro em ponto flutuante é uma fonte
-- clássica de erro de arredondamento: 19,90 vira 19,899999999999999.
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  slug                text        not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                text        not null,
  tagline             text        not null default '',
  description         text        not null default '',
  -- Preço de venda, em centavos.
  price_cents         integer     not null check (price_cents >= 0),
  -- Preço "de", em centavos, para o riscado. NULL = não há preço anterior.
  compare_at_cents    integer     check (compare_at_cents is null or compare_at_cents > price_cents),
  badge               text        check (badge is null or badge in ('mais_vendido', 'premium', 'novo')),
  -- O que o cliente recebe, em JSONB. Flexível porque muda por produto, e
  -- nunca é consultado por filtro — só lido inteiro.
  features            jsonb       not null default '[]'::jsonb,
  -- Estrelas que valem para este produto, em ordem de sugestão.
  --
  -- A integridade (cada slug existir em `stars`) fica num GATILHO, e não numa
  -- `foreign key`: o Postgres não aceita chave estrangeira em coluna de array —
  -- ele compararia o array inteiro contra um escalar, o que nem tem tipo em
  -- comum. O gatilho logo abaixo faz a checagem elemento a elemento.
  star_slugs          text[]      not null default '{}'
                      check (array_position(star_slugs, null) is null),
  -- Onde aparece na vitrine. NULL = escondido.
  sort_order          integer,
  active              boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.products.price_cents is
  'Preço em centavos. O valor do pedido é SEMPRE lido desta coluna no servidor; preço vindo do cliente é descartado.';
comment on column public.products.star_slugs is
  'Slugs das estrelas oferecidas neste produto, em ordem de sugestão.';

create index if not exists products_active_sort_idx
  on public.products (sort_order)
  where active;

-- Garante que todo slug em `products.star_slugs` existe em `stars`.
--
-- Substitui a `foreign key` impossível (ver o comentário na coluna). É a versão
-- elemento a elemento: roda ANTES de gravar, então um produto apontando para
-- estrela inexistente nem chega ao banco. O `errcode` imita o de uma violação
-- de FK, para que a falha apareça como o erro de integridade que ela é.
create or replace function public.produtos_estrelas_validas()
returns trigger
language plpgsql
as $$
declare
  faltando text;
begin
  select s.slug into faltando
  from unnest(new.star_slugs) as s(slug)
  where not exists (select 1 from public.stars where stars.slug = s.slug)
  limit 1;

  if faltando is not null then
    raise exception 'star_slugs contém estrela inexistente: %', faltando
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists products_star_slugs_validas on public.products;
create trigger products_star_slugs_validas
  before insert or update of star_slugs on public.products
  for each row execute function public.produtos_estrelas_validas();

-- ---------------------------------------------------------------------------
-- Código público de pedido
--
-- Definido ANTES de `orders`: o `default` da coluna é resolvido quando a tabela
-- é criada, então a função já precisa existir — o contrário dá "function does
-- not exist" no meio da migration.
--
-- Alfanumérico, sem 0/O e 1/I/L: o código é ditado ao telefone com frequência,
-- e esses caracteres geram confusão. Formato: SG-XXXX-XXXX, em que os quatro
-- caracteres vêm de um alfabeto sem ambiguidade.
-- ---------------------------------------------------------------------------
create or replace function public.gen_order_code()
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := 'SG-';
  i int;
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    if i = 4 then
      code := code || '-';
    end if;
  end loop;
  return code;
end;
$$;

comment on function public.gen_order_code() is
  'Código público de rastreio, formato SG-XXXX-XXXX, sem caracteres ambíguos.';

-- ---------------------------------------------------------------------------
-- Pedidos
--
-- O identificador público (`code`) é curto e legível para a pessoa digitar ao
-- rastrear: nada de UUID de 36 caracteres num campo de formulaire.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),

  -- Código público de rastreio. Gerado aqui, nunca pelo cliente.
  code                text        not null unique default public.gen_order_code(),

  -- Status do pagamento, conforme o Mercado Pago. `pending` é o estado
  -- inicial e o mais comum: Pix leva minutos, boleto leva dias.
  status              text        not null default 'pending'
                      check (status in (
                        'pending',      -- criado, aguardando pagamento
                        'approved',     -- pago
                        'in_process',   -- em análise (Pix já caiu, conciliação pendente)
                        'rejected',     -- recusado
                        'cancelled',    -- expirado ou cancelado
                        'refunded',     -- estornado
                        'charged_back'  -- devolvido pelo banco
                      )),

  -- Pagamento
  payment_id          text,            -- id do pagamento no Mercado Pago
  payment_method      text,            -- pix | credit_card | boleto
  -- Snapshot do preço no momento da compra. Guardado para o pedido não mudar
  -- de valor se o preço do produto mudar amanhã.
  amount_cents        integer     not null check (amount_cents >= 0),
  paid_at             timestamptz,

  -- Cliente. E-mail em citext (case-insensitive) para o rastreio funcionar
  -- mesmo que a pessoa digite com maiúsculas diferentes.
  customer_email      citext      not null,
  customer_name       text        not null,
  customer_doc        text,            -- CPF, para emissão de nota fiscal

  -- Personalização do certificado
  star_slug           text        not null references public.stars (slug),
  honoree_name        text        not null check (length(honoree_name) between 1 and 120),
  dedication_date     date,
  from_name           text,            -- assinatura, opcional
  message             text,            -- mensagem pessoal, opcional
  -- 'pt-BR' só por enquanto; guardada para o certificado bilíngue depois.
  locale              text        not null default 'pt-BR',

  -- Produto comprado, para o histórico. SET NULL porque o produto pode ser
  -- apagado da vitrine sem apagar o que já foi vendido.
  product_id          uuid        references public.products (id) on delete set null,
  product_name        text        not null,   -- cópia do nome no momento da compra

  -- Entrega
  certificate_url     text,            -- caminho no Storage, preenchido pelo webhook
  certificate_path    text,
  delivered_at        timestamptz,
  email_error         text,            -- última falha de envio, para o admin reenviar

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_message_length check (message is null or length(message) <= 2000),
  constraint orders_from_length check (from_name is null or length(from_name) <= 120)
);

comment on table public.orders is
  'Pedidos. Inacessível ao anon por RLS: o rastreamento é feito pela Edge Function track-order, que exige e-mail + código.';

-- O rastreio busca por (código, e-mail). Índice composto para essa consulta
-- exata, sem varrer a tabela.
create index if not exists orders_code_email_idx
  on public.orders (code, customer_email);

-- O webhook recebe eventos do Mercado Pago fora de ordem, e precisa achar o
-- pedido pelo id do pagamento.
create index if not exists orders_payment_id_idx
  on public.orders (payment_id)
  where payment_id is not null;

-- Painel do admin: listar os mais recentes, e filtrar por pendente.
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_pending_idx
  on public.orders (created_at desc)
  where status in ('pending', 'in_process');

-- ---------------------------------------------------------------------------
-- Geração do certificado
--
-- ---------------------------------------------------------------------------

create table if not exists public.certificate_drafts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid        not null unique references public.orders (id) on delete cascade,
  storage_path        text        not null,
  page_count          integer     not null default 1 check (page_count > 0),
  -- Hash do PDF. Serve para (a) não regerar o mesmo arquivo duas vezes quando
  -- o Mercado Pago reenvia o webhook, e (b) provar que o arquivo não mudou.
  content_hash        text        not null,
  created_at          timestamptz not null default now()
);

comment on table public.certificate_drafts is
  'PDF gerado por pedido. O hash evita regerar o arquivo quando o webhook chega duplicado.';

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
--
-- Feito no banco, e não na aplicação: se algum caminho futuro escrever direto
-- por SQL, o updated_at continua certo.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- RLS ligado em TODA tabela do schema exposto. O padrão do Supabase é que
-- tabelas criadas pelo SQL não têm RLS ligado — e sem RLS, o `anon` lê tudo
-- que o Data API expõe.
-- ---------------------------------------------------------------------------
alter table public.stars              enable row level security;
alter table public.products           enable row level security;
alter table public.orders             enable row level security;
alter table public.certificate_drafts enable row level security;

-- Políticas de escrita são as mais apertadas possível: quem escreve é a Edge
-- Function, que usa a service_role (que ignora RLS). Ou seja: nenhuma política
-- de INSERT/UPDATE/DELETE para o anon é necessária, e não deve existir.
--
-- Em `stars` e `products` só leitura pública: a vitrine precisa mostrar preço e
-- nome, e isso não é segredo. Todo o resto do schema fica fechado.

create policy "stars sao publicas para leitura"
  on public.stars for select to anon, authenticated
  using (active);

create policy "produtos ativos sao publicos para leitura"
  on public.products for select to anon, authenticated
  using (active);

-- `orders` e `certificate_drafts`: sem nenhuma política. Nenhuma linha é
-- visível para o anon ou para o authenticated. O acesso acontece só por
-- service_role, dentro das Edge Functions.
--
-- Nota sobre `track-order`: ela usa a service_role para ler o pedido e depois
-- devolve um objeto montado, com apenas o necessário para a pessoa se
-- reconhecer. Isso é mais seguro do que abrir a tabela, e não expõe e-mail de
-- terceiros.

-- ---------------------------------------------------------------------------
-- Grants
--
-- O Data API só entrega o que for explicitamente concedido. O padrão do
-- Supabase concede amplidão ao anon em tabelas novas; aqui o acesso é
-- revogado e devolvido com o mínimo.
-- ---------------------------------------------------------------------------
revoke all on public.orders from anon, authenticated;
revoke all on public.certificate_drafts from anon, authenticated;
revoke all on public.products from anon, authenticated;
revoke all on public.stars from anon, authenticated;

grant select on public.stars to anon, authenticated;
grant select on public.products to anon, authenticated;

-- Sem sequência e sem identity: nenhuma tabela deste esquema usa
-- `serial`/`identity`, todos os ids são `uuid` com `gen_random_uuid()`.
