import { useEffect, useState } from 'react'

/**
 * Preço do produto (e o preço "de", riscado), lido do banco.
 *
 * O valor COBRADO sempre veio do banco (`create-checkout` lê `price_cents` no
 * servidor); o que a tela MOSTRAVA era um número escrito no código. Bastava
 * mudar o preço no banco para o botão dizer "R$ 49" e o Mercado Pago cobrar
 * outro valor. Agora a tela pergunta ao banco também.
 *
 * Leitura direta pelo Data API do Supabase com a chave anon: `products` tem
 * política de leitura pública (`0001_loja.sql`), preço não é segredo.
 *
 * `reserva` é o valor mostrado até a resposta chegar — e para sempre, se não
 * houver Supabase configurado (testes, build local sem `.env`). Uma promessa
 * por slug, guardada no módulo: a home e o produto não perguntam duas vezes.
 */
const cache = new Map()

function buscarPrecos(slug) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !chave) return Promise.resolve(null)

  if (!cache.has(slug)) {
    const consulta = `${url.replace(/\/$/, '')}/rest/v1/products?slug=eq.${encodeURIComponent(slug)}&select=price_cents,compare_at_cents`
    cache.set(
      slug,
      fetch(consulta, { headers: { apikey: chave, Authorization: `Bearer ${chave}` } })
        .then((r) => (r.ok ? r.json() : []))
        .then((linhas) => (Number.isInteger(linhas?.[0]?.price_cents) ? linhas[0] : null))
        .catch(() => {
          // Falha de rede não pode prender a próxima tentativa num erro velho.
          cache.delete(slug)
          return null
        }),
    )
  }
  return cache.get(slug)
}

/** "49" para valor inteiro, "49,90" com centavos — como se escreve preço no Brasil. */
export function formatarReais(centavos) {
  const reais = centavos / 100
  return Number.isInteger(reais)
    ? String(reais)
    : reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * `{ preco, eram }` em reais, já formatados para exibir. `eram` é `null`
 * quando o banco não tem preço "de" para o produto.
 */
export function usePreco(slug, reserva) {
  const [linha, setLinha] = useState(null)

  useEffect(() => {
    let vivo = true
    buscarPrecos(slug).then((valor) => {
      if (vivo && valor !== null) setLinha(valor)
    })
    return () => {
      vivo = false
    }
  }, [slug])

  if (!linha) return { preco: String(reserva.preco), eram: reserva.eram == null ? null : String(reserva.eram) }
  return {
    preco: formatarReais(linha.price_cents),
    eram: Number.isInteger(linha.compare_at_cents) ? formatarReais(linha.compare_at_cents) : null,
  }
}
