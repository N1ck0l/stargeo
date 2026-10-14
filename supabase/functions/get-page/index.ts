/**
 * Página dedicada de um cliente — leitura pública por código.
 *
 * Endereço: `/p/SG-XXXX-XXXX`, o mesmo código do rastreio. Quem tem o código
 * vê a página; quem não tem, não — 40 bits de entropia com letra de 31, o
 * mesmo segredo que já protege o pedido. Por isso `pages` não tem nenhuma
 * política de leitura: esta função é o único caminho, e ela nunca devolve
 * `customer_email` nem `order_id`.
 *
 * Página em `draft` responde 404 como se não existisse: rascunho não é uma
 * categoria pública. O admin lê rascunho pelo `admin-api`.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import {
  conteudoDaLinha,
  estrelaParaPagina,
  SELECAO_PAGINA,
  type LinhaPagina,
} from '../_shared/pagina.ts'

/** Mesmo formato do `gen_order_code()` de `0001_loja.sql`. */
const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/

Deno.serve(
  comHandler(async (request) => {
    const { code } = (await lerJson(request)) as { code?: string }

    if (!code) {
      throw new ErroApp('campos_ausentes', 'Informe o código da página.')
    }

    const codigo = String(code).trim().toUpperCase()

    // Formato conferido antes de tocar o banco: lixo não gasta consulta.
    if (!RE_CODIGO.test(codigo)) {
      throw new ErroApp('codigo_invalido', 'Endereço de página inválido.', 422)
    }

    const db = admin()

    const { data, error } = await db
      .from('pages')
      .select(SELECAO_PAGINA)
      .eq('code', codigo)
      .eq('status', 'published')
      .maybeSingle()

    if (error) {
      throw new ErroApp('consulta_falhou', 'Não foi possível abrir a página.', 500, error.message)
    }

    const linha = data as unknown as LinhaPagina | null

    if (!linha) {
      /*
       * Mesma resposta para "não existe" e "está em rascunho". Distinguir
       * entregaria a quem tem o código a informação de que existe um rascunho.
       */
      throw new ErroApp('nao_encontrada', 'Não encontramos nenhuma página com esse endereço.', 404)
    }

    const { data: estrela, error: erroEstrela } = await db
      .from('stars')
      .select('*')
      .eq('slug', linha.star_slug)
      .maybeSingle()

    if (erroEstrela) {
      throw new ErroApp('consulta_falhou', 'Não foi possível abrir a página.', 500, erroEstrela.message)
    }

    if (!estrela) {
      // Slug de página aponta para estrela apagada: conflito de integridade
      // que as FKs devem impedir, mas defensivo mesmo assim.
      throw new ErroApp('estrela_ausente', 'Não foi possível abrir a página.', 500, `star_slug ${linha.star_slug}`)
    }

    return json(request, {
      pagina: {
        code: linha.code,
        // O conteúdo no formato do `conteudo.json` do site pessoal: os
        // componentes recebem pronto, sem camada de tradução.
        conteudo: conteudoDaLinha(linha),
        // Só o que a página pública precisa — nunca `customer_email`.
        starSlug: linha.star_slug,
        criadoEm: linha.created_at,
      },
      estrela: estrelaParaPagina(estrela as Record<string, unknown>),
    })
  }, 'get-page'),
)
