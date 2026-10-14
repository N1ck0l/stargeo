import { Folha } from './Folha.jsx'

/**
 * A folha apresentada como objeto — na tela, emoldurada ou na versão de
 * impressão. Serve para a pessoa IMAGINAR o presente na vida real.
 *
 * A moldura é desenho (CSS), e a legenda diz isso: a Stellara entrega o
 * certificado digital; moldura e impressão são de quem compra. Prometer um
 * objeto físico que não é vendido seria enganar justamente quem confiou.
 *
 * `modo`: 'tela' | 'moldura' | 'impressao'. As demais props são as da folha.
 */
export function Vitrine({ modo = 'tela', ...folha }) {
  if (modo === 'moldura') {
    return (
      <figure>
        {/* Moldura escura com passe-partout marfim, como um quadro na parede. */}
        <div
          className="mx-auto rounded-[4px] p-[4.5%] shadow-[0_30px_70px_rgba(0,0,0,0.6)]"
          style={{
            background: 'linear-gradient(135deg, #2b241d 0%, #16120e 45%, #2a231c 100%)',
            boxShadow: '0 30px 70px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          <div className="bg-[#f1ebdd] p-[7%] shadow-[inset_0_2px_10px_rgba(0,0,0,0.25)]">
            <div className="shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
              <Folha {...folha} />
            </div>
          </div>
        </div>
        <figcaption className="mt-3 text-center text-[11px] text-ivory/45">
          Ilustração: o certificado é digital, e a moldura fica por sua conta — ele foi desenhado
          em A4 para caber nas molduras de papelaria.
        </figcaption>
      </figure>
    )
  }

  return (
    <figure>
      <div className="shimmer-border overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <Folha {...folha} light={modo === 'impressao'} />
      </div>
      <figcaption className="mt-3 text-center text-[11px] text-ivory/45">
        {modo === 'impressao'
          ? 'A versão clara vai junto: fundo marfim, gasta pouca tinta e fica linda em papel fosco.'
          : 'A versão escura é a original — para guardar, mandar por mensagem e mostrar na tela.'}
      </figcaption>
    </figure>
  )
}
