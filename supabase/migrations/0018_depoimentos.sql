-- ============================================================================
-- Depoimentos de quem comprou — só reais, só aprovados.
--
-- Quem escreve é o comprador, de dentro da edição da página dele (sessão do
-- `page-auth`): o depoimento fica preso a um pedido PAGO, um por pedido. Nada
-- aparece no site sem aprovação no painel, e a home só mostra a seção quando
-- existe ao menos um aprovado — sem depoimento inventado para "encher".
--
-- O que é público: o nome como a pessoa quer aparecer, a cidade (opcional) e
-- o texto. O pedido, o e-mail e o resto ficam de fora (`depoimentos_aprovados`).
-- ============================================================================

create table if not exists public.depoimentos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  nome_exibicao text not null check (char_length(nome_exibicao) between 2 and 40),
  cidade text check (cidade is null or char_length(cidade) between 2 and 40),
  texto text not null check (char_length(texto) between 10 and 400),
  -- Autorização explícita para publicar no site: sem ela, não entra.
  autoriza_publicar boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decidido_em timestamptz
);

create index if not exists depoimentos_status_idx on public.depoimentos (status, decidido_em desc);

-- Sem política: leitura e escrita só pelo servidor (funções e painel).
alter table public.depoimentos enable row level security;

comment on table public.depoimentos is
  'Depoimentos de compradores; públicos só depois de aprovados no painel.';

-- A vitrine pública: só aprovados, só os campos de exibição.
create or replace function public.depoimentos_aprovados(p_limite integer default 6)
returns table (id uuid, nome_exibicao text, cidade text, texto text, decidido_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.nome_exibicao, d.cidade, d.texto, d.decidido_em
  from public.depoimentos d
  where d.status = 'aprovado' and d.autoriza_publicar
  order by d.decidido_em desc nulls last
  limit least(greatest(coalesce(p_limite, 6), 1), 12);
$$;

revoke all on function public.depoimentos_aprovados(integer) from public;
grant execute on function public.depoimentos_aprovados(integer) to anon, authenticated;
