import { useEffect, useRef } from 'react'

/**
 * Fundo celeste animado: estrelas com parallax, nebulosas à deriva e meteoros.
 *
 * Tudo roda em um único laço de `requestAnimationFrame`, reaproveitado do que
 * já existia — assim acrescentar movimento não significa acrescentar laços.
 *
 * A nebulosa é cara de desenhar (gradientes grandes), então é rasterizada uma
 * vez num canvas fora da tela e depois só reaproveitada com `drawImage`.
 *
 * Com `prefers-reduced-motion`, a cena é desenhada uma única vez e nada anima.
 *
 * Quem importa: `loja/src/App.jsx`. Export: `Starfield`. É a variante da
 * loja — o site pessoal tem outro fundo, com mais camadas; este é o mesmo
 * desenho, enxuto, para não pesar em quem está com o cartão na mão.
 *
 * Invariantes: um canvas só, decorativo (`aria-hidden`), sempre POR TRÁS do
 * conteúdo (z-0; o conteúdo precisa de z-10, ver o comentário no `App` da
 * loja); a animação pausa com a aba escondida; e nada aqui pode rodar sem
 * contexto 2D — teste e navegador com canvas bloqueado caem fora sem erro.
 */
export function Starfield() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Sem contexto 2D (canvas bloqueado, teste sem stub) não há o que animar.
    if (!ctx) return
    let width = 0
    let height = 0
    let raf = 0
    let pointer = { x: 0, y: 0 }
    const stars = []
    const meteors = []
    const nebula = document.createElement('canvas')
    const nctx = nebula.getContext('2d')

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches
    let nextMeteor = 0
    const start = performance.now()

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintNebula()
    }

    /** Nebulosas coloridas, rasterizadas uma vez por redimensionamento. */
    const paintNebula = () => {
      nebula.width = width
      nebula.height = height
      nctx.clearRect(0, 0, width, height)

      const clouds = [
        { x: 0.18, y: 0.12, r: 0.55, color: 'rgba(96, 58, 180, 0.30)' },
        { x: 0.82, y: 0.22, r: 0.45, color: 'rgba(216, 182, 106, 0.10)' },
        { x: 0.5, y: 0.92, r: 0.6, color: 'rgba(46, 26, 108, 0.34)' },
        { x: 0.1, y: 0.75, r: 0.38, color: 'rgba(140, 70, 190, 0.16)' },
        { x: 0.95, y: 0.7, r: 0.34, color: 'rgba(70, 90, 200, 0.14)' },
      ]

      for (const cloud of clouds) {
        const cx = cloud.x * width
        const cy = cloud.y * height
        const radius = cloud.r * Math.max(width, height)
        const gradient = nctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        gradient.addColorStop(0, cloud.color)
        gradient.addColorStop(1, 'rgba(7, 6, 26, 0)')
        nctx.fillStyle = gradient
        nctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
      }
    }

    const seedStars = () => {
      stars.length = 0
      // Densidade pelo MENOR lado: num celular deitado a tela é larga e o
      // número não pode disparar só por causa da largura.
      const count = Math.round(Math.min(width, height) * 0.55)
      for (let i = 0; i < count; i += 1) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.4 + 0.2,
          a: Math.random() * 0.8 + 0.15,
          s: Math.random() * 0.6 + 0.2,
          p: Math.random() * Math.PI * 2,
          depth: Math.random() * 0.8 + 0.2,
          // Uma em cada vinte ganha uma cintilação mais marcada.
          flare: Math.random() < 0.05 ? Math.random() * 0.6 + 0.5 : 0,
        })
      }
    }

    // Posição do ponteiro normalizada (−0,5 a 0,5): um só número vira o
    // deslocamento das camadas, sem depender da largura da janela.
    const onMove = (event) => {
      pointer.x = event.clientX / width - 0.5
      pointer.y = event.clientY / height - 0.5
    }

    /** Cria um meteoro entrando por uma borda aleatória. */
    const spawnMeteor = () => {
      const fromLeft = Math.random() < 0.5
      const speed = 6 + Math.random() * 7
      const angle = (fromLeft ? 0.32 : Math.PI - 0.32) + (Math.random() - 0.5) * 0.4
      meteors.push({
        x: fromLeft ? -80 : width + 80,
        y: Math.random() * height * 0.7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.006 + Math.random() * 0.006,
        length: 90 + Math.random() * 130,
      })
    }

    const renderFrame = (time, allowMotion) => {
      const t = allowMotion ? (time - start) / 1000 : 0
      ctx.clearRect(0, 0, width, height)

      // Nebulosa à deriva, em duas camadas para dar profundidade.
      const driftX = Math.sin(t * 0.05) * 26
      const driftY = Math.cos(t * 0.04) * 20
      ctx.globalAlpha = 0.9
      ctx.drawImage(nebula, -driftX + pointer.x * 18, -driftY + pointer.y * 14)
      ctx.globalAlpha = 1

      for (const star of stars) {
        const twinkle = 0.55 + Math.sin(time * 0.001 * star.s + star.p) * 0.45
        const ox = allowMotion ? pointer.x * 24 * star.depth : 0
        const oy = allowMotion ? pointer.y * 18 * star.depth : 0
        const x = star.x + ox
        const y = star.y + oy

        ctx.beginPath()
        ctx.fillStyle = `rgba(246, 241, 231, ${star.a * twinkle})`
        ctx.arc(x, y, star.r, 0, Math.PI * 2)
        ctx.fill()

        // Cintilações de estrelas mais brilhantes.
        if (star.flare > 0 && twinkle > 0.82) {
          const size = star.r * 5 * star.flare
          const flare = ctx.createRadialGradient(x, y, 0, x, y, size)
          flare.addColorStop(0, `rgba(255, 245, 214, ${0.5 * star.flare * twinkle})`)
          flare.addColorStop(1, 'rgba(255, 245, 214, 0)')
          ctx.fillStyle = flare
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Meteoros.
      for (const meteor of meteors) {
        meteor.x += meteor.vx
        meteor.y += meteor.vy
        meteor.life -= meteor.decay

        const tail = meteor.length * Math.max(0, meteor.life)
        const norm = Math.hypot(meteor.vx, meteor.vy) || 1
        const tx = meteor.x - (meteor.vx / norm) * tail
        const ty = meteor.y - (meteor.vy / norm) * tail

        const streak = ctx.createLinearGradient(tx, ty, meteor.x, meteor.y)
        streak.addColorStop(0, 'rgba(255, 245, 214, 0)')
        streak.addColorStop(1, `rgba(255, 245, 214, ${0.85 * meteor.life})`)
        ctx.strokeStyle = streak
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(meteor.x, meteor.y)
        ctx.stroke()

        // Cabeça brilhante do meteoro.
        ctx.fillStyle = `rgba(255, 252, 235, ${meteor.life})`
        ctx.beginPath()
        ctx.arc(meteor.x, meteor.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = (time) => {
      // Um meteoro a cada 2,4–6 s, com um máximo de quatro em tela.
      if (time > nextMeteor && meteors.length < 4) {
        spawnMeteor()
        nextMeteor = time + 2400 + Math.random() * 3600
      }
      // Descarta os que saíram da tela ou apagaram.
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        if (meteors[i].life <= 0 || meteors[i].x < -300 || meteors[i].x > width + 300) {
          meteors.splice(i, 1)
        }
      }

      renderFrame(time, true)
      raf = requestAnimationFrame(loop)
    }

    const handleResize = () => {
      resize()
      seedStars()
      if (reduced) renderFrame(performance.now(), false)
    }

    /*
     * Aba escondida é tempo de tela desligada, e este canvas é de tela cheia com
     * um gradiente repintado a cada quadro. Pausar aqui devolve a bateria.
     */
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
        return
      }
      if (!reduced && !raf) {
        nextMeteor = performance.now() + 1200
        raf = requestAnimationFrame(loop)
      }
    }

    /** Reage a mudanças na preferência de movimento, ligando ou desligando o loop. */
    const handleMotionChange = (event) => {
      reduced = event.matches
      cancelAnimationFrame(raf)
      raf = 0
      meteors.length = 0
      if (reduced) renderFrame(performance.now(), false)
      else {
        nextMeteor = performance.now() + 1200
        raf = requestAnimationFrame(loop)
      }
    }

    resize()
    seedStars()

    if (reduced) renderFrame(performance.now(), false)
    else {
      nextMeteor = performance.now() + 1200
      raf = requestAnimationFrame(loop)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('visibilitychange', handleVisibility)
    motionQuery.addEventListener('change', handleMotionChange)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', handleVisibility)
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  // Decorativo de propósito: estrela de fundo não se navega, não se lê e
  // não deve aparecer para leitor de tela.
  return <canvas ref={canvasRef} className="scroll-veil" aria-hidden="true" />
}
