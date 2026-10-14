-- ============================================================================
-- Catálogo completo: ~118 mil estrelas, exclusivas, com preço por faixa.
--
-- Até aqui `stars` tinha as 12 estrelas curadas. Agora ela recebe o
-- Hipparcos inteiro (carregado por `scripts/carregar-catalogo.mjs`), e cada
-- estrela pode ser dedicada a UMA pessoa só.
--
-- 1. `faixas`: o preço depende do brilho e do nome da estrela, não do
--    produto. Editável sem deploy (é uma linha por faixa).
-- 2. `stars` ganha: número Hipparcos e HD, cor (B-V), sigla da constelação,
--    faixa, visibilidade no Brasil e o ESTADO da exclusividade:
--      disponivel → reservada (durante o pagamento) → dedicada.
--    Distância vira opcional (estrela fraca sem paralaxe confiável).
-- 3. Funções, todas atômicas (um UPDATE condicional cada):
--      reservar_estrela  — no checkout; só uma reserva vence;
--      dedicar_estrela   — no pagamento aprovado;
--      liberar_estrela   — pagamento recusado/cancelado;
--      buscar_estrelas / estrela_aleatoria — a vitrine (leitura pública).
-- 4. O produto deixa de listar estrelas: `star_slugs` vazio = todas.
--
-- Idempotente.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Faixas de preço
-- ---------------------------------------------------------------------------
create table if not exists public.faixas (
  slug         text primary key check (slug ~ '^[a-z]+$'),
  nome         text    not null,
  descricao    text    not null,
  price_cents  integer not null check (price_cents > 0),
  ordem        integer not null
);

comment on table public.faixas is
  'Faixas de preço do catálogo, pelo brilho e pelo nome da estrela. Mudar o preço é editar a linha.';

insert into public.faixas (slug, nome, descricao, price_cents, ordem) values
  ('lendaria',  'Lendária',  'As estrelas mais brilhantes do céu, com nome próprio',      24900, 1),
  ('nomeada',   'Nomeada',   'Estrelas com nome próprio, conhecidas há séculos',            14900, 2),
  ('brilhante', 'Brilhante', 'Fáceis de ver a olho nu, mesmo perto da cidade',              9900, 3),
  ('visivel',   'Visível',   'Visíveis a olho nu num céu escuro',                           6900, 4),
  ('profunda',  'Profunda',  'Só aparecem com binóculo ou telescópio — um segredo do céu',  4900, 5)
on conflict (slug) do nothing;

alter table public.faixas enable row level security;
revoke all on public.faixas from anon, authenticated;
grant select on public.faixas to anon, authenticated;
drop policy if exists "faixas sao publicas" on public.faixas;
create policy "faixas sao publicas" on public.faixas for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. Estrelas
-- ---------------------------------------------------------------------------
alter table public.stars
  add column if not exists hip            integer,
  add column if not exists hd             integer,
  add column if not exists bv             real,
  add column if not exists sigla          text,
  add column if not exists faixa          text references public.faixas (slug),
  add column if not exists visibility     text,
  add column if not exists curada         boolean not null default false,
  add column if not exists status         text not null default 'disponivel',
  add column if not exists reserved_until timestamptz,
  add column if not exists order_id       uuid references public.orders (id) on delete set null,
  add column if not exists dedicated_at   timestamptz;

alter table public.stars alter column distance_ly drop not null;
alter table public.stars drop constraint if exists stars_distance_ly_check;
alter table public.stars add constraint stars_distance_ly_check check (distance_ly is null or distance_ly > 0);

alter table public.stars drop constraint if exists stars_status_check;
alter table public.stars add constraint stars_status_check check (status in ('disponivel', 'reservada', 'dedicada'));
alter table public.stars drop constraint if exists stars_visibility_check;
alter table public.stars add constraint stars_visibility_check check (visibility is null or visibility in ('brasil', 'norte', 'nunca'));

create unique index if not exists stars_hip_idx on public.stars (hip);
create index if not exists stars_nome_trgm_idx on public.stars using gin (name extensions.gin_trgm_ops);
create index if not exists stars_bayer_trgm_idx on public.stars using gin (bayer extensions.gin_trgm_ops);
create index if not exists stars_vitrine_idx on public.stars (status, faixa, magnitude);
create index if not exists stars_sigla_idx on public.stars (sigla, magnitude);

comment on column public.stars.status is
  'disponivel → reservada (pagamento em curso, até reserved_until) → dedicada. Só as funções abaixo mudam isto.';

-- As 12 curadas, antes do catálogo chegar: faixa e flag (o carregador refaz).
update public.stars set curada = true where slug in (
  'kaus-australis', 'alpha-centauri', 'sirius', 'canopus', 'antares', 'achernar',
  'fomalhaut', 'spica', 'pollux', 'regulus', 'atria', 'vega');

-- Kaus Australis é o presente da Geovanna (página SG-GEOV-ANNA): já dedicada.
update public.stars set status = 'dedicada', dedicated_at = coalesce(dedicated_at, now())
where slug = 'kaus-australis' and status <> 'dedicada';

-- ---------------------------------------------------------------------------
-- 3. Funções de exclusividade (só service_role)
-- ---------------------------------------------------------------------------

/*
 * Reserva a estrela para o pedido por `p_minutos`. Vence a reserva quem fizer
 * o UPDATE primeiro: a condição (disponível, ou reserva vencida) e a escrita
 * são a mesma instrução, então duas compras simultâneas não reservam a mesma
 * estrela. Devolve true se reservou.
 */
create or replace function public.reservar_estrela(p_slug text, p_order uuid, p_minutos integer)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with reservada as (
    update public.stars
    set status = 'reservada',
        order_id = p_order,
        reserved_until = now() + make_interval(mins => p_minutos)
    where slug = p_slug
      and active
      and (status = 'disponivel' or (status = 'reservada' and reserved_until < now()))
    returning 1
  )
  select exists (select 1 from reservada);
$$;

/*
 * Dedica a estrela ao pedido pago. Passa se ela está reservada PARA ESTE
 * pedido (o caminho normal), ou livre (reserva venceu e ninguém pegou). Se
 * outro pedido pegou no meio tempo, devolve false — o webhook registra a
 * pendência para o admin (reembolso ou troca de estrela).
 */
create or replace function public.dedicar_estrela(p_slug text, p_order uuid)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with dedicada as (
    update public.stars
    set status = 'dedicada',
        order_id = p_order,
        reserved_until = null,
        dedicated_at = now()
    where slug = p_slug
      and (
        (status in ('reservada', 'dedicada') and order_id = p_order)
        or status = 'disponivel'
        or (status = 'reservada' and reserved_until < now())
      )
    returning 1
  )
  select exists (select 1 from dedicada);
$$;

/* Pagamento recusado ou cancelado: a reserva DESTE pedido volta ao catálogo. */
create or replace function public.liberar_estrela(p_slug text, p_order uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.stars
  set status = 'disponivel', order_id = null, reserved_until = null
  where slug = p_slug and status = 'reservada' and order_id = p_order;
$$;

revoke all on function public.reservar_estrela(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.dedicar_estrela(text, uuid) from public, anon, authenticated;
revoke all on function public.liberar_estrela(text, uuid) from public, anon, authenticated;
grant execute on function public.reservar_estrela(text, uuid, integer) to service_role;
grant execute on function public.dedicar_estrela(text, uuid) to service_role;
grant execute on function public.liberar_estrela(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Vitrine (leitura pública)
-- ---------------------------------------------------------------------------

/*
 * Busca no catálogo. Texto casa com nome ou designação (trigrama, tolera
 * acento e erro de digitação); filtros opcionais por constelação, faixa e
 * visibilidade no Brasil. Só estrelas que dá para comprar (disponível ou
 * reserva vencida) — a não ser que `p_incluir_dedicadas`.
 *
 * Ordem: com texto, a mais parecida primeiro; sem texto, a mais brilhante.
 * Devolve `total` (antes da paginação) em toda linha, para a tela paginar.
 */
create or replace function public.buscar_estrelas(
  p_texto text default null,
  p_sigla text default null,
  p_faixa text default null,
  p_visivel_brasil boolean default false,
  p_incluir_dedicadas boolean default false,
  p_limite integer default 24,
  p_deslocamento integer default 0
)
returns table (
  slug text, name text, bayer text, constellation text, constellation_latin text, sigla text,
  spectral_type text, ra_hours double precision, dec_degrees double precision, magnitude double precision,
  distance_ly double precision, story text, best_month text, faixa text, price_cents integer,
  visibility text, status text, curada boolean, total bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with filtradas as (
    select s.*, f.price_cents,
           case when coalesce(p_texto, '') = '' then 0
                else greatest(similarity(s.name, p_texto), similarity(s.bayer, p_texto)) end as nota
    from public.stars s
    join public.faixas f on f.slug = s.faixa
    where s.active
      and (p_incluir_dedicadas or s.status = 'disponivel' or (s.status = 'reservada' and s.reserved_until < now()))
      and (p_sigla is null or s.sigla = p_sigla)
      and (p_faixa is null or s.faixa = p_faixa)
      and (not p_visivel_brasil or s.visibility = 'brasil')
      and (
        coalesce(p_texto, '') = ''
        or s.name ilike '%' || p_texto || '%'
        or s.bayer ilike '%' || p_texto || '%'
        or s.name % p_texto
        or ('HIP ' || s.hip) = upper(p_texto)
      )
  )
  select slug, name, bayer, constellation, constellation_latin, sigla, spectral_type, ra_hours, dec_degrees,
         magnitude, distance_ly, story, best_month, faixa, price_cents, visibility,
         case when status = 'reservada' and reserved_until < now() then 'disponivel' else status end,
         curada, count(*) over ()
  from filtradas
  order by nota desc, magnitude asc
  limit least(greatest(p_limite, 1), 60)
  offset greatest(p_deslocamento, 0);
$$;

/* Uma estrela disponível ao acaso ("Surpreenda-me"), opcionalmente de uma faixa. */
create or replace function public.estrela_aleatoria(p_faixa text default null, p_visivel_brasil boolean default true)
returns setof text
language sql
volatile
security invoker
set search_path = ''
as $$
  select slug from public.stars
  where active
    and (status = 'disponivel' or (status = 'reservada' and reserved_until < now()))
    and (p_faixa is null or faixa = p_faixa)
    and (not p_visivel_brasil or visibility = 'brasil')
  order by random()
  limit 1;
$$;

grant execute on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) to anon, authenticated;
grant execute on function public.estrela_aleatoria(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. O produto vale para todas as estrelas
-- ---------------------------------------------------------------------------
update public.products set star_slugs = '{}' where slug = 'certificado-digital';
