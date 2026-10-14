-- ============================================================================
-- Só o Certificado Digital fica à venda.
--
-- Os outros dois níveis do catálogo (Certificado + Mapa Impresso e Premium)
-- eram planejamento: enquanto não existem de verdade, ficam DESLIGADOS pelo
-- mesmo mecanismo documentado em 0001 — `active = false` tira o produto da
-- vitrine e do checkout (a política de leitura filtra `active`, e o
-- `create-checkout` recusa produto inativo) SEM apagar a linha: pedido e
-- página antigos continuam de pé e legíveis pelas funções.
--
-- `sort_order = null` e `badge = null` acompanham: são os campos que a
-- vitrine usaria ao reativar, e é melhor começarem limpos.
--
-- Reativar quando os outros níveis existirem de verdade é um único update
-- voltando as três colunas. Idempotente: repetir não muda nada.
-- ============================================================================

update public.products
set active = false,
    sort_order = null,
    badge = null
where slug in ('certificado-mapa-impresso', 'certificado-premium');
