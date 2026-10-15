import { ExploradorDeEstrelas } from '../components/ExploradorDeEstrelas.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { TabelaDeFaixas } from '../components/TabelaDeFaixas.jsx'
import { navegar } from '../lib/rota.js'
import { useMetaPagina } from '../lib/meta.js'

/**
 * O catálogo — `/estrelas`.
 *
 * As ~118 mil estrelas do Hipparcos, cada uma exclusiva: quem escolhe uma
 * aqui segue para o configurador com ela já marcada. As faixas de preço vêm
 * explicadas antes da busca, porque "por que esta custa mais?" é a primeira
 * pergunta de quem vê preços diferentes.
 */
export default function Catalogo() {
  useMetaPagina({
    titulo: 'Catálogo de estrelas · 118 mil estrelas reais | Stellara',
    descricao: 'Busque entre as 118 mil estrelas do catálogo Hipparcos por nome, constelação ou preço. Cada estrela é exclusiva: dedicada, sai do catálogo.',
  })
  return (
    <div className="espaco-secao">
      <div className="pilha">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">O catálogo</p>
          <h1 className="font-display mt-4 text-3xl text-ivory sm:text-4xl">118 mil estrelas reais. Cada uma, de uma pessoa só.</h1>
          <p className="mt-4 leading-relaxed text-ivory/70">
            Todo o catálogo Hipparcos, com coordenadas, distância e constelação de verdade. Quando uma
            estrela é dedicada, ela sai da lista: ninguém mais recebe a mesma.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <TabelaDeFaixas />
        </Reveal>

        <Reveal delay={160} className="mt-10">
          <ExploradorDeEstrelas
            titulo="Buscar uma estrela"
            aoEscolher={(estrela) => navegar(`/produto/certificado-digital?estrela=${encodeURIComponent(estrela.slug)}`)}
          />
        </Reveal>
      </div>
    </div>
  )
}
