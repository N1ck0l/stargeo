import { STARS } from '../../../shared/stars.js'
import { Folha } from '../components/Folha.jsx'
import { SimboloOficial } from '../components/SimboloOficial.jsx'
import { Link } from '../lib/Link.jsx'
import { reais, useFaixas } from '../lib/catalogo.js'
import { useState } from 'react'
import { Reveal } from '../components/Reveal.jsx'
import { useScroll, useTypewriter } from '../lib/useReveal.js'

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
    'Certificado em PDF de alta resolução',
    'Mapa do céu da constelação',
    'Código de registro único',
    'Entrega por e-mail em minutos',
    'Acesso ao app Mira celeste',
  ],
}

const CONFianca = [
  { titulo: 'Entrega em minutos', texto: 'O certificado sai por e-mail assim que o pagamento cai.' },
  { titulo: 'Estrela exclusiva', texto: 'Cada estrela vai para uma pessoa só — depois, sai do catálogo.' },
  { titulo: '7 dias para desistir', texto: 'Não gostou? Devolvemos, sem pergunta.' },
  { titulo: 'Suporte de verdade', texto: 'Uma pessoa responde, em português, no mesmo dia.' },
]

const FAQ = [
  {
    pergunta: 'Isso é uma estrela de verdade?',
    resposta:
      'A estrela é real e a posição é exata — conferida com o catálogo SIMBAD, o mesmo dos astrônomos. O que não existe é a posse: ninguém compra uma estrela. O que você compra é um documento que registra um nome dedicado a um ponto fixo e verificável no céu.',
  },
  {
    pergunta: 'Consigo ver a estrela no Brasil?',
    resposta:
      'Depende da estrela, e a gente diz antes: cada uma mostra se aparece a olho nu, com binóculo ou só de telescópio, e qual a melhor época. O filtro "Visíveis em todo o Brasil", ligado por padrão na busca, esconde as que nunca sobem acima do nosso horizonte.',
  },
  {
    pergunta: 'Outra pessoa pode ganhar a mesma estrela?',
    resposta:
      'Não pela Stellara: cada estrela do catálogo é dedicada uma única vez e, depois disso, sai da lista. Uma nota honesta — nenhuma empresa dá nome oficial a estrelas (isso é da União Astronômica Internacional). O que é exclusivo é o registro dela no nosso catálogo, a página e o certificado.',
  },
  {
    pergunta: 'Por que as estrelas têm preços diferentes?',
    resposta:
      'São mais de 118 mil, e não são todas iguais: as mais brilhantes e as que têm nome próprio há séculos (Sirius, Vega, Antares…) são poucas e custam mais. As que só aparecem de telescópio são as mais acessíveis — e guardam um céu que pouca gente já viu.',
  },
  {
    pergunta: 'Como recebo?',
    resposta:
      'Por e-mail, em PDF, quase imediatamente depois da confirmação do pagamento. Com Pix, a confirmação costuma levar menos de um minuto. Você também pode baixar de novo pelo link, que fica valendo por 30 dias.',
  },
  {
    pergunta: 'Posso escrever uma mensagem?',
    resposta:
      'Sim, e é a melhor parte. O campo de mensagem aparece na prévia e sai impresso no certificado. Não aceitamos telefone, e-mail ou endereço de rede social: um documento desses pode ser usado para golpe, e não queremos participar disso.',
  },
  {
    pergunta: 'E se eu errar o nome?',
    resposta:
      'Escreva com calma — a prévia mostra exatamente o que vai sair antes de você pagar. Se ainda assim precisar corrigir, é só falar com a gente pelo código do pedido, sem custo.',
  },
  {
    pergunta: 'Dá para imprimir?',
    resposta:
      'O PDF é feito para isso: A4 em alta resolução, com uma versão clara que economiza tinta de jato de tinta. Muita gente imprime e emoldura.',
  },
  {
    pergunta: 'Já comprei, como acesso minha página?',
    resposta:
      'Clique em "Editar minha página" no rodapé, ou venha direto para Editar. Digite o código que veio no e-mail da compra e o e-mail usado no pagamento — a página abre e você ajusta a carta, a assinatura e a mensagem pessoal quando quiser.',
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
      <Hero />
      <Manifesto />
      <Estrelas />
      <Certificado />
      <ComoFunciona />
      <Confianca />
      <Faq />
      <ChamadaFinal />
    </>
  )
}

/**
 * Herói: promessa, dois caminhos (ver o certificado / ver o processo) e os
 * três números que resolvem a primeira objeção — quantas estrelas, quão
 * longe, quão rápido cai o Pix.
 */

function Hero() {
  const scrollY = useScroll()
  const { output: titulo, done: tituloPronto } = useTypewriter('Presente com coordenada')

  /*
   * Parallax: cada camada se move a uma velocidade um pouco diferente, o que
   * dá a sensação de profundidade sem custo de GPU — e some junto com o
   * `fade`, que apaga o herói conforme a pessoa rola para baixo.
   *
   * `useScroll` devolve 0 com movimento reduzido, então o `fade` fica em 1:
   * quem pediu menos movimento vê o herói inteiro, sem apagar.
   */
  const estrelaShift = scrollY * 0.28
  const tituloShift = scrollY * 0.14
  const fade = Math.max(0, 1 - scrollY / 520)

  return (
    <section className="espaco-secao relative overflow-hidden">
      <div className="pilha grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div
          style={{ transform: `translate3d(0, ${tituloShift * 0.3}px, 0)`, opacity: fade }}
        >
          {/*
            A linha é digitada caractere a caractere. Anunciar isso a cada tecla
            seria um spam para quem usa leitor de tela, então a região fica
            oculta do announce e o texto completo é exposto uma vez, quando
            termina. A altura fica reservada para o resto não pular.
          */}
          <Reveal
            as="p"
            delay={80}
            className="min-h-[1.1em] font-display text-xs tracking-[0.3em] text-gold uppercase"
          >
            <span aria-hidden={!tituloPronto}>{titulo}</span>
            {!tituloPronto && <span className="type-cursor" aria-hidden="true" />}
            <span className="sr-only">{tituloPronto ? titulo : ''}</span>
          </Reveal>

          <Reveal
            as="h1"
            delay={220}
            className="font-display mt-5 text-4xl leading-[1.1] text-ivory sm:text-5xl lg:text-6xl"
          >
            Transforme uma homenagem
            <br />
            <span className="gold-text">em algo inesquecível</span>
          </Reveal>

          <Reveal as="p" delay={360} className="mt-6 max-w-lg text-lg leading-relaxed text-ivory/75">
            Nomeie uma estrela e eternize o que realmente importa. Coordenadas reais, conferidas
            com o SIMBAD — o certificado chega por e-mail em minutos.
          </Reveal>

          <Reveal delay={500} className="mt-9 flex flex-wrap gap-4">
            {/*
              Âncora nativa, não `Link`: o destino é uma seção DESTA tela, e
              a rolagem suave do navegador resolve sem trocar de rota. O
              caminho de compra começa na seção do certificado, não aqui —
              o herói apresenta, a seção vende.
            */}
            <a href="#certificados" className="btn btn-primary animate-pulse-glow">
              Criar minha homenagem
            </a>
            <a href="#como-funciona" className="btn btn-secundario">
              Como funciona
            </a>
          </Reveal>

          <Reveal delay={640}>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[
                ['118 mil', 'estrelas no catálogo'],
                ['1', 'pessoa por estrela'],
                ['~1 min', 'para receber por Pix'],
              ].map(([valor, rotulo]) => (
                <div key={rotulo}>
                  <dt className="font-display text-2xl text-gold">{valor}</dt>
                  <dd className="mt-1 text-xs text-ivory/60">{rotulo}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <div
          className="relative"
          style={{ transform: `translate3d(0, ${-estrelaShift * 0.25}px, 0)` }}
        >
          <div
            className="animar-flutuar pointer-events-none absolute -inset-8 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(216,182,106,0.25), transparent 70%)' }}
            aria-hidden="true"
          />
          <EstrelaGrande />
        </div>
      </div>

      {/* Chamada para rolar, que desaparece assim que a pessoa rola. */}
      <a
        href="#certificados"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-ivory/60 transition-opacity duration-500 lg:flex"
        style={{ opacity: fade * 0.9 }}
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
            Escolhemos doze estrelas que se enxergam daqui, conferimos cada coordenada no catálogo
            SIMBAD — o mesmo dos astrônomos — e desenhamos o céu onde elas aparecem. O que fica é um
            ponto fixo no mapa do universo, com um nome escrito do lado.
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
      <div className="pilha grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
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
            {PRODUTO.resumo}: folha A4 em alta resolução, coordenadas conferidas com o SIMBAD e
            código de registro único. Chega por e-mail em minutos.
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
              <p className="mt-1 text-xs text-ivory/45">à vista no Pix ou em até 12x no cartão</p>

              <Link para={`/produto/${PRODUTO.slug}`} className="btn btn-primary mt-6 w-full">
                Montar o meu certificado
              </Link>
              <p className="mt-3 text-center text-xs text-ivory/45">
                Pix, cartão ou boleto · pagamento pelo Mercado Pago
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

            <div className="shimmer-border mx-auto mt-4 max-w-[26rem] overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <Folha estrela={STARS[0]} honoreeName={nome} code="SG-XXXX-XXXX" />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ivory/45">
              A prévia usa as mesmas medidas e as mesmas fontes do PDF que você vai receber. O
              código de registro só é real depois da compra.
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
  // Começa na primeira do catálogo; o botão do painel leva ao produto com a
  // escolha já na URL, para a pessoa não ter que escolher de novo.
  const [selecionada, setSelecionada] = useState(STARS[0])

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
                    mag. {estrela.magnitude.toFixed(2)}
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

            <Link para={`/produto/certificado-digital?estrela=${selecionada.slug}`} className="btn btn-primary mt-7 w-full">
              Dedicá-la a alguém
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
      titulo: 'Escreva o nome',
      texto: 'A prévia mostra o certificado exatamente como vai sair, em tempo real.',
    },
    {
      titulo: 'Pague do seu jeito',
      texto: 'Pix, cartão ou boleto. O preço vem do servidor — nunca da sua tela.',
    },
    {
      titulo: 'Receba por e-mail',
      texto: 'Em minutos você tem o PDF para imprimir, guardar ou emoldurar.',
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
 * Acordeão do FAQ — uma pergunta aberta por vez.
 *
 * `aberta` guarda o índice; `-1` é "nenhuma aberta" e serve para fechar a
 * que está aberta clicando de novo. Começa em `0` porque a primeira pergunta
 * ("isso é uma estrela de verdade?") é o argumento que segura a venda.
 */
function Faq() {
  const [aberta, setAberta] = useState(0)

  return (
    <section id="faq" className="espaco-secao border-t border-white/8">
      <div className="pilha max-w-3xl">
        <Reveal>
          <h2 className="font-display text-center text-3xl text-ivory sm:text-4xl">
            Perguntas frequentes
          </h2>
        </Reveal>

        <Reveal delay={120} className="mt-10 divide-y divide-white/10">
          {FAQ.map((item, i) => {
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
