/**
 * Moderação do texto que o cliente escreve no certificado.
 *
 * O certificado é entregue por e-mail, e quem paga escreve nele. Isso abre
 * três problemas práticos, e os três já aconteceram em lojas desse tipo:
 *
 * 1. **Golpe.** O certificado sai com o nome e a assinatura de quem compra, e
 *    a pessoa pode colocar telefone, e-mail ou @Instagram. O documento
 *    impresso vira um convite para o consumidor final cair em uma fraude. O
 *    filtro de contato é o que fecha essa porta.
 *
 * 2. **Conteúdo impróprio.** Ódio e sexualização explícita não são o que uma
 *    loja de presente quer entregar — e, no Brasil, responder por isso custa
 *    caro.
 *
 * 3. **Promessa impossível.** Frases com milhares de caracteres não cabem no
 *    papel, e o cliente descobriria isso depois de pagar.
 *
 * A regra de ouro: **rejeitar, nunca editar silenciosamente**. Trocar a
 * palavra do cliente sem avisar entrega um presente que ele não escreveu, e
 * isso é pior que recusar. A validação roda na criação do pedido (a pessoa
 * corrige antes de pagar) e de novo no webhook (defesa em profundidade).
 *
 * Arquivo em `shared/` porque as duas Edge Functions precisam da MESMA regra.
 * Se a validação do checkout fosse mais frouxa que a da entrega, o buraco
 * voltaria pela metade do caminho.
 */

/**
 * Limites por campo.
 *
 * Os números vêm do espaço físico: o bloco de mensagem tem ~150 mm de largura
 * a 11 pt, o que cabe em ~8 linhas de ~70 caracteres. Acima disso, ou o
 * desenho encolhe, ou o texto invade a moldura.
 */
export const LIMITES = {
  honoreeName: { min: 2, max: 80 },
  fromName: { min: 2, max: 60 },
  // Nome dado à estrela: uma linha no certificado, em corpo grande.
  starNickname: { min: 2, max: 40 },
  message: { min: 1, max: 600 },
  customerName: { min: 2, max: 120 },
  customerEmail: { min: 5, max: 254 },
}

/**
 * Termos bloqueados.
 *
 * Comparados SEM acentos e sem caixa, porque "foda-se" e "foda se" precisam
 * cair igual. A lista é curta e genérica de propósito: um filtro grande e
 * automático bloqueia "Merda" (cidade do Rio Grande do Sul) e nomes que as
 * pessoas usam sem má-fé. O objetivo é pegar o óbvio e os termos de ódio, não
 * ser um dicionário.
 *
 * Um filtro automático também NÃO é suficiente sozinho: as listas públicas
 * erram nos dois sentidos. Por isso a validação tem uma porta de escape
 * explícita (allowlist por e-mail no banco), para o caso de um pedido legítimo
 * ser barrado — o dinheiro já foi pago, e o pedido não pode ficar preso.
 */
const TERMOS_BLOQUEADOS = [
  // Sexual explícito
  'porn', 'porno', 'puta', 'foda', 'fodase', 'foda se', 'caralho', 'cacete',
  'buceta', 'xereca', 'pussy', 'blowjob', 'sexo anal',
  // Ódio e discriminação
  'nigger', 'nigga', 'faggot', 'retardado', 'deficiente', 'idiota', 'imbecil',
  'racista', 'racismo', 'nazista', 'hitler',
  // Drogas e crime
  'cocaina', 'metanfetamina', 'drogail', 'traficante',
  // Contato e promessa de pagamento fora da loja
  'me chama no zap', 'chama no zap', 'chame no zap', 'zap é', 'zap e',
]

/**
 * Padrões que indicam tentativa de contato — o vetor de fraude.
 *
 * Deliberadamente agressivo: no certificado não há motivo legítimo para
 * telefone, endereço de e-mail, site ou @. Uma única ocorrência barra.
 *
 * As regex rodam sobre o texto LIMPO (sem normalizar acentos): telefone,
 * e-mail e URL não têm acento, e testar no original mantém as expressões
 * legíveis. Os TERMOS_BLOQUEADOS, que dependem de caixa/acento, são os que
 * passam pela normalização.
 */
const PADROES_CONTATO = [
  // Telefone brasileiro nas formas mais comuns: DDD com ou sem parênteses,
  // espaços ou hífens entre os grupos, e o +55 opcional. Exemplos que casam:
  // "(11) 98765-4321", "11987654321", "+55 11 3333-4444". Datas e códigos
  // postais não caem aqui: a regex exige 4-5 dígitos seguidos de mais 4.
  { nome: 'telefone', re: /(?:\+?\d{1,2}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/ },
  // E-mail: parte local @ domínio ponto TLD (2+ letras). Case-insensitive.
  { nome: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  // URL: http(s):// ou www., pegando o resto da linha. Só o "www." já é
  // suficiente para ser redirecionamento.
  { nome: 'site', re: /\b(?:https?:\/\/|www\.)\S+/i },
  // @ de rede social: no início do texto ou depois de espaço, com 3+ chars.
  // O @ de um e-mail é pego antes, pelo padrão "email" — a ordem do array
  // importa, e o loop devolve no primeiro que casa.
  { nome: 'arroba', re: /(^|\s)@[a-z0-9._]{3,}/i },
  // Chave pix, nas duas formas: a palavra "pix" seguida de hash hex (chave
  // aleatória/EVM curta) OU um UUID completo (formato oficial de chave pix
  // aleatória, 8-4-4-4-12 em hex).
  { nome: 'chave pix', re: /\b(?:pix)\b.*\b[a-f0-9]{8,}\b|\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i },
]

/** Remove acentos e caixa, para comparar texto de forma estável. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    // Faixa de diacriticos combinantes (U+0300-U+036F) escrita como escape:
    // o caractere literal e invisivel e some na revisao de codigo.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Colapsa espaços repetidos e quebras de linha em branco excessivas. */
export function limpar(texto) {
  return String(texto ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((linha) => linha.trim())
    .join('\n')
    .trim()
}

/**
 * @typedef {object} Resultado
 * @property {boolean} ok
 * @property {Array<{campo: string, motivo: string}>} erros
 */

/**
 * Valida um campo de texto livre com limite conhecido.
 *
 * @param {string} campo
 * @param {string} valor
 * @returns {string|null} mensagem de erro, ou null se estiver tudo bem
 */
export function validarTexto(campo, valor) {
  const limite = LIMITES[campo]
  if (!limite) return `campo desconhecido: ${campo}`
  return validarTextoLivre(valor, limite)
}

/**
 * Valida texto com limite arbitrário — o caminho dos textos de PÁGINA.
 *
 * A página dedicada não imprime estes textos, mas passa pelas mesmas duas
 * regras por motivos iguais: termo de ódio e tentativa de contato não ficam
 * melhores só porque o suporte é web. O tamanho, que no certificado é limite
 * físico de papel, aqui é só um teto contra abuso de espaço.
 *
 * @param {string} valor
 * @param {{min?: number, max: number}} limite
 * @returns {string|null} mensagem de erro, ou null se estiver tudo bem
 */
export function validarTextoLivre(valor, { min = 0, max }) {
  const limpo = limpar(valor)

  if (limpo.length < min) return `campo vazio ou curto demais`
  if (limpo.length > max) return `passa de ${max} caracteres (tem ${limpo.length})`

  const normalizado = normalizar(limpo)

  for (const termo of TERMOS_BLOQUEADOS) {
    if (normalizado.includes(normalizar(termo))) {
      return `contém termo não permitido`
    }
  }

  for (const { nome, re } of PADROES_CONTATO) {
    if (re.test(limpo)) {
      return `não pode conter ${nome} — o certificado é impresso e usado como documento`
    }
  }

  return null
}

/**
 * Valida o pedido inteiro.
 *
 * @param {object} pedido
 * @returns {Resultado}
 */
export function validarPedido(pedido) {
  const erros = []

  const checar = (campo, valor) => {
    // Campos opcionais são pulados quando vazios.
    const opcional = campo === 'fromName' || campo === 'message' || campo === 'starNickname'
    if (opcional && !limpar(valor)) return
    const erro = validarTexto(campo, valor)
    if (erro) erros.push({ campo, motivo: erro })
  }

  checar('honoreeName', pedido.honoreeName)
  checar('fromName', pedido.fromName)
  checar('starNickname', pedido.starNickname)
  checar('message', pedido.message)

  if (!pedido.customerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(pedido.customerEmail).trim())) {
    erros.push({ campo: 'customerEmail', motivo: 'endereço de e-mail inválido' })
  }

  checar('customerName', pedido.customerName)

  return { ok: erros.length === 0, erros }
}

/**
 * Uma versão curta e legível para mostrar à pessoa.
 *
 * Mensagens de erro que dizem qual regra interna foi quebrada ajudam quem
 * quer burlar. Esta diz o que fazer.
 */
export function explicarErros(erros) {
  if (erros.length === 0) return ''
  const campos = [...new Set(erros.map((e) => e.campo))]
  const nomes = {
    honoreeName: 'o nome de quem recebe',
    fromName: 'a assinatura',
    starNickname: 'o nome da estrela',
    message: 'a mensagem',
    customerName: 'o nome do comprador',
    customerEmail: 'o e-mail',
  }
  return `Não foi possível continuar: revise ${campos.map((c) => nomes[c] ?? c).join(', ')}.`
}
