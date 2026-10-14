/**
 * Gravação da edição do cliente na página dedicada.
 *
 * Só o que a pessoa escreveu em vida própria passa por aqui: assinatura,
 * parágrafos da carta e mensagem pessoal (`CAMPOS_DO_CLIENTE`). Nome, estrela
 * e data não — são o que foi comprado, e deixá-los editáveis transformaria o
 * presente numa coisa diferente do pagamento. Títulos e descrição são do
 * admin: são a voz da loja.
 *
 * Autenticação: `Authorization: Bearer <token>` do `page-auth`. Campos fora
 * da lista branca são ignorados, não erro — o front pode mandar o objeto
 * inteiro que a página devolveu.
 *
 * URL: `https://<ref>.supabase.co/functions/v1/page-update`, chamada por
 * `loja/src/lib/pagina.js`. Publicada com `--no-verify-jwt` (ver `LOJA.md`):
 * o token de edição é a única chave que abre isto.
 *
 * Efeitos colaterais: UPDATE em `pages`, apenas nas colunas de conteúdo que o
 * cliente alcança. Sem trava de concorrência: quem grava por último manda — a
 * edição é de uma pessoa só, e histórico de versões não é o produto aqui.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { lerToken, sessaoDe } from '../_shared/token.ts'
import {
  CAMPOS_DO_CLIENTE,
  conteudoDaLinha,
  type ConteudoPagina,
  validarConteudo,
} from '../_shared/pagina.ts'

Deno.serve(
  comHandler(async (request) => {
    const corpo = await lerJson(request)

    const token = lerToken(request, corpo)
    if (!token) {
      throw new ErroApp('sessao_expirada', 'Sua sessão de edição terminou. Entre de novo.', 401)
    }

    const db = admin()
    const sessao = await sessaoDe(db, token)

    const enviado = (corpo.conteudo ?? {}) as Partial<ConteudoPagina>

    // Lista branca: só os três campos do cliente saem do objeto recebido.
    const parcial = pick(enviado)

    // Validação antes de tocar o banco — mesma moderação de termos e contato
    // de `shared/moderation.js`, que é a regra que interessa.
    const erros = validarConteudo(parcial)
    if (erros.length) {
      throw new ErroApp(
        'conteudo_invalido',
        erros.map((e) => `${e.campo}: ${e.motivo}`).join(' · '),
        422,
        JSON.stringify(erros),
      )
    }

    const colunas: Record<string, unknown> = {}

    if (parcial.assinatura !== undefined) {
      colunas.from_name = (parcial.assinatura ?? '').trim() || null
    }
    if (parcial.carta !== undefined) {
      colunas.carta = parcial.carta.map((p) => p.trim()).filter(Boolean)
    }
    if (parcial.mensagemPessoal !== undefined) {
      const mensagem = (parcial.mensagemPessoal ?? '').trim()
      colunas.mensagem_pessoal = mensagem
      // Escrever/apagar a mensagem define se ela aparece: o cliente não tem
      // um interruptor à parte, e mensagem vazia em público não é nada bom.
      colunas.mostrar_mensagem = mensagem.length > 0
    }

    if (!Object.keys(colunas).length) {
      throw new ErroApp('conteudo_invalido', 'Nada para salvar.', 422)
    }

    const { data, error } = await db
      .from('pages')
      .update(colunas)
      // O WHERE vem da SESSÃO, nunca do corpo: o cliente não escolhe qual
      // página escreve — só a dona do token aceita o update.
      .eq('id', sessao.pageId)
      .select('*')
      .single()

    if (error) {
      throw new ErroApp('grava_falhou', 'Não foi possível salvar.', 500, error.message)
    }

    return json(request, {
      ok: true,
      salvoEm: new Date().toISOString(),
      pagina: {
        code: data.code,
        status: data.status,
        conteudo: conteudoDaLinha(data as never),
        podeEditar: true,
      },
    })
  }, 'page-update'),
)

/** Extrai só os campos que o cliente pode escrever. */
function pick(conteudo: Partial<ConteudoPagina>): Partial<ConteudoPagina> {
  const saida: Partial<ConteudoPagina> = {}
  for (const campo of CAMPOS_DO_CLIENTE) {
    if (conteudo[campo] !== undefined) {
      // `carta` chega como texto no editor (um parágrafo por linha) e como
      // array no conteúdo da página — os dois formatos são aceitos.
      if (campo === 'carta' && typeof conteudo[campo] === 'string') {
        saida.carta = String(conteudo[campo])
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
      } else {
        // @ts-expect-error index dinâmico sobre união de chaves conhecidas
        saida[campo] = conteudo[campo]
      }
    }
  }
  return saida
}
