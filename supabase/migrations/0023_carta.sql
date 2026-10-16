-- ============================================================================
-- A carta que acompanha o certificado.
--
-- Opcional, escrita na compra: é a segunda peça do presente — o certificado
-- representa a estrela; a carta, o que sente quem dá. Vira a carta da página
-- dedicada (`pages.carta`, um parágrafo por linha) e um PDF próprio, gerado
-- com o mesmo desenhista do certificado (`shared/carta/desenho.js`).
--
-- Texto pessoal: só aparece na página de quem recebe (que já é privada por
-- link, e escondida até a data quando há revelação). Nunca vai para a vitrine,
-- depoimentos ou divulgação.
--
-- O teto (2000) é o mesmo de `LIMITES.letter` em `shared/moderation.js`: uma
-- folha A4 de leitura confortável.
-- ============================================================================

alter table public.orders
  add column if not exists letter text
  check (letter is null or char_length(letter) between 1 and 2000);

comment on column public.orders.letter is
  'Carta escrita na compra (opcional, texto pessoal). Vira a carta da página e o PDF da carta.';
