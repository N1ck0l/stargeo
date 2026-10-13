import { useEffect, useRef, useState } from 'react'

/**
 * Registrador de rastros de estrelas.
 *
 * Mantém um canvas em accumulation e, a cada quadro, redesenha a cena do
 * fundo do aparelho por cima do que já estava lá. Como o céu gira ~1° a cada
 * 4 minutos, o resultado depois de alguns minutos são os arcos deixados pelas
 * estrelas — o mesmo efeito de uma longa exposição, feito no aparelho.
 */
export function StarTrails({ videoRef }) {
  const canvasRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const stop = () => {
    // A limpeza do efeito faz o trabalho de verdade: cancelar o quadro. Aqui
    // basta sair do estado de gravação, o que dispara o cleanup.
    setRecording(false)
  }

  useEffect(() => {
    if (!recording) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let raf = 0
    const startedAt = performance.now()
    // Último segundo mostrado, para não re-renderizar a 60 fps por causa de um
    // número que só muda uma vez por segundo.
    let shownSecond = -1

    const resize = () => {
      const video = videoRef.current
      const width = video?.videoWidth || window.innerWidth
      const height = video?.videoHeight || window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Fundo inicial: sem isso a primeira imagem seria um retângulo preto.
      ctx.fillStyle = '#07061a'
      ctx.fillRect(0, 0, width, height)
      paint()
    }

    const paint = () => {
      const video = videoRef.current
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      if (!video || !video.videoWidth) return

      // `lighter` acumula luz sem escurecer o que já foi desenhado.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.22
      const scale = Math.max(w / video.videoWidth, h / video.videoHeight)
      const dw = video.videoWidth * scale
      const dh = video.videoHeight * scale
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const loop = () => {
      paint()
      const second = Math.floor((performance.now() - startedAt) / 1000)
      if (second !== shownSecond) {
        shownSecond = second
        setElapsed(second)
      }
      raf = requestAnimationFrame(loop)
    }

    resize()

    /*
     * A câmera pode ainda não ter dimensões: logo após abrir, `videoWidth` é 0 e
     * o canvas cairia no tamanho da janela, deixando as trilhas do vídeo
     * desalinhadas — sem chance de se corrigir depois. O `loadedmetadata`
     * dispara assim que o vídeo passa a ter imagem, e aí sim a medição vale.
     */
    const video = videoRef.current
    if (video && !video.videoWidth) {
      video.addEventListener('loadedmetadata', resize, { once: true })
    }

    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      video?.removeEventListener('loadedmetadata', resize)
    }
  }, [recording, videoRef])

  const start = () => {
    setError('')
    // Recomeçar zera o quadro e o contador: o botão dizia "continuar", mas
    // continuava de verdade só para o contador, não para as trilhas.
    setElapsed(0)
    setSaved(false)
    setRecording(true)
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'rastros-kaus-australis.png'
      link.href = dataUrl
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setSaved(true)
    } catch {
      setError('Não foi possível salvar a imagem.')
    }
  }

  return (
    <div className="space-y-2">
      <canvas ref={canvasRef} className="w-full rounded-xl border border-white/10 bg-night" />

      {recording ? (
        <>
          <p className="text-center text-sm text-gold-soft" role="status">
            Gravando há {Math.floor(elapsed / 60)}:
            {String(elapsed % 60).padStart(2, '0')} — deixe o celular parado
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={stop}
              className="flex-1 rounded-full border border-gold/50 px-4 py-2 text-sm text-gold transition hover:bg-gold hover:text-night"
            >
              Parar
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-full bg-gold px-4 py-2 text-sm text-night transition hover:bg-gold-soft"
            >
              Salvar
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={start}
            className="w-full rounded-full border border-gold/50 px-4 py-2 text-sm text-gold transition hover:bg-gold hover:text-night"
          >
            Começar a gravar rastros
          </button>
          {saved && (
            <p role="status" className="text-center text-xs text-gold-soft">
              Imagem salva nas galerias do aparelho.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-center text-xs text-red-200">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-ivory/60">
        Funciona melhor virado para o lado mais escuro do céu, sem lua cheia.
      </p>
    </div>
  )
}