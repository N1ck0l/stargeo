import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  constellationLines,
  kausAustralis,
  sagittariusStars,
} from '../../data/star'
import { useContent } from '../../lib/contentContext'
import {
  DEG,
  RAD_PER_HOUR,
  SCALE_DEFAULT,
  fitScale,
  formatDec,
  formatRa,
  magnitudeRadius,
  normalizeRaDelta,
  panBy,
  project,
  toCanvasPoint,
  zoomAt,
} from '../../../../shared/astro.js'

/** Centro inicial: em volta de Kaus Australis, com a figura do bule visível. */
const INITIAL_VIEW = { ra: 18.6, dec: -29.8, scale: SCALE_DEFAULT }

/** Abaixo deste deslocamento (px) o gesto conta como clique, não como arrasto. */
const DRAG_THRESHOLD = 5

const RA_GRID = [16, 17, 18, 19, 20, 21]
const DEC_GRID = [-50, -40, -30, -20, -10]

/**
 * Grades ao redor da estrela da página, para céus fora de Sagitário.
 *
 * As grades fixas acima cobrem a região do bule; numa página de outra
 * constelação elas ficariam fora de tela e o mapa perderia a referência de
 * coordenadas. Aqui elas acompanham a estrela.
 */
function gradeRa(ra) {
  const centro = Math.round(ra)
  return [-2, -1, 0, 1, 2].map((d) => centro + d)
}

function gradeDec(dec) {
  const centro = Math.round(dec / 10) * 10
  return [-20, -10, 0, 10, 20].map((d) => centro + d)
}

/**
 * Estrelas de fundo: posições determinísticas (sem `Math.random`) para que o
 * céu não "pisque" a cada re-render. Cobrem a região de Sagitário.
 */
const BACKDROP_STARS = Array.from({ length: 520 }, (_, i) => ({
  ra: 16.2 + ((i * 7919) % 5200) / 1000,
  dec: -52 + ((i * 4093) % 4200) / 1000,
  r: 0.3 + ((i * 37) % 13) / 20,
  phase: i * 0.7,
  depth: 0.25 + ((i * 17) % 7) / 10,
}))

/**
 * Mapa do céu — canvas interativo com projeção gnomônica.
 *
 * Papel na arquitetura: seção `#ceu`, o coração visual do site. Toda a
 * matemática (projeção, arrasto, zoom ancorado) mora em `shared/astro.js`,
 * que só reexporta `shared/astro.js`; este componente é a casca que desenha,
 * detecta gestos e expõe o mapa ao teclado.
 *
 * Importado por: `App.jsx`.
 * Exports: `SkyMap`.
 *
 * Interações: arrastar para percorrer, roda/pinça/`+`/`-` para zoom, clique
 * ou toque numa estrela para ver os detalhes — e tudo também por teclado
 * (setas, `+`/`-`, `0` para recentrar).
 *
 * Convenções do desenho (as mesmas de um atlas celeste segurado no céu):
 * - norte (declinação crescente) para cima;
 * - leste (ascensão reta crescente) para a ESQUERDA — a projeção inverte o
 *   eixo X de propósito, e os testes de `astro.test.mjs` seguram isso;
 * - projeção gnomônica: grandes circunferências viram retas, ângulos entre
 *   estrelas são reais, e pontos atrás do plano tangente devolvem `null`.
 *
 * Invariantes:
 * - o desenho vive num efeito de `[]` e lê estado por refs (`viewRef`,
 *   `redrawRef`, `dedicatedLabelRef`): qualquer estado novo que o canvas
 *   precise enxergar precisa entrar por ref, senão ele não redesenha;
 * - com `prefers-reduced-motion` NÃO existe laço de animação — cada gesto
 *   provoca um `draw` único, coalescido por quadro (`renderOnce`);
 * - o mapa pausa quando está fora da tela OU com a aba oculta (dois sinais
 *   separados num único `state`, porque um `IntersectionObserver` não
 *   dispara quando a aba some);
 * - a lista `sr-only` de estrelas é a única representação textual do que o
 *   canvas desenha: sem ela o mapa é invisível para leitores de tela.
 */
export function SkyMap({ onOpenCertificate }) {
  const { content } = useContent()

  /*
   * Duas fontes de dado, com o MESMO fallback do site pessoal: sem
   * `content.estrela`/`content.sky` (que é o caso do site da Geovanna) tudo
   * continua vindo do import e nada muda; com eles (páginas da loja) o mapa
   * mostra a estrela e o céu do cliente.
   */
  const estrela = content.estrela ?? kausAustralis
  const ceu = content.sky ?? { stars: sagittariusStars, lines: constellationLines }
  const estrelas = ceu.stars
  const linhas = ceu.lines
  /** Céu do bule: a vista e a grade continuam as de sempre nesse caso. */
  const ehBule = linhas.length > 0

  /**
   * Índice das estrelas por id, montado uma vez por céu.
   *
   * As linhas da constelação são resolvidas a cada quadro; refazer o `Map` ali
   * significava alocar entradas 60 vezes por segundo para dados que nunca
   * mudam. Era um `Map` de módulo; como o céu agora vem do conteúdo, o índice
   * é do componente — capturado pelo efeito do canvas no primeiro render.
   */
  const porId = useMemo(() => new Map(estrelas.map((star) => [star.id, star])), [estrelas])

  const vistaInicial = useMemo(
    () =>
      ehBule
        ? { ...INITIAL_VIEW }
        : { ra: estrela.ra.hoursDecimal, dec: estrela.dec.decimal, scale: SCALE_DEFAULT },
    [ehBule, estrela],
  )

  /** Grade de coordenadas: a de Sagitário, ou a que acompanha a estrela. */
  const raGrid = useMemo(
    () => (ehBule ? RA_GRID : gradeRa(estrela.ra.hoursDecimal)),
    [ehBule, estrela],
  )
  const decGrid = useMemo(
    () => (ehBule ? DEC_GRID : gradeDec(estrela.dec.decimal)),
    [ehBule, estrela],
  )

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const viewRef = useRef(vistaInicial)
  const sizeRef = useRef({ width: 0, height: 0 })
  /*
   * Redesenho sob demanda, publicado pelo efeito que tem o `draw` em mãos.
   *
   * Sem movimento reduzido existe um laço de animação que redesenha sempre, e
   * os botões e o teclado só precisam mexer em `viewRef`. Mas quando o
   * movimento é reduzido não há laço — sem esta ponte, o "+" e as setas
   * mudavam a vista sem mudar a tela, e era justamente o público que mais
   * depende do teclado que perdia o controle.
   */
  const redrawRef = useRef(() => {})
  const [selected, setSelected] = useState(
    () => estrelas.find((star) => star.dedicated) ?? estrelas[0],
  )
  /*
   * O desenho vive num efeito com `[]`, então não enxergaria uma variável do
   * componente mudar. A ref é o meio de manter o rótulo da estrela em dia sem
   * remontar o canvas inteiro a cada tecla digitada no painel.
   */
  const dedicatedLabelRef = useRef(content.nomeCurto)
  useEffect(() => {
    dedicatedLabelRef.current = content.nomeCurto
    redrawRef.current()
  }, [content.nomeCurto])

  // Recalcula o zoom para que a figura caiba na tela atual.
  const resetView = useCallback(() => {
    const { width, height } = sizeRef.current
    viewRef.current = { ...vistaInicial, scale: fitScale(width, height) }
    redrawRef.current()
    setSelected(estrelas.find((star) => star.dedicated) ?? estrelas[0])
  }, [vistaInicial, estrelas])

  const zoomBy = useCallback((factor) => {
    viewRef.current = zoomAt(viewRef.current, 0, 0, factor)
    redrawRef.current()
  }, [])

  /*
   * Teclado espelha os gestos: setas arrastam, `+`/`-` dão zoom no centro,
   * `0` recentra na estrela dedicada. `Shift` triplica o passo (40 → 120 px)
   * para percorrer o céu sem apertar mil vezes. `preventDefault` nas setas
   * é o que impede a página de rolar enquanto o canvas está em foco.
   */
  const handleKeyDown = useCallback(
    (event) => {
      const step = event.shiftKey ? 120 : 40
      const view = viewRef.current
      const moves = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }

      if (moves[event.key]) {
        event.preventDefault()
        const [dx, dy] = moves[event.key]
        viewRef.current = panBy(view, dx, dy)
        redrawRef.current()
        return
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        viewRef.current = zoomAt(view, 0, 0, 0.8)
        redrawRef.current()
        return
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        viewRef.current = zoomAt(view, 0, 0, 1.25)
        redrawRef.current()
        return
      }
      if (event.key === '0') {
        event.preventDefault()
        resetView()
      }
    },
    [resetView],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches
    let width = 0
    let height = 0
    let raf = 0

    const gesture = { active: false, id: null, moved: false, x: 0, y: 0 }
    const pointers = new Map()
    let pinchDistance = 0

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      width = rect.width
      height = rect.height
      sizeRef.current = { width, height }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    /** Instante zero das animações, usado como fase do twinkle. */
    const start = performance.now()

    // Progresso do traçado da constelação: 0 enquanto não começou.
    const drawProgress = { value: 0 }
    let drawStart = 0

    /*
     * O mapa é um desenho caro — a cada quadro projeta ~1.700 pontos. Ele fica
     * no meio da página, então quase sempre está fora da tela enquanto a pessoa
     * lê outra seção; e aba escondida é tempo de tela desligada.
     *
     * Os dois motivos são guardados separados, porque um `IntersectionObserver`
     * não dispara quando a aba está oculta: se o estado fosse um único booleano,
     * ele ficaria preso em `true` sem nunca ser corrigido.
     */
    const state = { onScreen: true, tabVisible: !document.hidden }
    const shouldAnimate = () => state.onScreen && state.tabVisible

    let screenObserver = null
    if (typeof IntersectionObserver !== 'undefined') {
      screenObserver = new IntersectionObserver(
        ([entry]) => {
          state.onScreen = entry.isIntersecting
          sync()
        },
        { rootMargin: '200px' },
      )
      screenObserver.observe(wrap)
    }

    const handleVisibility = () => {
      state.tabVisible = !document.hidden
      sync()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // O mapa fica abaixo da dobra, então o traçado só dispara quando ele entra
    // na tela — senão terminaria antes de a pessoa chegar lá.
    let revealObserver = null
    if (typeof IntersectionObserver !== 'undefined') {
      revealObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !drawStart) {
            drawStart = performance.now()
            revealObserver.disconnect()
          }
        },
        { threshold: 0.25 },
      )
      revealObserver.observe(wrap)
    } else {
      drawStart = performance.now()
    }

    /** Estrela mais próxima do ponto, dentro do raio de tolerância.
     *  A dedicada tem alcance maior (26 px contra 18): é o alvo principal e
     *  precisa ser acertável mesmo com o halo por cima. */
    const hitStar = (px, py) => {
      const view = viewRef.current
      let closest = null
      let best = Infinity
      for (const star of estrelas) {
        const point = project(star.ra, star.dec, view, width, height)
        if (!point) continue
        const distance = Math.hypot(px - point.x, py - point.y)
        const reach = star.dedicated ? 26 : 18
        if (distance < reach && distance < best) {
          best = distance
          closest = star
        }
      }
      return closest
    }

    const draw = (time) => {
      const view = viewRef.current
      const t = reduced ? 0 : (time - start) / 1000
      if (!reduced && drawStart > 0) {
        // Traçado completo em 1,8 s a partir da primeira vez que o mapa
        // entrou na tela. Sem movimento reduzido o progresso fica em 1 e a
        // figura nasce inteira.
        drawProgress.value = Math.min(1, (time - drawStart) / 1800)
      }
      ctx.clearRect(0, 0, width, height)

      // Névoa de fundo, mais intensa em direção ao centro do mapa.
      const haze = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        10,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.7,
      )
      haze.addColorStop(0, 'rgba(58, 32, 118, 0.55)')
      haze.addColorStop(1, 'rgba(7, 6, 26, 0.1)')
      ctx.fillStyle = haze
      ctx.fillRect(0, 0, width, height)

      /*
       * Um ponto é "visível" com folga: a margem evita cortar estrelas que
       * estão a poucos pixels de fora — o halo delas ainda aparece. `null`
       * (projeção inexistente, atrás da esfera) também é invisível.
       */
      const visible = (point, margin = 80) =>
        point && point.x > -margin && point.y > -margin &&
        point.x < width + margin && point.y < height + margin

      // Grade de coordenadas (meridianos e paralelos).
      // A "caneta" (`pen`) só desenha quando o ponto anterior existia: um
      // meridiano cruza a zona projetável e volta a ser `null`, e sem levantar
      // a caneta o `lineTo` ligaria o fim de um pedaço ao começo do outro,
      // riscando o mapa inteiro na diagonal.
      ctx.strokeStyle = 'rgba(246, 241, 231, 0.07)'
      ctx.lineWidth = 1
      for (const ra of raGrid) {
        ctx.beginPath()
        let pen = false
        for (let dec = -60; dec <= 5; dec += 1) {
          const point = project(ra, dec, view, width, height)
          if (!point) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(point.x, point.y)
          else {
            ctx.moveTo(point.x, point.y)
            pen = true
          }
        }
        ctx.stroke()
      }
      for (const dec of decGrid) {
        ctx.beginPath()
        let pen = false
        // Paralelos: varridos em torno do centro da vista (±8h). O
        // `normalizeRaDelta` mantém o valor projetável quando a varredura
        // atravessa a costura das 0h — sem ele, 24,1h não casaria com 0,1h.
        for (let ra = view.ra - 8; ra <= view.ra + 8; ra += 0.1) {
          const point = project(normalizeRaDelta(ra), dec, view, width, height)
          if (!point) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(point.x, point.y)
          else {
            ctx.moveTo(point.x, point.y)
            pen = true
          }
        }
        ctx.stroke()
      }

      // Estrelas de fundo.
      for (const star of BACKDROP_STARS) {
        const point = project(star.ra, star.dec, view, width, height)
        if (!visible(point)) continue
        const twinkle = 0.3 + Math.sin(t * 1.3 + star.phase) * 0.28
        ctx.beginPath()
        ctx.fillStyle = `rgba(226, 233, 255, ${twinkle * star.depth + 0.12})`
        ctx.arc(point.x, point.y, star.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Figura da constelação, desenhada como se fosse traçada à mão.
      const points = linhas
        .map(([fromId, toId]) => {
          const from = porId.get(fromId)
          const to = porId.get(toId)
          if (!from || !to) return null
          const p1 = project(from.ra, from.dec, view, width, height)
          const p2 = project(to.ra, to.dec, view, width, height)
          return p1 && p2 ? [p1, p2] : null
        })
        .filter(Boolean)

      ctx.strokeStyle = 'rgba(216, 182, 106, 0.35)'
      ctx.lineWidth = 1.4
      points.forEach(([p1, p2], index) => {
        // Cada segmento surge um pouco depois do anterior.
        const appear = reduced ? 1 : Math.min(1, Math.max(0, drawProgress.value * points.length - index))
        if (appear <= 0) return
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p1.x + (p2.x - p1.x) * appear, p1.y + (p2.y - p1.y) * appear)
        ctx.stroke()
      })

      // Estrelas da constelação, com halo proporcional à magnitude.
      const placedLabels = []
      for (const star of estrelas) {
        const point = project(star.ra, star.dec, view, width, height)
        if (!visible(point, 40)) continue
        const radius = magnitudeRadius(star.mag) * (star.dedicated ? 1.5 : 1)

        const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 7)
        glow.addColorStop(0, star.dedicated ? 'rgba(255, 231, 158, 0.95)' : 'rgba(214, 226, 255, 0.6)')
        glow.addColorStop(1, 'rgba(214, 226, 255, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius * 7, 0, Math.PI * 2)
        ctx.fill()

        ctx.beginPath()
        ctx.fillStyle = star.dedicated ? '#ffe08a' : '#f6f1e7'
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.fill()

        if (star.dedicated) {
          const pulse = 16 + Math.sin(t * 2.2) * 5
          ctx.strokeStyle = `rgba(216, 182, 106, ${0.35 + Math.sin(t * 2.2) * 0.3})`
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2)
          ctx.stroke()

          // Retículo de mira ao redor da estrela dedicada.
          ctx.strokeStyle = 'rgba(216, 182, 106, 0.55)'
          ctx.lineWidth = 1
          const arm = radius + 12
          for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            ctx.beginPath()
            ctx.moveTo(point.x + sx * arm, point.y + sy * arm)
            ctx.lineTo(point.x + sx * (arm + 8), point.y + sy * (arm + 8))
            ctx.stroke()
          }
        }

        // Rótulo. Cada caixa é um retângulo (x, y, largura, altura) que não
        // pode tocar nenhuma já colocada — teste de sobreposição AABB, feito
        // na ordem em que as estrelas são desenhadas (da dedicada para fora).
        // Sobrou colisão ou o texto sairia da borda direita: o rótulo some,
        // nunca é cortado.
        const label = star.dedicated ? dedicatedLabelRef.current : star.name
        ctx.font = star.dedicated
          ? '600 13px Montserrat, sans-serif'
          : '11px Montserrat, sans-serif'
        const boxWidth = ctx.measureText(label).width
        const box = { x: point.x + 12, y: point.y - 22, w: boxWidth, h: 15 }
        const collides = placedLabels.some(
          (other) =>
            box.x < other.x + other.w &&
            box.x + box.w > other.x &&
            box.y < other.y + other.h &&
            box.y + box.h > other.y,
        )
        if (!collides && box.x + box.w < width) {
          placedLabels.push(box)
          ctx.fillStyle = star.dedicated ? '#d8b66a' : 'rgba(246, 241, 231, 0.62)'
          ctx.fillText(label, box.x, box.y + 11)
        }
      }

      // Rótulos da grade, encostados nas bordas do canvas para não serem
      // cortados. `decSpan`/`raSpan` são a conversão inversa: quanto em
      // graus (ou horas) cabe do centro até a borda, descontando a folga do
      // texto. A escala é em pixels por radiano — daí dividir por `DEG`
      // (graus) e por `RAD_PER_HOUR` (horas).
      ctx.fillStyle = 'rgba(246, 241, 231, 0.6)'
      ctx.font = '10px Montserrat, sans-serif'
      const decSpan = Math.max(0.5, (height / 2 - 34) / view.scale / DEG)
      const raSpan = Math.max(0.5, (width / 2 - 46) / (view.scale * RAD_PER_HOUR))
      for (const dec of decGrid) {
        const point = project(normalizeRaDelta(view.ra - raSpan), dec, view, width, height)
        if (visible(point, 20)) ctx.fillText(`${dec}°`, point.x, point.y)
      }
      for (const ra of raGrid) {
        const point = project(ra, view.dec + decSpan, view, width, height)
        if (visible(point, 20)) ctx.fillText(`${ra}h`, point.x, point.y)
      }
    }

    const loop = (time) => {
      draw(time)
      raf = requestAnimationFrame(loop)
    }

    /**
     * Liga ou desliga o laço contínuo conforme o estado atual.
     *
     * Só anima quando faz sentido: movimento não reduzido e mapa na tela.
     * Fora da tela o laço é cancelado de vez, e o `IntersectionObserver` volta
     * a chamá-la quando o mapa reaparece.
     */
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = 0
      if (reduced || !shouldAnimate()) return
      raf = requestAnimationFrame(loop)
    }

    /*
     * Com movimento reduzido não há laço: cada gesto provoca um redesenho.
     * A roda do mouse e o trackpad emitem dezenas de eventos por segundo, e um
     * `draw` completo (grade, 520 estrelas de fundo, constelação) por evento
     * trava a rolagem. Coalescer em um por quadro resolve sem perder resposta.
     */
    let pendingFrame = 0
    const renderOnce = () => {
      if (!reduced) return
      if (pendingFrame) return
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0
        if (!state.onScreen) return
        draw(performance.now())
      })
    }

    // Botões e teclado, que vivem fora deste efeito, redesenham por aqui.
    redrawRef.current = () => {
      if (!reduced) {
        sync()
        return
      }
      draw(performance.now())
    }

    // --- Ponteiros -----------------------------------------------------
    const onPointerDown = (event) => {
      pointers.set(event.pointerId, toCanvasPoint(event, canvas))
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
        /*
         * Um gesto de pinça não é um clique: ao soltá-la, o dedo que restou
         * terminaria passando pelo teste "não arrastou" e trocaria a estrela
         * selecionada para alguma que a pessoa nem tocou. Marcando como movido
         * e devolvendo o arraste para o dedo que ficou, o comportamento fica
         * o esperado: a pinça dá zoom e o outro dedo continua arrastando.
         */
        gesture.moved = true
        gesture.active = false
        return
      }
      if (pointers.size > 2) return
      canvas.setPointerCapture(event.pointerId)
      gesture.active = true
      gesture.moved = false
      gesture.id = event.pointerId
      gesture.x = event.clientX
      gesture.y = event.clientY
    }

    const onPointerMove = (event) => {
      const point = toCanvasPoint(event, canvas)
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point)

      // Pinça com dois dedos: controla apenas o zoom.
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDistance > 0 && distance > 0) {
          viewRef.current = zoomAt(viewRef.current, 0, 0, pinchDistance / distance)
          renderOnce()
        }
        pinchDistance = distance
        return
      }

      if (!gesture.active) {
        canvas.style.cursor = hitStar(point.x, point.y) ? 'pointer' : 'grab'
        return
      }

      const dx = event.clientX - gesture.x
      const dy = event.clientY - gesture.y
      if (!gesture.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) gesture.moved = true
      if (gesture.moved) {
        viewRef.current = panBy(viewRef.current, dx, dy)
        gesture.x = event.clientX
        gesture.y = event.clientY
        canvas.style.cursor = 'grabbing'
        renderOnce()
      }
    }

    const onPointerUp = (event) => {
      pointers.delete(event.pointerId)
      if (pointers.size < 2) pinchDistance = 0

      /*
       * Saiu uma pinça e sobrou um dedo: ele volta a arrastar, a partir da
       * posição onde já está. Sem isso o mapa "trava" até todos saírem.
       */
      if (pointers.size === 1 && gesture.moved) {
        const [remainingId] = [...pointers.keys()]
        gesture.id = remainingId
        gesture.active = true
        gesture.x = event.clientX
        gesture.y = event.clientY
        return
      }

      if (event.pointerId !== gesture.id) return

      // Só seleciona se o ponteiro não "arrastou" o mapa.
      if (!gesture.moved) {
        const point = toCanvasPoint(event, canvas)
        const star = hitStar(point.x, point.y)
        if (star) setSelected(star)
      }
      gesture.active = false
      gesture.id = null
      canvas.style.cursor = 'grab'
    }

    const onWheel = (event) => {
      event.preventDefault()
      const point = toCanvasPoint(event, canvas)
      // Exponencial para que deltas grandes (mouse com roda "livre") e
      // pequenos (trackpad) produzam a mesma sensação de velocidade.
      // deltaY negativo = rolar para cima = aproximar (fator < 1).
      const factor = Math.exp(-event.deltaY * 0.0015)
      viewRef.current = zoomAt(
        viewRef.current,
        point.x - width / 2,
        point.y - height / 2,
        factor,
      )
      renderOnce()
    }

    const onDoubleClick = (event) => {
      event.preventDefault()
      const point = toCanvasPoint(event, canvas)
      viewRef.current = zoomAt(viewRef.current, point.x - width / 2, point.y - height / 2, 0.7)
      renderOnce()
    }

    const handleMotionChange = (event) => {
      reduced = event.matches
      sync()
      // Ao passar para movimento reduzido, a tela tem de mostrar o estado
      // atual da vista imediatamente — não só quando o próximo gesto vier.
      if (reduced && state.onScreen) draw(performance.now())
    }

    const handleResize = () => {
      resize()
      renderOnce()
    }

    resize()
    // Primeira medição: ajusta o zoom para o tamanho real da tela.
    viewRef.current = { ...INITIAL_VIEW, scale: fitScale(width, height) }
    draw(performance.now())
    sync()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('resize', handleResize)
    motionQuery.addEventListener('change', handleMotionChange)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(pendingFrame)
      redrawRef.current = () => {}
      revealObserver?.disconnect()
      screenObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('resize', handleResize)
      motionQuery.removeEventListener('change', handleMotionChange)
    }
    // O desenho captura o céu do PRIMEIRO render (conteúdo da página não muda
    // depois de carregado); as dependências existem para o lint — e são
    // estáveis, então o efeito não remonta sem motivo.
  }, [estrelas, linhas, raGrid, decGrid, porId])

  const isDedicated = selected?.dedicated

  return (
    <section id="ceu" className="relative z-10 mx-auto max-w-6xl px-5 py-20">
      <div className="mb-8 max-w-2xl">
        <p className="font-display text-[11px] tracking-[0.35em] text-gold uppercase">
          Mapa do céu
        </p>
        <h2 className="font-serif mt-3 text-4xl text-ivory sm:text-5xl">
          {estrela.constellation}, de perto
        </h2>
        <p className="mt-4 text-ivory/70">
          Arraste para percorrer o céu, use a roda ou os botões para aproximar e toque
          numa estrela para ver os detalhes. O anel dourado marca
          {' '}
          <strong className="font-medium text-gold">{estrela.commonName}</strong>, dedicada a{' '}
          {content.nomeCurto}.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gold/20 bg-[#0b0824]/80 shadow-[0_0_80px_rgba(59,29,110,0.35)]">
        {/*
          O canvas é pintado, não renderizado por texto: leitores de tela não
          enxergariam as estrelas. Esta lista é a alternativa textual equivalente.
        */}
        <p id="sky-map-desc" className="sr-only">
          Mapa celeste da constelação de {estrela.constellation}, projeção gnomônica,
          época J2000, com norte para cima e ascensão reta crescente para a esquerda.
          {linhas.length > 0 && ' As linhas douradas ligam as estrelas da figura.'}
          {' '}Use as setas para percorrer, mais e menos para aproximar e afastar, e 0
          para recentrar. Os detalhes da estrela selecionada aparecem no painel ao lado.
        </p>
        <ul className="sr-only">
          {estrelas.map((star) => (
            <li key={star.id}>
              {star.name} ({star.bayer}), magnitude {star.mag.toFixed(2)}, ascensão reta{' '}
              {formatRa(star.ra)}, declinação {formatDec(star.dec)}
              {star.dedicated ? `, dedicada a ${content.nome}` : ''}.
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-3">
          <p className="text-xs text-ivory/60">
            Arraste para mover · zoom com a roda, os botões ou a pinça · clique para
            detalhes
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => zoomBy(0.7)}
              aria-label="Aproximar"
              className="h-8 w-8 rounded-full border border-white/15 text-ivory/80 transition hover:border-gold hover:text-gold"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.4)}
              aria-label="Afastar"
              className="h-8 w-8 rounded-full border border-white/15 text-ivory/80 transition hover:border-gold hover:text-gold"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetView}
              className="rounded-full border border-gold/40 px-3 py-1 text-xs text-gold transition hover:bg-gold hover:text-night"
            >
              Recentrar
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_300px]">
          <div ref={wrapRef} className="relative h-[58vh] min-h-[360px] w-full">
            <canvas
              ref={canvasRef}
              className="sky-canvas h-full w-full cursor-grab touch-none"
              role="application"
              tabIndex={0}
              aria-label={`Mapa do céu de ${estrela.constellation}. Use as setas para percorrer, mais e menos para aproximar e afastar, e 0 para recentrar em ${estrela.commonName}.`}
              aria-describedby="sky-map-desc"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/*
            A região é anunciada, mas o anúncio fica restrito ao NOME da estrela.
            Com `aria-live` no painel inteiro, cada troca de seleção reanunciava
            magnitude, coordenadas e catálogo junto — muito ruído para um
            `polite`.
          */}
          <aside
            className="border-t border-white/5 p-6 lg:border-l lg:border-t-0"
            aria-labelledby="sky-selection-title"
          >
            <p className="font-display text-[10px] tracking-[0.3em] text-gold/80 uppercase">
              Estrela selecionada
            </p>
            <h3
              id="sky-selection-title"
              className="font-serif mt-2 text-2xl text-ivory"
              aria-live="polite"
            >
              {selected?.name}
            </h3>
            <p className="text-sm text-ivory/60">{selected?.bayer}</p>

            {isDedicated && (
              <>
                <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold-soft">
                  Nome batizado: {content.nome}
                </p>
                <button
                  type="button"
                  onClick={onOpenCertificate}
                  className="mt-4 w-full rounded-full bg-gold px-4 py-2 text-sm font-medium text-night transition hover:bg-gold-soft"
                >
                  Ver certificado
                </button>
              </>
            )}

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ivory/60">Magnitude</dt>
                <dd className="text-right">{selected?.mag.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ivory/60">Ascensão reta</dt>
                <dd className="text-right">{selected ? formatRa(selected.ra) : ''}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ivory/60">Declinação</dt>
                <dd className="text-right">{selected ? formatDec(selected.dec) : ''}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ivory/60">Constelação</dt>
                <dd className="text-right">
                  {estrela.constellation} ({estrela.constellationLatin})
                </dd>
              </div>
            </dl>

            <p className="mt-6 text-xs leading-relaxed text-ivory/60">
              Projeção gnomônica, época J2000 — a mesma dos atlas celestes, em que
              os ângulos entre as estrelas são reais.
            </p>
          </aside>
        </div>
      </div>
    </section>
  )
}