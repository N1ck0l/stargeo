import { Suspense, lazy } from 'react'

const MiniCeu = lazy(() => import('./MiniCeu.jsx').then((m) => ({ default: m.MiniCeu })))

/** `MiniCeu` carregado só quando aparece; o lugar fica reservado (quadrado). */
export function MiniCeuSobDemanda(props) {
  return (
    <Suspense fallback={<div aria-hidden="true" className={`${props.className ?? ''} rounded-full bg-white/[0.03]`} />}>
      <MiniCeu {...props} />
    </Suspense>
  )
}
