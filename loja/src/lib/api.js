/**
 * Cliente das Edge Functions.
 *
 * Todo o acesso ao backend passa por aqui, e sempre por POST — inclusive as
 * consultas. Um `GET /track-order?code=...` colocaria código e e-mail na URL,
 * que acaba em histórico de navegador, log de servidor e `Referer` para o
 * site de onde a pessoa veio.
 */

const BASE = import.meta.env.VITE_FUNCTIONS_URL

/** Erro com o código estável que a função devolveu. */
export class ErroApi extends Error {
  constructor(codigo, mensagem, status) {
    super(mensagem)
    this.name = 'ErroApi'
    this.codigo = codigo
    this.status = status
  }
}

/**
 * Se a URL das funções não estiver configurada, avisar é melhor do que
 * deixar a pessoa preencher o formulário inteiro e falhar só no "finalizar".
 */
function base() {
  if (!BASE) {
    throw new ErroApi(
      'sem_configuracao',
      'A loja ainda não foi configurada. Veja o arquivo .env.example.',
      0,
    )
  }
  return BASE.replace(/\/$/, '')
}

async function chamar(caminho, corpo) {
  const resposta = await fetch(`${base()}/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  })

  let dados = null
  try {
    dados = await resposta.json()
  } catch {
    // Resposta sem JSON: normalmente a função caiu antes de tratar o erro.
  }

  if (!resposta.ok) {
    throw new ErroApi(
      dados?.erro ?? 'erro_desconhecido',
      dados?.mensagem ?? 'Algo deu errado. Tente de novo em instantes.',
      resposta.status,
    )
  }

  return dados
}

/**
 * Cria o pedido e devolve o ponto de pagamento.
 *
 * @param {object} entrada
 * @param {string} entrada.productSlug
 * @param {string} entrada.starSlug
 * @param {string} entrada.honoreeName
 * @param {string} [entrada.message]
 * @param {string} [entrada.fromName]
 * @param {string} [entrada.dedicationDate]  ISO, YYYY-MM-DD
 * @param {string} entrada.customerEmail
 * @param {string} entrada.customerName
 */
export function criarCheckout(entrada) {
  return chamar('create-checkout', entrada)
}

/** Consulta um pedido pelo código + e-mail. */
export function rastrear({ code, email }) {
  return chamar('track-order', { code, email })
}

/**
 * Envia o checkout para a página do Mercado Pago.
 *
 * A preferência já existe; aqui só é um redirecionamento. O redirecionar (e
 * não renderizar o Brick) é o que mantém o site sem nenhum código de cartão:
 * ninguém digita número de cartão dentro da nossa página.
 */
export function irParaPagamento(initPoint) {
  window.location.assign(initPoint)
}
