import { useEffect, useState } from 'react'
import qrcode from 'qrcode-generator'
import { SimboloOficial } from '../components/SimboloOficial.jsx'
import { buscarPagina, tokenGuardado } from '../lib/pagina.js'
import { Link } from '../lib/Link.jsx'

/**
 * Cartão para imprimir — `/p/SG-XXXX-XXXX/cartao`.
 *
 * Um cartão A6 (148 × 105 mm) com o QR code da página da estrela: vai dentro
 * de um presente, de um envelope, preso num buquê. Não diz QUAL é a estrela —
 * quem lê o QR descobre —, então combina com a revelação na data (0019): o
 * cartão pode ser entregue antes, e o link abre a contagem até o dia.
 *
 * Fundo claro de propósito: é para a impressora. Na impressão, só o cartão
 * sai (`@media print` abaixo), sem cabeçalho nem rodapé da loja.
 */
export function CartaoPresente({ codigo }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    buscarPagina(codigo, tokenGuardado(codigo))
      .then((d) => {
        if (!vivo) return
        setDados({
          para: d.guardada?.para ?? d.pagina?.conteudo?.nomeCurto ?? '',
          revelaEm: d.guardada?.revelaEm ?? d.pagina?.revelaEm ?? null,
        })
      })
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
  }, [codigo])

  if (erro) {
    return (
      <div className="pilha espaco-secao text-center">
        <h1 className="font-display text-2xl text-ivory">Não encontramos esta página</h1>
        <Link para="/" className="btn btn-primary mt-8">
          Ir para a loja
        </Link>
      </div>
    )
  }
  if (!dados) return <div className="espaco-secao min-h-[60vh]" aria-busy="true" />

  const url = `${window.location.origin}/p/${codigo}`
  const quando = dados.revelaEm
    ? new Date(`${dados.revelaEm}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : null

  return (
    <div className="espaco-secao">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          body * { visibility: hidden !important; }
          .cartao-impressao, .cartao-impressao * { visibility: visible !important; }
          .cartao-impressao { position: absolute; left: 0; top: 0; box-shadow: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="pilha max-w-3xl text-center">
        <p className="font-display text-xs tracking-[0.3em] text-gold uppercase">Cartão para o presente</p>
        <h1 className="mt-3 font-display text-3xl text-ivory">Imprima e entregue junto com o presente</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ivory/65">
          Tamanho A6 (um quarto de folha A4): recorte na linha da borda. O cartão não diz qual é a estrela — quem
          aponta a câmera para o código descobre.
        </p>

        <div
          className="cartao-impressao mx-auto mt-8 flex overflow-hidden rounded-sm text-left shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
          style={{ width: '148mm', maxWidth: '100%', aspectRatio: '148 / 105', background: '#fbf7ee', color: '#1b1d33' }}
        >
          <div className="m-[4mm] flex flex-1 items-center gap-[6mm] border border-[#b08d3e] p-[6mm]">
            <div className="flex min-w-0 flex-1 flex-col">
              <SimboloOficial className="w-[16mm]" />
              <p className="mt-[3mm] font-display text-[2.6mm] tracking-[0.35em] text-[#8f6f1f] uppercase">Stellara</p>
              <p className="mt-[4mm] font-serif text-[6mm] leading-tight">
                {dados.para ? `${dados.para}, uma estrela espera por você` : 'Uma estrela espera por você'}
              </p>
              <p className="mt-[3mm] font-serif text-[3.4mm] leading-snug text-[#4a4e69] italic">
                {quando ? `Ela se revela em ${quando}. ` : ''}Aponte a câmera do celular para o código.
              </p>
            </div>
            <div className="shrink-0 text-center">
              <QrCode texto={url} className="w-[38mm]" />
              <p className="mt-[2mm] font-mono text-[2.4mm] text-[#4a4e69]">{codigo}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.print()} className="btn btn-primary">
            Imprimir o cartão
          </button>
          <Link para={`/p/${codigo}`} className="btn btn-secundario">
            Voltar à página
          </Link>
        </div>
      </div>
    </div>
  )
}

/** QR code em SVG (módulos como um único caminho), correção de erro média. */
export function QrCode({ texto, className = '' }) {
  const qr = qrcode(0, 'M')
  qr.addData(texto)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`
    }
  }
  // Zona de silêncio de 2 módulos: leitores precisam da borda clara.
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className={className} role="img" aria-label={`Código QR para ${texto}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#1b1d33" />
    </svg>
  )
}
