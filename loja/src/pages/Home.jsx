import { STARS, getStar } from '../../../shared/stars.js'
import { Folha } from '../components/Folha.jsx'
import { TabelaDeFaixas } from '../components/TabelaDeFaixas.jsx'
import { Vitrine } from '../components/Vitrine.jsx'
import { OCASIOES } from '../lib/ocasioes.js'
import { SimboloOficial } from '../components/SimboloOficial.jsx'
import { Link } from '../lib/Link.jsx'
import { EMAIL_ATIVO } from '../lib/config.js'
import { buscarDepoimentos, estadoDasEstrelas, reais, useFaixas } from '../lib/catalogo.js'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Reveal } from '../components/Reveal.jsx'
import { useTypewriter } from '../lib/useReveal.js'
import { useParallaxDoTopo } from '../lib/parallax.js'

/**
 * Home da loja.
 *
 * Antes de ser um site de vendas, esta página é de APRESENTAÇÃO: quem chega
 * ainda não sabe o que é "dedicar uma estrela", então ela primeiro mostra a
 * ideia (manifesto), o céu (as 12 estrelas) e o OBJETO — a folha do
 * certificado, com prévia ao vivo digitando o nome — e só depois explica como
 * funciona, por que confiar e quanto custa. A ordem das seções é essa, e é a
 * ordem em que a dúvida aparece.
 *
 * As animações são as MESMAS do site pessoal: céu por trás, revelação por
 * rolagem, parallax do herói, máquina de escrever e brilho nas bordas.
 *
 * Papel na arquitetura: é a rota raiz do roteador em `loja/src/App.jsx`
 * (`telaPara` devolve `<Home />` para qualquer caminho desconhecido), e é
 * export default deste arquivo. Todo o resto é interno: `Hero`, `Manifesto`,
 * `Estrelas` e cia. não são importados de lugar nenhum.
 *
 * Invariantes: o preço de `PRODUTO` é de EXIBIÇÃO (o cobrado é decidido pelo
 * servidor no `create-checkout`, e uma divergência aqui não muda o valor da
 * compra); o `slug` de `PRODUTO` é o único que existe — o mesmo de
 * `pages/Produto.jsx` e do banco (os outros níveis ficaram desligados na
 * migration 0007); os 12 `slug` de estrela batem com `shared/stars.js`, que é
 * de onde vêm nome, magnitude e história; e nada aqui pode esconder conteúdo
 * de quem pediu movimento reduzido — as revelações nascem visíveis nesse
 * caso (ver `lib/useReveal.js`).
 */

/**
 * O produto à venda.
 *
 * O preço não mora aqui: cada estrela tem a faixa dela (brilho e nome), e o
 * cartão mostra "a partir de" — a faixa mais barata, lida do banco. `inclui` é
 * a lista que a pessoa lê antes de decidir.
 */
const PRODUTO = {
  slug: 'certificado-digital',
  nome: 'Certificado Digital',
  resumo: 'O essencial, na hora',
  inclui: [
    'Certificado em PDF, A4 — versão escura e versão clara para imprimir',
    'Uma carta sua, na mesma identidade, em PDF próprio para guardar',
    'Nome de quem recebe, sua dedicatória, a data e a sua assinatura',
    'O mapa do céu real em volta da estrela',
    'Uma página da estrela para compartilhar, com o mapa e a Mira celeste',
    'Estrela exclusiva e código de registro único',
    'Pronto logo após a confirmação do pagamento',
  ],
}

/**
 * A folha de exemplo do herói. Nome, mensagem e assinatura INVENTADOS — é um
 * exemplo de personalização, rotulado como tal para leitores de tela, não um
 * cliente.
 */
const EXEMPLO = {
  estrela: getStar('vega'),
  nome: 'Helena Martins',
  mensagem: 'Para lembrar que, mesmo longe, a gente olha para o mesmo céu.',
  assinatura: 'Com amor, Rafael',
  data: '12 de junho de 2026',
}

/** Os três jeitos de ver a folha (`Vitrine`): na tela, na parede, no papel. */
const MODOS_VITRINE = [
  ['tela', 'Na tela'],
  ['moldura', 'Emoldurado'],
  ['impressao', 'Para imprimir'],
]

/** Hoje, por extenso — a data de exemplo da prévia. */
const semAssinatura = () => () => {}
const dataDeHoje = () => new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

const CONFianca = [
  { titulo: 'Pronto em minutos', texto: 'Confirmado o pagamento, a página da estrela e o PDF ficam prontos.' },
  { titulo: 'Estrela exclusiva', texto: 'Cada estrela vai para uma pessoa só — depois, sai do catálogo.' },
  { titulo: 'Homenagem simbólica', texto: 'Estrela real, nome simbólico — e isso vem escrito no próprio certificado.' },
  { titulo: 'Pagamento seguro', texto: 'Pix ou cartão pelo Mercado Pago. Os dados do cartão nunca passam por nós.' },
  { titulo: '7 dias para desistir', texto: 'Direito de arrependimento, como garante o Código de Defesa do Consumidor.' },
]

const FAQ = [
  {
    grupo: 'produto',
    pergunta: 'Isso é uma estrela de verdade?',
    resposta:
      'A estrela é real, e a posição vem do catálogo Hipparcos, da Agência Espacial Europeia — uma das medições mais precisas já feitas do céu. O nome é simbólico: ninguém é dono de uma estrela, e nenhuma empresa dá nome oficial a elas (isso cabe à União Astronômica Internacional). O que você recebe é uma homenagem: o certificado e a página que dedicam aquela estrela, no catálogo da Stellara, a quem você escolheu.',
  },
  {
    grupo: 'produto',
    pergunta: 'Consigo ver a estrela no Brasil?',
    resposta:
      'Depende da estrela, e a gente diz antes: cada uma mostra se aparece a olho nu, com binóculo ou só de telescópio, e qual a melhor época. O filtro "Visíveis em todo o Brasil", ligado por padrão na busca, esconde as que nunca sobem acima do nosso horizonte.',
  },
  {
    grupo: 'produto',
    pergunta: 'Outra pessoa pode ganhar a mesma estrela?',
    resposta:
      'Não pela Stellara: cada estrela do catálogo é dedicada uma única vez e, depois disso, sai da lista. Uma nota honesta — nenhuma empresa dá nome oficial a estrelas (isso é da União Astronômica Internacional). O que é exclusivo é o registro dela no nosso catálogo, a página e o certificado.',
  },
  {
    grupo: 'produto',
    pergunta: 'Por que as estrelas têm preços diferentes?',
    resposta:
      'São mais de 118 mil, e não são todas iguais: as mais brilhantes e as que têm nome próprio há séculos (Sirius, Vega, Antares…) são poucas e custam mais. As que só aparecem de telescópio são as mais acessíveis — e guardam um céu que pouca gente já viu.',
  },
  {
    grupo: 'entrega',
    pergunta: 'Como recebo?',
    resposta:
      'Assim que o pagamento é confirmado (com Pix, costuma ser na hora), a página da sua estrela fica pronta: lá você vê o certificado, baixa o PDF nas versões escura e clara (e o da carta, se escreveu uma) e pega o link para enviar a quem vai receber.' +
      (EMAIL_ATIVO ? ' O link também vai para o e-mail da compra.' : ''),
  },
  {
    grupo: 'entrega',
    pergunta: 'O que é a carta que vem junto?',
    resposta:
      'Uma segunda peça do presente: o certificado representa a estrela, e a carta, o que você sente. Na compra você escreve o que quiser (até 2.000 caracteres, ou comece por um modelo) e vê a prévia ao lado; ela sai num PDF A4 próprio, na mesma identidade do certificado, e vira a carta da página da estrela. Comprando mais de uma estrela, você escolhe: a mesma carta para todos ou uma para cada pessoa. É opcional e não custa nada a mais. É texto pessoal: só quem tem o link da página lê, e ele nunca é usado em divulgação.',
  },
  {
    grupo: 'entrega',
    pergunta: 'Vocês enviam o certificado impresso?',
    resposta:
      'Ainda não: o certificado é digital, em PDF A4 de alta resolução, pensado para imprimir em casa ou numa gráfica rápida e caber nas molduras de papelaria. A versão clara gasta pouca tinta e fica muito bonita em papel fosco.',
  },
  {
    grupo: 'pagamento',
    pergunta: 'E se o pagamento não for aprovado?',
    resposta:
      'Nada é cobrado. A estrela fica reservada para você por 30 minutos enquanto paga; se o pagamento não acontecer, ela volta ao catálogo e você pode tentar de novo.',
  },
  {
    grupo: 'pagamento',
    pergunta: 'O que vocês fazem com os meus dados?',
    resposta:
      'Só o necessário para fazer e entregar o certificado: seu nome, seu e-mail e o texto que você escreve. Os dados do cartão ficam com o Mercado Pago. Os detalhes estão em Políticas, no rodapé.',
  },
  {
    grupo: 'produto',
    pergunta: 'Dá para dar estrelas para várias pessoas?',
    resposta:
      'Dá, até 6 numa compra: no produto, use "Adicionar outra pessoa". Cada pessoa ganha a própria estrela, o próprio certificado e a própria página, e todas aparecem juntas numa página do grupo, no mesmo céu. Desconto: 2 estrelas, 10%; 3, 15%; 4 a 6, 20% — num pagamento só.',
  },
  {
    grupo: 'entrega',
    pergunta: 'Posso comprar antes e entregar no dia?',
    resposta:
      'Pode. Marque "Guardar a surpresa até uma data" e escolha o dia. Você recebe o certificado na hora; a página da estrela mostra só uma contagem regressiva até a data — dá para mandar o link antes, num cartão ou numa mensagem, sem estragar a surpresa.',
  },
  {
    grupo: 'produto',
    pergunta: 'Posso dar um nome à estrela?',
    resposta:
      'Pode. É opcional: escreva um nome como "Nossa Luz" no campo "Um nome para a estrela" e ele sai no certificado ("chamada, nesta homenagem, de…") e na página. É um nome simbólico, desta homenagem — nos catálogos dos astrônomos, a estrela continua com o nome oficial, que também aparece na folha.',
  },
  {
    grupo: 'entrega',
    pergunta: 'Posso escrever uma mensagem?',
    resposta:
      'Sim, e é a melhor parte. O campo de mensagem aparece na prévia e sai impresso no certificado. Não aceitamos telefone, e-mail ou endereço de rede social: um documento desses pode ser usado para golpe, e não queremos participar disso.',
  },
  {
    grupo: 'depois',
    pergunta: 'E se eu errar o nome?',
    resposta:
      'Escreva com calma — a prévia mostra exatamente o que vai sair antes de você pagar. Se ainda assim precisar corrigir, é só falar com a gente pelo código do pedido, sem custo.',
  },
  {
    grupo: 'entrega',
    pergunta: 'Dá para imprimir?',
    resposta:
      'O PDF é feito para isso: A4 em alta resolução, com uma versão clara que economiza tinta de jato de tinta. Muita gente imprime e emoldura.',
  },
  {
    grupo: 'depois',
    pergunta: 'Já comprei, como acesso minha página?',
    resposta:
      'Clique em "Editar minha página" no rodapé, ou venha direto para Editar. Digite o código do pedido (' + (EMAIL_ATIVO ? 'veio no e-mail da compra' : 'aparece no fim da compra e no endereço da página, depois de /p/') + ') e o e-mail usado no pagamento — a página abre e você ajusta a carta, a assinatura e a mensagem pessoal quando quiser.',
  },
]

/**
 * Faz a luz do `.spotlight` seguir o ponteiro dentro do cartão.
 *
 * Só mexe em custom properties — quem anima é o CSS, e o navegador não
 * precisa reavaliar a árvore a cada movimento.
 */
function seguirPonteiro(evento) {
  const alvo = evento.currentTarget
  const caixa = alvo.getBoundingClientRect()
  alvo.style.setProperty('--mx', `${evento.clientX - caixa.left}px`)
  alvo.style.setProperty('--my', `${evento.clientY - caixa.top}px`)
}

/**
 * Sequência de seções da vitrine: o que é (herói), a ideia (manifesto), o
 * céu (estrelas), o objeto (certificado com prévia ao vivo), como funciona,
 * garantias, objeções (FAQ) e a última chamada. Apresentação antes de preço.
 */
export default function Home() {
  return (
    <>
      {/* A ordem é a da decisão de compra: a promessa, o OBJETO (a folha),
          a escolha da estrela com os preços, o processo, e só então a pausa
          emocional e a confiança. Ver a folha antes de tudo é o que liga a
          emoção do herói ao produto. */}
      <Hero />
      <Certificado />
      <Estrelas />
      <Ocasioes />
      <ComoFunciona />
      <Manifesto />
      <Confianca />
      <Depoimentos />
      <Faq />
      <ChamadaFinal />
    </>
  )
}

/**
 * A linha digitada do topo ("Presente com coordenada"), num componente só
 * dela: cada letra redesenha ESTE pedaço, não o topo inteiro com a folha.
 *
 * Anunciar letra a letra seria spam para leitor de tela: a região fica oculta
 * enquanto digita e o texto completo é exposto uma vez, no fim. A altura fica
 * reservada para nada pular.
 */
function LinhaDigitada({ texto }) {
  const { output, done } = useTypewriter(texto)
  return (
    <p className="min-h-[1.1em] font-display text-xs tracking-[0.3em] text-gold uppercase">
      <span aria-hidden={!done}>{output}</span>
      {!done && <span className="type-cursor" aria-hidden="true" />}
      <span className="sr-only">{done ? output : ''}</span>
    </p>
  )
}

/**
 * Herói: promessa, dois caminhos (ver o certificado / ver o processo) e os
 * três números que resolvem a primeira objeção — quantas estrelas, quão
 * longe, quão rápido cai o Pix.
 */

function Hero() {
  /*
   * Sem animação de entrada no topo: o título e o texto aparecem NA HORA.
   * Com elas (opacidade 0 até o efeito terminar), o navegador só dava a
   * página por pintada ~4 s depois no celular (Lighthouse, LCP) — e é isso
   * que o anúncio pago cobra. O movimento fica para o resto da página.
   */
  const textoRef = useRef(null)
  const arteRef = useRef(null)
  const rolarRef = useRef(null)
  useParallaxDoTopo(textoRef, arteRef, rolarRef)

  return (
    <section className="espaco-secao relative overflow-hidden">
      <div className="pilha grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div ref={textoRef} className="will-change-transform">
          <LinhaDigitada texto="Presente com coordenada" />

          <h1
            className="font-display mt-5 text-[2.15rem] leading-[1.12] text-ivory sm:text-5xl lg:text-[3.4rem]"
          >
            Alguns sentimentos merecem um lugar{' '}
            <span className="gold-text">entre as estrelas</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-ivory/75 sm:text-lg">
            Dedique uma estrela real a alguém especial e receba um certificado personalizado — com o
            nome, a sua dedicatória e o céu onde ela brilha. Fica pronto em minutos, para guardar,
            imprimir e emoldurar.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            {/*
              O principal vai DIRETO à personalização: quem já decidiu não
              precisa rolar a página inteira. O secundário fica na página,
              descendo até o certificado (âncora nativa, rolagem suave).
            */}
            <Link para="/produto/certificado-digital" className="btn btn-primary animate-pulse-glow">
              Criar minha homenagem
            </Link>
            <a href="#certificados" className="btn btn-secundario">
              Conhecer a experiência
            </a>
          </div>

          {/* O produto em três passos, para quem decide em segundos. */}
          <ol className="mt-8 flex max-w-lg flex-wrap gap-x-5 gap-y-2 text-sm text-ivory/80">
            {['Escolha uma estrela', 'Personalize a homenagem', 'Receba o certificado'].map((passo, i) => (
              <li key={passo} className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full border border-gold/50 font-display text-xs text-gold">
                  {i + 1}
                </span>
                {passo}
              </li>
            ))}
          </ol>

          <div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[
                ['118 mil', 'estrelas reais no catálogo'],
                ['1', 'pessoa por estrela'],
                ['Minutos', 'do pagamento ao certificado'],
              ].map(([valor, rotulo]) => (
                <div key={rotulo}>
                  <dt className="font-display text-2xl text-gold">{valor}</dt>
                  <dd className="mt-1 text-xs text-ivory/60">{rotulo}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div ref={arteRef} className="relative will-change-transform">
          {/* Brilho atrás da folha: o degradê já é suave. Ele tinha um
              desfoque grande (`blur-3xl`) animado sem parar — no iPhone, a
              coisa mais cara de desenhar na rolagem do topo. */}
          <div
            className="animar-flutuar pointer-events-none absolute -inset-8 rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, rgba(216,182,106,0.25), transparent 70%)' }}
            aria-hidden="true"
          />
          {/* A estrela da marca ao fundo e, à frente, O PRODUTO: uma folha de
              exemplo, levemente inclinada, como um presente sobre a mesa. Na
              primeira dobra a pessoa já vê o que vai receber. */}
          <div className="relative mx-auto max-w-md">
            <div className="opacity-60 sm:opacity-80">
              <EstrelaGrande />
            </div>
            <div className="absolute inset-x-[17%] top-[7%] origin-bottom -rotate-[3deg] overflow-hidden rounded-[3px] shadow-[0_30px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(216,182,106,0.35)] transition-transform duration-700 hover:rotate-0">
              <Folha
                estrela={EXEMPLO.estrela}
                honoreeName={EXEMPLO.nome}
                message={EXEMPLO.mensagem}
                fromName={EXEMPLO.assinatura}
                dedicationDate={EXEMPLO.data}
                code="SG-XXXX-XXXX"
              />
            </div>
            <p className="sr-only">
              Exemplo de certificado: a estrela {EXEMPLO.estrela.name} dedicada a {EXEMPLO.nome}.
            </p>
          </div>
        </div>
      </div>

      {/* Chamada para rolar, que desaparece assim que a pessoa rola. */}
      <a
        href="#certificados"
        aria-hidden="true"
        tabIndex={-1}
        ref={rolarRef}
        className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-ivory/60 opacity-90 transition-opacity duration-500 lg:flex"
      >
        <span className="text-[10px] tracking-[0.3em] uppercase">Rolar</span>
        <span className="block h-8 w-px bg-gradient-to-b from-gold to-transparent" />
      </a>
    </section>
  )
}

/**
 * A estrela do herói: o mostrador (anéis e raios) gira devagar por trás, e o
 * símbolo oficial fica DE PÉ por cima, só pulsando o brilho. Antes a estrela
 * girava junto com tudo e aparecia em "X" — outra estrela, não a da marca.
 */
function EstrelaGrande() {
  // Posições fixas: são seis pontos de luz, não um campo — aleatoriedade aqui
  // só faria a cena mudar a cada render.
  const fagulhas = [
    { topo: '8%', esquerda: '22%', atraso: '0s' },
    { topo: '18%', esquerda: '78%', atraso: '0.9s' },
    { topo: '46%', esquerda: '6%', atraso: '1.8s' },
    { topo: '72%', esquerda: '88%', atraso: '2.5s' },
    { topo: '86%', esquerda: '34%', atraso: '1.2s' },
    { topo: '34%', esquerda: '92%', atraso: '3.1s' },
  ]

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-sm items-center justify-center">
      <span
        className="animate-spin-slow absolute inset-0 rounded-full border border-gold/20"
        aria-hidden="true"
      />
      <span
        className="animate-spin-slow absolute inset-6 rounded-full border border-dashed border-gold/15 [animation-direction:reverse] [animation-duration:34s]"
        aria-hidden="true"
      />

      {fagulhas.map((f) => (
        <span
          key={`${f.topo}-${f.esquerda}`}
          className="animate-twinkle absolute size-1.5 rounded-full bg-gold-soft"
          style={{ top: f.topo, left: f.esquerda, animationDelay: f.atraso }}
          aria-hidden="true"
        />
      ))}

      <svg viewBox="0 0 200 200" className="animar-girar w-full" aria-hidden="true">
        <defs>
          <radialGradient id="brilho">
            <stop offset="0%" stopColor="#eadfb6" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#d8b66a" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#d8b66a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="95" fill="url(#brilho)" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="#d8b66a" strokeWidth="0.5" opacity="0.35" />
        <circle cx="100" cy="100" r="38" fill="none" stroke="#d8b66a" strokeWidth="0.4" opacity="0.25" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 24
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * 38}
              y1={100 + Math.sin(a) * 38}
              x2={100 + Math.cos(a) * 62}
              y2={100 + Math.sin(a) * 62}
              stroke="#d8b66a"
              strokeWidth="0.6"
              opacity="0.4"
            />
          )
        })}
      </svg>

      <SimboloOficial className="animate-shimmer absolute w-[62%] drop-shadow-[0_0_24px_rgba(216,182,106,0.35)]" />
    </div>
  )
}

/**
 * Manifesto: a ideia antes de qualquer preço.
 *
 * A pausa mágica entre o herói e o catálogo — a frase da marca em corpo
 * grande, sem botão e sem form. Quem chegou curioso lê isto e só depois
 * encontra o produto; o rodapé repete a mesma frase em corpo miúdo.
 */
function Manifesto() {
  return (
    <section className="border-t border-white/8">
      <div className="pilha max-w-3xl py-20 text-center sm:py-24">
        <Reveal>
          <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">A ideia</p>
          <p className="font-serif mt-6 text-3xl leading-snug text-ivory sm:text-4xl">
            Ninguém é dono de uma estrela.
            <br />
            Mas todo mundo pode dedicar <span className="gold-text italic">uma</span>.
          </p>
        </Reveal>

        <Reveal delay={140}>
          <p className="mx-auto mt-7 max-w-2xl leading-relaxed text-ivory/70">
            São mais de 118 mil estrelas reais, com a posição medida pelo satélite Hipparcos, e o
            céu desenhado onde cada uma aparece. O que fica é um ponto fixo no mapa do universo,
            com um nome escrito do lado — e mais ninguém com aquela estrela.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Faixa de garantias: as quatro objeções de quem compra presente
 * (entrega, visibilidade, desistência, suporte) respondidas antes que a
 * pessoa precise perguntar.
 */
function Confianca() {
  return (
    <section className="border-t border-white/8 bg-white/[0.02]">
      <div className="pilha grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-5">
        {CONFianca.map((item, i) => (
          <Reveal key={item.titulo} delay={i * 90} className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" className="mt-0.5 shrink-0 text-gold" aria-hidden="true">
              <path
                d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"
                fill="currentColor"
              />
            </svg>
            <div>
              <h2 className="text-sm font-medium text-ivory">{item.titulo}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ivory/55">{item.texto}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/**
 * Depoimentos de quem comprou — REAIS: vêm da edição da página de um pedido
 * pago, com autorização do comprador e aprovação no painel (migration 0018).
 * Enquanto não houver nenhum aprovado, a seção não existe: nada de texto de
 * exemplo nem "clientes satisfeitos" inventados.
 */
function Depoimentos() {
  const [lista, setLista] = useState([])
  useEffect(() => {
    let vivo = true
    buscarDepoimentos()
      .then((r) => vivo && setLista(Array.isArray(r) ? r : []))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  if (!lista.length) return null

  return (
    <section aria-labelledby="depoimentos-titulo" className="espaco-secao">
      <div className="pilha">
        <Reveal as="h2" id="depoimentos-titulo" className="text-center font-serif text-3xl text-ivory sm:text-4xl">
          Quem já deu uma estrela
        </Reveal>
        <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {lista.map((d, i) => (
            <Reveal as="li" key={d.id} delay={i * 90} className="cartao flex flex-col">
              <blockquote className="flex-1 font-serif text-lg leading-relaxed text-ivory/85 italic">“{d.texto}”</blockquote>
              <p className="mt-5 text-sm text-gold/85">
                {d.nome_exibicao}
                {d.cidade ? <span className="text-ivory/45"> · {d.cidade}</span> : null}
              </p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * O produto apresentado — a folha em si.
 *
 * `id="certificados"` é a âncora do botão "Rolar" e do "Ver o certificado"
 * do herói: se o id mudar, as duas chamadas apontam para o nada.
 *
 * A prévia é a MESMA folha do configurador (`CertificadoPreview` dentro de
 * `Produto`), e o campo de nome atualiza ela a cada tecla — a pessoa vê o
 * objeto antes de pensar em preço. Só depois vêm o cartão com o que está
 * incluso e o valor: apresentação primeiro, venda em seguida. É a mesma
 * ordem no celular (a folha nasce por cima, via `order-1`).
 */
function Certificado() {
  const [nome, setNome] = useState('')
  const [modo, setModo] = useState('tela')
  // A data de hoje é de quem está vendo, não do build: na montagem sobre a
  // home pré-renderizada ela vem vazia (igual ao HTML) e entra em seguida.
  const hoje = useSyncExternalStore(semAssinatura, dataDeHoje, () => '')
  const faixas = useFaixas()
  const aPartirDe = Math.min(...faixas.map((f) => f.precoCentavos))

  return (
    <section id="certificados" className="espaco-secao border-t border-white/8">
      <div className="pilha">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">O certificado</p>
          <h2 className="font-display mt-4 text-3xl text-ivory sm:text-4xl">
            Um ponto fixo no céu, com o nome de quem você ama
          </h2>
          <p className="mt-4 leading-relaxed text-ivory/70">
            {PRODUTO.resumo}: folha A4 em alta resolução, com as coordenadas reais da estrela, o
            mapa do céu em volta dela e um código de registro único. Pronto em minutos.
          </p>
        </Reveal>

        <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
          {/* --- Cartão do que vem junto (esquerda no desktop) --------------- */}
          <Reveal delay={260} className="order-2 lg:order-1">
            <div className="tilt spotlight cartao h-fit" onPointerMove={seguirPonteiro}>
              <h3 className="font-display text-xl text-ivory">O que vem junto</h3>

              <ul className="mt-5 space-y-3">
                {PRODUTO.inclui.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-ivory/75">
                    <svg width="16" height="16" viewBox="0 0 24 24" className="mt-0.5 shrink-0 text-gold" aria-hidden="true">
                      <path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-7 flex items-baseline gap-3 border-t border-white/10 pt-6">
                <span className="text-sm text-ivory/50">a partir de</span>
                <span className="font-display text-3xl text-ivory">{reais(aPartirDe)}</span>
              </div>
              <p className="mt-1 text-xs text-ivory/45">
                O preço depende da estrela · Pix ou cartão em até 12x
              </p>

              <Link para={`/produto/${PRODUTO.slug}`} className="btn btn-primary mt-6 w-full">
                Montar o meu certificado
              </Link>
              <p className="mt-3 text-center text-xs text-ivory/45">
                Certificado digital — não enviamos impresso. Pagamento seguro pelo Mercado Pago.
              </p>
            </div>
          </Reveal>

          {/* --- Módulo ao vivo: nome digitado → folha (direita no desktop) --- */}
          <Reveal delay={130} className="order-1 lg:order-2">
            <label htmlFor="nome-ao-vivo" className="rotulo">
              Escreva um nome e veja a folha ganhar vida
            </label>
            <input
              id="nome-ao-vivo"
              className="campo"
              type="text"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              placeholder="Ex.: Maria Fernanda"
              maxLength={80}
            />

            {/* Como vai ser na vida real: na tela, na parede, no papel. */}
            <div role="group" aria-label="Como ver o certificado" className="mt-4 flex justify-center gap-1.5">
              {MODOS_VITRINE.map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setModo(valor)}
                  aria-pressed={modo === valor}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                    modo === valor
                      ? 'border-gold/70 bg-gold/15 text-gold'
                      : 'border-white/12 text-ivory/70 hover:border-white/30'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="mx-auto mt-4 max-w-[26rem]">
              <Vitrine
                modo={modo}
                estrela={getStar('antares')}
                honoreeName={nome}
                message={nome ? 'Que esta estrela te lembre, todas as noites, do quanto você é amada.' : ''}
                fromName={nome ? 'Com amor' : ''}
                dedicationDate={hoje}
                code="SG-XXXX-XXXX"
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ivory/45">
              É a mesma folha do PDF que você recebe, com as mesmas medidas e fontes. Na compra você
              escolhe a estrela e escreve a sua própria dedicatória; o código de registro só existe
              depois do pagamento.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/**
 * Estrelas em destaque (as 12 curadas, com história escrita à mão) com o
 * painel de detalhe ao lado, e a porta para o catálogo completo.
 *
 * São botões, não links: a seleção troca o painel sem trocar de rota, e
 * `aria-pressed` diz a quem navega por teclado ou leitor de tela qual está
 * ativa. O painel é `sticky` para a história acompanhar a rolagem da grade.
 */
function Estrelas() {
  // Começa numa estrela livre; o botão do painel leva ao produto com a
  // escolha já na URL, para a pessoa não ter que escolher de novo.
  const [selecionada, setSelecionada] = useState(getStar('sirius'))
  // Estado de cada destaque no banco: estrela dedicada não é oferecida (a
  // Kaus Australis, por exemplo, é o presente que deu origem à Stellara).
  const [estados, setEstados] = useState({})
  useEffect(() => {
    let vivo = true
    estadoDasEstrelas(STARS.map((e) => e.slug))
      .then((r) => vivo && setEstados(r))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  const dedicada = (slug) => estados[slug] === 'dedicada'

  return (
    <section id="estrelas" className="espaco-secao border-t border-white/8">
      <div className="pilha">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl text-ivory sm:text-4xl">Estrelas em destaque</h2>
          <p className="mt-4 leading-relaxed text-ivory/70">
            Algumas das mais famosas do céu do Brasil — e mais de 118 mil outras no catálogo, cada
            uma exclusiva. Clique para ver a história.
          </p>
          <Link para="/estrelas" className="btn btn-secundario mt-6">
            Explorar o catálogo completo
          </Link>
        </Reveal>

        {/* A oferta clara antes do checkout: o preço depende da estrela. */}
        <Reveal delay={100} className="mt-12">
          <TabelaDeFaixas />
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_320px]">
          <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {STARS.map((estrela) => {
              const ativa = estrela.slug === selecionada.slug
              return (
                <button
                  key={estrela.slug}
                  type="button"
                  onClick={() => setSelecionada(estrela)}
                  aria-pressed={ativa}
                  className={`rounded-2xl border p-4 text-left transition ${
                    ativa
                      ? 'border-gold/70 bg-gold/10 shadow-[0_0_24px_rgba(216,182,106,0.15)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                  }`}
                >
                  <span className="block font-serif text-base leading-tight text-ivory">{estrela.name}</span>
                  <span className="mt-1 block text-xs text-gold/70">{estrela.bayer}</span>
                  <span className="mt-2 block text-[11px] text-ivory/45">
                    {dedicada(estrela.slug) ? 'Já dedicada' : `mag. ${estrela.magnitude.toFixed(2)}`}
                  </span>
                </button>
              )
            })}
          </Reveal>

          <Reveal delay={160} className="cartao h-fit lg:sticky lg:top-24">
            <h3 className="font-serif text-2xl text-ivory">{selecionada.name}</h3>
            <p className="mt-1 text-sm text-gold/80">
              {selecionada.bayer} · {selecionada.constellation}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ivory/70">{selecionada.story}</p>

            <dl className="mt-6 space-y-2.5 border-t border-white/10 pt-5 text-sm">
              {[
                ['Distância', selecionada.distanceLy ? `${selecionada.distanceLy} anos-luz` : 'não medida'],
                ['Tipo', selecionada.spectralType],
                ['Melhor época', selecionada.bestMonth],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between gap-4">
                  <dt className="text-ivory/50">{rotulo}</dt>
                  <dd className="text-right text-ivory/85">{valor}</dd>
                </div>
              ))}
            </dl>

            {dedicada(selecionada.slug) ? (
              <p className="mt-7 rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-ivory/65">
                Esta estrela já foi dedicada a alguém — cada uma é de uma pessoa só.{' '}
                <Link para="/estrelas" className="text-gold hover:underline">
                  Ver as que estão livres
                </Link>
              </p>
            ) : (
              <Link para={`/produto/certificado-digital?estrela=${selecionada.slug}`} className="btn btn-primary mt-7 w-full">
                Dedicá-la a alguém
              </Link>
            )}
            <Link para={`/estrelas/${selecionada.slug}`} className="mt-3 block text-center text-xs text-gold/80 hover:underline">
              Conhecer a história de {selecionada.name}
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/**
 * Os quatro passos, na mesma ordem em que acontecem.
 *
 * O terceiro (`O preço vem do servidor`) não é texto de enfeite: é a
 * promessa que `Produto.jsx` cumpre — o número impresso aqui não é o que a
 * pessoa paga.
 */
function ComoFunciona() {
  const passos = [
    {
      titulo: 'Escolha a estrela',
      texto: 'Busque entre 118 mil estrelas por nome ou constelação — ou deixe o céu escolher por você.',
    },
    {
      titulo: 'Personalize',
      texto: 'O nome de quem recebe, a sua dedicatória, a data e a assinatura. A prévia mostra a folha exatamente como vai sair.',
    },
    {
      titulo: 'Pague com segurança',
      texto: 'Pix ou cartão em até 12x, pelo Mercado Pago. A estrela fica reservada para você enquanto paga.',
    },
    {
      titulo: 'Receba e presenteie',
      texto: 'Logo após a confirmação, a página da estrela fica pronta, com o PDF para baixar e o link para enviar a quem você ama.',
    },
  ]

  return (
    <section id="como-funciona" className="espaco-secao border-t border-white/8">
      <div className="pilha">
        <Reveal>
          <h2 className="font-display text-center text-3xl text-ivory sm:text-4xl">Como funciona</h2>
        </Reveal>

        <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {passos.map((passo, i) => (
            <Reveal as="li" key={passo.titulo} delay={i * 110} className="relative">
              <span className="font-display flex size-10 items-center justify-center rounded-full border border-gold/50 text-lg text-gold">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg text-ivory">{passo.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory/65">{passo.texto}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * Para cada história: o momento do presente leva ao configurador já com
 * sugestões de dedicatória daquela ocasião (`?ocasiao=`). Ajuda quem chega
 * sem saber o que escrever — sem empurrar data nem urgência.
 */
function Ocasioes() {
  return (
    <section id="ocasioes" className="espaco-secao border-t border-white/8">
      <div className="pilha">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">Para cada história</p>
          <h2 className="font-display mt-4 text-3xl text-ivory sm:text-4xl">Qual é o momento?</h2>
          <p className="mt-4 leading-relaxed text-ivory/70">
            Escolha a ocasião e a gente sugere algumas dedicatórias para começar — você muda o que
            quiser.
          </p>
        </Reveal>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OCASIOES.map((o, i) => (
            <Reveal as="li" key={o.slug} delay={i * 60}>
              <Link
                para={`/produto/certificado-digital?ocasiao=${o.slug}`}
                className="cartao group block h-full transition hover:border-gold/50"
              >
                <span className="font-serif text-lg text-ivory transition group-hover:text-gold">{o.titulo}</span>
                <span className="mt-2 block text-sm leading-relaxed text-ivory/60">{o.frase}</span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * Acordeão do FAQ — uma pergunta aberta por vez.
 *
 * `aberta` guarda o índice; `-1` é "nenhuma aberta" e serve para fechar a
 * que está aberta clicando de novo. Começa em `0` porque a primeira pergunta
 * ("isso é uma estrela de verdade?") é o argumento que segura a venda.
 */
/**
 * Os assuntos do FAQ, na ordem da decisão de compra: primeiro o que é o
 * produto (as dúvidas que decidem), depois entrega, pagamento e o pós-venda.
 * Com 15 perguntas, a lista inteira cansava; uma aba por vez, não.
 */
const ASSUNTOS_FAQ = [
  ['produto', 'O produto'],
  ['entrega', 'Certificado e entrega'],
  ['pagamento', 'Pagamento e dados'],
  ['depois', 'Depois da compra'],
]

function Faq() {
  const [assunto, setAssunto] = useState('produto')
  const [aberta, setAberta] = useState(0)
  const perguntas = FAQ.filter((item) => item.grupo === assunto)

  return (
    <section id="faq" className="espaco-secao border-t border-white/8">
      <div className="pilha max-w-3xl">
        <Reveal>
          <h2 className="font-display text-center text-3xl text-ivory sm:text-4xl">
            Perguntas frequentes
          </h2>
        </Reveal>

        <div role="group" aria-label="Assunto das perguntas" className="mt-8 flex flex-wrap justify-center gap-2">
          {ASSUNTOS_FAQ.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setAssunto(id)
                setAberta(0)
              }}
              aria-pressed={assunto === id}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                assunto === id ? 'border-gold/70 bg-gold/15 text-gold' : 'border-white/12 text-ivory/70 hover:border-white/30'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <Reveal delay={120} className="mt-6 divide-y divide-white/10">
          {perguntas.map((item, i) => {
            const abertaAqui = aberta === i
            return (
              <div key={item.pergunta}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setAberta(abertaAqui ? -1 : i)}
                    aria-expanded={abertaAqui}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="text-ivory/90">{item.pergunta}</span>
                    {/* Girado 45° quando aberta, a cruz vira `×`: o mesmo
                        desenho diz "dá para fechar", sem precisar de um
                        segundo ícone. */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className={`shrink-0 text-gold transition-transform ${abertaAqui ? 'rotate-45' : ''}`}
                    >
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </h3>
                {abertaAqui && (
                  <p className="animate-fade-in pb-5 leading-relaxed text-ivory/65">{item.resposta}</p>
                )}
              </div>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}

/**
 * Última chamada, sempre para o configurador — não existe página de
 * catálogo sem produto nesta loja.
 */
function ChamadaFinal() {
  return (
    <section className="espaco-secao">
      <div className="pilha">
        <Reveal>
          <div className="shimmer-border rounded-3xl border border-gold/30 bg-gold/[0.06] px-8 py-14 text-center">
            <h2 className="font-display text-3xl text-ivory">Comece pelo nome de quem recebe</h2>
            <p className="mx-auto mt-4 max-w-lg leading-relaxed text-ivory/70">
              Leva menos de dois minutos, e você vê o certificado pronto antes de pagar qualquer
              coisa.
            </p>
            <Link para="/produto/certificado-digital" className="btn btn-primary animate-pulse-glow mt-8">
              Criar minha homenagem
            </Link>
            {/* Quem já comprou não quer um segundo certificado — quer a
                página daquele. O atalho sai do mesmo bloco, em tamanho de
                leitura, sem disputar o botão principal. */}
            <p className="mt-6 text-sm text-ivory/55">
              Já é seu?{' '}
              <Link para="/editar" className="text-gold transition hover:underline">
                Acesse sua página para editar o texto
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
