-- ============================================================================
-- Grupos de estrelas (2 a 6 numa compra).
--
-- O par (0020) vira o caso de 2 de um GRUPO: pedidos ligados por `group_id`,
-- pagos juntos, cada pessoa com a sua estrela, o seu certificado e a sua
-- página. Esta tabela dá ao grupo o que é dele:
--
--   - `nome` (opcional, "Família Souza"): sai no certificado de 3+ estrelas
--     ("Uma das quatro estrelas · Família Souza");
--   - `code` (GR-XXXX-XXXX): o endereço da página do grupo, `/g/CODE`, com
--     todas as estrelas num mapa do céu inteiro.
--
-- Leitura só pelas funções (RLS sem política), como `pages`.
-- ============================================================================

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('GR-' || substr(public.gen_order_code(), 4)),
  nome text check (nome is null or char_length(nome) between 2 and 40),
  created_at timestamptz not null default now()
);

alter table public.grupos enable row level security;

comment on table public.grupos is
  'Estrelas compradas juntas (2 a 6). code = endereço da página do grupo (/g/CODE).';

-- Pedidos novos só entram num grupo que existe. `not valid`: não reavalia o
-- que já está gravado (pares de teste anteriores a esta tabela).
alter table public.orders
  add constraint orders_group_fk foreign key (group_id) references public.grupos (id) not valid;
