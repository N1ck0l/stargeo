-- ============================================================================
-- Busca do catálogo rápida, com o banco frio ou quente.
--
-- A busca de 0010 levava ~0,9 s sem filtro: o `count(*) over ()` obrigava o
-- Postgres a juntar e ORDENAR as ~108 mil estrelas livres para devolver 12.
-- Com o cache frio isso passa do limite de tempo da chave anon e vira 500 (foi
-- visto na loja). Aqui:
--
--   - índices PARCIAIS só com as estrelas livres: a ordem por brilho sai do
--     índice, e o LIMIT para cedo;
--   - a contagem é uma consulta à parte, sem ordenar nada;
--   - a busca só considera `disponivel`. As reservas vencidas voltam a ser
--     `disponivel` pela limpeza em `reservar_estrela` (cada checkout limpa as
--     vencidas) — antes elas eram tratadas como livres na própria busca, o
--     que impedia o uso do índice;
--   - "Surpreenda-me" sorteia um número Hipparcos e pega a primeira estrela
--     livre a partir dele (índice), em vez de embaralhar a tabela inteira.
--
-- Idempotente.
-- ============================================================================

create index if not exists stars_livres_mag_idx
  on public.stars (magnitude) include (visibility, faixa, sigla)
  where active and status = 'disponivel';

create index if not exists stars_livres_hip_idx
  on public.stars (hip)
  where active and status = 'disponivel';

create index if not exists stars_livres_filtros_idx
  on public.stars (sigla, faixa, visibility, magnitude)
  where active and status = 'disponivel';

create index if not exists stars_reservadas_idx
  on public.stars (reserved_until)
  where status = 'reservada';

-- A busca deixa de ver reservas vencidas como livres: quem as devolve é a
-- limpeza abaixo, que roda a cada nova reserva.
create or replace function public.reservar_estrela(p_slug text, p_order uuid, p_minutos integer)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  reservou boolean;
begin
  update public.stars
  set status = 'disponivel', order_id = null, reserved_until = null
  where status = 'reservada' and reserved_until < now();

  update public.stars
  set status = 'reservada',
      order_id = p_order,
      reserved_until = now() + make_interval(mins => p_minutos)
  where slug = p_slug and active and status = 'disponivel';

  get diagnostics reservou = row_count;
  return reservou;
end;
$$;

drop function if exists public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer);

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
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  texto text := nullif(trim(coalesce(p_texto, '')), '');
  quantos bigint;
begin
  select count(*) into quantos
  from public.stars s
  where s.active
    and (p_incluir_dedicadas or s.status = 'disponivel')
    and (p_sigla is null or s.sigla = p_sigla)
    and (p_faixa is null or s.faixa = p_faixa)
    and (not p_visivel_brasil or s.visibility = 'brasil')
    and (texto is null or s.name ilike '%' || texto || '%' or s.bayer ilike '%' || texto || '%'
         or s.name % texto or ('HIP ' || s.hip) = upper(texto));

  return query
  select s.slug, s.name, s.bayer, s.constellation, s.constellation_latin, s.sigla, s.spectral_type,
         s.ra_hours, s.dec_degrees, s.magnitude, s.distance_ly, s.story, s.best_month, s.faixa,
         f.price_cents, s.visibility, s.status, s.curada, quantos
  from public.stars s
  join public.faixas f on f.slug = s.faixa
  where s.active
    and (p_incluir_dedicadas or s.status = 'disponivel')
    and (p_sigla is null or s.sigla = p_sigla)
    and (p_faixa is null or s.faixa = p_faixa)
    and (not p_visivel_brasil or s.visibility = 'brasil')
    and (texto is null or s.name ilike '%' || texto || '%' or s.bayer ilike '%' || texto || '%'
         or s.name % texto or ('HIP ' || s.hip) = upper(texto))
  order by
    case when texto is null then 0 else greatest(similarity(s.name, texto), similarity(s.bayer, texto)) end desc,
    s.magnitude asc
  limit least(greatest(p_limite, 1), 60)
  offset greatest(p_deslocamento, 0);
end;
$$;

grant execute on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) to anon, authenticated;

create or replace function public.estrela_aleatoria(p_faixa text default null, p_visivel_brasil boolean default true)
returns setof text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  sorteado integer := floor(random() * 120000)::integer;
  achada text;
begin
  select s.slug into achada from public.stars s
  where s.active and s.status = 'disponivel'
    and (p_faixa is null or s.faixa = p_faixa)
    and (not p_visivel_brasil or s.visibility = 'brasil')
    and s.hip >= sorteado
  order by s.hip
  limit 1;

  -- Passou do fim do catálogo: dá a volta.
  if achada is null then
    select s.slug into achada from public.stars s
    where s.active and s.status = 'disponivel'
      and (p_faixa is null or s.faixa = p_faixa)
      and (not p_visivel_brasil or s.visibility = 'brasil')
    order by s.hip
    limit 1;
  end if;

  if achada is not null then
    return next achada;
  end if;
end;
$$;

grant execute on function public.estrela_aleatoria(text, boolean) to anon, authenticated;

analyze public.stars;
