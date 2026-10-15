import { Link } from '../lib/Link.jsx'

/**
 * Políticas — `/politicas`.
 *
 * O que a Stellara entrega, como, quanto tempo leva, o que acontece com o
 * dinheiro e com os dados. Escrito sobre o que a loja FAZ hoje (certificado
 * digital, Mercado Pago, página da estrela), não sobre o que gostaria de
 * fazer: num produto simbólico, a confiança é o produto.
 *
 * Revisar com um advogado antes de vender em escala — ver PENDENCIAS.md.
 */
const CONTATO = 'nickolasfelipe225@gmail.com'

const SECOES = [
  {
    id: 'o-que-e',
    titulo: 'O que você compra',
    paragrafos: [
      'A Stellara oferece uma homenagem simbólica: você escolhe uma estrela real do nosso catálogo e a dedica a alguém. Você recebe um certificado digital personalizado e uma página da estrela, com o mapa do céu e a dedicatória.',
      'A estrela é real e os dados dela vêm de catálogos astronômicos públicos (veja "Dados astronômicos"). O nome dedicado é simbólico: nenhuma empresa pode dar nome oficial a uma estrela — a nomenclatura astronômica cabe à União Astronômica Internacional. O que é exclusivo é a dedicação no catálogo da Stellara: cada estrela é dedicada uma única vez, e depois sai da lista.',
    ],
  },
  {
    id: 'entrega',
    titulo: 'Entrega',
    paragrafos: [
      'O certificado é digital: um PDF em A4, nas versões escura e clara (para imprimir), e uma página da estrela com endereço próprio. Não enviamos certificado impresso, moldura nem embalagem física.',
      'A entrega é automática, logo depois que o Mercado Pago confirma o pagamento — com Pix costuma ser na hora; com cartão, em poucos minutos. A página da estrela fica disponível no endereço que aparece depois da compra e no rastreamento do pedido, onde também dá para baixar o PDF. O link vai para o e-mail informado na compra.',
      'Se algo atrasar, o rastreamento mostra o estado do pedido, e você pode falar com a gente pelo e-mail abaixo informando o código do pedido.',
    ],
  },
  {
    id: 'pagamento',
    titulo: 'Pagamento e preços',
    paragrafos: [
      'O pagamento é feito no Mercado Pago, por Pix ou cartão (em até 12x, com os juros do parcelamento informados pelo Mercado Pago). A Stellara não recebe nem guarda dados do seu cartão.',
      'O preço depende da faixa da estrela (pelo brilho e por ela ter ou não nome próprio) e é mostrado antes de pagar, no resumo do pedido. O valor cobrado é sempre o calculado pelo nosso servidor.',
      'Durante o pagamento, a estrela fica reservada para você por cerca de 30 minutos. Se o pagamento não for concluído nesse prazo, nada é cobrado e a estrela volta ao catálogo.',
    ],
  },
  {
    id: 'arrependimento',
    titulo: 'Arrependimento, cancelamento e reembolso',
    paragrafos: [
      'Você pode desistir da compra em até 7 dias depois do pagamento, como garante o artigo 49 do Código de Defesa do Consumidor. Basta escrever para o e-mail abaixo com o código do pedido. O valor é devolvido pelo mesmo meio de pagamento, pelo Mercado Pago; a estrela volta ao catálogo e a página é retirada do ar.',
      'Errou o nome ou a dedicatória? A carta, a mensagem e a assinatura da página podem ser editadas por você a qualquer momento, em "Editar minha página". Para corrigir o nome de quem recebe ou o nome dado à estrela no certificado, fale com a gente — é sem custo.',
    ],
  },
  {
    id: 'privacidade',
    titulo: 'Privacidade (LGPD)',
    paragrafos: [
      'Usamos só o necessário para fazer e entregar o certificado: seu nome e e-mail (para o pedido, a entrega e o acesso à edição), o nome de quem recebe, o nome dado à estrela, a dedicatória, a data e a assinatura (que vão impressos no certificado e na página da estrela), e os dados do pagamento que o Mercado Pago nos informa (situação e valor — nunca o número do cartão).',
      'Os dados ficam guardados no Supabase (banco de dados e arquivos), o site é servido pela Netlify, o pagamento é processado pelo Mercado Pago e os e-mails são enviados pelo Resend. Não vendemos nem compartilhamos seus dados com outras empresas para publicidade, e o site não usa rastreadores de anúncios.',
      'Para saber se a loja está funcionando, contamos de forma anônima quantas vezes, por dia, alguém abre o site, abre o certificado, começa a personalizar e vai ao pagamento. São só contadores: não usamos cookies, não guardamos IP nem nada que identifique você, e quem ativou "não rastrear" no navegador não é contado.',
      'Depois da compra, você pode escrever um depoimento na edição da sua página. Ele só aparece no site com a sua autorização e depois da nossa revisão, com o nome e a cidade que você escolher — e sai do ar quando você pedir.',
      'Atenção: a página da estrela é pública para quem tiver o endereço — é ela que você manda para quem recebe o presente. Não coloque nela nada que não queira que essa pessoa veja.',
      'Você pode pedir acesso, correção ou exclusão dos seus dados pelo e-mail abaixo.',
    ],
  },
  {
    id: 'dados-astronomicos',
    titulo: 'Dados astronômicos',
    paragrafos: [
      'As posições, o brilho, a distância e o tipo de cada estrela vêm do catálogo Hipparcos, da Agência Espacial Europeia (ESA, 1997), obtido pelo serviço VizieR do Centro de Dados Astronômicos de Estrasburgo. Nomes próprios, designações e as linhas das constelações vêm do projeto d3-celestial (Olaf Frohn). A constelação de cada estrela é calculada pelos limites oficiais da União Astronômica Internacional.',
      'Algumas estrelas fracas não têm distância medida com precisão — nesses casos, o certificado diz isso em vez de mostrar um número inventado.',
    ],
  },
]

export default function Politicas() {
  return (
    <div className="espaco-secao">
      <div className="pilha max-w-3xl">
        <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">Transparência</p>
        <h1 className="font-display mt-4 text-3xl text-ivory sm:text-4xl">Políticas da Stellara</h1>
        <p className="mt-4 leading-relaxed text-ivory/70">
          O que você recebe, quando, como paga e o que fazemos com os seus dados — em português
          direto.
        </p>

        <nav aria-label="Nesta página" className="mt-8 flex flex-wrap gap-2 text-xs">
          {SECOES.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-white/12 px-3 py-1.5 text-ivory/70 transition hover:border-gold/50 hover:text-gold">
              {s.titulo}
            </a>
          ))}
        </nav>

        {SECOES.map((s) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
            <h2 className="font-display text-xl text-ivory sm:text-2xl">{s.titulo}</h2>
            {s.paragrafos.map((texto) => (
              <p key={texto.slice(0, 32)} className="mt-4 leading-relaxed text-ivory/75">
                {texto}
              </p>
            ))}
          </section>
        ))}

        <section id="contato" className="cartao mt-14">
          <h2 className="font-display text-lg text-ivory">Fale com a gente</h2>
          <p className="mt-2 text-sm leading-relaxed text-ivory/70">
            Dúvida, correção ou desistência:{' '}
            <a href={`mailto:${CONTATO}`} className="text-gold hover:underline">
              {CONTATO}
            </a>
            . Se já comprou, informe o código do pedido (SG-XXXX-XXXX). Você também pode{' '}
            <Link para="/rastrear" className="text-gold hover:underline">
              rastrear o pedido
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
