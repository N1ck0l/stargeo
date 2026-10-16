import { nomeDoArquivo } from './certificado.js'

/**
 * A carta que acompanha o certificado: os modelos do formulário e o "Baixar
 * a carta (PDF)" da página.
 *
 * Os modelos são PONTOS DE PARTIDA, para quem trava na folha em branco: um
 * toque preenche o campo, e tudo continua editável. Escritos sem marcar o
 * gênero de quem dá nem de quem recebe ("obrigado/obrigada" fica de fora), e
 * sem prometer o que a estrela não é — ela é uma homenagem, não uma posse.
 * A primeira linha curta vira a saudação na folha.
 */
export const MODELOS_DE_CARTA = [
  {
    rotulo: 'Amor',
    texto: [
      'Meu amor,',
      'Escolhi uma estrela para você porque não encontrei outro jeito de mostrar o tamanho do que sinto. Ela estava lá muito antes de a gente se conhecer — e vai continuar lá em todas as noites que ainda vamos dividir.',
      'Quando o dia pesar, olhe para o céu e lembre: tem um pedaço dele guardado para você, escolhido por alguém que te admira em cada detalhe.',
      'Que bom que você existe no meu universo.',
    ].join('\n'),
  },
  {
    rotulo: 'Família',
    texto: [
      'Para você, que me ensinou a olhar para o alto,',
      'Nenhum presente cabe tudo o que você fez por mim, então escolhi um que não cabe em lugar nenhum: uma estrela de verdade, lá no céu.',
      'Que ela te lembre, nas noites tranquilas e nas difíceis, que existe uma família inteira feliz por ter você.',
    ].join('\n'),
  },
  {
    rotulo: 'Amizade',
    texto: [
      'Para quem esteve lá em todas as fases,',
      'Amizade como a nossa é rara — dessas que a gente encontra uma vez e guarda para sempre. Por isso escolhi uma estrela: algo que dura, que brilha mesmo de longe e que está sempre no mesmo lugar.',
      'Que sorte a minha ter você por perto em cada conversa, em cada risada e em cada vez que você apareceu sem eu precisar pedir.',
    ].join('\n'),
  },
  {
    rotulo: 'Saudade',
    texto: [
      'Para quem continua brilhando,',
      'Algumas pessoas não vão embora: só mudam de lugar. Escolhi esta estrela para lembrar a sua luz — a mesma que ainda ilumina quem ficou.',
      'Sempre que alguém olhar para o céu, vai ter um motivo para sorrir com saudade.',
    ].join('\n'),
  },
]

/**
 * Gera o PDF da carta NO NAVEGADOR e baixa o arquivo — o mesmo caminho do
 * certificado (`baixarPdf`): o gerador de `shared/pdf.js`, carregado só no
 * clique, com as fontes em TTF.
 *
 * @param {{ paragrafos: string[] | string, titulo?: string, fromName?: string, honoreeName?: string, estrela?: { name?: string }, code?: string }} carta
 * @param {{ claro?: boolean }} [opcoes]
 */
export async function baixarCarta(carta, { claro = false } = {}) {
  const { buildLetterPdf } = await import('../../../shared/pdf.js')
  const bytes = await buildLetterPdf(
    {
      paragrafos: carta.paragrafos,
      titulo: carta.titulo,
      fromName: carta.fromName,
      honoreeName: carta.honoreeName,
      starName: carta.estrela?.name,
      code: carta.code,
    },
    { light: claro, fontBaseUrl: '', formatoFonte: 'ttf' },
  )

  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nomeDoArquivo(carta, claro ? 'claro' : '', 'pdf').replace(/^certificado-/, 'carta-')
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
