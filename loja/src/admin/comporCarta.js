/**
 * Rascunho de carta de campanha — montado AQUI, no navegador, só com o que o
 * painel preencheu. Nenhum texto sai para serviço externo.
 *
 * Regras (as da campanha):
 * - nada inventado: qualidades, trabalho e lembrança entram com as palavras
 *   de quem preencheu; sem elas, a carta fica curta e sincera, sem fingir
 *   intimidade;
 * - tom de colega de trabalho: carinho e reconhecimento, nunca declaração;
 * - não repetir: cada parágrafo tem várias versões, e a escolha depende do
 *   nome e da "versão" pedida — duas pessoas raramente recebem a mesma
 *   combinação, e o painel ainda compara as cartas (`similaridade.js`);
 * - "obrigado/obrigada" fica de fora (marca o gênero de quem escreve).
 *
 * É um ponto de partida: a carta final é a que for revisada no painel.
 */

export const TONS = [
  ['afetuoso', 'Afetuoso'],
  ['elegante', 'Elegante'],
  ['inspirador', 'Inspirador'],
  ['amistoso', 'Amistoso'],
  ['profissional', 'Profissional'],
]

const SAUDACAO = {
  afetuoso: (n) => `Querida ${n},`,
  elegante: (n) => `${n},`,
  inspirador: (n) => `Para ${n},`,
  amistoso: (n) => `Oi, ${n}!`,
  profissional: (n) => `Prezada ${n},`,
}

/** Abertura: a estrela (fato) e o porquê do gesto. */
const ABERTURA = [
  (e) => `Esta estrela, ${e.nome}, na constelação de ${e.constelacao}, foi escolhida para você como uma forma de agradecer por tudo o que você faz por aqui.`,
  (e) => `Quando pensamos em como agradecer a você, a resposta veio do céu: ${e.nome}, em ${e.constelacao}, agora guarda uma homenagem com o seu nome.`,
  (e) => `Lá em ${e.constelacao} existe uma estrela chamada ${e.nome}. A partir de hoje, ela também lembra você — um gesto pequeno para um reconhecimento grande.`,
  (e) => `Escolher uma estrela foi o jeito que encontramos de dizer que o seu trabalho é visto e valorizado. A sua é ${e.nome}, na constelação de ${e.constelacao}.`,
  (e) => `Algumas presenças merecem ser lembradas de um jeito especial. Por isso, ${e.nome}, uma estrela real da constelação de ${e.constelacao}, foi dedicada a você.`,
  (e) => `Nem todo agradecimento cabe em palavras do dia a dia. Este vem do céu: ${e.nome}, em ${e.constelacao}, foi escolhida para homenagear você.`,
]

const QUALIDADES = [
  (q) => `Quem convive com você conhece de perto ${q}.`,
  (q) => `Algumas coisas em você chamam a atenção todos os dias: ${q}.`,
  (q) => `Quero registrar aqui o que admiro em você: ${q}.`,
  (q) => `${maiuscula(q)} — é isso que vem à cabeça quando penso em você.`,
]

const TRABALHO = [
  (t) => `No trabalho, ${t} — e isso não passa despercebido.`,
  (t) => `${maiuscula(t)}: isso faz diferença no nosso dia a dia.`,
  (t) => `No dia a dia da equipe, ${t}. É o tipo de cuidado que torna tudo mais leve.`,
]

const LEMBRANCA = [
  (l) => `Guardo com carinho ${l}.`,
  (l) => `Uma lembrança que fica: ${l}.`,
  (l) => `Lembro bem de ${l}.`,
]

const FECHO = {
  afetuoso: [
    'Que esta estrela te lembre, nas noites claras, do quanto você é especial para nós.',
    'Sempre que olhar para o céu, lembre que tem uma estrela com o seu nome e uma equipe que torce por você.',
  ],
  elegante: [
    'Que ela brilhe como um lembrete do valor do seu trabalho e da sua presença.',
    'Que esta homenagem acompanhe você por muitos anos, como a luz de uma estrela.',
  ],
  inspirador: [
    'Que ela te inspire a seguir brilhando, do seu jeito, em tudo o que faz.',
    'Que a luz dela te lembre de que o seu caminho também ilumina o de outras pessoas.',
  ],
  amistoso: [
    'Quando olhar para o céu, já sabe: tem uma estrela lá em cima que é sua.',
    'Fica aqui o registro, escrito nas estrelas, de que é muito bom ter você por perto.',
  ],
  profissional: [
    'Com reconhecimento e gratidão pela sua dedicação.',
    'Fica o nosso reconhecimento pelo seu trabalho e pelo seu compromisso com a equipe.',
  ],
}

function maiuscula(texto) {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}

/** Texto do painel → fragmento para o meio da frase (sem ponto final, sem espaços sobrando). */
function fragmento(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().replace(/[.!;]+$/, '')
}

/** Inteiro estável a partir de um texto (FNV-1a): o mesmo nome dá o mesmo rascunho. */
function semente(texto) {
  let h = 2166136261
  for (const ch of texto) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return h >>> 0
}

/**
 * @param {{ nome: string, tom?: string, qualidades?: string, profissional?: string, lembranca?: string,
 *           estrela: { nome: string, constelacao: string }, versao?: number }} dados
 * @returns {string} a carta, um parágrafo por linha (o formato do editor)
 */
export function comporCarta({ nome, tom = 'elegante', qualidades, profissional, lembranca, estrela, versao = 0 }) {
  const n = fragmento(nome) || 'você'
  const s = semente(`${n}|${versao}`)
  const escolher = (lista, deslocamento) => lista[(s + deslocamento * 7919) % lista.length]
  const q = fragmento(qualidades)
  const t = fragmento(profissional)
  const l = fragmento(lembranca)

  const linhas = [(SAUDACAO[tom] ?? SAUDACAO.elegante)(n), escolher(ABERTURA, 1)(estrela)]
  if (q) linhas.push(escolher(QUALIDADES, 2)(q))
  if (t) linhas.push(escolher(TRABALHO, 3)(t))
  if (l) linhas.push(escolher(LEMBRANCA, 4)(l))
  linhas.push(escolher(FECHO[tom] ?? FECHO.elegante, 5))
  return linhas.join('\n')
}
