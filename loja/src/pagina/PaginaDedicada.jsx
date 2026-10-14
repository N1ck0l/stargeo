import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { ContentContext } from '../lib/contentContext.js'
import { Hero } from './secoes/Hero.jsx'
import { StarDetails } from './secoes/StarDetails.jsx'
import { SkyMap } from './secoes/SkyMap.jsx'
import { LoveLetter } from './secoes/LoveLetter.jsx'
import { PersonalMessage } from './secoes/PersonalMessage.jsx'
import { ErroApi } from '../lib/api.js'
import { buscarPagina } from '../lib/pagina.js'
import { montarConteudo } from '../lib/conteudoPagina.js'
import { Link } from '../lib/Link.jsx'

/*
 * A mira e o modal entram como chunk separado: quem só lê a carta não baixa
 * a câmera, o `html-to-image` nem o motor da bússola.
 */
const SkyFinder = lazy(() =>
  import('./secoes/SkyFinder.jsx').then((m) => ({ default: m.SkyFinder })),
)
const ModalCertificado = lazy(() => import('./ModalCertificado.jsx').then((m) => ({ default: m.ModalCertificado })))

/**
 * A página dedicada de um cliente — `/p/SG-XXXX-XXXX`.
 *
 * É o site da Geovanna virado produto: os MESMOS componentes do site
 * pessoal, alimentados pela API em vez do `conteudo.json`. O roteador passa o
 * código, `get-page` devolve conteúdo + estrela, e o objeto montado em
 * `montarConteudo` é o que o `ContentContext` distribui — os componentes não
 * sabem que a fonte mudou.
 *
 * Duas peças são da loja, e de propósito: o certificado usa a folha A4 da
 * loja (`CertificadoPreview`, a mesma do PDF) e o rodapé é o da plataforma.
 */
export function PaginaDedicada({ codigo }) {
  const [estado, setEstado] = useState({ fase: 'carregando' })
  const [certificado, setCertificado] = useState(false)
  const [mira, setMira] = useState(false)

  // Troca de código na mesma rota (/p/SG-AAAA-BBBB → /p/SG-CCCC-DDDD): o
  // estado volta ao loading durante a renderização — sem `setState` dentro
  // do efeito, que o lint (e o React) preferem evitar.
  const [codigoAnterior, setCodigoAnterior] = useState(codigo)
  if (codigoAnterior !== codigo) {
    setCodigoAnterior(codigo)
    setEstado({ fase: 'carregando' })
  }

  useEffect(() => {
    let vivo = true
    buscarPagina(codigo)
      .then((dados) => {
        if (vivo) setEstado({ fase: 'pronta', dados })
      })
      .catch((erro) => {
        if (vivo) setEstado({ fase: 'erro', erro })
      })
    return () => {
      vivo = false
    }
  }, [codigo])

  const conteudo = useMemo(
    () =>
      estado.fase === 'pronta'
        ? montarConteudo(estado.dados.pagina, estado.dados.estrela)
        : null,
    [estado],
  )

  if (estado.fase === 'carregando') return <Esqueleto />

  if (estado.fase === 'erro') {
    // 404 (não existe) e código malformado (422 `codigo_invalido`) são a
    // mesma situação para quem está do outro lado: digitou um endereço que
    // não é nosso. Rede e falha de servidor ficam na mensagem genérica.
    const naoExiste =
      estado.erro instanceof ErroApi &&
      (estado.erro.status === 404 || estado.erro.codigo === 'codigo_invalido')
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-32 text-center">
        <p className="font-display text-[11px] tracking-[0.3em] text-gold uppercase">
          Página dedicada
        </p>
        <h1 className="font-serif mt-4 text-3xl text-ivory sm:text-4xl">
          {naoExiste ? 'Este endereço não existe' : 'Não conseguimos abrir a página'}
        </h1>
        <p className="mt-4 text-ivory/65 leading-relaxed">
          {naoExiste
            ? 'Confira o código do registro — o formato é SG-XXXX-XXXX, o mesmo do rastreio.'
            : 'A conexão falhou no meio do caminho. Tente de novo em instantes.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link para="/" className="btn btn-primary text-sm">
            Ir para a loja
          </Link>
          <Link para="/rastrear" className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-ivory/85 transition hover:border-gold hover:text-gold">
            Rastrear pedido
          </Link>
        </div>
      </div>
    )
  }

  const abrirCertificado = () => setCertificado(true)

  return (
    /*
     * Provedor à mão, e não o `ContentProvider` do site pessoal: o conteúdo
     * vem da API (montado em `montarConteudo`), não do `conteudo.json`. O
     * `setContent` vira não-op de propósito — nada muda esta página no lugar;
     * a escrita acontece na rota `/editar`, com token.
     */
    <ContentContext.Provider value={{ content: conteudo, setContent: () => {}, editable: false }}>
      <Hero onOpenCertificate={abrirCertificado} onOpenFinder={() => setMira(true)} />
      <StarDetails onOpenCertificate={abrirCertificado} />
      <SkyMap onOpenCertificate={abrirCertificado} />
      <LoveLetter />
      <PersonalMessage />

      {/* Porta de entrada do cliente: daqui ele vai para o login de edição
          (código + e-mail). Discreto — quem só lê a carta passa reto. */}
      <div className="mx-auto max-w-3xl px-5 pb-14 text-center">
        <Link
          para={`/p/${codigo}/editar`}
          className="text-xs text-ivory/40 transition hover:text-gold"
        >
          Esta página é sua? Entre para editar o texto.
        </Link>
      </div>

      {/* Ambos em `Suspense`: a mira e o modal só baixam o chunk quando abrem. */}
      {mira && (
        <Suspense fallback={null}>
          <SkyFinder onClose={() => setMira(false)} />
        </Suspense>
      )}
      {certificado && (
        <Suspense fallback={null}>
          <ModalCertificado open onClose={() => setCertificado(false)} />
        </Suspense>
      )}
    </ContentContext.Provider>
  )
}

/** Espera com a mesma linguagem visual da loja: estrelas, sem esqueleto cinza. */
function Esqueleto() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <span className="animate-spin-slow inline-block h-10 w-10 rounded-full border border-gold/25 border-t-gold" />
      <p className="font-serif mt-6 text-lg italic text-ivory/60">
        Abrindo a página das estrelas…
      </p>
    </div>
  )
}
