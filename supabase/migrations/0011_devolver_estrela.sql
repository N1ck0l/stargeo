-- ============================================================================
-- Reembolso devolve a estrela ao catálogo.
--
-- A política (`/politicas`) promete: desistiu em 7 dias, o dinheiro volta, a
-- estrela volta ao catálogo e a página sai do ar. O webhook do Mercado Pago
-- recebe o estorno (`refunded` / `charged_back`) e chama esta função — sem
-- depender de alguém lembrar de fazer à mão.
--
-- Só devolve a estrela dedicada A ESTE pedido: nunca mexe na de outra pessoa.
-- Idempotente.
-- ============================================================================

create or replace function public.devolver_estrela(p_slug text, p_order uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.stars
  set status = 'disponivel', order_id = null, reserved_until = null, dedicated_at = null
  where slug = p_slug and order_id = p_order and status in ('reservada', 'dedicada');
$$;

revoke all on function public.devolver_estrela(text, uuid) from public, anon, authenticated;
grant execute on function public.devolver_estrela(text, uuid) to service_role;
