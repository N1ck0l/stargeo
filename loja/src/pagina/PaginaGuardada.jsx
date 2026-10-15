import { useEffect, useState } from 'react'
import { SimboloOficial } from '../components/SimboloOficial.jsx'
import { Link } from '../lib/Link.jsx'

/**
 * A página do presente antes da data de revelação (migration 0019).
 *
 * O servidor (`get-page`) não manda a estrela, a carta nem o nome completo —
 * só o dia e o primeiro nome. Aqui é a contagem regressiva; quando ela
 * chega a zero, a página recarrega e o servidor já entrega tudo.
 *
 * A data é do calendário de Brasília: revela à meia-noite de lá (UTC−3, sem
 * horário de verão desde 2019).
 */
export function PaginaGuardada({ revelaEm, para, codigo }) {
  const alvo = new Date(`${revelaEm}T00:00:00-03:00`).getTime()
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(relogio)
  }, [])

  const faltam = Math.max(0, alvo - agora)
  useEffect(() => {
    if (faltam === 0) window.location.reload()
  }, [faltam])

  const dias = Math.floor(faltam / 86_400_000)
  const horas = Math.floor((faltam % 86_400_000) / 3_600_000)
  const minutos = Math.floor((faltam % 3_600_000) / 60_000)
  const segundos = Math.floor((faltam % 60_000) / 1000)
  const dataPorExtenso = new Date(`${revelaEm}T12:00:00Z`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <section className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-5 py-24 text-center">
      <SimboloOficial className="animate-floaty animate-shimmer w-20" />
      <p className="mt-8 font-display text-[11px] tracking-[0.3em] text-gold/80 uppercase">Uma surpresa nas estrelas</p>
      <h1 className="mt-4 font-serif text-4xl leading-tight text-ivory sm:text-5xl">
        {para ? `${para}, uma estrela espera por você` : 'Uma estrela espera por você'}
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-ivory/70">
        Ela se revela em <span className="text-gold">{dataPorExtenso}</span>. Guarde este link — no dia, é só abrir de novo.
      </p>

      <dl className="mt-10 grid grid-cols-4 gap-3 sm:gap-5" aria-label="Tempo até a revelação">
        {[
          [dias, dias === 1 ? 'dia' : 'dias'],
          [horas, horas === 1 ? 'hora' : 'horas'],
          [minutos, 'min'],
          [segundos, 'seg'],
        ].map(([valor, rotulo]) => (
          <div key={rotulo} className="min-w-16 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4">
            <dd className="font-display text-3xl text-gold tabular-nums sm:text-4xl">{String(valor).padStart(2, '0')}</dd>
            <dt className="mt-1 text-[11px] tracking-[0.15em] text-ivory/50 uppercase">{rotulo}</dt>
          </div>
        ))}
      </dl>

      <Link para={`/p/${codigo}/editar`} className="mt-14 text-xs text-ivory/40 transition hover:text-gold">
        Esta página é sua? Entre para ver e editar antes da data.
      </Link>
    </section>
  )
}
