import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CertificateModal } from './components/CertificateModal'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { LoveLetter } from './components/LoveLetter'
import { Navbar } from './components/Navbar'
import { PersonalMessage } from './components/PersonalMessage'
import { ScrollProgress } from './components/ScrollProgress'
import { SkyMap } from './components/SkyMap'
import { StarDetails } from './components/StarDetails'
import { Starfield } from './components/Starfield'
import { UpdateNotice } from './components/UpdateNotice'
import { ContentProvider } from './lib/content.jsx'

/**
 * A Mira celeste só existe depois do clique, e ela carrega com ela a matemática
 * de posição celeste. Carregar sob demanda tira ~34 KB do código inicial.
 */
const SkyFinder = lazy(() =>
  import('./components/SkyFinder').then((mod) => ({ default: mod.SkyFinder })),
)

/** O painel de edição também não é do site público — entra só se for pedido. */
const Admin = lazy(() =>
  import('./components/Admin').then((mod) => ({ default: mod.Admin })),
)

export default function App() {
  const [certificateOpen, setCertificateOpen] = useState(false)
  const [finderOpen, setFinderOpen] = useState(false)
  // `adminOnly` mantém o painel fora do site normal, e permite abrir o editor
  // sem carregar o resto da aplicação.
  const [adminOnly] = useState(
    () => typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/admin',
  )

  // Identidade estável: evita reiniciar o efeito do modal a cada render.
  const openCertificate = useCallback(() => setCertificateOpen(true), [])
  const closeCertificate = useCallback(() => setCertificateOpen(false), [])
  const openFinder = useCallback(() => setFinderOpen(true), [])

  // Enquanto o painel estiver aberto, a rota é dele.
  useEffect(() => {
    if (!adminOnly) return
    const onPop = () => window.history.pushState(null, '', '/admin')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [adminOnly])

  if (adminOnly) {
    return (
      <ContentProvider editable>
        <Suspense
          fallback={
            <div className="star-bg flex min-h-dvh items-center justify-center">
              <p className="animate-fade-in font-serif text-gold/80">Abrindo o painel…</p>
            </div>
          }
        >
          <Admin />
        </Suspense>
      </ContentProvider>
    )
  }

  return (
    <ContentProvider>
      <div className="star-bg relative min-h-dvh overflow-x-hidden">
        <Starfield />
        <ScrollProgress />
        <UpdateNotice />
        <Navbar onOpenCertificate={openCertificate} onOpenFinder={openFinder} />
        <main>
          <Hero onOpenCertificate={openCertificate} onOpenFinder={openFinder} />
          <SkyMap onOpenCertificate={openCertificate} />
          <StarDetails onOpenCertificate={openCertificate} />
          <LoveLetter />
          <PersonalMessage />
        </main>
        <Footer />
        <CertificateModal open={certificateOpen} onClose={closeCertificate} />
        {finderOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-night">
                <p className="animate-fade-in font-serif text-lg text-gold/80">
                  Abrindo a mira celeste…
                </p>
              </div>
            }
          >
            <SkyFinder onClose={() => setFinderOpen(false)} />
          </Suspense>
        )}
      </div>
    </ContentProvider>
  )
}