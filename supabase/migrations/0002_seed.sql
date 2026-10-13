-- ============================================================================
-- Carga inicial: as estrelas de shared/stars.js e os produtos da vitrine.
--
-- Este arquivo é executado depois de 0001. É idempotente (`on conflict`), então
-- pode rodar de novo sem duplicar nem sobrescrever alterações de preço feitas
-- pelo admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Estrelas
--
-- Os valores abaixo são cópia literal de `shared/stars.js`. As duas fontes
-- precisam concordar; `shared/stars.test.mjs` é o que garante isso.
-- ---------------------------------------------------------------------------
insert into public.stars (
  slug, name, bayer, constellation, constellation_latin, spectral_type,
  ra_hours, dec_degrees, magnitude, distance_ly, best_month, story, featured
) values
  ('kaus-australis', 'Kaus Australis', 'ε Sagittarii', 'Sagitário', 'Sagittarius', 'B9 IVp',
   18.40286622, -34.38461647, 1.85, 143, 'Junho a setembro',
   'A estrela mais brilhante de Sagitário, no bico do "bule de chá". No inverno brasileiro ela sobe alto e fica fácil de encontrar. Sua luz saiu 143 anos atrás — quando o Brasil ainda era um império.',
   true),

  ('alpha-centauri', 'Alpha Centauri', 'α Centauri', 'Centauro', 'Centaurus', 'G2V + K1V',
   14.66013568, -60.83397672, -0.27, 4.37, 'Abril a setembro',
   'A estrela mais próxima do Sol depois de Proxima. É na verdade três: duas estrelas que giram uma na outra a cada 16 dias, com uma terceira anã vermelha ao redor. Quatro anos-luz. Na escala do cosmos, é quase vizinha.',
   true),

  ('sirius', 'Sirius', 'α Canis Majoris', 'Cão Maior', 'Canis Major', 'A1V + DA2',
   6.7524808, -16.71611586, -1.46, 8.6, 'Janeiro a março',
   'A estrela mais brilhante do céu noturno inteiro, visível do Brasil quase o ano todo. Faz parte do Cão Maior, que os egípcios usavam para marcar a cheia do Nilo. Brilha 25 vezes mais que o Sol.',
   true),

  ('canopus', 'Canopus', 'α Carinae', 'Carena', 'Carina', 'A9II',
   6.39919772, -52.69566013, -0.72, 310, 'Janeiro a abril',
   'Segunda mais brilhante do céu, e a estrela-guia dos foguetes: a Soyuz e a cápsula Apollo usavam o brilho dela para se orientar. Do Brasil aparece baixa, perto do horizonte, e some rápido. Difícil de ver. Vale o esforço.',
   false),

  ('antares', 'Antares', 'α Scorpii', 'Escorpião', 'Scorpius', 'M1.5Iab',
   16.49012703, -26.43199644, 1.06, 550, 'Maio a agosto',
   'O nome vem do grego: "rival de Marte", porque brilha em vermelho. Uma supergigante tão vasta que, se estivesse onde o Sol está, engoliria a órbita de Marte. O núcleo dela já está no fim.',
   false),

  ('achernar', 'Achernar', 'α Eridani', 'Erídano', 'Eridanus', 'B6Vep',
   1.62857161, -57.2367153, 0.46, 139, 'Novembro a março',
   'Significa "o rio que corre para o sul", o fim do rio egípcio. É uma estrela achatada, girando tão rápido que fica visivelmente oval. Para o hemisfério sul, ocupa o lugar que Polaris ocupa no norte — quase.',
   false),

  ('fomalhaut', 'Fomalhaut', 'α Piscis Austrini', 'Peixe Austral', 'Piscis Austrinus', 'A3V',
   22.96084749, -29.62223605, 1.16, 25, 'Setembro a novembro',
   'A estrela mais solitária do céu: não tem nenhuma estrela vizinha num raio grande, numa das regiões mais vazias da Via Láctea. Em 2013 o Telescópio Hubble fotografou um anel de poeira ao redor dela, como se alguém tivesse desenhado um beijo no espaço.',
   true),

  ('spica', 'Spica', 'α Virginis', 'Virgem', 'Virgo', 'B1III-IV',
   13.41988305, -11.16132208, 0.98, 250, 'Março a maio',
   'Do latim, "espiga". Não é uma estrela, mas duas, girando uma ao redor da outra a cada quatro dias. Uma empresa de telecomunicações já mediu a distância da Terra até ela com mais precisão do que qualquer laboratório terrestre.',
   false),

  ('pollux', 'Pollux', 'β Geminorum', 'Gêmeos', 'Gemini', 'K0III',
   7.75526358, 28.0261992, 1.14, 34, 'Dezembro a março',
   'A mais brilhante dos Gêmeos, parecendo o irmão mais velho de Castor. Anã vermelha e gigante laranja ao mesmo tempo — uma estrela que está engordando enquanto esfria. Uma estrela natalina de verdade.',
   false),

  ('regulus', 'Regulus', 'α Leonis', 'Leão', 'Leo', 'B7V',
   10.13953074, 11.96720871, 1.36, 79, 'Fevereiro a abril',
   'Do latim, "pequeno rei". Forma o triângulo da cabeça do Leão. Gira tão rápido no equador que está 30% mais achatada nos polos do que nos lados — a distorção foi medida daqui da Terra.',
   false),

  ('atria', 'Atria', 'α Trianguli Australis', 'Triângulo Austral', 'Triangulum Australe', 'K2Ib-II',
   16.81104865, -69.02772075, 1.91, 391, 'Maio a agosto',
   'Segunda mais brilhante do céu para quem está no hemisfério sul, logo abaixo de Canopus. Aponta quase para o Polo Sul Celeste. Foi uma das primeiras estrelas a serem mapeadas por outro continente.',
   false),

  ('vega', 'Vega', 'α Lyrae', 'Lira', 'Lyra', 'A0V',
   18.61564931, 38.78368896, 0.03, 25, 'Julho a outubro',
   'A quinta estrela mais brilhante do céu, e a primeira de todas a ser fotografada, em 1850. Foi a estrela em torno da qual a primeira tentativa de encontrar vida extraterrestre se orientou — e continua sendo alvo de buscas.',
   false)

on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Produtos
--
-- Três níveis, como na referência de mercado: digital, com mapa impresso e
-- premium. Os preços são de exemplo — troque pelos seus antes de publicar.
-- ---------------------------------------------------------------------------
insert into public.products (
  slug, name, tagline, description, price_cents, compare_at_cents,
  badge, features, star_slugs, sort_order
) values
  ('certificado-digital',
   'Certificado Digital',
   'O essencial, na hora',
   'O certificado personalizado em PDF de alta resolução, com as coordenadas reais da estrela, o mapa do céu em que ela aparece e o código de registro verificável. Chega por e-mail em poucos minutos.',
   4900, 7900, null,
   '["Certificado em PDF (A4, 300 dpi)", "Mapa do céu da constelação em PDF", "Código de registro único", "Envio por e-mail em até 10 minutos", "Acesso ao app Mira celeste com o nome dedicado"]'::jsonb,
   '{kaus-australis,alpha-centauri,sirius,fomalhaut}', 1),

  ('certificado-mapa-impresso',
   'Certificado + Mapa Impresso',
   'O mais vendido',
   'Tudo do digital, mais o mapa da constelação em versão de impressão, com marcações prontas para emoldurar em A4. Você escolhe a estrela que quiser imortalizar.',
   14900, 21200, 'mais_vendido',
   '["Tudo do Certificado Digital", "Mapa celeste em A4 pronto para emoldurar (300 dpi)", "Guia de campo: como achar a estrela no céu", "Cartão com o céu do hemisfério sul", "Envio por e-mail em até 10 minutos", "Acesso ao app Mira celeste"]'::jsonb,
   '{kaus-australis,alpha-centauri,sirius,antares,vega,spica,pollux,regulus,canopus,achernar,fomalhaut,atria}', 2),

  ('certificado-premium',
   'Certificado Premium',
   'A experiência completa',
   'O conjunto digital inteiro, com o mapa de maior resolução, o guia de observação personalizado para a sua cidade e um arquivo de áudio com a história da estrela narrada.',
   24900, 32900, 'premium',
   '["Tudo do Certificado + Mapa Impresso", "Guia de observação personalizado para a sua cidade", "Mapa celeste em 4K (600 dpi)", "Narrativa em áudio da história da estrela", "Tela de céu personalizada", "Envio prioritário"]'::jsonb,
   '{kaus-australis,alpha-centauri,sirius,antares,vega,spica,pollux,regulus,canopus,achernar,fomalhaut,atria}', 3)

on conflict (slug) do nothing;
