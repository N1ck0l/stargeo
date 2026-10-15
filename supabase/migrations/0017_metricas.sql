-- ============================================================================
-- Medição de conversão, sem rastrear ninguém.
--
-- Só CONTADORES POR DIA: "hoje, 40 visitas, 12 abriram o produto, 3 iniciaram
-- o pagamento". Não existe linha por pessoa — nada de IP, cookie, identificador,
-- e-mail ou caminho de navegação. Não há o que vazar nem o que pedir
-- consentimento (LGPD): o dado nem chega a ser pessoal.
--
-- O espaço é limitado por construção: (dia × evento × detalhe), com evento e
-- detalhe de listas fechadas. Quem chamar a função em laço só infla um
-- contador; não cria linha nova nem enche o banco.
--
-- Compra aprovada NÃO é evento daqui: o painel conta direto em `orders`
-- (pagos), então ninguém de fora infla o número que importa.
-- ============================================================================

create table if not exists public.metricas_diarias (
  dia date not null,
  evento text not null,
  -- Faixa de preço da estrela, quando o evento tem uma ('' quando não tem).
  detalhe text not null default '',
  total integer not null default 0,
  primary key (dia, evento, detalhe)
);

-- RLS sem nenhuma política: só a service role (painel) lê; escrita só pelas
-- funções abaixo.
alter table public.metricas_diarias enable row level security;

comment on table public.metricas_diarias is
  'Contadores diários do funil (sem dado pessoal). Escrita só por registrar_evento.';

create or replace function public.contar_evento(p_evento text, p_detalhe text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_detalhe text := coalesce(p_detalhe, '');
begin
  if v_detalhe <> '' and not exists (select 1 from public.faixas where slug = v_detalhe) then
    v_detalhe := '';
  end if;
  insert into public.metricas_diarias (dia, evento, detalhe, total)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_evento, v_detalhe, 1)
  on conflict (dia, evento, detalhe) do update set total = public.metricas_diarias.total + 1;
end;
$$;

revoke all on function public.contar_evento(text, text) from public, anon, authenticated;

-- Pública: os eventos do navegador. Evento fora da lista é ignorado em
-- silêncio (não vale um erro para o visitante).
create or replace function public.registrar_evento(p_evento text, p_detalhe text default '')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_evento in ('visita', 'ver_produto', 'escolher_estrela', 'personalizar', 'iniciar_checkout') then
    perform public.contar_evento(p_evento, p_detalhe);
  end if;
end;
$$;

revoke all on function public.registrar_evento(text, text) from public;
grant execute on function public.registrar_evento(text, text) to anon, authenticated;

