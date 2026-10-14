-- ============================================================================
-- Entrega idempotente, limite de requisições e resumo do painel.
--
-- Três peças independentes, todas só para a service_role (as Edge Functions):
--
-- 1. `orders.delivery_started_at` — trava da entrega. O Mercado Pago manda
--    mais de um evento por pagamento (`payment.created`, `payment.updated`,
--    reenvios); sem trava, dois eventos aprovados em paralelo geravam o PDF e
--    mandavam o e-mail duas vezes. O webhook "reserva" o pedido com um update
--    condicional e só quem reservou entrega. A reserva vence em 5 minutos,
--    para uma função que morreu no meio não travar o pedido para sempre.
--
-- 2. `rate_limits` + `consumir_limite()` — janela fixa por chave (função + IP
--    ou função + e-mail). Protege `create-checkout`, `track-order` e
--    `page-auth` de serem chamadas em laço: pedido falso enchendo o banco e
--    tentativa em massa de par código + e-mail.
--
-- 3. `resumo_pedidos()` — os números da visão geral calculados no banco. Antes
--    o painel somava em memória as 500 linhas mais recentes, e a receita
--    passava a mentir a partir do pedido 501.
--
-- Idempotente: repetir não muda nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trava da entrega
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists delivery_started_at timestamptz;

comment on column public.orders.delivery_started_at is
  'Reserva da entrega pelo mp-webhook. Só quem a grava (update condicional) gera o PDF e manda o e-mail; vence em 5 min.';

-- ---------------------------------------------------------------------------
-- 2. Limite de requisições
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  chave        text        not null,
  janela       timestamptz not null,
  contagem     integer     not null default 0,
  primary key (chave, janela)
);

comment on table public.rate_limits is
  'Contadores de janela fixa por chave (função + IP/e-mail). Escrito só por consumir_limite().';

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create index if not exists rate_limits_janela_idx on public.rate_limits (janela);

/*
 * Soma 1 na janela atual da chave e diz se ainda está dentro do limite.
 *
 * Um único `insert ... on conflict do update ... returning` — atômico, sem
 * corrida entre ler e escrever. A limpeza das janelas velhas vai junto, numa
 * fração das chamadas, para a tabela não crescer sem ninguém varrer.
 */
create or replace function public.consumir_limite(
  p_chave text,
  p_janela_segundos integer,
  p_maximo integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  inicio timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos
  );
  atual integer;
begin
  insert into public.rate_limits as r (chave, janela, contagem)
  values (p_chave, inicio, 1)
  on conflict (chave, janela) do update set contagem = r.contagem + 1
  returning r.contagem into atual;

  if random() < 0.01 then
    delete from public.rate_limits where janela < now() - interval '1 day';
  end if;

  return atual <= p_maximo;
end;
$$;

revoke all on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Resumo da visão geral
-- ---------------------------------------------------------------------------
create or replace function public.resumo_pedidos()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'receitaCentavos', coalesce(sum(amount_cents) filter (where status = 'approved'), 0),
    'comErroDeEmail', count(*) filter (where email_error is not null),
    'naSemana', count(*) filter (where created_at >= now() - interval '7 days'),
    'porStatus', coalesce(
      (select jsonb_object_agg(status, n)
       from (select status, count(*) as n from public.orders group by status) s),
      '{}'::jsonb
    )
  )
  from public.orders;
$$;

revoke all on function public.resumo_pedidos() from public, anon, authenticated;
grant execute on function public.resumo_pedidos() to service_role;
