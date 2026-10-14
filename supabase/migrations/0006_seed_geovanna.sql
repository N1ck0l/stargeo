-- ============================================================================
-- Seed: a página da Geovanna — a primeira cliente, migrada do site pessoal
--
-- Textos cópia literal de `src/data/defaults.js` e `src/data/star.js` (o site
-- que já está no ar). Idempotente: `on conflict (code) do nothing`, então
-- rodar de novo não reescreve o que o admin ou a Geovanna já tenham editado
-- pela plataforma.
--
-- Três decisões:
--
-- 1. `certificate_id` = 'ε-SGR-GBT-2026': o registro dela não muda com a
--    mudança de endereço (ver 0005).
--
-- 2. `customer_email` = 'demo@stargeo.com': é o par (código + e-mail) do login
--    de edição. Placeholder — trocar pelo e-mail dela pelo painel, quando se
--    quiser que ela mesma edite a carta.
--
-- 3. `dedication_date` = '2026-10-11': a data é do site original
--    ('11 de outubro de 2026'); a função `dataEmPortugues` reconverte para
--    exibição, sem perder o formato.
-- ============================================================================

insert into public.pages (
  code,
  status,
  certificate_id,
  customer_email,
  star_slug,
  honoree_name,
  from_name,
  dedication_date,
  titulo_hero,
  frase_hero,
  titulo_estrela,
  descricao_estrela,
  titulo_carta,
  carta,
  mensagem_pessoal,
  mostrar_mensagem,
  mostrar_mira
) values (
  'SG-GEOV-ANNA',           -- a URL: /p/SG-GEOV-ANNA
  'published',              -- no ar desde o seed, sem passar pelo painel
  'ε-SGR-GBT-2026',         -- registro impresso (0005): não acompanha o code
  'demo@stargeo.com',       -- par do login de edição (0004) — placeholder
  'kaus-australis',         -- a estrela do site original
  'Geovanna Beatriz Santos Trindade',
  null,                     -- sem assinatura: o texto todo está na carta
  '2026-10-11',             -- '11 de outubro de 2026' no site; dataEmPortugues reconverte

  'a luz mais brilhante de Sagitário',
  'Uma estrela real, a ε Sagittarii, escolhida para você.',

  'Kaus Australis, agora também Geovanna',
  'Kaus Australis é a estrela mais brilhante de Sagitário. Do hemisfério sul — e especialmente do Brasil — ela se mostra a olho nu, sem telescópio, como um ponto firme no arco do arqueiro. Os números abaixo são reais; o nome batizado é só seu.',

  'Para ser lida sob as estrelas',

  array[
    'Geovanna Beatriz Santos Trindade.',
    'Existe um pedaço do céu que, todas as noites, se recusa a ser comum. Fica em Sagitário — a constelação do arqueiro — e o seu ponto mais brilhante se chama Kaus Australis. Os catálogos a conhecem como ε Sagittarii. A partir de agora, este lugar também te conhece pelo teu nome.',
    'Eu escolhi essa estrela porque ela não se esconde. Magnitude 1,85: clara o bastante para ser vista a olho nu, especialmente daqui, do hemisfério sul, do Brasil, do mesmo céu que cobre os teus dias. Enquanto o inverno avança, o arqueiro sobe e ela brilha no bico do “bule de chá” — como se o universo tivesse deixado um convite discreto para quem soubesse olhar.',
    'A 143 anos-luz daqui, a luz que chega aos teus olhos hoje saiu dessa estrela quando ainda éramos só possibilidade. Mesmo assim, ela atravessou o vazio, o tempo e a poeira da Via Láctea para encontrar exatamente este instante. Eu gosto de pensar que o amor faz o mesmo: parte de muito longe e, ainda assim, acerta o alvo.',
    'Este certificado não pretende possuir o céu. Ninguém é dono de uma estrela. O que ele guarda é outra coisa, mais verdadeira: a decisão de te colocar no mapa. De apontar para um ponto de luz real, com coordenadas, espectro e história, e dizer — aqui. Quando o mundo parecer pequeno demais, levanta os olhos. Ela estará lá. E o teu nome, também.',
    'Com todo o meu amor, sob a mesma noite.'
  ],

  '',                        -- mensagem pessoal vazia: o conteúdo está na carta
  true,                      -- mostrar_mensagem: default da plataforma
  true                       -- mostrar_mira: idem (a seção do Mira aparece)
)
on conflict (code) do nothing;
