-- ============================================================================
-- Busca por texto usando os índices de trigrama.
--
-- Com RLS ligado em `stars`, o Postgres não deixa operadores "não leakproof"
-- (como ILIKE e o `%` do pg_trgm) atravessarem a barreira de segurança da
-- política — e sem isso os índices GIN de trigrama ficam de fora: a busca por
-- texto levava ~1 s para a chave anon, contra 3 ms como dona da tabela.
--
-- A função passa a rodar como DONA (`security definer`). É seguro porque ela
-- já entrega só o que a política entregaria: estrelas `active`, colunas
-- públicas, e só as disponíveis (dedicadas apenas com o parâmetro explícito,
-- que também é público — o nome da estrela, não quem a comprou). O
-- `search_path` é fixo, como manda a regra de funções definer.
--
-- Idempotente.
-- ============================================================================

alter function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) security definer;
alter function public.estrela_aleatoria(text, boolean) security definer;

revoke all on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) from public;
revoke all on function public.estrela_aleatoria(text, boolean) from public;
grant execute on function public.buscar_estrelas(text, text, text, boolean, boolean, integer, integer) to anon, authenticated;
grant execute on function public.estrela_aleatoria(text, boolean) to anon, authenticated;
