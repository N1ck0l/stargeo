/**
 * Páginas dedicadas — lógica compartilhada pelas quatro funções que as
 * tocam (`get-page`, `page-auth`, `page-update`, `admin-api`) e pelo webhook.
 *
 * O conteúdo usa os MESMOS nomes de campo do `conteudo.json` do site pessoal
 * (`src/data/defaults.js`), de propósito: os componentes da Geovanna — Hero,
 * StarDetails, LoveLetter, PersonalMessage — recebem o objeto pronto, sem
 * camada de tradução, e a página antiga migra sem perda.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { formatDec, formatRa } from '../../../shared/stars.js'
import { MAX_PARAGRAFOS_CARTA, limpar, paragrafosDaCarta, validarTextoLivre } from '../../../shared/moderation.js'
import { dataEmPortugues } from './datas.ts'

/** O que o visitante vê. Nomes iguais aos de `src/data/defaults.js`. */
export interface ConteudoPagina {
  nome: string
  nomeCurto: string
  assinatura: string
  /** Nome dado à estrela na compra (simbólico); vazio quando não houve. */
  apelidoEstrela: string
  data: string
  registro: string
  tituloHero: string
  fraseHero: string
  tituloEstrela: string
  descricaoEstrela: string
  tituloCarta: string
  carta: string[]
  mensagemPessoal: string
  mostrarMensagem: boolean
  mostrarMira: boolean
}

/**
 * Teto por campo de texto de página.
 *
 * Diferente do certificado (onde o limite é a largura do papel), aqui o teto
 * existe para conter abuso de espaço — a regra que importa é a de termos e
 * contato, e essa é a mesma de `shared/moderation.js`.
 */
export const LIMITES_PAGINA: Record<string, number> = {
  nome: 120,
  assinatura: 120,
  apelidoEstrela: 40,
  tituloHero: 120,
  fraseHero: 220,
  tituloEstrela: 160,
  descricaoEstrela: 1600,
  tituloCarta: 160,
  // Um parágrafo pode ser a carta inteira da compra (`LIMITES.letter`).
  paragrafo: 2000,
  mensagemPessoal: 4000,
}

/**
 * Campos que o CLIENTE pode escrever.
 *
 * Nome, estrela e data não estão aqui: são o que foi comprado, e mudá-los
 * pela página transformaria o presente numa coisa diferente do pagamento.
 * Títulos e descrição são do admin — são a voz da loja, não a de quem
 * recebeu.
 */
export const CAMPOS_DO_CLIENTE = [
  'assinatura',
  'carta',
  'mensagemPessoal',
] as const

/** Linha de `pages`, como existe em `migrations/0004_paginas.sql` + `0005`. */
export interface LinhaPagina {
  id: string
  code: string
  certificate_id: string | null
  status: string
  order_id: string | null
  customer_email: string | null
  star_slug: string
  honoree_name: string
  from_name: string | null
  star_nickname: string | null
  dedication_date: string | null
  reveal_on: string | null
  titulo_hero: string
  frase_hero: string
  titulo_estrela: string
  descricao_estrela: string
  titulo_carta: string
  carta: string[]
  mensagem_pessoal: string
  mostrar_mensagem: boolean
  mostrar_mira: boolean
  created_at: string
}

/** Primeiro nome, que é o que o Hero usa no "Para …". */
export function primeiroNome(nomeCompleto: string): string {
  return limpar(nomeCompleto).split(' ')[0] ?? ''
}

/** Conteúdo no formato do site pessoal, saindo de uma linha de `pages`. */
export function conteudoDaLinha(linha: LinhaPagina): ConteudoPagina {
  return {
    nome: linha.honoree_name,
    nomeCurto: primeiroNome(linha.honoree_name),
    assinatura: linha.from_name ?? '',
    apelidoEstrela: linha.star_nickname ?? '',
    data: dataEmPortugues(linha.dedication_date) ?? '',
    // Registro impresso no certificado. Pedido não tem um à parte — o code É
    // o registro. Página manual (Geovanna) pode ter, e aí não troca.
    registro: linha.certificate_id || linha.code,
    tituloHero: linha.titulo_hero,
    fraseHero: linha.frase_hero,
    tituloEstrela: linha.titulo_estrela,
    descricaoEstrela: linha.descricao_estrela,
    tituloCarta: linha.titulo_carta,
    carta: linha.carta ?? [],
    mensagemPessoal: linha.mensagem_pessoal,
    mostrarMensagem: linha.mostrar_mensagem,
    mostrarMira: linha.mostrar_mira,
  }
}

/**
 * Colunas de conteúdo a partir de um objeto de conteúdo vindo do cliente.
 *
 * `honoree_name`/`dedication_date` NÃO estão aqui — ver `CAMPOS_DO_CLIENTE`:
 * para atualizar dados de dedicação existe a criação, não a edição.
 */
export function colunasDoConteudo(conteudo: ConteudoPagina): Record<string, unknown> {
  return {
    from_name: limpar(conteudo.assinatura) || null,
    star_nickname: limpar(conteudo.apelidoEstrela ?? '') || null,
    titulo_hero: limpar(conteudo.tituloHero),
    frase_hero: limpar(conteudo.fraseHero),
    titulo_estrela: limpar(conteudo.tituloEstrela),
    descricao_estrela: limpar(conteudo.descricaoEstrela),
    titulo_carta: limpar(conteudo.tituloCarta),
    carta: (conteudo.carta ?? []).map((p) => limpar(p)).filter(Boolean),
    mensagem_pessoal: limpar(conteudo.mensagemPessoal),
    // Ausente conta como `true`: o default da coluna é mostrar, e o front só
    // some a seção quando o cliente explicitamente desliga (ou apaga o texto,
    // caso do `page-update`).
    mostrar_mensagem: conteudo.mostrarMensagem !== false,
    mostrar_mira: conteudo.mostrarMira !== false,
  }
}

/**
 * Valida os textos de um objeto de conteúdo.
 *
 * @returns lista de `{campo, motivo}` — vazia quando está tudo bem
 */
export function validarConteudo(conteudo: Partial<ConteudoPagina>): Array<{ campo: string; motivo: string }> {
  const erros: Array<{ campo: string; motivo: string }> = []
  const checar = (campo: string, valor: unknown, limite?: number) => {
    if (valor === undefined || valor === null) return
    if (campo === 'carta') {
      const paragrafos = (valor as unknown[]).map((p) => String(p))
      if (paragrafos.length > 12) {
        erros.push({ campo, motivo: `a carta aceita no máximo 12 parágrafos (tem ${paragrafos.length})` })
        return
      }
      for (const [i, paragrafo] of paragrafos.entries()) {
        const erro = validarTextoLivre(paragrafo, { max: LIMITES_PAGINA.paragrafo })
        if (erro) erros.push({ campo: `${campo}[${i + 1}]`, motivo: erro })
      }
      return
    }
    const texto = String(valor)
    const max = limite ?? LIMITES_PAGINA[campo] ?? 2000
    const erro = validarTextoLivre(texto, { max })
    if (erro) erros.push({ campo, motivo: erro })
  }

  if (conteudo.nome !== undefined) checar('nome', conteudo.nome, LIMITES_PAGINA.nome)
  if (conteudo.assinatura !== undefined && limpar(conteudo.assinatura)) {
    checar('assinatura', conteudo.assinatura, LIMITES_PAGINA.assinatura)
  }
  if (conteudo.apelidoEstrela !== undefined && limpar(conteudo.apelidoEstrela)) {
    checar('apelidoEstrela', conteudo.apelidoEstrela, LIMITES_PAGINA.apelidoEstrela)
  }
  if (conteudo.tituloHero !== undefined) checar('tituloHero', conteudo.tituloHero)
  if (conteudo.fraseHero !== undefined) checar('fraseHero', conteudo.fraseHero)
  if (conteudo.tituloEstrela !== undefined) checar('tituloEstrela', conteudo.tituloEstrela)
  if (conteudo.descricaoEstrela !== undefined) checar('descricaoEstrela', conteudo.descricaoEstrela)
  if (conteudo.tituloCarta !== undefined) checar('tituloCarta', conteudo.tituloCarta)
  if (conteudo.carta !== undefined) checar('carta', conteudo.carta)
  if (conteudo.mensagemPessoal !== undefined && limpar(conteudo.mensagemPessoal)) {
    checar('mensagemPessoal', conteudo.mensagemPessoal, LIMITES_PAGINA.mensagemPessoal)
  }

  return erros
}

/**
 * Lê uma linha de `pages` com todos os campos de conteúdo.
 *
 * Lista explícita em vez de `*`: a linha é passada adiante para o `get-page`
 * e para o `page-auth`, e é mais fácil garantir o que sai daqui olhando a
 * lista do que lembrando de remover coluna por coluna. O `customer_email`
 * entra porque o login precisa conferir o par (código, e-mail) — mas o
 * `get-page` simplesmente não o devolve na resposta.
 */
export const SELECAO_PAGINA = [
  'id', 'code', 'certificate_id', 'status', 'order_id', 'customer_email', 'star_slug',
  'honoree_name', 'from_name', 'star_nickname', 'dedication_date', 'reveal_on',
  'titulo_hero', 'frase_hero', 'titulo_estrela', 'descricao_estrela',
  'titulo_carta', 'carta', 'mensagem_pessoal', 'mostrar_mensagem',
  'mostrar_mira', 'created_at',
].join(',')

/**
 * A estrela, no formato que os componentes do site pessoal esperam
 * (`kausAustralis` em `src/data/star.js`).
 *
 * Campos que só existem para Kaus Australis — catálogos HIP/HD/HR e a nota
 * sobre magnitude — ficam de fora quando o banco não os tem; o componente
 * pula a linha. Nada é inventado: o que não temos não aparece.
 */
export function estrelaParaPagina(estrela: Record<string, unknown>): Record<string, unknown> {
  // Estrela fraca pode não ter paralaxe confiável: distância desconhecida
  // vai como null (a página escreve "não medida"), nunca como 0.
  const distanceLy = estrela.distance_ly == null ? null : Number(estrela.distance_ly)
  return {
    slug: estrela.slug,
    sigla: estrela.sigla ?? null,
    visibility: estrela.visibility ?? 'brasil',
    commonName: estrela.name,
    bayer: estrela.bayer,
    constellation: estrela.constellation,
    constellationLatin: estrela.constellation_latin,
    spectralType: estrela.spectral_type,
    ra: {
      hoursDecimal: Number(estrela.ra_hours),
      formatted: formatRa(Number(estrela.ra_hours)),
    },
    dec: {
      decimal: Number(estrela.dec_degrees),
      formatted: formatDec(Number(estrela.dec_degrees)),
    },
    magnitude: Number(estrela.magnitude),
    distanceLy,
    // 1 ano-luz = 0.3066 pc. Mesma conversão usada no certificado.
    distancePc: distanceLy == null ? null : Math.round(distanceLy * 0.3066 * 10) / 10,
    bestSeason: estrela.best_month ?? '',
    note: '',
    story: estrela.story ?? '',
  }
}

/**
 * Conteúdo inicial de uma página nascida de um pedido.
 *
 * A carta: se quem comprou escreveu uma (0023), é ELA — um parágrafo por
 * linha, como no PDF da carta. Senão, um TEMPLATE NEUTRO, ponto de partida
 * que o admin e o cliente reescrevem pela edição — não um texto que alguém
 * teria de escrever antes de comprar. A mensagem do certificado vira
 * `mensagemPessoal`.
 */
export function conteudoDoPedido(
  pedido: Record<string, unknown>,
  estrela: Record<string, unknown>,
): ConteudoPagina {
  const nome = String(pedido.honoree_name ?? '')
  const curto = primeiroNome(nome)
  const nomeEstrela = String(estrela.name ?? '')
  const bayer = String(estrela.bayer ?? '')
  const constelacao = String(estrela.constellation ?? '')
  const mensagem = limpar(pedido.message ?? '')
  const apelido = limpar(pedido.star_nickname ?? '')
  const cartaEscrita = paragrafosDaCarta(limpar(pedido.letter ?? '')).slice(0, MAX_PARAGRAFOS_CARTA)

  return {
    nome,
    nomeCurto: curto,
    assinatura: limpar(pedido.from_name ?? ''),
    apelidoEstrela: apelido,
    data: dataEmPortugues(
      typeof pedido.dedication_date === 'string' ? pedido.dedication_date : null,
    ) ?? '',
    registro: String(pedido.code ?? ''),
    tituloHero: `a estrela de ${curto}`,
    // A estrela aparece logo abaixo, na linha de fatos do topo: a frase não a repete.
    fraseHero: 'Este pedaço do universo foi escolhido para você.',
    tituloEstrela: apelido
      ? `${nomeEstrela}, agora também “${apelido}”`
      : `${nomeEstrela}, agora também de ${curto}`,
    descricaoEstrela: String(estrela.story ?? ''),
    tituloCarta: cartaEscrita.length ? 'Uma carta para você' : 'Para ser lida sob as estrelas',
    carta: cartaEscrita.length ? cartaEscrita : [
      `${nome}.`,
      `Existe um pedaço do céu que se recusa a ser comum. Em ${constelacao}, ` +
        `${nomeEstrela} — ${bayer} nos catálogos — ` +
        (Number(estrela.magnitude) <= 6.5
          ? `não se esconde: clara o bastante para ser vista a olho nu, do mesmo céu que cobre os seus dias.`
          : `guarda a luz para quem sabe procurar: discreta demais para o olho nu, ` +
            `ela está lá, no mesmo céu que cobre os seus dias, esperando um telescópio.`),
      `Este certificado não pretende possuir o céu. Ninguém é dono de uma estrela. ` +
        `O que ele guarda é outra coisa, mais verdadeira: a decisão de colocar alguém ` +
        `no mapa. Quando o mundo parecer pequeno demais, levanta os olhos — ela estará lá, ` +
        `e o nome também.`,
    ],
    mensagemPessoal: mensagem,
    mostrarMensagem: mensagem.length > 0,
    mostrarMira: true,
  }
}

/**
 * Cria a página de um pedido, se ela ainda não existir.
 *
 * Idempotente pelo `order_id` (único na tabela): o Mercado Pago reenvia o
 * webhook, e um reprocessamento NÃO pode apagar o que o cliente ou o admin já
 * escreveu na página. Por isso a conferência vem antes do insert — upsert
 * reescreveria.
 *
 * @returns o id da página (a que existia ou a recém-criada)
 */
export async function criarPaginaDoPedido(
  db: SupabaseClient,
  pedido: Record<string, unknown>,
  estrela: Record<string, unknown>,
): Promise<string | null> {
  const orderId = String(pedido.id)

  const { data: existente } = await db
    .from('pages')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle()

  if (existente) return String(existente.id)

  const conteudo = conteudoDoPedido(pedido, estrela)

  const { data, error } = await db
    .from('pages')
    .insert({
      order_id: orderId,
      code: String(pedido.code),
      customer_email: pedido.customer_email ?? null,
      star_slug: String(pedido.star_slug),
      honoree_name: conteudo.nome,
      from_name: conteudo.assinatura || null,
      dedication_date: (pedido.dedication_date as string | null) ?? null,
      reveal_on: (pedido.reveal_on as string | null) ?? null,
      ...colunasDoConteudo(conteudo),
    })
    .select('id')
    .single()

  if (error) {
    // Não derruba a entrega: o PDF e o e-mail são o que foi pago. A página
    // pode ser criada depois pelo admin.
    console.error('[pagina] falha ao criar página do pedido', orderId, error.message)
    return null
  }

  return String(data.id)
}
