/**
 * Utilidades de HTTP compartilhadas pelas Edge Functions.
 *
 * A maior parte disto existe por um motivo só: **não vazar erro interno**.
 * Uma mensagem de exceção do Postgres ou do Mercado Pago carrega nome de
 * tabela, coluna e às vezes parte do payload do cliente. Quem compra não
 * precisa ver nada disso — precisa ver "tente de novo", e o operador precisa
 * ver o detalhe no log.
 */

/**
 * Origens sempre liberadas, para o desenvolvimento local.
 *
 * 5173 é o site pessoal (porta padrão do Vite) e 4173 é o `vite preview`.
 */
const ORIGENS_DEV = ['http://localhost:5173', 'http://localhost:4173']

/**
 * Lê os domínios extras da variável de ambiente `ORIGENS_PERMITIDAS`.
 *
 * A lista de produção vem do ambiente (`supabase secrets set`) e não do
 * código: o domínio muda entre teste e produção, e editar código para publicar
 * é um convite a esquecer. Sem a variável, só o desenvolvimento local passa —
 * o padrão seguro.
 */
function origensPermitidas(): string[] {
  const extra = Deno.env.get('ORIGENS_PERMITIDAS')
  if (!extra) return ORIGENS_DEV
  return [...ORIGENS_DEV, ...extra.split(',').map((o) => o.trim()).filter(Boolean)]
}

/**
 * Headers de CORS, com a origem ecoada apenas se estiver na lista.
 *
 * Ecoar `*` em uma API que cria pedidos permitiria que qualquer site fizesse
 * pedidos usando a configuração da loja. A lista é explícita de propósito.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origem = request.headers.get('origin')
  const permitida = origem && origensPermitidas().includes(origem)

  return {
    'Access-Control-Allow-Origin': permitida ? origem : ORIGENS_DEV[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

/** Responde JSON com os headers de CORS.
 *
 * `status` é o código HTTP; o corpo é sempre JSON, então quem consome (o front
 * da loja) não precisa checar content-type em nenhuma resposta.
 */
export function json(request: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: corsHeaders(request) })
}

/**
 * Erro com um código estável, para o cliente decidir o que fazer.
 *
 * Os campos são declarados explicitamente porque `Error` já tem `message`, e
 * sem declarar, o TypeScript não enxerga `codigo`/`detalhe` daqui de dentro e
 * o `instanceof` no handler passa a compilar errado.
 *
 * O `detalhe` nunca vai para a resposta — só para o log.
 */
export class ErroApp extends Error {
  /** Código estável, em snake_case, que o front usa para decidir a mensagem. */
  readonly codigo: string
  /** Status HTTP correspondente. */
  readonly status: number
  /** Contexto técnico, apenas para o log do operador. */
  readonly detalhe: string | null

  constructor(codigo: string, mensagem: string, status = 400, detalhe: string | null = null) {
    super(mensagem)
    this.name = 'ErroApp'
    this.codigo = codigo
    this.status = status
    this.detalhe = detalhe
  }
}

/** Assinatura do handler que `comHandler` embrulha. */
export type Handler = (request: Request) => Promise<Response> | Response

/**
 * Envolve o handler, convertendo qualquer exceção em resposta JSON.
 *
 * Sem isto, uma exceção vira a página de erro padrão do Deno — HTML, com
 * stack trace — para quem comprou.
 *
 * Também responde o `OPTIONS` do preflight de CORS aqui: toda função é
 * chamada do navegador da loja, e sem a resposta vazia com os headers o
 * navegador trava antes de mandar o corpo.
 */
export function comHandler(handler: Handler, nome: string): Handler {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    try {
      return await handler(request)
    } catch (erro) {
      if (erro instanceof ErroApp) {
        // Erro esperado: log curto, resposta com a mensagem que escrevemos.
        console.warn(`[${nome}] ${erro.codigo}: ${erro.message}`, erro.detalhe ?? '')
        return json(request, { erro: erro.codigo, mensagem: erro.message }, erro.status)
      }

      // Erro inesperado: log completo para o operador, resposta genérica.
      console.error(`[${nome}] falha inesperada:`, erro)
      return json(
        request,
        { erro: 'erro_interno', mensagem: 'Algo deu errado do nosso lado. Tente de novo em instantes.' },
        500,
      )
    }
  }
}

/**
 * Lê e valida o corpo JSON.
 *
 * Sem limite de tamanho: um corpo gigante é o caminho mais fácil para estourar
 * a memória de uma função serverless.
 */
export async function lerJson(request: Request, limiteBytes = 16 * 1024): Promise<Record<string, unknown>> {
  const bruto = await request.text()
  if (bruto.length > limiteBytes) {
    throw new ErroApp('corpo_grande', 'Dados demais enviados.', 413)
  }
  try {
    // Corpo vazio vira `{}`: dá para chamar uma função que só lê headers sem
    // se preocupar em mandar `{}` na mão.
    return JSON.parse(bruto || '{}')
  } catch {
    throw new ErroApp('json_invalido', 'Não foi possível ler os dados enviados.', 400)
  }
}

/** Gera um id de correlação, para amarrar os logs de uma requisição. */
export function idRequisicao() {
  return crypto.randomUUID().slice(0, 8)
}
