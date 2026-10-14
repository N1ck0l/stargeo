import { reais, useFaixas } from '../lib/catalogo.js'

/**
 * As faixas de preço lado a lado, com o que TODAS incluem.
 *
 * "Por que esta custa mais?" é a primeira pergunta de quem vê preços
 * diferentes: a resposta (brilho e nome) fica na própria tabela. Usada na
 * home (seção das estrelas) e no catálogo (`/estrelas`).
 */
export function TabelaDeFaixas() {
  const faixas = useFaixas()
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {faixas.map((f) => (
          <li key={f.slug} className="cartao">
            <p className="font-serif text-lg text-ivory">{f.nome}</p>
            <p className="mt-1 text-sm text-gold">{reais(f.precoCentavos)}</p>
            <p className="mt-2 text-xs leading-relaxed text-ivory/55">{f.descricao}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs leading-relaxed text-ivory/55">
        Todas as faixas incluem o certificado em PDF A4 (versão escura e versão clara para imprimir), a
        página da estrela com mapa do céu e Mira celeste, e a estrela exclusiva — pronto em minutos.
      </p>
    </div>
  )
}
