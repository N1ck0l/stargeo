-- ============================================================================
-- Campanhas de homenagem (a primeira: PROIMAGEM).
--
-- Uma campanha é um conjunto de PÁGINAS MANUAIS (sem pedido, sem pagamento)
-- com identidade própria: a logomarca do parceiro no certificado, na carta e
-- na página, a assinatura de quem presenteia e uma frase final. Cada
-- homenageada é uma linha em `pages` — a mesma rota (`/p/SG-XXXX-XXXX`), a
-- mesma leitura pública (`get-page`), o mesmo editor do painel.
--
-- Privacidade: o que serve para ESCREVER a carta (qualidades, lembrança, tom)
-- e o consentimento de divulgação ficam em colunas que só o painel lê; a
-- `get-page` usa lista explícita de colunas (`SELECAO_PAGINA`) e nunca os
-- devolve. Cargo, setor, telefone e data de nascimento não têm coluna.
--
-- Nada aqui muda dado existente: só cria a tabela, acrescenta colunas
-- anuláveis e duas funções. Para desfazer (antes de haver homenagens):
--   drop function if exists public.dedicar_estrela_manual(text);
--   drop function if exists public.liberar_estrela_manual(text);
--   alter table public.pages drop column if exists campanha_id, drop column if exists campanha_etapa,
--     drop column if exists campanha_chave, drop column if exists campanha_notas,
--     drop column if exists campanha_consentimento;
--   drop table if exists public.campanhas;
-- ============================================================================

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  nome text not null check (char_length(nome) between 2 and 80),
  -- Quem assina a iniciativa junto com a Stellara ("PROIMAGEM").
  parceiro text not null check (char_length(parceiro) between 2 and 60),
  -- Arquivo em `loja/public` (servido pelo site e lido pelo gerador de PDF).
  logo_url text check (logo_url is null or logo_url ~ '^/[a-z0-9/_.-]+\.(png|jpg|jpeg)$'),
  -- Proporção da logo (largura ÷ altura), para o PDF desenhar sem deformar.
  logo_proporcao numeric check (logo_proporcao is null or logo_proporcao between 0.2 and 6),
  -- A logo só aparece com a autorização registrada aqui.
  logo_autorizada boolean not null default false,
  -- Assinatura padrão das cartas e das páginas (cada homenagem pode trocar).
  assinatura text check (assinatura is null or char_length(assinatura) <= 120),
  -- Frase delicada no fim da carta, opcional.
  frase_final text check (frase_final is null or char_length(frase_final) <= 200),
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.campanhas is
  'Campanhas de homenagem (co-branding). Só o painel (service_role) lê e escreve; a página pública recebe o mínimo via get-page.';

-- Sem política nenhuma: só o service_role (Edge Functions) enxerga.
alter table public.campanhas enable row level security;

insert into public.campanhas (slug, nome, parceiro, logo_url, logo_proporcao, logo_autorizada)
values ('proimagem', 'Homenagem PROIMAGEM', 'PROIMAGEM', '/campanhas/proimagem.png', 1.518, true)
on conflict (slug) do nothing;

alter table public.pages
  add column if not exists campanha_id uuid references public.campanhas (id) on delete restrict,
  -- Andamento da homenagem no painel — independente de `status` (publicada
  -- ou não), que continua decidindo se o link abre.
  add column if not exists campanha_etapa text
    check (campanha_etapa is null or campanha_etapa in ('rascunho', 'revisao', 'finalizada')),
  -- Nome normalizado (sem acento, minúsculo): impede cadastrar a mesma
  -- pessoa duas vezes na mesma campanha.
  add column if not exists campanha_chave text,
  -- Para escrever a carta: { qualidades, profissional, lembranca, tom }.
  -- Só o painel lê.
  add column if not exists campanha_notas jsonb not null default '{}'::jsonb
    check (pg_column_size(campanha_notas) <= 8192),
  -- Consentimento de divulgação (opcional; o presente não depende dele):
  -- { redes, repostagem, imagem, registradoEm }. Só o painel lê.
  add column if not exists campanha_consentimento jsonb not null default '{}'::jsonb
    check (pg_column_size(campanha_consentimento) <= 2048);

create unique index if not exists pages_campanha_pessoa_idx
  on public.pages (campanha_id, campanha_chave)
  where campanha_id is not null;

comment on column public.pages.campanha_notas is
  'Anotações para escrever a carta (qualidades, lembrança, tom). Privadas: nunca saem na página pública.';
comment on column public.pages.campanha_consentimento is
  'Consentimento de divulgação da homenageada (opcional). Privado: só o painel.';

-- ---------------------------------------------------------------------------
-- Estrela de página manual sai da vitrine (e volta quando a página a solta).
--
-- Antes, página manual não tocava `stars`: a estrela de uma homenagem podia
-- ser vendida a um cliente. `order_id` fica nulo — não há pedido. Só mexe em
-- estrela livre (dedicar) ou dedicada SEM pedido e sem outra página (liberar):
-- nunca numa estrela vendida.
-- ---------------------------------------------------------------------------
create or replace function public.dedicar_estrela_manual(p_slug text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with dedicada as (
    update public.stars
    set status = 'dedicada', order_id = null, reserved_until = null, dedicated_at = now()
    where slug = p_slug
      and (status = 'disponivel' or (status = 'reservada' and reserved_until < now()))
    returning 1
  )
  select exists (select 1 from dedicada)
      or exists (
        -- Já dedicada sem pedido (ex.: a mesma página salva de novo).
        select 1 from public.stars s where s.slug = p_slug and s.status = 'dedicada' and s.order_id is null
      );
$$;

create or replace function public.liberar_estrela_manual(p_slug text)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.stars s
  set status = 'disponivel', dedicated_at = null
  where s.slug = p_slug
    and s.status = 'dedicada'
    and s.order_id is null
    and not exists (select 1 from public.pages p where p.star_slug = p_slug);
$$;

revoke all on function public.dedicar_estrela_manual(text) from public, anon, authenticated;
revoke all on function public.liberar_estrela_manual(text) from public, anon, authenticated;
