-- ============================================================================
-- Registro impresso ≠ endereço da página
--
-- O `code` é a URL (`/p/SG-XXXX-XXXX`) e o que o cliente digita no rastreio.
-- Em pedido, o mesmo código é o registro do certificado — os dois são a mesma
-- coisa desde o 0001. Em página manual não: a da Geovanna existe desde antes
-- da plataforma, com registro `ε-SGR-GBT-2026`, e mudar o que está impresso no
-- papel só porque o endereço passou a ser `/p/SG-GEOV-ANNA` seria apagar o
-- histórico dela.
--
-- `certificate_id` anulável: quando nulo (todo pedido e qualquer página sem
-- registro próprio), o certificado continua exibindo o `code`, como sempre.
-- ============================================================================

alter table public.pages
  add column if not exists certificate_id text;

alter table public.pages
  drop constraint if exists pages_certificate_length;

alter table public.pages
  add constraint pages_certificate_length
  check (certificate_id is null or length(certificate_id) between 1 and 60);

comment on column public.pages.certificate_id is
  'Registro impresso no certificado. Nulo = exibir o code.';
