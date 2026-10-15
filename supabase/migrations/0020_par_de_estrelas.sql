-- ============================================================================
-- Par de estrelas.
--
-- Um par (casal, irmãos, mãe e filha) são DOIS pedidos comuns ligados por
-- `group_id` e pagos juntos numa só preferência do Mercado Pago. Cada pessoa
-- ganha a própria estrela, o próprio certificado e a própria página; o
-- certificado diz "em par com …" e cada página aponta para a do par.
--
-- Modelar como dois pedidos — e não um pedido com duas estrelas — mantém tudo
-- o que já existe valendo sem caso especial: correção de texto, revelação na
-- data, depoimento, reembolso (o webhook trata o grupo inteiro).
--
-- O preço é a soma das faixas das duas estrelas: cada pedido guarda o seu.
-- ============================================================================

alter table public.orders add column if not exists group_id uuid;

create index if not exists orders_group_idx on public.orders (group_id) where group_id is not null;

comment on column public.orders.group_id is
  'Pedidos do mesmo par de estrelas (pagos juntos). A preferência usa o id do primeiro como external_reference.';
