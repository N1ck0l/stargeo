import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StarTrails } from './StarTrails'
import { brightStars } from '../../data/brightStars'
import { kausAustralis, sagittariusStars } from '../../data/star'
import { useContent } from '../../lib/contentContext'
import { cardinal, devicePointing, equatorialToHorizontal, wrap180 } from '../../../../shared/sky.js'
import {
  emPunhos,
  grausDoRaio,
  mensagemDeObservacao,
  observacao,
  projetarNaTela,
  separacao,
  suavizador,
} from '../../../../shared/mira.js'

/**
 * Campo de visão da câmera traseira no lado COMPRIDO da imagem, em graus.
 * Varia entre aparelhos (55°–80°): é uma aproximação, e a pessoa ajusta em
 * "Calibrar" até a estrela cair no círculo quando aponta para ela.
 */
const CAMERA_FOV = 68

/** Raio do retículo no centro da tela, em px. */
const RETICULO = 56

/** Sem leitura nova da bússola por mais que isto, a direção não é confiável. */
const SENSOR_PARADO_MS = 2000

/**
 * Cidades brasileiras como alternativa quando a pessoa recusa a localização.
 * Sem latitude não dá para calcular a altura da estrela.
 */
const FALLBACK_CITIES = [
  { name: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
  { name: 'Belo Horizonte', lat: -19.9167, lon: -43.9345 },
  { name: 'Brasília', lat: -15.7939, lon: -47.8828 },
  { name: 'Salvador', lat: -12.9777, lon: -38.5016 },
  { name: 'Aracaju', lat: -10.9472, lon: -37.0731 },
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

/** Rotação da tela em graus (0 retrato; 90/270 paisagem), nos dois sistemas. */
function anguloDaTela() {
  if (typeof window === 'undefined') return 0
  const a = window.screen?.orientation?.angle ?? window.orientation ?? 0
  return ((Number(a) % 360) + 360) % 360
}

/**
 * Mira celeste — "aponte para o céu e ache a estrela".
 *
 * Dois modos, a mesma estrela:
 * - **Mira com câmera**: a câmera ao fundo e, por cima, a direção da estrela
 *   projetada com a orientação COMPLETA do aparelho (`shared/mira.js`:
 *   inclinado de lado, tela em paisagem). O centro da tela é para onde o
 *   celular aponta; a seta na borda do círculo indica para onde virar.
 * - **Mapa celeste**: sem câmera — o céu visto de cima (centro = acima da
 *   cabeça, borda = horizonte) com os pontos cardeais e a estrela.
 *
 * Honestidade, porque isto é um presente:
 * - a câmera só mostra a DIREÇÃO; estrelas raramente aparecem na imagem, e
 *   de dia nunca;
 * - "Você está apontando para…" só com bússola ABSOLUTA, com leituras
 *   recentes e sem aviso de imprecisão — nunca com sensor parado, relativo ou
 *   ausente (sem leituras inventadas);
 * - a observação (`observacao`) considera o Sol e o crepúsculo e nunca diz
 *   "visível agora": diz se ela está acima do horizonte e se o céu permite
 *   TENTAR.
 *
 * Fluxo de permissão: o motivo de cada uma é dito antes de pedir.
 * 1. `intro` → a pessoa escolhe o modo;
 * 2. orientação (`DeviceOrientationEvent.requestPermission`, só iOS);
 * 3. câmera, só no modo câmera — opcional, sem ela a mira segue em fundo escuro;
 * 4. localização — negada, cai na escolha de cidade.
 *
 * Diálogo modal de verdade: `role="dialog"`, foco preso, Esc fecha, fundo
 * travado; a câmera é desligada ao fechar e ao trocar para o mapa.
 */
export function SkyFinder({ onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const dialogRef = useRef(null)
  const closedRef = useRef(false)

  const { content } = useContent()
  const estrela = content.estrela ?? kausAustralis
  const celestes = content.skyFigura?.stars ?? sagittariusStars

  const [stage, setStage] = useState('intro') // intro | starting | active
  const [modo, setModo] = useState('camera') // camera | mapa
  const [camera, setCamera] = useState('desligada') // ligada | negada | indisponivel | desligada
  const [fix, setFix] = useState(null)
  const [lugar, setLugar] = useState({ estado: 'aguardando', nome: '' }) // aguardando | gps | cidade | negada
  const [showCities, setShowCities] = useState(false)
  const [orientacao, setOrientacao] = useState(null) // { alpha, beta, gamma } suavizada
  const [fonte, setFonte] = useState(null) // absoluta | ios | relativa
  const [accuracy, setAccuracy] = useState(null)
  const [ultimaLeitura, setUltimaLeitura] = useState(0)
  const [semSensor, setSemSensor] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [fov, setFov] = useState(CAMERA_FOV)
  const [painel, setPainel] = useState(null) // calibrar | rastros | null
  const [tela, setTela] = useState(() => ({
    largura: typeof window === 'undefined' ? 390 : window.innerWidth,
    altura: typeof window === 'undefined' ? 844 : window.innerHeight,
    angulo: anguloDaTela(),
  }))

  // Tamanho e rotação da tela.
  useEffect(() => {
    const medir = () => setTela({ largura: window.innerWidth, altura: window.innerHeight, angulo: anguloDaTela() })
    window.addEventListener('resize', medir)
    window.addEventListener('orientationchange', medir)
    window.screen?.orientation?.addEventListener?.('change', medir)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('orientationchange', medir)
      window.screen?.orientation?.removeEventListener?.('change', medir)
    }
  }, [])

  /** Desliga a câmera e devolve o indicador do sistema. */
  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    closedRef.current = false
    return () => {
      closedRef.current = true
      pararCamera()
    }
  }, [pararCamera])

  // Relógio: a estrela se move ~1° a cada 4 minutos; o "sensor parado" é
  // reavaliado no mesmo ritmo curto.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
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
      } else if (!dialogRef.current?.contains(document.activeElement)) {
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
    if (stage !== 'active') return undefined
    let vivo = true
    const suave = suavizador(0.3)

    /*
     * O NORTE de verdade, por sistema:
     * - Android (Chrome): `deviceorientationabsolute` traz a bússola; o
     *   `deviceorientation` comum é RELATIVO (zero = para onde o celular
     *   apontava ao abrir) e é ignorado quando o absoluto existe;
     * - iPhone: `webkitCompassHeading` (graus no sentido horário) no evento
     *   comum; `webkitCompassAccuracy` diz o erro (−1 = sem calibração).
     * Sem nenhum dos dois, o relativo é usado só para o desenho — e a mira
     * avisa que a direção não é confiável.
     */
    const absolutoDisponivel = 'ondeviceorientationabsolute' in window
    const onOrientation = (event) => {
      if (!vivo || event.beta === null || event.beta === undefined) return
      let alpha = null
      let origem = null
      if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
        alpha = (360 - event.webkitCompassHeading) % 360
        origem = 'ios'
      } else if (event.type === 'deviceorientationabsolute' || event.absolute === true) {
        alpha = event.alpha
        origem = 'absoluta'
      } else if (!absolutoDisponivel) {
        alpha = event.alpha
        origem = 'relativa'
      }
      if (alpha === null || alpha === undefined) return
      setOrientacao(suave({ alpha, beta: event.beta, gamma: event.gamma ?? 0 }))
      setFonte(origem)
      setUltimaLeitura(Date.now())
      if (typeof event.webkitCompassAccuracy === 'number') setAccuracy(event.webkitCompassAccuracy)
      setSemSensor(false)
    }

    window.addEventListener('deviceorientation', onOrientation)
    if (absolutoDisponivel) window.addEventListener('deviceorientationabsolute', onOrientation)
    // Permissão concedida não prova que o sensor funciona: só dado de verdade.
    const timer = setTimeout(() => {
      if (vivo) setSemSensor((atual) => atual || !document.hidden)
    }, 3500)
    return () => {
      vivo = false
      clearTimeout(timer)
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('deviceorientationabsolute', onOrientation)
    }
  }, [stage])

  // --- localização ---------------------------------------------------------
  const localizar = useCallback(() => {
    if (!navigator.geolocation) {
      setLugar({ estado: 'negada', nome: '' })
      setShowCities(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFix({ lat: position.coords.latitude, lon: position.coords.longitude })
        setLugar({ estado: 'gps', nome: 'Sua localização' })
        setShowCities(false)
      },
      () => {
        setLugar((atual) => (atual.estado === 'cidade' ? atual : { estado: 'negada', nome: '' }))
        setShowCities(true)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    )
  }, [])

  // --- câmera --------------------------------------------------------------
  const ligarCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera('indisponivel')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      if (closedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // O Safari às vezes ignora o autoplay e deixa a imagem preta.
        videoRef.current.play?.()?.catch(() => {})
      }
      setCamera('ligada')
    } catch {
      setCamera('negada')
    }
  }, [])

  // --- início --------------------------------------------------------------
  const iniciar = useCallback(
    async (modoEscolhido) => {
      setModo(modoEscolhido)
      setStage('starting')
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          await DeviceOrientationEvent.requestPermission()
        } catch {
          // O aviso real vem do teste de dados (`semSensor`).
        }
        if (closedRef.current) return
      }
      if (modoEscolhido === 'camera') await ligarCamera()
      if (closedRef.current) return
      setStage('active')
      localizar()
    },
    [ligarCamera, localizar],
  )

  const trocarModo = useCallback(
    (novo) => {
      setModo(novo)
      setPainel(null)
      if (novo === 'mapa') {
        pararCamera()
        setCamera('desligada')
      } else if (!streamRef.current) {
        ligarCamera()
      }
    },
    [ligarCamera, pararCamera],
  )

  // O vídeo só existe no modo câmera: religa o stream quando ele volta a montar.
  useEffect(() => {
    if (modo === 'camera' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play?.()?.catch(() => {})
    }
  }, [modo, stage, camera])

  // --- cálculos ------------------------------------------------------------
  const alvoCeu = useMemo(() => {
    if (!fix) return null
    return equatorialToHorizontal(estrela.ra.hoursDecimal, estrela.dec.decimal, fix.lat, fix.lon, now)
  }, [estrela, fix, now])

  // A observação muda devagar: recalcula de minuto em minuto.
  const minuto = Math.floor(now.getTime() / 60000)
  const obs = useMemo(() => {
    if (!fix) return null
    return observacao(
      { ra: estrela.ra.hoursDecimal, dec: estrela.dec.decimal, mag: estrela.magnitude },
      fix.lat,
      fix.lon,
      new Date(minuto * 60000),
    )
  }, [estrela, fix, minuto])
  const mensagem = mensagemDeObservacao(obs, now)

  const pointing = orientacao ? devicePointing(orientacao.alpha, orientacao.beta, orientacao.gamma) : null

  /*
   * Estado do sensor, do mais grave ao bom. Só `ok` permite dizer que a
   * pessoa está apontando para a estrela.
   */
  const parado = orientacao && now.getTime() - ultimaLeitura > SENSOR_PARADO_MS
  const bussolaRuim = accuracy !== null && (accuracy < 0 || accuracy > 25)
  const sensor = !orientacao
    ? semSensor
      ? 'sem-sensor'
      : 'aguardando'
    : parado
      ? 'parado'
      : fonte === 'relativa'
        ? 'relativa'
        : bussolaRuim
          ? 'imprecisa'
          : 'ok'
  const confiavel = sensor === 'ok'

  const medidas = { largura: tela.largura, altura: tela.altura, fov }
  const naTela = (pos) => projetarNaTela(pos, orientacao, tela.angulo, medidas)
  const dentroDaTela = (p) => p.naFrente && p.x > -20 && p.x < tela.largura + 20 && p.y > -20 && p.y < tela.altura + 20

  // A estrela em relação ao centro da tela (barato: recalcula a cada leitura).
  const alvo = (() => {
    if (!alvoCeu || !orientacao || !pointing) return null
    const p = naTela(alvoCeu)
    return {
      ...p,
      sep: separacao(alvoCeu, pointing),
      tolerancia: grausDoRaio(RETICULO, medidas),
      noCirculo: p.naFrente && Math.hypot(p.x - tela.largura / 2, p.y - tela.altura / 2) <= RETICULO,
      dAz: wrap180(alvoCeu.azimuth - pointing.azimuth),
      dAlt: alvoCeu.altitude - pointing.altitude,
    }
  })()

  // Céu em volta (as brilhantes) e a figura da constelação, só no modo câmera.
  const ceuEmVolta = useMemo(() => {
    if (!fix) return []
    return brightStars
      .map((star) => ({ ...star, mag: star.m ?? star.mag, ...equatorialToHorizontal(star.ra, star.dec, fix.lat, fix.lon, new Date(minuto * 60000)) }))
      .filter((star) => star.altitude > -5)
  }, [fix, minuto])
  const figura = useMemo(() => {
    if (!fix) return []
    return celestes
      .filter((star) => !star.dedicated)
      .map((star) => ({ ...star, ...equatorialToHorizontal(star.ra, star.dec, fix.lat, fix.lon, new Date(minuto * 60000)) }))
  }, [celestes, fix, minuto])

  /*
   * Portal no fim do `body`: o diálogo é `fixed z-50`, e um ancestral com
   * `z-index` criaria um contexto de empilhamento que o prenderia por baixo
   * do cabeçalho da loja.
   */
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Mira celeste: para onde fica ${estrela.commonName}`}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-night text-ivory"
    >
      {modo === 'camera' && (
        <>
          <video ref={videoRef} autoPlay playsInline muted aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-night/85 via-night/25 to-night/95" aria-hidden="true" />
        </>
      )}

      {/* Cabeçalho: o nome da estrela em destaque e a troca de modo. */}
      <div className="safe-top relative z-20 px-5 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-display text-[10px] tracking-[0.3em] text-gold uppercase">Mira celeste</p>
            <h2 className="font-serif mt-1 truncate text-2xl sm:text-3xl">{estrela.commonName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar a mira celeste"
            className="min-h-11 rounded-full border border-white/25 bg-night/40 px-4 text-sm transition hover:border-gold hover:text-gold"
          >
            Fechar
          </button>
        </div>
        {stage === 'active' && (
          <div role="group" aria-label="Modo da mira" className="mt-3 inline-flex rounded-full border border-white/15 bg-night/60 p-1 text-sm">
            {[
              ['camera', 'Mira com câmera'],
              ['mapa', 'Mapa celeste'],
            ].map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                onClick={() => trocarModo(valor)}
                aria-pressed={modo === valor}
                className={`min-h-10 rounded-full px-4 transition ${modo === valor ? 'bg-gold text-night' : 'text-ivory/80 hover:text-ivory'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}
        {stage === 'active' && modo === 'camera' && (
          <p className="mt-2 max-w-xs text-[11px] leading-snug text-ivory/60 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
            A câmera só mostra a direção: a estrela fica muito além de qualquer parede ou objeto da imagem.
          </p>
        )}
      </div>

      {stage !== 'active' ? (
        <Introducao estrela={estrela} iniciando={stage === 'starting'} aoIniciar={iniciar} />
      ) : (
        <>
          {modo === 'camera' ? (
            <CamadaDaCamera
              estrela={estrela}
              alvo={alvo}
              alvoCeu={alvoCeu}
              pointing={pointing}
              tela={tela}
              naTela={naTela}
              dentroDaTela={dentroDaTela}
              ceuEmVolta={ceuEmVolta}
              figura={figura}
            />
          ) : (
            <MapaCeleste estrela={estrela} alvoCeu={alvoCeu} ceu={ceuEmVolta} figura={figura} pointing={confiavel ? pointing : null} />
          )}

          {/* Instruções e estado: texto sempre, sem depender de cor ou animação. */}
          <div className="relative z-20 flex min-h-0 flex-1 flex-col items-center justify-end px-5 pb-3 landscape:absolute landscape:top-24 landscape:right-4 landscape:w-72 landscape:flex-none landscape:justify-start landscape:px-0 landscape:pb-0">
            {modo === 'camera' && (
              <Instrucoes estrela={estrela} alvo={alvo} alvoCeu={alvoCeu} sensor={sensor} obs={obs} camera={camera} temLugar={Boolean(fix)} />
            )}
          </div>

          {/* Rodapé: a observação, os dados e três controles. */}
          <div className="safe-bottom relative z-20 max-h-[46vh] shrink-0 overflow-y-auto border-t border-white/10 bg-night/85 px-5 pt-3 text-sm backdrop-blur landscape:mt-auto landscape:max-h-[42vh] landscape:pr-[19rem]">
            <div className="mx-auto max-w-2xl">
              <div
                className={`rounded-xl border px-3 py-2 ${obs?.estado === 'boa' ? 'border-gold/40 bg-gold/10' : 'border-white/15 bg-white/5'}`}
                role="status"
              >
                <p className="text-sm font-medium text-ivory">{mensagem.titulo}</p>
                {/* Em paisagem a tela é baixa: o título basta, o detalhe volta em retrato. */}
                <p className="mt-0.5 text-xs leading-relaxed text-ivory/70 landscape:hidden">{mensagem.detalhe}</p>
              </div>

              {alvoCeu && (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ivory/75 sm:flex sm:flex-wrap sm:gap-x-6">
                  <div>
                    <dt className="inline text-gold/85">Altura </dt>
                    <dd className="inline">{alvoCeu.altitude.toFixed(0)}° {alvoCeu.altitude < 0 && '(abaixo do horizonte)'}</dd>
                  </div>
                  <div>
                    <dt className="inline text-gold/85">Direção </dt>
                    <dd className="inline">
                      {alvoCeu.azimuth.toFixed(0)}° ({cardinal(alvoCeu.azimuth)})
                    </dd>
                  </div>
                  {modo === 'camera' && confiavel && alvo && (
                    <div>
                      <dt className="inline text-gold/85">Falta </dt>
                      <dd className="inline">{alvo.sep.toFixed(0)}° até a estrela</dd>
                    </div>
                  )}
                  {modo === 'camera' && pointing && (
                    <div>
                      <dt className="inline text-gold/85">Celular </dt>
                      <dd className="inline">
                        {confiavel ? `${pointing.azimuth.toFixed(0)}° · altura ${pointing.altitude.toFixed(0)}°` : 'bússola não confiável'}
                      </dd>
                    </div>
                  )}
                </dl>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => (fix ? setShowCities((v) => !v) : localizar())}
                  aria-expanded={showCities}
                  className="min-h-11 rounded-full border border-white/20 px-4 text-xs text-ivory/85 transition hover:border-gold hover:text-gold"
                >
                  {fix ? `📍 ${lugar.nome}` : 'Usar minha localização'}
                </button>
                {modo === 'camera' && (
                  <button
                    type="button"
                    onClick={() => setPainel((p) => (p === 'calibrar' ? null : 'calibrar'))}
                    aria-expanded={painel === 'calibrar'}
                    className="min-h-11 rounded-full border border-white/20 px-4 text-xs text-ivory/85 transition hover:border-gold hover:text-gold"
                  >
                    Calibrar
                  </button>
                )}
                {modo === 'camera' && camera === 'ligada' && (
                  <button
                    type="button"
                    onClick={() => setPainel((p) => (p === 'rastros' ? null : 'rastros'))}
                    aria-expanded={painel === 'rastros'}
                    className="min-h-11 rounded-full border border-white/20 px-4 text-xs text-ivory/85 transition hover:border-gold hover:text-gold"
                  >
                    Rastros
                  </button>
                )}
              </div>

              {painel === 'calibrar' && (
                <Calibracao estrela={estrela} fov={fov} setFov={setFov} sensor={sensor} fonte={fonte} accuracy={accuracy} />
              )}
              {painel === 'rastros' && camera === 'ligada' && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <StarTrails videoRef={videoRef} />
                </div>
              )}
              {showCities && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="mb-3 text-xs text-ivory/70">
                    {lugar.estado === 'negada'
                      ? 'A localização não foi liberada. Escolha a cidade mais próxima — a posição da estrela fica aproximada:'
                      : 'Escolha outra cidade (ou use a localização do aparelho):'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {lugar.estado !== 'gps' && (
                      <button type="button" onClick={localizar} className="min-h-10 rounded-full border border-gold/50 px-3 text-xs text-gold">
                        Tentar a localização de novo
                      </button>
                    )}
                    {FALLBACK_CITIES.map((city) => (
                      <button
                        key={city.name}
                        type="button"
                        onClick={() => {
                          setFix({ lat: city.lat, lon: city.lon })
                          setLugar({ estado: 'cidade', nome: city.name })
                          setShowCities(false)
                        }}
                        className="min-h-10 rounded-full border border-white/20 px-3 text-xs text-ivory/80 transition hover:border-gold hover:text-gold"
                      >
                        {city.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

/** Antes de pedir qualquer permissão: o que é, o que precisa e por quê. */
function Introducao({ estrela, iniciando, aoIniciar }) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-6 text-center">
      <div className="max-w-md">
        <svg width="56" height="56" viewBox="0 0 72 72" aria-hidden="true" className="mx-auto text-gold">
          <path d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z" fill="currentColor" />
        </svg>
        <h3 className="font-serif mt-5 text-2xl">Onde fica {estrela.commonName} no seu céu</h3>
        <p className="mt-4 leading-relaxed text-ivory/75">
          Calculamos a posição real dela agora, a partir de onde você está. Na mira, aponte o celular e siga a seta até a
          estrela cair no círculo do centro.
        </p>
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm text-ivory/70">
          <li>
            <span className="text-gold">Localização</span> — para saber como o céu está visto daí.
          </li>
          <li>
            <span className="text-gold">Movimento e bússola</span> — para saber para onde o celular aponta.
          </li>
          <li>
            <span className="text-gold">Câmera</span> (opcional) — só como fundo. Ela mostra a DIREÇÃO; estrelas quase nunca
            aparecem na imagem, e de dia nunca.
          </li>
        </ul>
        <div className="mt-7 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => aoIniciar('camera')}
            disabled={iniciando}
            className="min-h-12 rounded-full bg-gold px-7 font-medium text-night transition hover:bg-gold-soft disabled:opacity-60"
          >
            {iniciando ? 'Abrindo…' : 'Abrir a mira com câmera'}
          </button>
          <button
            type="button"
            onClick={() => aoIniciar('mapa')}
            disabled={iniciando}
            className="min-h-12 rounded-full border border-white/25 px-7 text-ivory transition hover:border-gold hover:text-gold disabled:opacity-60"
          >
            Ver no mapa celeste (sem câmera)
          </button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ivory/50">
          A bússola do celular erra alguns graus — às vezes 20° ou mais dentro de casa, perto de metal e eletrônicos. Ao ar
          livre, à noite, funciona melhor.
        </p>
      </div>
    </div>
  )
}

/**
 * A camada sobre a câmera: céu em volta, horizonte, a estrela (com o nome),
 * o retículo fixo no centro e a seta na borda dele.
 */
function CamadaDaCamera({ estrela, alvo, alvoCeu, pointing, tela, naTela, dentroDaTela, ceuEmVolta, figura }) {
  if (!alvo || !pointing) return null

  // O horizonte: a linha de altura 0 nos azimutes à frente do aparelho.
  const horizonte = []
  for (let d = -80; d <= 80; d += 4) {
    const p = naTela({ altitude: 0, azimuth: pointing.azimuth + d })
    if (p.naFrente) horizonte.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`)
  }
  const cardeais = [
    ['N', 0],
    ['L', 90],
    ['S', 180],
    ['O', 270],
  ]
    .map(([rotulo, az]) => ({ rotulo, p: naTela({ altitude: 0, azimuth: az }) }))
    .filter(({ p }) => dentroDaTela(p))
  const centro = { x: tela.largura / 2, y: tela.altura / 2 }
  const abaixo = alvoCeu.altitude < 0

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
      <svg className="absolute inset-0" width={tela.largura} height={tela.altura}>
        {horizonte.length > 1 && (
          <polyline points={horizonte.join(' ')} fill="none" stroke="#d8b66a" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="6 6" />
        )}
      </svg>
      {cardeais.map(({ rotulo, p }) => (
        <span key={rotulo} className="absolute -translate-x-1/2 translate-y-1.5 text-xs font-medium tracking-widest text-gold/85" style={{ left: p.x, top: p.y }}>
          {rotulo}
        </span>
      ))}
      {horizonte.length > 1 && (
        <span className="absolute left-3 text-[10px] tracking-[0.2em] text-gold/60 uppercase" style={{ top: Number(horizonte[0].split(',')[1]) - 16 }}>
          horizonte
        </span>
      )}

      {ceuEmVolta.map((star) => {
        const p = naTela(star)
        if (!dentroDaTela(p) || star.altitude < 0) return null
        const r = Math.max(1.5, Math.min(5, 6.5 - (star.mag ?? 3) * 1.3))
        return <span key={`c-${star.ra}-${star.dec}`} className="absolute rounded-full bg-ivory/55" style={{ left: p.x - r / 2, top: p.y - r / 2, width: r, height: r }} />
      })}
      {figura.map((star) => {
        const p = naTela(star)
        if (!dentroDaTela(p)) return null
        return <span key={`f-${star.id}`} className="absolute size-[6px] rounded-full bg-ivory/80" style={{ left: p.x - 3, top: p.y - 3 }} />
      })}

      {/* A estrela: anel tracejado quando está abaixo do horizonte. */}
      {dentroDaTela(alvo) && (
        <span className="absolute" style={{ left: alvo.x, top: alvo.y }}>
          <span
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${abaixo ? 'size-3 border border-dashed border-gold/70' : 'size-4 bg-gold shadow-[0_0_22px_rgba(216,182,106,0.95)]'}`}
          />
          <span className={`absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border ${abaixo ? 'border-dashed border-gold/40' : 'border-gold/60'}`} />
          <span className="absolute top-5 -translate-x-1/2 whitespace-nowrap font-serif text-sm text-gold [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
            {estrela.commonName}
            {abaixo ? ' · abaixo do horizonte' : ''}
          </span>
        </span>
      )}

      {/* Retículo fixo no centro: para onde o celular aponta. */}
      <span
        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border ${alvo.noCirculo ? 'border-gold' : 'border-gold/40'}`}
        style={{ left: centro.x, top: centro.y, width: RETICULO * 2, height: RETICULO * 2 }}
      />
      <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/70" style={{ left: centro.x, top: centro.y }} />
      {!alvo.noCirculo && (
        <svg
          width="44"
          height="44"
          viewBox="0 0 24 24"
          className="absolute text-gold drop-shadow-[0_0_6px_rgba(0,0,0,0.85)]"
          style={{ left: centro.x, top: centro.y, transform: `translate(-50%, -50%) rotate(${alvo.angulo}deg) translateX(${RETICULO + 22}px)` }}
        >
          <path d="M8 5 L16 12 L8 19" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

/** O que fazer agora, em texto — o que a seta mostra, dito em palavras. */
function Instrucoes({ estrela, alvo, alvoCeu, sensor, obs, camera, temLugar }) {
  const avisoCamera =
    camera === 'negada' || camera === 'indisponivel' ? (
      <p className="mt-2 text-xs text-ivory/55">Câmera desligada: a mira funciona assim mesmo, sobre o fundo escuro.</p>
    ) : null

  if (!temLugar) {
    return (
      <Caixa>
        <p>Falta a sua localização para calcular onde a estrela está.</p>
        {avisoCamera}
      </Caixa>
    )
  }
  if (sensor === 'aguardando') return <Caixa>Lendo os sensores do celular…</Caixa>
  if (sensor === 'sem-sensor') {
    return (
      <Caixa>
        <p>Os sensores de movimento não responderam — a mira não sabe para onde o celular aponta.</p>
        <p className="mt-1.5 text-xs text-ivory/60">
          No iPhone: Ajustes → Safari → Movimento e Orientação. Ou use o <strong>Mapa celeste</strong>, que funciona sem eles.
        </p>
      </Caixa>
    )
  }
  if (!alvo) return null

  const horizontal = Math.abs(alvo.dAz) > alvo.tolerancia ? `Gire para a ${alvo.dAz > 0 ? 'direita' : 'esquerda'}${Math.abs(alvo.dAz) > 100 ? ' (ela está às suas costas)' : ''}` : null
  const vertical = alvo.dAlt > alvo.tolerancia ? 'Incline o celular para cima' : alvo.dAlt < -alvo.tolerancia ? 'Incline o celular para baixo' : null
  const naDirecao = alvo.noCirculo || alvo.sep <= alvo.tolerancia

  return (
    <Caixa>
      {sensor === 'relativa' && (
        <p className="mb-2 text-xs text-gold-soft">
          Este navegador não dá acesso à bússola: a seta acompanha o movimento, mas o norte pode estar errado. Prefira o Mapa
          celeste.
        </p>
      )}
      {sensor === 'imprecisa' && (
        <p className="mb-2 text-xs text-gold-soft">
          Bússola imprecisa. Afaste-se de metal e eletrônicos e mova o celular em forma de 8 por alguns segundos.
        </p>
      )}
      {sensor === 'parado' && <p className="mb-2 text-xs text-gold-soft">O sensor parou de responder — mova o celular.</p>}

      {naDirecao && sensor === 'ok' ? (
        alvoCeu.altitude < 0 ? (
          <p>
            <span className="font-serif text-xl text-gold">Esta é a direção de {estrela.commonName}</span>
            <span className="mt-1 block text-sm text-ivory/75">Mas agora ela está abaixo do horizonte — do outro lado da Terra.</span>
          </p>
        ) : (
          <p>
            <span className="font-serif text-xl text-gold">Você está apontando para {estrela.commonName} ✦</span>
            <span className="mt-1 block text-sm text-ivory/75">
              {obs?.estado === 'boa'
                ? 'Olhe para o céu nessa direção, além de qualquer prédio ou árvore.'
                : 'A direção é esta. ' + (obs?.estado === 'ceu-claro' ? 'Com o céu claro, ela não aparece agora.' : 'Veja abaixo quando dá para tentar vê-la.')}
            </span>
          </p>
        )
      ) : (
        <p>
          {horizontal && <span className="block">{horizontal}</span>}
          {vertical && <span className="block">{vertical}</span>}
          {!horizontal && !vertical && <span className="block">Você está perto da direção certa — ajuste devagar</span>}
          {naDirecao && sensor !== 'ok' && (
            <span className="mt-1 block text-xs text-ivory/60">Com a bússola assim, a direção é só aproximada.</span>
          )}
        </p>
      )}
      {avisoCamera}
    </Caixa>
  )
}

function Caixa({ children }) {
  return (
    <div className="max-w-sm rounded-2xl border border-white/10 bg-night/75 px-4 py-2.5 text-center text-[15px] leading-snug backdrop-blur" role="status">
      {children}
    </div>
  )
}

/** Campo de visão e o estado da bússola. */
function Calibracao({ estrela, fov, setFov, sensor, fonte, accuracy }) {
  const descricao = {
    ok: fonte === 'ios' ? 'Bússola do iPhone respondendo.' : 'Bússola do aparelho respondendo.',
    imprecisa: 'Bússola imprecisa.',
    relativa: 'Sem bússola absoluta neste navegador.',
    parado: 'O sensor parou de responder.',
    'sem-sensor': 'Sensores de movimento indisponíveis.',
    aguardando: 'Aguardando os sensores.',
  }[sensor]
  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-xs text-ivory/75">
      <p>
        <span className="text-gold">Bússola:</span> {descricao}
        {accuracy !== null && accuracy >= 0 && ` Erro estimado: ±${accuracy.toFixed(0)}°.`} Nenhum celular garante a direção
        exata.
      </p>
      <p>Para melhorar: afaste-se de metal e eletrônicos e mova o celular devagar em forma de 8 por alguns segundos.</p>
      <p>
        Se, apontando para {estrela.commonName}, ela ficar fora do círculo mesmo com a bússola boa, ajuste o campo de visão
        da câmera:
      </p>
      <label className="flex items-center gap-3">
        <span className="w-24 shrink-0">Campo de visão</span>
        <input
          type="range"
          min="45"
          max="90"
          step="1"
          value={fov}
          onChange={(event) => setFov(Number(event.target.value))}
          className="min-h-8 flex-1 accent-[#d8b66a]"
          aria-label="Campo de visão da câmera, em graus"
        />
        <span className="w-10 text-right font-mono text-gold">{fov}°</span>
      </label>
      <button type="button" onClick={() => setFov(CAMERA_FOV)} className="min-h-10 rounded-full border border-white/20 px-3 text-ivory/80 hover:border-gold hover:text-gold">
        Voltar ao padrão ({CAMERA_FOV}°)
      </button>
    </div>
  )
}

/**
 * O céu visto de cima, sem câmera: o centro é o ponto acima da cabeça
 * (zênite), a borda é o horizonte; norte em cima, leste à direita — como uma
 * bússola. Com bússola confiável, uma faixa mostra para onde o celular está
 * virado.
 */
function MapaCeleste({ estrela, alvoCeu, ceu, figura, pointing }) {
  const tam = 300
  const c = tam / 2
  const raio = 128
  const ponto = (alt, az) => {
    const rho = (raio * (90 - Math.max(alt, -12))) / 90
    const z = (az * Math.PI) / 180
    return { x: c + rho * Math.sin(z), y: c - rho * Math.cos(z) }
  }
  const abaixo = alvoCeu && alvoCeu.altitude < 0
  const alvo = alvoCeu ? ponto(alvoCeu.altitude, alvoCeu.azimuth) : null
  const cardeais = [
    ['N', 0],
    ['NE', 45],
    ['L', 90],
    ['SE', 135],
    ['S', 180],
    ['SO', 225],
    ['O', 270],
    ['NO', 315],
  ]

  return (
    <div className="relative z-10 flex flex-col items-center px-4 pt-2">
      <svg viewBox={`0 0 ${tam} ${tam}`} className="w-full max-w-[min(88vw,46vh)]" role="img" aria-label={`Mapa do céu com ${estrela.commonName}`}>
        <defs>
          <radialGradient id="ceu-mapa" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1c2257" />
            <stop offset="1" stopColor="#0b0d26" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={raio} fill="url(#ceu-mapa)" stroke="#d8b66a" strokeOpacity="0.7" />
        {[30, 60].map((alt) => (
          <circle key={alt} cx={c} cy={c} r={(raio * (90 - alt)) / 90} fill="none" stroke="#d8b66a" strokeOpacity="0.15" strokeDasharray="3 4" />
        ))}
        {pointing && (
          <path
            d={(() => {
              const a = ((pointing.azimuth - 15) * Math.PI) / 180
              const b = ((pointing.azimuth + 15) * Math.PI) / 180
              return `M${c} ${c} L${c + raio * Math.sin(a)} ${c - raio * Math.cos(a)} A${raio} ${raio} 0 0 1 ${c + raio * Math.sin(b)} ${c - raio * Math.cos(b)} Z`
            })()}
            fill="#d8b66a"
            fillOpacity="0.12"
          />
        )}
        {ceu
          .filter((s) => s.altitude > 0)
          .map((s) => {
            const p = ponto(s.altitude, s.azimuth)
            return <circle key={`m-${s.ra}-${s.dec}`} cx={p.x} cy={p.y} r={Math.max(0.8, Math.min(2.6, 3 - (s.mag ?? 3) * 0.6))} fill="#f4ecd8" fillOpacity="0.7" />
          })}
        {figura
          .filter((s) => s.altitude > 0)
          .map((s) => {
            const p = ponto(s.altitude, s.azimuth)
            return <circle key={`mf-${s.id}`} cx={p.x} cy={p.y} r="1.8" fill="#f4ecd8" fillOpacity="0.85" />
          })}
        {cardeais.map(([rotulo, az]) => {
          const p = { x: c + (raio + 12) * Math.sin((az * Math.PI) / 180), y: c - (raio + 12) * Math.cos((az * Math.PI) / 180) }
          return (
            <text key={rotulo} x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={rotulo.length === 1 ? 11 : 8} fill="#d8b66a" fillOpacity={rotulo.length === 1 ? 1 : 0.6} fontFamily="Montserrat, sans-serif">
              {rotulo}
            </text>
          )
        })}
        {alvo && (
          <g>
            <circle cx={alvo.x} cy={alvo.y} r="9" fill="none" stroke="#d8b66a" strokeDasharray={abaixo ? '2 2' : undefined} />
            {!abaixo && <circle cx={alvo.x} cy={alvo.y} r="4" fill="#d8b66a" />}
            <text x={alvo.x} y={alvo.y - 13} textAnchor="middle" fontSize="10" fill="#f4ecd8" fontFamily="Playfair Display, serif" stroke="#0b0d26" strokeWidth="3" paintOrder="stroke">
              {estrela.commonName}
            </text>
          </g>
        )}
      </svg>
      <p className="mt-2 max-w-sm text-center text-xs leading-relaxed text-ivory/60">
        Visto de cima: o centro é o ponto bem acima da sua cabeça, a borda é o horizonte.{pointing ? ' A faixa clara é para onde o celular está virado.' : ''}
      </p>
      {alvoCeu && (
        <p className="mt-2 max-w-sm text-center text-sm text-ivory/85" role="status">
          {abaixo
            ? `Agora ${estrela.commonName} está abaixo do horizonte, na direção ${cardinal(alvoCeu.azimuth)}.`
            : `Vire-se para o ${cardinal(alvoCeu.azimuth)} (${alvoCeu.azimuth.toFixed(0)}°) e olhe a ${alvoCeu.altitude.toFixed(0)}° de altura — ${emPunhos(alvoCeu.altitude)}.`}
        </p>
      )}
    </div>
  )
}
