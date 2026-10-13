import { validarPedido, validarTexto, normalizar, explicarErros } from './moderation.js'

let falhas = 0
const check = (nome, ok, detalhe = '') => {
  if (ok) console.log('ok   ', nome)
  else { console.log('FALHA', nome, detalhe); falhas += 1 }
}

const base = {
  honoreeName: 'Geovanna Beatriz Santos Trindade',
  fromName: 'Com amor, sempre',
  message: 'Que este ano traga tudo aquilo que você deseja.',
  customerName: 'Ana Paula',
  customerEmail: 'ana@exemplo.com.br',
}

console.log('--- deve passar ---')
check('pedido limpo', validarPedido(base).ok, JSON.stringify(validarPedido(base).erros))
check('sem assinatura e sem mensagem', validarPedido({ ...base, fromName: '', message: '' }).ok)
check('acentos e emojis', validarPedido({ ...base, message: 'Você merecia ⭐ tudo de melhor' }).ok)
// "Merda" é cidade do Rio Grande do Sul e apelido comum; está fora da lista
// de propósito. Um filtro que barra isso barra gente comprando de verdade.
check('palavra inocente que soa forte', validarPedido({ ...base, message: 'Cidade de Merda, amei!' }).ok)
check('palavra $|urao daily', validarPedido({ ...base, message: 'Uma ideia excelente, nota 10!' }).ok)

console.log('\n--- deve barrar ---')
const casos = [
  ['contato por telefone', { message: 'Liga no (11) 98765-4321 que a gente conversa' }],
  ['contato por e-mail', { message: 'Fale comigo: ana@exemplo.com' }],
  ['site', { message: 'Veja mais em https://exemplo.com' }],
  ['arroba de rede social', { message: 'Manda um pix no @fulana' }],
  ['chave pix', { message: 'chave pix: 12345678901234567890' }],
  ['termo bloqueado', { message: 'Isso é um caralho de presente' }],
  ['termo com acento trocado', { message: 'fôda se isso aqui' }],
  ['termo em CAIXA ALTA', { message: 'PUTA QUE DÓ' }],
  ['termo sem espaco', { message: 'fodase' }],
  ['termo de odio', { fromName: 'Com amor do nazista' }],
]
for (const [nome, patch] of casos) {
  const r = validarPedido({ ...base, ...patch })
  check(`barrar: ${nome}`, !r.ok, JSON.stringify(r))
}

console.log('\n--- limites ---')
check('nome muito longo', !validarPedido({ ...base, honoreeName: 'A'.repeat(200) }).ok)
check('mensagem muito longa', !validarPedido({ ...base, message: 'x'.repeat(900) }).ok)
check('email invalido', !validarPedido({ ...base, customerEmail: 'nao-e-email' }).ok)
check('email sem arroba', !validarPedido({ ...base, customerEmail: 'ana.exemplo.com' }).ok)

console.log('\n--- normalizacao ---')
check('remove acento', normalizar('Coraçao') === 'coracao', normalizar('Coraçao'))
check('remove caixa', normalizar('NAÇÃO') === 'nacao', normalizar('NAÇÃO'))
check('remove acento+caixa', normalizar('FÓDA-SE') === 'foda-se', normalizar('FÓDA-SE'))

console.log('\n--- explicacao legivel ---')
const r = validarPedido({ ...base, message: 'liga 11987654321' })
const msg = explicarErros(r.erros)
check('nao revela a regra interna', !/termo|padroes|regex/i.test(msg), msg)
check('menciona a mensagem', /mensagem/i.test(msg), msg)
check('campo desconhecido nao quebra', validarTexto('inexistente', 'oi') !== null)

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
