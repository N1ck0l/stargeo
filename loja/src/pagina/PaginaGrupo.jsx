import { useEffect, useState } from 'react'
import { MapaCeuInteiro } from '../components/MapaCeuInteiro.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { SimboloOficial } from '../components/SimboloOficial.jsx'
import { ErroApi } from '../lib/api.js'
import { Link } from '../lib/Link.jsx'
import { buscarGrupo } from '../lib/pagina.js'
import { PaginaGuardada } from './PaginaGuardada.jsx'

/**
 * A página de um grupo de estrelas — `/g/GR-XXXX-XXXX` (migration 0021).
 *
 * Todas as estrelas compradas juntas no MESMO céu (projeção do céu inteiro,
 * `MapaCeuInteiro`), ligadas na ordem da compra: a constelação que só aquelas
 * pessoas têm. Abaixo, cada estrela leva à página da pessoa. Antes da data de
 * revelação, a contagem regressiva (a mesma da página individual).
 */
export function PaginaGrupo({ codigo }) {
  const [estado, setEstado] = useState({ fase: 'carregando' })

  useEffect(() => {
    let vivo = true
    Promise.all([buscarGrupo(codigo), import('../../../shared/ceu.js')])
      .then(([dados, ceu]) => vivo && setEstado({ fase: 'pronta', dados, ceu }))
      .catch((erro) => vivo && setEstado({ fase: 'erro', erro }))
    return () => {
      vivo = false
    }
  }, [codigo])

  if (estado.fase === 'carregando') return <div className="espaco-secao min-h-[70vh]" aria-busy="true" />

  if (estado.fase === 'erro') {
    const naoExiste = estado.erro instanceof ErroApi && (estado.erro.status === 404 || estado.erro.codigo === 'codigo_invalido')
    return (
      <div className="pilha espaco-secao text-center">
        <h1 className="font-serif text-3xl text-ivory">{naoExiste ? 'Este endereço não existe' : 'Não conseguimos abrir agora'}</h1>
        <p className="mt-3 text-ivory/65">
          {naoExiste ? 'Confira o endereço do grupo — o formato é GR-XXXX-XXXX.' : 'Tente de novo em instantes.'}
        </p>
        <Link para="/" className="btn btn-primary mt-8">
          Ir para a loja
        </Link>
      </div>
    )
  }

  const { dados, ceu } = estado
  if (dados.guardada) {
    return (
      <PaginaGuardada
        revelaEm={dados.guardada.revelaEm}
        codigo={null}
        titulo={`${dados.guardada.total} estrelas esperam por ${dados.nome ? dados.nome : 'vocês'}`}
      />
    )
  }

  // O nome do grupo vai SOZINHO no título: "A constelação de Família Souza"
  // pediria o artigo certo ("da", "dos", "de"), que não dá para adivinhar.
  const titulo = dados.nome || 'Uma constelação só de vocês'

  return (
    <div className="espaco-secao">
      <div className="pilha">
        <Reveal className="text-center">
          <SimboloOficial className="mx-auto w-16" />
          <p className="mt-6 font-display text-[11px] tracking-[0.3em] text-gold/80 uppercase">
            A constelação · {dados.estrelas.length} estrelas, dedicadas juntas
          </p>
          <h1 className="mt-3 font-serif text-4xl text-ivory sm:text-5xl">{titulo}</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-ivory/65">
            Cada estrela é de uma pessoa — e todas estão no mesmo céu. O traço dourado liga as estrelas na ordem em
            que foram dedicadas: uma constelação que só existe para vocês.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          {/* No celular a elipse inteira ficaria pequena demais para ler os
              nomes: o mapa ganha largura mínima e rola de lado. */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <MapaCeuInteiro
              ceu={ceu}
              estrelas={dados.estrelas.map((e) => ({ ra: e.ra, dec: e.dec, rotulo: e.para, nome: e.estrela }))}
              className="mx-auto w-full max-w-5xl min-w-[640px]"
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-ivory/45 sm:hidden">Arraste para ver o céu inteiro →</p>
          <p className="mt-3 text-center text-[11px] text-ivory/45">
            O céu inteiro, com o norte em cima e o leste à esquerda. Estrelas até a magnitude 5 e as 88 constelações.
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dados.estrelas.map((e, i) => (
            <Reveal as="li" key={e.pagina} delay={i * 80}>
              <Link
                para={`/p/${e.pagina}`}
                className="cartao block h-full transition hover:border-gold/50"
              >
                <p className="font-display text-[11px] tracking-[0.25em] text-gold/80 uppercase">A estrela de {e.para}</p>
                <p className="mt-2 font-serif text-2xl text-ivory">{e.estrela}</p>
                <p className="mt-1 text-sm text-ivory/55">
                  {e.bayer} · {e.constelacao}
                </p>
                <p className="mt-4 text-sm text-gold">Ver a página de {e.para} →</p>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </div>
  )
}
