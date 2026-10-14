-- Renome de marca: os endereços do domínio antigo saem do banco.
--
-- Três lugares guardam o e-mail antigo, e os três têm de mudar juntos — o
-- login de edição compara o par (código + e-mail) em `orders` E `pages`, o
-- painel admin confere `admins.email` por `user_id`, e o GoTrue autentica
-- pela linha em `auth.users` (com o espelho em `auth.identities`).
--
-- A senha do painel não muda: ela está fora do repositório, como sempre
-- esteve. O e-mail novo é o pessoal do dono da loja — é por ele que o
-- remetente dos e-mails passa a sair até existir domínio próprio da marca.

update public.orders
set customer_email = 'nickolasfelipe225@gmail.com'
where lower(customer_email) = 'demo@stargeo.com';

update public.pages
set customer_email = 'nickolasfelipe225@gmail.com'
where lower(customer_email) = 'demo@stargeo.com';

update public.admins
set email = 'nickolasfelipe225@gmail.com'
where lower(email) = 'admin@stargeo.com';

-- `identity_data` é onde o provedor de e-mail do GoTrue guarda o endereço:
-- trocar só `auth.users.email` deixaria o login antigo funcionando em uns
-- caminhos e falhando em outros.
with alvo as (
  select id
  from auth.users
  where lower(email) = 'admin@stargeo.com'
)
update auth.identities
set identity_data = jsonb_set(
      coalesce(identity_data, '{}'::jsonb),
      '{email}',
      to_jsonb('nickolasfelipe225@gmail.com'::text)
    )
where user_id in (select id from alvo);

update auth.users
set email = 'nickolasfelipe225@gmail.com',
    raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{email}',
      to_jsonb('nickolasfelipe225@gmail.com'::text)
    )
where lower(email) = 'admin@stargeo.com';
