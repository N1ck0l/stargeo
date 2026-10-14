-- ============================================================================
-- Busca do catálogo com SQL montado por chamada.
--
-- Em 0012/0013 os filtros opcionais eram escritos como `(p IS NULL OR …)`.
-- Dentro de uma função plpgsql, isso vira plano genérico: o Postgres não sabe
-- que o texto veio preenchido e desiste dos índices de trigrama — ~1 s, contra
-- 3 ms da mesma consulta escrita só com as condições que valem. Aqui o WHERE
-- é montado com SÓ os filtros pedidos (valores sempre por parâmetro, nunca
-- concatenados), e cada execução tem o plano certo.
--
-- Idempotente.
-- ============================================================================

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
  numero_hip integer := null;
  filtros text := 's.active';
  ordem text := 's.magnitude asc';
  quantos bigint;
begin
  if texto ~* '^(hip\s*)?\d{1,6}$' then
    numero_hip := regexp_replace(texto, '\D', '', 'g')::integer;
  end if;

  -- Só nomes de parâmetro ($1…$5) entram no texto; os valores vão no USING.
  if not p_incluir_dedicadas then filtros := filtros || ' and s.status = ''disponivel'''; end if;
  if p_sigla is not null then filtros := filtros || ' and s.sigla = $2'; end if;
  if p_faixa is not null then filtros := filtros || ' and s.faixa = $3'; end if;
  if p_visivel_brasil then filtros := filtros || ' and s.visibility = ''brasil'''; end if;
  if numero_hip is not null then
    filtros := filtros || ' and s.hip = $4';
  elsif texto is not null then
    filtros := filtros || ' and (s.name ilike ''%'' || $1 || ''%'' or s.bayer ilike ''%'' || $1 || ''%'' or s.name % $1)';
    ordem := 'greatest(similarity(s.name, $1), similarity(s.bayer, $1)) desc, s.magnitude asc';
  end if;

  execute 'select count(*) from public.stars s where ' || filtros
    into quantos
    using texto, p_sigla, p_faixa, numero_hip;

  return query execute
    'select s.slug, s.name, s.bayer, s.constellation, s.constellation_latin, s.sigla, s.spectral_type,
            s.ra_hours, s.dec_degrees, s.magnitude, s.distance_ly, s.story, s.best_month, s.faixa,
            f.price_cents, s.visibility, s.status, s.curada, $5::bigint
     from public.stars s
     join public.faixas f on f.slug = s.faixa
     where ' || filtros || '
     order by ' || ordem || '
     limit $6 offset $7'
    using texto, p_sigla, p_faixa, numero_hip, quantos,
          least(greatest(p_limite, 1), 60), greatest(p_deslocamento, 0);
end;
$$;

grant execute on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) to anon, authenticated;
