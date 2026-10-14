-- ============================================================================
-- Busca por texto rápida.
--
-- Em 0012 o filtro de texto juntava, num OR só, o nome, a designação, o
-- trigrama e a comparação "HIP 12345". A comparação com HIP é uma expressão
-- sobre cada linha (`'HIP ' || hip`), e com ela no OR o Postgres desistia dos
-- índices de trigrama e lia a tabela inteira (~1 s). Agora:
--   - "HIP 12345" (ou só "12345") vai direto pelo índice de `hip`;
--   - o resto usa só condições que os índices GIN de trigrama atendem.
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
  quantos bigint;
begin
  if texto ~* '^(hip\s*)?\d{1,6}$' then
    numero_hip := regexp_replace(texto, '\D', '', 'g')::integer;
  end if;

  select count(*) into quantos
  from public.stars s
  where s.active
    and (p_incluir_dedicadas or s.status = 'disponivel')
    and (p_sigla is null or s.sigla = p_sigla)
    and (p_faixa is null or s.faixa = p_faixa)
    and (not p_visivel_brasil or s.visibility = 'brasil')
    and (
      texto is null
      or (numero_hip is not null and s.hip = numero_hip)
      or (numero_hip is null and (s.name ilike '%' || texto || '%' or s.bayer ilike '%' || texto || '%' or s.name % texto))
    );

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
    and (
      texto is null
      or (numero_hip is not null and s.hip = numero_hip)
      or (numero_hip is null and (s.name ilike '%' || texto || '%' or s.bayer ilike '%' || texto || '%' or s.name % texto))
    )
  order by
    case when texto is null then 0 else greatest(similarity(s.name, texto), similarity(s.bayer, texto)) end desc,
    s.magnitude asc
  limit least(greatest(p_limite, 1), 60)
  offset greatest(p_deslocamento, 0);
end;
$$;

grant execute on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) to anon, authenticated;
