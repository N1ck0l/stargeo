import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StarTrails } from './StarTrails'
import { brightStars } from '../../data/brightStars'
import { kausAustralis, sagittariusStars } from '../../data/star'
import { useContent } from '../../lib/contentContext'
import {
  devicePointing,
  equatorialToHorizontal,
  visibility,
  visibilityMessage,
  wrap180,
} from '../../../../shared/sky.js'

/**
 * Campo de visão VERTICAL da câmera traseira com o celular em pé, em graus
 * (o lado comprido da imagem). O horizontal sai da proporção da tela, que o
 * vídeo cobre recortando as laterais. Varia entre aparelhos (55°–80°): é uma
 * aproximação, e a pessoa ajusta pelo controle de calibração.
 */
const CAMERA_FOV = 68

/** Raio do retículo no centro da tela, em px: estrela dentro dele = "ali está". */
const RETICULO = 56

/**
 * Cidades brasileiras como alternativa quando a pessoa recusa a localização.
 * Sem latitude não dá para calcular a altura da estrela; o azimute, porém,
 * independe do lugar.
 */
const FALLBACK_CITIES = [
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
  { name: 'Belo Horizonte', lat: -19.9167, lon: -43.9345 },
  { name: 'Brasília', lat: -15.7939, lon: -47.8828 },
  { name: 'Salvador', lat: -12.9777, lon: -38.5016 },
  { name: 'Recife', lat: -8.0476, lon: -34.877 },
  { name: 'Fortaleza', lat: -3.7319, lon: -38.5267 },
  { name: 'Curitiba', lat: -25.4284, lon: -49.2733 },
  { name: 'Porto Alegre', lat: -30.0346, lon: -51.2177 },
  { name: 'Florianópolis', lat: -27.5954, lon: -48.548 },
  { name: 'Manaus', lat: -3.119, lon: -60.0217 },
]

/** Elementos que recebem foco dentro da mira. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Mira celeste — o "aponte para o céu e ache a estrela".
 *
 * Papel na arquitetura: diálogo em tela cheia (portal no fim do `body`) que
 * combina três fontes de verdade — câmera (vídeo ao fundo), sensores de
 * orientação (bússola) e matemática de `shared/sky.js` — para apontar onde Kaus Australis está AGORA, a partir do
 * lugar onde a pessoa está.
 *
 * Importado por: `App.jsx`, mas só via `lazy()` depois do clique no botão.
 * Exports: `SkyFinder`.
 *
 * Fluxo de permissão (não pode ser reordenado sem pensar):
 * 1. `intro` → pessoa lê o aviso e clica "Abrir a mira";
 * 2. `DeviceOrientationEvent.requestPermission()` (só existe no iOS ≥ 12);
 * 3. `getUserMedia` da câmera traseira — CÂMERA É OPCIONAL, sem ela a mira
 *    continua funcionando sobre um fundo escuro;
 * 4. `getCurrentPosition` — sem latitude não há altura da estrela, e o
 *    fallback é escolher uma das `FALLBACK_CITIES`;
 * 5. `active`.
 *
 * Invariantes:
 * - `streamRef` é parado no cleanup e TAMBÉM quando uma promessa resolve com
 *   a tela já fechada (`closedRef`) — o indicador de câmera do sistema não
 *   pode ficar aceso;
 * - `wrap180` em todo cálculo de diferença de azimute: sem ele, 350° − 10°
 *   viraria "340° à direita" em vez de "20° à esquerda";
 * - os avisos de erro (`sensorMissing`) só aparecem quando NENHUM dado chega
 *   em 3,5 s — a permissão concedida não é sinal de que o sensor funciona.
 *
 * É montada só enquanto está aberta, então não precisa de efeito para se
 * "reiniciar" — abrir de novo já cria uma instância nova. Como cobre a tela
 * inteira, comporta-se como diálogo modal de verdade: `role="dialog"`,
 * `aria-modal`, foco preso, `Esc` para sair e trava de rolagem do fundo.
 */
export function SkyFinder({ onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const dialogRef = useRef(null)
  const [tela, setTela] = useState(() => ({
    largura: typeof window === 'undefined' ? 390 : window.innerWidth,
    altura: typeof window === 'undefined' ? 844 : window.innerHeight,
  }))
  useEffect(() => {
    const medir = () => setTela({ largura: window.innerWidth, altura: window.innerHeight })
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  /*
   * O alvo e a figura do céu vêm do conteúdo quando a página é de um cliente;
   * sem isso (site pessoal) o fallback é o import, como era antes — ver o
   * mesmo padrão em `Hero.jsx`.
   */
  const { content } = useContent()
  const estrela = content.estrela ?? kausAustralis
  const celestes = content.skyFigura?.stars ?? sagittariusStars

  /*
   * `stage` tem três valores: 'intro' (aviso antes de pedir permissão),
   * 'starting' (permissões em andamento, botão desabilitado) e 'active'
   * (sensores ligados, mira em uso).
   */
  const [stage, setStage] = useState('intro')
  const [error, setError] = useState('')
  const [fix, setFix] = useState(null)
  const [placeName, setPlaceName] = useState('')
  const [showCities, setShowCities] = useState(false)
  const [pointing, setPointing] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [sensorMissing, setSensorMissing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [fov, setFov] = useState(CAMERA_FOV)
  const [calibrating, setCalibrating] = useState(false)
  const [showTrails, setShowTrails] = useState(false)

  /** Desliga a câmera. */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  /*
   * Sinal de "a tela já foi fechada" para as operações assíncronas.
   *
   * `getUserMedia` e `getCurrentPosition` podem demorar segundos. Se a pessoa
   * fechar a mira nesse meio-tempo, o cleanup roda com `streamRef.current`
   * vazio e não desliga nada; quando a promessa resolve, o stream chega a um
   * componente morto e o indicador de câmera do sistema fica aceso até ela sair
   * da aba. Esta ref é consultada assim que cada operação volta, e o stream
   * órfão é parado na hora em que chega.
   */
  const closedRef = useRef(false)

  // Sair da tela precisa devolver a câmera ao sistema.
  useEffect(() => {
    closedRef.current = false
    return () => {
      closedRef.current = true
      stop()
    }
  }, [stop])

  // Relógio: a estrela se move ~1° a cada 4 minutos.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // Comportamento de diálogo modal: trava o fundo, prende o foco e devolve.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    const { overflow, paddingRight } = document.body.style
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`

    dialogRef.current?.querySelector(FOCUSABLE)?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  // --- sensores ------------------------------------------------------------
  useEffect(() => {
    if (stage !== 'active') return
    let mounted = true

    /*
     * `alpha` = rotação em torno do eixo vertical (0 = norte magnético),
     * `beta` = inclinação frente/costa, `gamma` = inclinação lateral. É
     * `alpha` que define para que azimute o aparelho está virado; a conversão
     * completa para (altura, azimute) da câmera vive em `devicePointing`.
     */
    /*
     * O NORTE de verdade. No Android, o Chrome manda em `deviceorientation`
     * um alpha RELATIVO (zero = para onde o celular apontava quando a página
     * abriu) — a estrela "mudava de lugar" a cada vez que se abria a mira. A
     * bússola vem em `deviceorientationabsolute`. No iPhone, o norte vem em
     * `webkitCompassHeading` (graus no sentido horário; alpha é o contrário).
     */
    const absolutoDisponivel = 'ondeviceorientationabsolute' in window
    const onOrientation = (event) => {
      if (!mounted) return
      let alpha = null
      if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
        alpha = (360 - event.webkitCompassHeading) % 360
      } else if (event.type === 'deviceorientationabsolute' || event.absolute) {
        alpha = event.alpha
      } else if (!absolutoDisponivel) {
        // Último recurso (aparelho sem bússola absoluta): melhor que nada.
        alpha = event.alpha
      }
      if (alpha === null || alpha === undefined) return
      setPointing(devicePointing(alpha, event.beta ?? 0, event.gamma ?? 0))
      // Só o Android publica a precisão da bússola; no iOS `accuracy` fica nulo
      // e a qualidade aparece como "desconhecida" — não como "ruim".
      if (typeof event.webkitCompassAccuracy === 'number') setAccuracy(event.webkitCompassAccuracy)
      // Chegou dado de verdade: o aviso de sensor ausente não se aplica.
      setSensorMissing(false)
    }

    window.addEventListener('deviceorientation', onOrientation)
    if (absolutoDisponivel) window.addEventListener('deviceorientationabsolute', onOrientation)

    /*
     * Não dá para confiar só na permissão: o navegador pode autorizar e ainda
     * assim não enviar evento nenhum (aparelho sem bússola, sensor bloqueado
     * por configuração, uso no computador). O aviso só aparece se NADA chegar.
     */
    const timer = setTimeout(() => {
      if (mounted) setSensorMissing(true)
    }, 3500)

    return () => {
      mounted = false
      clearTimeout(timer)
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('deviceorientationabsolute', onOrientation)
    }
  }, [stage])

  // --- localização ---------------------------------------------------------
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setShowCities(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFix({ lat: position.coords.latitude, lon: position.coords.longitude })
        setPlaceName('sua localização')
        setShowCities(false)
      },
      // Recusa, timeout ou API ausente: tudo cai na mesma escolha de cidades.
      // `enableHighAccuracy: false` basta (a posição da estrela muda ~1° a
      // cada 4 min); `maximumAge` aceita uma posição de até 10 minutos atrás.
      () => setShowCities(true),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [])

  // --- início --------------------------------------------------------------
  const start = useCallback(async () => {
    setError('')
    setSensorMissing(false)
    setStage('starting')

    /*
     * Pedir permissão de orientação, quando a API existe. O resultado não é
     * usado para avisar ninguém: em alguns navegadores a chamada recusa mesmo
     * em aparelhos que depois emitem os eventos normalmente. Quem decide se
     * há problema é o teste de 3,5 s abaixo, que observa dados de verdade.
     */
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        await DeviceOrientationEvent.requestPermission()
      } catch {
        // Ignorado de propósito: o aviso real vem do teste de dados.
      }
      // A permissão do iOS abre uma folha do sistema que pode levar segundos.
      if (closedRef.current) return
    }

    // Câmera é opcional: sem ela a mira continua funcionando com um fundo escuro.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        // A tela pode ter sido fechada durante a permissão. Parar o stream
        // recém-chegado é o que impede a câmera ficar acesa em segundo plano.
        if (closedRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          // O Safari do iOS às vezes ignora o autoplay e deixa a câmera preta.
          // Chamar play() explicitamente resolve — e o erro é ignorado porque
          // o vídeo já vem com `muted` e `playsInline`.
          video.play?.()?.catch(() => {})
        }
      } catch {
        // Sem câmera não é motivo para impedir o uso.
      }
    }

    if (closedRef.current) return
    setStage('active')
    locate()
  }, [locate])

  // --- cálculos ------------------------------------------------------------
  const target = useMemo(() => {
    if (!fix) return null
    return equatorialToHorizontal(estrela.ra.hoursDecimal, estrela.dec.decimal, fix.lat, fix.lon, now)
  }, [estrela, fix, now])


  /**
   * Onde a estrela está e se dá para vê-la agora. Calcula nascer, pôr e a
   * melhor janela da noite — isso responde a pergunta que a tela mais importa:
   * "dá para ver agora?"
   */
  const vis = useMemo(() => {
    if (!fix) return null
    return visibility(estrela.ra.hoursDecimal, estrela.dec.decimal, fix.lat, fix.lon, now)
  }, [estrela, fix, now])

  /**
   * Qualidade da bússola.
   *
   * O Android informa `webkitCompassAccuracy` (desvio em graus). Acima de 25°
   * a leitura não serve: é o caso típico dentro de casa, perto de janelas e de
   *longedouros, onde o campo magnético é distorcido.
   */
  const compassQuality = accuracy === null ? 'desconhecida' : accuracy <= 10 ? 'boa' : accuracy <= 25 ? 'média' : 'ruim'

  /** Onde cada estrela da figura está, para desenhar o desenho completo. */
  const constellation = useMemo(() => {
    if (!fix || !pointing) return []
    return celestes
      .map((star) => {
        const pos = equatorialToHorizontal(star.ra, star.dec, fix.lat, fix.lon, now)
        return { ...star, ...pos, bearing: wrap180(pos.azimuth - pointing.azimuth) }
      })
      .filter((star) => Math.abs(star.bearing) < fov / 2)
  }, [celestes, fix, pointing, now, fov])

  /**
   * O céu em volta: as estrelas mais brilhantes que a olho nu aparecem.
   *
   * Sem isso a Mira mostra um desenho solto no vazio; com isso ela consegue
   * se orientar e reconhecer para onde está olhando. Só entram as que estão
   * acima do horizonte e dentro do campo de visão.
   *
   * Cada estrela era convertida DUAS vezes — uma para filtrar pelo horizonte,
   * outra para montar o desenho — e a conversão chama `localSiderealTime`.
   * Como `pointing` muda a ~60 Hz, isso eram 180 conversões por sensor, por
   * quadro. Um `map` só resolve: converte uma vez e filtra depois.
   */
  const skyStars = useMemo(() => {
    if (!fix || !pointing) return []
    const limit = fov / 2
    return brightStars
      .map((star) => {
        const pos = equatorialToHorizontal(star.ra, star.dec, fix.lat, fix.lon, now)
        return {
          ...star,
          ...pos,
          bearing: wrap180(pos.azimuth - pointing.azimuth),
        }
      })
      .filter((star) => star.altitude > 0 && Math.abs(star.bearing) < limit)
      .sort((a, b) => a.mag - b.mag)
  }, [fix, pointing, now, fov])

  /*
   * As estrelas do Sagitário têm prioridade no desenho; as do céu ficam atrás.
   *
   * A comparação é por posição, e não por nome: o catálogo traz Kaus Australis
   * sem nome próprio (`n: null`), então exigir `s.name === star.n` nunca
   * casava e a estrela aparecia duas vezes — desenhada no fundo e no bule.
   * A tolerância de 0,05 h é ~3 minutos de tempo sideral, bem acima do erro
   * de catálogo entre as duas fontes.
   */
  const skyBackdrop = useMemo(
    () => skyStars.filter(
      (star) => !celestes.some((s) => Math.abs(s.ra - star.ra) < 0.05 && Math.abs(s.dec - star.dec) < 0.5),
    ),
    [skyStars, celestes],
  )

  /*
   * Céu → tela. `fov` é o campo de visão VERTICAL da câmera (retrato); o
   * horizontal sai da proporção da tela. A diferença de azimute encolhe com o
   * cosseno da altura (perto do zênite, 10° de azimute são poucos graus de
   * céu). Centro da tela = para onde o celular aponta.
   */
  const fovV = fov
  const fovH = fov * (tela.largura / tela.altura)
  const naTela = (pos) => {
    const dx = wrap180(pos.azimuth - pointing.azimuth) * Math.cos((pos.altitude * Math.PI) / 180)
    const dy = pos.altitude - pointing.altitude
    return { dx, dy, x: 50 + (dx / fovH) * 100, y: 50 - (dy / fovV) * 100 }
  }

  /*
   * A estrela em relação ao retículo, em PIXELS: "alinhado" é o ponto dentro
   * do círculo que a pessoa vê — o mesmo critério para o texto e para a seta,
   * que assim nunca se contradizem.
   */
  const alvo = (() => {
    if (!target || !pointing) return null
    const t = naTela(target)
    const px = ((t.x - 50) / 100) * tela.largura
    const py = ((t.y - 50) / 100) * tela.altura
    return {
      ...t,
      dentro: t.x > -2 && t.x < 102 && t.y > -2 && t.y < 102 && target.altitude > -2,
      alinhado: Math.hypot(px, py) <= RETICULO,
      angulo: (Math.atan2(py, px) * 180) / Math.PI,
      // Os graus que o raio do retículo cobre: abaixo disso, "bem perto".
      tolerancia: (RETICULO / tela.altura) * fovV,
    }
  })()

  // Cardeais em português e em azimute: Norte 0°, Leste 90°, Sul 180°, Oeste 270°.
  const compassPoints = { N: 0, L: 90, S: 180, O: 270 }

  /*
   * Portal no fim do `body`: o diálogo é `fixed z-50`, e um ancestral com
   * `z-index` (o `<main class="z-10">` da loja, por exemplo) criaria um
   * contexto de empilhamento onde o 50 fica preso por baixo do header (z-40).
   * No fim do body ele disputa no mesmo nível que todo mundo — e vence.
   */
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Mira celeste: para onde fica ${estrela.commonName}`}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-night text-ivory"
    >
      {/* Câmera ao fundo; some quando não há permissão. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-night/80 via-night/30 to-night/95" aria-hidden="true" />

      {/* Cabeçalho */}
      <div className="safe-top relative z-10 flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <p className="font-display text-[10px] tracking-[0.3em] text-gold uppercase">Mira celeste</p>
          <h2 className="font-serif mt-1 text-2xl sm:text-3xl">Ache {estrela.commonName}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar a mira celeste"
          className="rounded-full border border-white/25 px-4 py-2 text-sm transition hover:border-gold hover:text-gold"
        >
          Fechar
        </button>
      </div>

      {error && (
        <p className="relative z-10 mx-5 rounded-xl border border-gold/30 bg-night/70 px-4 py-2 text-sm text-gold-soft">
          {error}
        </p>
      )}

      {sensorMissing && !error && (
        <p className="relative z-10 mx-5 rounded-xl border border-gold/30 bg-night/70 px-4 py-2 text-sm text-gold-soft">
          Os sensores de orientação não responderam. Num iPhone, verifique em
          Configurações → Safari → Movimentação e Orientação. A mira ainda mostra a
          posição calculada da estrela no rodapé, mas não acompanha o aparelho.
        </p>
      )}

      {stage === 'intro' || stage === 'starting' ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-md">
            <svg width="64" height="64" viewBox="0 0 72 72" aria-hidden="true" className="mx-auto text-gold">
              <path
                d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
                fill="currentColor"
              />
            </svg>
            <h3 className="font-serif mt-6 text-2xl">Aponte a câmera para o céu</h3>
            <p className="mt-4 text-ivory/75 leading-relaxed">
              O celular usa a bússola para mostrar para onde fica {estrela.commonName},
              na constelação de {estrela.constellation}. Siga a seta até a estrela
              cair dentro do círculo no centro da tela.
            </p>
            <p className="mt-4 text-sm text-ivory/60">
              Funciona melhor à noite, ao ar livre, e precisa de <strong>HTTPS</strong> e
              permissão de câmera e movimento.
            </p>
            <button
              type="button"
              onClick={start}
              disabled={stage === 'starting'}
              className="mt-8 rounded-full bg-gold px-7 py-3 font-medium text-night transition hover:bg-gold-soft disabled:opacity-60"
            >
              {stage === 'starting' ? 'Abrindo…' : 'Abrir a mira'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Bússola. `offset` é a diferença para o norte magnético, já
              embrulhada em (-180, 180] — um cardeal "atrás" do aparelho não
              pode aparecer do outro lado da fita. A faixa tem a largura do
              campo de visão, então graus saem direto em porcentagem:
              50% + offset / fov × 100. */}
          <div className="relative z-10 flex justify-center pt-2" aria-hidden="true">
            <div className="relative h-10 w-[min(90vw,520px)] overflow-hidden">
              {Object.entries(compassPoints).map(([label, angle]) => {
                const offset = wrap180(angle - (pointing?.azimuth ?? 0))
                // Fora de ±60° do centro: esconde, para a fita não encher de
                // letras coladas nas bordas.
                if (Math.abs(offset) > 60) return null
                return (
                    <span
                      key={label}
                      className="absolute top-0 text-xs tracking-widest text-gold/80"
                      style={{ left: `${50 + (offset / fov) * 100}%`, transform: 'translateX(-50%)' }}
                    >
                      {label}
                    </span>
                  )
              })}
              <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-gold/40" />
            </div>
          </div>

          {/*
            UMA camada só, do tamanho da tela, sobre a câmera: o centro da tela
            é para onde o celular aponta, e a estrela, a constelação e o céu
            ficam no lugar deles na imagem (`naTela`). Antes eram duas peças —
            um retículo com seta no alto e um quadradinho de céu mais abaixo —
            e a estrela parecia estar em dois lugares.
          */}
          {target && pointing && (
            <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
              {skyBackdrop.map((star) => {
                const t = naTela(star)
                const r = Math.max(2, Math.min(6, 9 - star.mag * 1.8))
                return (
                  <span
                    key={`sky-${star.ra}-${star.dec}`}
                    className="absolute rounded-full bg-ivory/60"
                    style={{ left: `${t.x}%`, top: `${t.y}%`, width: r, height: r, marginLeft: -r / 2, marginTop: -r / 2 }}
                  />
                )
              })}
              {constellation
                .filter((star) => !star.dedicated)
                .map((star) => {
                  const t = naTela(star)
                  return (
                    <span
                      key={star.id}
                      className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ivory/75"
                      style={{ left: `${t.x}%`, top: `${t.y}%` }}
                    />
                  )
                })}

              {/* A estrela: dentro da imagem, um ponto dourado com anel e o nome. */}
              {alvo.dentro && (
                <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${alvo.x}%`, top: `${alvo.y}%` }}>
                  <span className="block size-4 rounded-full bg-gold shadow-[0_0_22px_rgba(216,182,106,0.95)]" />
                  <span className="absolute -inset-3 rounded-full border border-gold/60" />
                  <span className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-serif text-sm text-gold">
                    {estrela.commonName}
                  </span>
                </span>
              )}

              {/* Retículo: fixo no centro (para onde o celular aponta). */}
              <span
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/40"
                style={{ width: RETICULO * 2, height: RETICULO * 2 }}
              />
              <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/70" />
              {/* Fora do círculo, a seta na borda dele aponta para a estrela —
                  em qualquer direção, inclusive para cima e para baixo. */}
              {!alvo.alinhado && (
                <svg
                  width="42"
                  height="42"
                  viewBox="0 0 24 24"
                  className="absolute top-1/2 left-1/2 text-gold drop-shadow-[0_0_6px_rgba(0,0,0,0.85)]"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${alvo.angulo}deg) translateX(${RETICULO + 22}px)`,
                  }}
                >
                  <path d="M8 5 L16 12 L8 19" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          )}

          {/* Instruções em texto (também para leitor de tela), abaixo do centro. */}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-end overflow-y-auto px-6 pb-6">
            {target && pointing ? (
              <p className="max-w-sm text-center text-lg" role="status">
                {alvo.alinhado ? (
                  <span className="font-serif text-2xl text-gold">Ali está a sua estrela ✦</span>
                ) : (
                  <>
                    {Math.abs(alvo.dx) > alvo.tolerancia && (
                      <span className="block">
                        Gire para a {alvo.dx > 0 ? 'direita' : 'esquerda'}
                        {Math.abs(alvo.dx) > 45 && ' bastante'}
                      </span>
                    )}
                    {alvo.dy > alvo.tolerancia && <span className="block">Levante um pouco o celular</span>}
                    {alvo.dy < -alvo.tolerancia && <span className="block">Abaixe um pouco o celular</span>}
                    {Math.abs(alvo.dx) <= alvo.tolerancia && Math.abs(alvo.dy) <= alvo.tolerancia && (
                      <span className="block">Está bem perto, ajuste devagar</span>
                    )}
                  </>
                )}
              </p>
            ) : (
              <p className="max-w-sm text-center text-ivory/70" role="status">
                {pointing
                  ? 'Precisando da sua localização para calcular onde a estrela está…'
                  : 'Sem os sensores de orientação. A mira precisa de um celular com bússola.'}
              </p>
            )}
          </div>

          {/* Rodapé com os dados */}
          <div className="safe-bottom relative z-10 shrink-0 border-t border-white/10 bg-night/70 px-5 py-4 text-sm">
            {/* Resposta à pergunta que importa: dá para ver agora? */}
            {vis && (
              <div className="mx-auto mb-3 max-w-2xl">
                <p
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    vis.visible
                      ? 'border-gold/30 bg-gold/10 text-gold-soft'
                      : 'border-white/15 bg-white/5 text-ivory/75'
                  }`}
                >
                  {visibilityMessage(vis)}
                </p>
              </div>
            )}

            <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3">
              {target && pointing ? (
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ivory/70">
                  <div className="flex gap-2">
                    <dt className="text-gold/80">Estrela</dt>
                    <dd>alt {target.altitude.toFixed(1)}° · az {target.azimuth.toFixed(0)}°</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gold/80">Aparelho</dt>
                    <dd>az {pointing.azimuth.toFixed(0)}°</dd>
                  </div>
                  {accuracy !== null && (
                    <div className="flex gap-2">
                      <dt className="text-gold/80">Bússola</dt>
                      <dd>
                        ±{accuracy.toFixed(0)}°{' '}
                        {compassQuality === 'ruim' && <span className="text-gold/80">(ruim)</span>}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-xs text-ivory/60">Aguardando sensores do aparelho…</p>
              )}

              <div className="flex items-center gap-2">
                {!fix ? (
                  <button
                    type="button"
                    onClick={locate}
                    className="rounded-full border border-gold/50 px-3 py-1.5 text-xs text-gold transition hover:bg-gold hover:text-night"
                  >
                    Usar minha localização
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCities((v) => !v)}
                    className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                  >
                    {placeName || 'Trocar lugar'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNow(new Date())}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                >
                  Recalcular
                </button>
                <button
                  type="button"
                  onClick={() => setCalibrating((v) => !v)}
                  aria-expanded={calibrating}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                >
                  Calibrar
                </button>
                <button
                  type="button"
                  onClick={() => setShowTrails((v) => !v)}
                  aria-expanded={showTrails}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                >
                  Rastros
                </button>
              </div>
            </div>

            {/*
              Bússola ruim é comum dentro de casa. Além do aviso, damos um
              ajuste manual do campo de visão — que é o outro fator que faz a
              mira "errar" sem que a bússola esteja errada.
            */}
            {compassQuality === 'ruim' && !calibrating && (
              <p className="mx-auto mt-3 max-w-2xl rounded-xl border border-gold/25 bg-night/60 px-3 py-2 text-xs text-gold-soft">
                A bússola está imprecisa — comum dentro de casa, perto de janelas
                e eletrodomésticos. Vá para fora e mova o celular devagar, em forma
                de 8, por alguns segundos; a leitura se ajusta sozinha.
              </p>
            )}

            {calibrating && (
              <div className="mx-auto mt-4 max-w-2xl border-t border-white/10 pt-4">
                <p className="mb-3 text-xs text-ivory/70">
                  Ajuste até a estrela de {estrela.commonName} cair dentro do círculo do
                  meio quando você apontar para ela.
                </p>
                <label className="flex items-center gap-3 text-xs text-ivory/80">
                  <span className="w-24 shrink-0">Campo de visão</span>
                  <input
                    type="range"
                    min="50"
                    max="90"
                    step="1"
                    value={fov}
                    onChange={(event) => setFov(Number(event.target.value))}
                    className="flex-1 accent-[#d8b66a]"
                    aria-label="Campo de visão da câmera, em graus"
                  />
                  <span className="w-12 text-right font-mono text-gold">{fov}°</span>
                </label>
                <button
                  type="button"
                  onClick={() => setFov(CAMERA_FOV)}
                  className="mt-3 rounded-full border border-white/20 px-3 py-1.5 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                >
                  Voltar ao padrão ({CAMERA_FOV}°)
                </button>
              </div>
            )}

            {showTrails && (
              <div className="mx-auto mt-4 max-w-2xl border-t border-white/10 pt-4">
                <StarTrails videoRef={videoRef} />
              </div>
            )}

            {showCities && (
              <div className="mx-auto mt-4 max-w-2xl border-t border-white/10 pt-4">
                <p className="mb-3 text-xs text-ivory/70">
                  Sem localização, a altura da estrela não pode ser calculada. Escolha uma
                  cidade:
                </p>
                <div className="flex flex-wrap gap-2">
                  {FALLBACK_CITIES.map((city) => (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => {
                        setFix({ lat: city.lat, lon: city.lon })
                        setPlaceName(city.name)
                        setShowCities(false)
                      }}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}