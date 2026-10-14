import { Suspense, lazy } from 'react'

/**
 * A folha do certificado carregada sob demanda.
 *
 * O desenho traz junto a tabela de larguras das fontes, o céu das 12
 * estrelas e a marca em curvas (~23 KB gzip). Quem abre a home não precisa
 * disso antes de rolar até a folha — então ela vira um pedaço próprio do
 * bundle, e o lugar dela fica reservado com a proporção exata da A4 retrato
 * (nada pula quando ela chega).
 *
 * Mesmas props da `CertificadoPreview`.
 */
const CertificadoPreview = lazy(() =>
  import('./CertificadoPreview.jsx').then((m) => ({ default: m.CertificadoPreview })),
)

export function Folha(props) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="w-full animate-pulse"
          style={{ aspectRatio: '210 / 297', background: props.light ? '#f6f1e7' : '#0f1230' }}
        />
      }
    >
      <CertificadoPreview {...props} />
    </Suspense>
  )
}
