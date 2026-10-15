import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { ContentContext } from '../lib/contentContext.js'
import { Hero } from './secoes/Hero.jsx'
import { StarDetails } from './secoes/StarDetails.jsx'
import { SkyMap } from './secoes/SkyMap.jsx'
import { LoveLetter } from './secoes/LoveLetter.jsx'
import { PersonalMessage } from './secoes/PersonalMessage.jsx'
import { ErroApi } from '../lib/api.js'
import { buscarPagina, tokenGuardado } from '../lib/pagina.js'
import { PaginaGuardada } from './PaginaGuardada.jsx'
import { CompartilharPagina } from '../components/CompartilharPagina.jsx'
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
    // O céu inteiro (estrelas até mag 5 e as 88 constelações) chega junto,
    // sob demanda: é dele que sai o mapa de qualquer estrela do catálogo.
    Promise.all([buscarPagina(codigo, tokenGuardado(codigo)), import('../../../shared/ceu.js')])
      .then(([dados, ceu]) => {
        if (vivo) setEstado({ fase: 'pronta', dados, ceu })
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
      estado.fase === 'pronta' && !estado.dados.guardada
        ? { ...montarConteudo(estado.dados.pagina, estado.dados.estrela, estado.ceu), grupo: estado.dados.grupo ?? null }
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

  // Antes da data de revelação, quem não é a dona vê só a contagem.
  if (estado.dados.guardada) {
    return <PaginaGuardada revelaEm={estado.dados.guardada.revelaEm} para={estado.dados.guardada.para} codigo={codigo} />
  }

  const abrirCertificado = () => setCertificado(true)
  const revelaEm = estado.dados.pagina?.revelaEm
  // Sessão de edição neste navegador = a dona está olhando.
  const dona = Boolean(tokenGuardado(codigo))

  return (
    /*
     * Provedor à mão, e não o `ContentProvider` do site pessoal: o conteúdo
     * vem da API (montado em `montarConteudo`), não do `conteudo.json`. O
     * `setContent` vira não-op de propósito — nada muda esta página no lugar;
     * a escrita acontece na rota `/editar`, com token.
     */
    <ContentContext.Provider value={{ content: conteudo, setContent: () => {}, editable: false }}>
      {revelaEm && (
        <p
          role="status"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-night/95 px-4 py-2.5 text-center text-xs text-ivory/80 backdrop-blur"
        >
          Prévia só para você: quem abrir o link antes de{' '}
          {new Date(`${revelaEm}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })} vê a
          contagem regressiva.
        </p>
      )}
      <Hero onOpenCertificate={abrirCertificado} onOpenFinder={() => setMira(true)} />
      <StarDetails onOpenCertificate={abrirCertificado} />
      <SkyMap onOpenCertificate={abrirCertificado} />
      <LoveLetter />
      <PersonalMessage />

      {/* Grupo de estrelas (0020/0021): o caminho até as outras e o céu de todas. */}
      {conteudo.grupo && <OutrasDoGrupo grupo={conteudo.grupo} />}

      {/* Porta de entrada do cliente: daqui ele vai para o login de edição
          (código + e-mail). Discreto — quem só lê a carta passa reto. */}
      <div className="mx-auto max-w-3xl px-5 pb-14 text-center">
        {dona ? (
          <>
          <CompartilharPagina
            codigo={codigo}
            para={conteudo?.nomeCurto}
            revelaEm={revelaEm}
            className="mb-5"
          />
          <p className="text-xs text-ivory/55">
            <Link para={`/p/${codigo}/editar`} className="transition hover:text-gold">
              Editar a página
            </Link>
            <span className="mx-2 text-ivory/25">·</span>
            <Link para={`/p/${codigo}/editar#depoimento`} className="text-gold/80 transition hover:text-gold">
              Conte como foi a entrega
            </Link>
            <span className="mx-2 text-ivory/25">·</span>
            <Link para={`/p/${codigo}/cartao`} className="transition hover:text-gold">
              Cartão com QR para imprimir
            </Link>
          </p>
          </>
        ) : (
          <Link
            para={`/p/${codigo}/editar`}
            className="text-xs text-ivory/40 transition hover:text-gold"
          >
            Esta página é sua? Entre para editar o texto.
          </Link>
        )}
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

/**
 * As outras estrelas compradas junto com esta: no par, "esta estrela tem um
 * par"; no grupo, a lista e o céu de todas juntas (`/g/CODE`).
 */
function OutrasDoGrupo({ grupo }) {
  const comPagina = grupo.outras.filter((o) => o.pagina)
  if (!comPagina.length && !grupo.code) return null
  const par = grupo.total === 2
  return (
    <section className="mx-auto max-w-2xl px-5 pb-12 text-center">
      <div className="cartao">
        <p className="font-display text-[11px] tracking-[0.3em] text-gold/80 uppercase">
          {par ? 'Esta estrela tem um par' : `Uma das ${grupo.total} estrelas${grupo.nome ? ` · ${grupo.nome}` : ''}`}
        </p>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {comPagina.map((o) => (
            <li key={o.pagina}>
              <Link
                para={`/p/${o.pagina}`}
                className="inline-block rounded-full border border-white/15 px-4 py-2 text-sm text-ivory/85 transition hover:border-gold hover:text-gold"
              >
                {o.estrela}, de {o.para}
              </Link>
            </li>
          ))}
        </ul>
        {grupo.code && (
          <Link para={`/g/${grupo.code}`} className="btn btn-secundario mt-5 text-sm">
            {par ? 'Ver as duas no mesmo céu' : 'Ver todas no mesmo céu'}
          </Link>
        )}
      </div>
    </section>
  )
}
