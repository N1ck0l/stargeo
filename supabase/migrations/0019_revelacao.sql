-- ============================================================================
-- Revelação na data.
--
-- Quem compra hoje para um aniversário daqui a um mês pode escolher o dia em
-- que a página da estrela se revela. O certificado (PDF) chega na hora para
-- quem pagou; a PÁGINA — o link que vai para quem recebe — mostra só uma
-- contagem regressiva até a data (`get-page`). Assim o link pode ir antes,
-- num cartão ou numa mensagem, sem estragar a surpresa.
--
-- Data do calendário (sem hora): revela à meia-noite de Brasília. Nula = já
-- revelada. A dona da página, com a sessão de edição, vê tudo antes.
-- ============================================================================

alter table public.orders add column if not exists reveal_on date;
alter table public.pages add column if not exists reveal_on date;

comment on column public.orders.reveal_on is
  'Dia em que a página da estrela se revela (meia-noite de Brasília). Nulo = na hora.';
comment on column public.pages.reveal_on is
  'Até este dia, get-page mostra só a contagem regressiva a quem não é a dona.';
