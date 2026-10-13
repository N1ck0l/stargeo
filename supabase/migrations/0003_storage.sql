-- ============================================================================
-- Bucket dos certificados
--
-- PRIVADO, e essa é a decisão mais importante deste arquivo.
--
-- Um bucket público entregaria o PDF de qualquer pessoa que adivinhasse ou
-- recebesse o UUID do pedido. Como o PDF traz o nome e a assinatura de quem
-- recebe o presente, isso é vazamento de dado de terceiro — e o terceiro nem
-- comprou nada, nem pediu.
--
-- O acesso é por link ASSINADO, gerado no momento do envio do e-mail e válido
-- por 30 dias. Depois disso o link morre e o cliente precisa pedir outro.
--
-- A criação do bucket é idempotente: rodar este arquivo duas vezes não dá
-- erro nem recria o bucket.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certificados',
  'certificados',
  false,                       -- privado: acesso só por link assinado
  2621440,                     -- 2,5 MB; o PDF tem ~24 KB, sobra folga
  array['application/pdf']      -- só PDF. Impede que um upload de outro tipo
                                -- vire um vetor (HTML com script, por exemplo)
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Políticas do bucket
--
-- Nenhuma política é criada para `anon` ou `authenticated`: o cliente nunca
-- fala com o Storage diretamente. Toda leitura e escrita acontece dentro das
-- Edge Functions, que usam a service_role e ignoram RLS.
--
-- Sem isto, o padrão do Supabase pode deixar o bucket legível, e valeria
-- exatamente o vazamento que o bucket privado existe para evitar.
-- ---------------------------------------------------------------------------
revoke all on storage.objects for anon, authenticated;
