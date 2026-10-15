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
 *
 * Função: `https://<ref>.supabase.co/functions/v1/get-page`, chamada por
 * `loja/src/lib/pagina.js` com `{code}`. Publicada com `--no-verify-jwt`
 * (ver `LOJA.md`) — não há sessão de ninguém aqui: o código É a credencial.
 *
 * Sem efeitos colaterais: leitura pura. E o que sai daqui é montado à mão,
 * campo a campo — o anon não tem política de leitura em `pages` para segurar
 * o resto, então quem escreve a resposta é quem decide o que é público.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { aindaGuardada } from '../_shared/datas.ts'
import { sessaoDe } from '../_shared/token.ts'
import { dadosDoGrupo } from '../_shared/par.ts'
import {
  conteudoDaLinha,
  primeiroNome,
  estrelaParaPagina,
  SELECAO_PAGINA,
  type LinhaPagina,
} from '../_shared/pagina.ts'

/** Mesmo formato do `gen_order_code()` de `0001_loja.sql`. */
const RE_CODIGO = /^SG-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** O handler, exportado para o teste do fluxo inteiro (`test/fluxo.test.js`). */
export const paginaPublica = comHandler(async (request) => {
    const { code, token } = (await lerJson(request)) as { code?: string; token?: string }

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
      // As duas condições juntas: código existe E está publicado. Qualquer uma
      // que falhe devolve null do `maybeSingle`, e o 404 é sempre o mesmo —
      // não se vê diferença entre "não existe" e "está em rascunho".
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

    /*
     * Revelação na data (0019): até o dia, quem abre o link vê só a contagem
     * regressiva — nem a estrela, nem a carta. A dona da página (sessão de
     * edição válida PARA ESTA página) vê tudo, com o aviso da data.
     */
    if (aindaGuardada(linha.reveal_on)) {
      let dona = false
      if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
        try {
          dona = (await sessaoDe(db, token)).pageId === linha.id
        } catch {
          dona = false
        }
      }
      if (!dona) {
        return json(request, {
          guardada: { revelaEm: linha.reveal_on, para: primeiroNome(linha.honoree_name) },
        })
      }
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

    // Grupo de estrelas (0020/0021): as outras estrelas (links para as páginas
    // publicadas) e o endereço da página do grupo. Só nome, estrela e
    // endereço — nada do pedido. `nome` completo é o que o certificado imprime.
    let grupo: {
      code: string | null
      nome: string | null
      total: number
      outras: Array<{ pagina: string | null; para: string; nome: string; estrela: string }>
    } | null = null
    if (linha.order_id) {
      const { data: pedido } = await db.from('orders').select('group_id').eq('id', linha.order_id).maybeSingle()
      const dados = await dadosDoGrupo(db, linha.order_id, pedido?.group_id)
      if (dados) {
        grupo = {
          code: dados.code,
          nome: dados.nome,
          total: dados.total,
          outras: dados.outros.map((o) => ({ pagina: o.pagina, para: o.para, nome: o.honoreeName, estrela: o.starName })),
        }
      }
    }

    return json(request, {
      grupo,
      pagina: {
        code: linha.code,
        // O conteúdo no formato do `conteudo.json` do site pessoal: os
        // componentes recebem pronto, sem camada de tradução.
        conteudo: conteudoDaLinha(linha),
        // Só o que a página pública precisa — nunca `customer_email`.
        starSlug: linha.star_slug,
        criadoEm: linha.created_at,
        // Só chega aqui com data futura quando quem pede é a dona.
        revelaEm: linha.reveal_on && aindaGuardada(linha.reveal_on) ? linha.reveal_on : null,
      },
      estrela: estrelaParaPagina(estrela as Record<string, unknown>),
    })
  }, 'get-page')

