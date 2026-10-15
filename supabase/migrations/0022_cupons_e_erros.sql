-- ============================================================================
-- Cupons de desconto e registro de erros do site.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cupons
--
-- Percentual (1–50%) ou valor fixo, com validade e limite de usos. Valem
-- sobre o total da compra (já com o desconto de grupo, `shared/preco.js`) e
-- quem calcula é SEMPRE o servidor (`create-checkout`): o site só mostra.
--
-- Um USO é uma compra PAGA (o webhook registra em `cupom_usos`, um por
-- pedido principal): checkout aberto e abandonado não gasta o cupom. Por isso
-- o limite pode estourar por pouco quando várias pessoas pagam no mesmo
-- instante — aceito: é cupom de divulgação, não cofre.
-- ---------------------------------------------------------------------------

create table if not exists public.cupons (
  codigo text primary key check (codigo ~ '^[A-Z0-9]{3,20}$'),
  tipo text not null check (tipo in ('percentual', 'valor')),
  -- Percentual: 1 a 50. Valor: centavos.
  valor integer not null check (valor > 0),
  descricao text check (descricao is null or char_length(descricao) <= 120),
  valido_de timestamptz,
  valido_ate timestamptz,
  max_usos integer check (max_usos is null or max_usos > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  check (tipo <> 'percentual' or valor <= 50)
);

create table if not exists public.cupom_usos (
  order_id uuid primary key references public.orders (id) on delete cascade,
  codigo text not null references public.cupons (codigo),
  created_at timestamptz not null default now()
);

create index if not exists cupom_usos_codigo_idx on public.cupom_usos (codigo);

alter table public.cupons enable row level security;
alter table public.cupom_usos enable row level security;

alter table public.orders add column if not exists cupom text references public.cupons (codigo);
alter table public.orders add column if not exists desconto_cupom_cents integer not null default 0;

comment on table public.cupons is 'Cupons de desconto (painel → Cupons). Calculados no create-checkout.';

/*
 * O site consulta um cupom para MOSTRAR o desconto antes de pagar. Só devolve
 * cupom válido agora e com uso disponível; o resto é "não encontrado" (mesma
 * resposta para inexistente, vencido e esgotado).
 */
create or replace function public.consultar_cupom(p_codigo text)
returns table (codigo text, tipo text, valor integer, descricao text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.codigo, c.tipo, c.valor, c.descricao
  from public.cupons c
  where c.codigo = upper(trim(p_codigo))
    and c.ativo
    and (c.valido_de is null or c.valido_de <= now())
    and (c.valido_ate is null or c.valido_ate > now())
    and (c.max_usos is null or (select count(*) from public.cupom_usos u where u.codigo = c.codigo) < c.max_usos);
$$;

revoke all on function public.consultar_cupom(text) from public;
grant execute on function public.consultar_cupom(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Erros do site
--
-- Quando algo quebra no navegador de um cliente (tela branca, erro no
-- pagamento), a loja registra AQUI — sem serviço de terceiro e sem dado
-- pessoal: a mensagem técnica (e-mails, códigos de pedido e números longos
-- são apagados antes de sair do navegador e de novo aqui), a tela (com os
-- códigos trocados por `:codigo`) e o navegador. Erro repetido vira contador
-- por dia (`fingerprint`); acima de 300 tipos de erro num dia, o resto é
-- ignorado — o banco não cresce por causa de um laço.
-- ---------------------------------------------------------------------------

create table if not exists public.erros_site (
  dia date not null,
  fingerprint text not null,
  mensagem text not null,
  rota text not null,
  pilha text,
  navegador text,
  total integer not null default 1,
  ultimo timestamptz not null default now(),
  primary key (dia, fingerprint)
);

alter table public.erros_site enable row level security;

create or replace function public.limpar_texto_erro(p text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '[^\s@]+@[^\s@]+', '[email]', 'g'),
        '(SG|GR)-[A-Z0-9]{4}-[A-Z0-9]{4}', ':codigo', 'gi'),
      '[0-9]{6,}', '[n]', 'g'),
    p_max);
$$;

create or replace function public.registrar_erro(p_mensagem text, p_rota text, p_pilha text, p_navegador text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mensagem text := public.limpar_texto_erro(p_mensagem, 300);
  v_rota text := public.limpar_texto_erro(p_rota, 120);
  v_fp text := md5(v_mensagem || '|' || v_rota);
begin
  if v_mensagem = '' then
    return;
  end if;
  if not exists (select 1 from public.erros_site where dia = v_dia and fingerprint = v_fp)
     and (select count(*) from public.erros_site where dia = v_dia) >= 300 then
    return;
  end if;
  insert into public.erros_site (dia, fingerprint, mensagem, rota, pilha, navegador)
  values (v_dia, v_fp, v_mensagem, v_rota, public.limpar_texto_erro(p_pilha, 1500), left(coalesce(p_navegador, ''), 40))
  on conflict (dia, fingerprint) do update
    set total = public.erros_site.total + 1, ultimo = now();
end;
$$;

revoke all on function public.limpar_texto_erro(text, integer) from public;
revoke all on function public.registrar_erro(text, text, text, text) from public;
grant execute on function public.registrar_erro(text, text, text, text) to anon, authenticated;
