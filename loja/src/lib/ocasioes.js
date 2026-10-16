/**
 * Ocasiões de presente — e sugestões de dedicatória para cada uma.
 *
 * Servem para quem chega sem saber o que escrever: na home, a pessoa escolhe
 * o momento; no configurador (`?ocasiao=`), as sugestões aparecem embaixo do
 * campo da mensagem. Toque usa, e o texto continua editável — é ponto de
 * partida, não modelo pronto.
 *
 * As frases respeitam a moderação (`shared/moderation.js`): sem contato, sem
 * link, bem abaixo do limite de 600 caracteres.
 */
export const OCASIOES = [
  {
    slug: 'pedido-de-namoro',
    titulo: 'Pedido de namoro',
    frase: 'Para fazer a pergunta de um jeito que ela nunca vai esquecer.',
    sugestoes: [
      'Escolhi uma estrela para fazer uma pergunta: quer namorar comigo?',
      'Entre milhares de estrelas, escolhi esta — do mesmo jeito que escolhi você.',
    ],
  },
  {
    slug: 'aniversario-de-namoro',
    titulo: 'Aniversário de namoro',
    frase: 'Cada ano juntos merece um ponto fixo no céu.',
    sugestoes: [
      'Mais um ano ao seu lado. Que esta estrela guarde todos os que ainda vêm.',
      'Para lembrar do dia em que tudo começou — e de tudo o que construímos desde então.',
    ],
  },
  {
    slug: 'casamento',
    titulo: 'Casamento',
    frase: 'Uma estrela para marcar o dia do sim.',
    sugestoes: [
      'Hoje o céu ganhou mais um motivo para brilhar: nós.',
      'Que a nossa história seja tão duradoura quanto a luz desta estrela.',
    ],
  },
  {
    slug: 'dia-dos-namorados',
    titulo: 'Dia dos Namorados',
    frase: 'Fugir das flores e do chocolate, com significado.',
    sugestoes: [
      'Flores murcham, chocolate acaba. Esta estrela vai continuar brilhando por você.',
      'Você é a minha estrela preferida. Agora o céu também sabe disso.',
    ],
  },
  {
    slug: 'aniversario',
    titulo: 'Aniversário',
    frase: 'Um presente que ninguém mais vai dar.',
    sugestoes: [
      'Feliz aniversário! Que a sua luz continue iluminando todo mundo à sua volta.',
      'Hoje o céu tem uma estrela com o seu nome. Feliz aniversário.',
    ],
  },
  {
    slug: 'homenagem',
    titulo: 'Homenagem',
    frase: 'Para alguém que merece ser lembrado para sempre.',
    sugestoes: [
      'Para quem iluminou o nosso caminho. Você continua brilhando em nós.',
      'Uma estrela para lembrar, todas as noites, de alguém que nunca vamos esquecer.',
    ],
  },
  {
    slug: 'sem-motivo',
    titulo: 'Sem motivo',
    frase: 'Porque às vezes o melhor presente não tem data.',
    sugestoes: [
      'Não precisava de motivo. Só queria que você soubesse o quanto é especial para mim.',
      'Uma estrela, sem data especial, só para dizer: obrigado por existir.',
    ],
  },
]

/** Sugestões quando a pessoa não veio de uma ocasião. */
export const SUGESTOES_GERAIS = [
  'Que esta estrela seja um lembrete eterno do lugar especial que você ocupa no meu universo.',
  'Que esta estrela te lembre, todas as noites, do quanto você é amada.',
  'Mesmo longe, a gente olha para o mesmo céu.',
  'Um presente que representa o que as palavras nem sempre conseguem dizer.',
]

export function ocasiaoPorSlug(slug) {
  return OCASIOES.find((o) => o.slug === slug) ?? null
}
