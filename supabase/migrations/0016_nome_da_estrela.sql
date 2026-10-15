-- ============================================================================
-- Nome dado à estrela.
--
-- Opcional, escolhido na compra ("Nossa Luz", "A Estrela da Vó Lúcia"): sai no
-- certificado ("chamada, nesta homenagem, de …"), no e-mail e na página. É
-- simbólico — o nome oficial nos catálogos continua o de `stars.name` — e por
-- isso mora no pedido e na página, nunca na estrela.
--
-- O teto (40) é o mesmo de `LIMITES.starNickname` em `shared/moderation.js`:
-- é uma linha só no certificado, em corpo grande.
-- ============================================================================

alter table public.orders
  add column if not exists star_nickname text
  check (star_nickname is null or char_length(star_nickname) between 1 and 40);

alter table public.pages
  add column if not exists star_nickname text
  check (star_nickname is null or char_length(star_nickname) between 1 and 40);

comment on column public.orders.star_nickname is
  'Nome dado à estrela na compra (simbólico). Vai no certificado, no e-mail e na página.';
comment on column public.pages.star_nickname is
  'Nome dado à estrela nesta homenagem (simbólico); nasce do pedido, o admin corrige.';
