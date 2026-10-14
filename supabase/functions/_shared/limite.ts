/**
 * Limite de requisições das funções públicas.
 *
 * `create-checkout`, `track-order` e `page-auth` não exigem login — é o
 * desenho da loja. Sem limite, um laço cria milhares de pedidos falsos (e de
 * preferências no Mercado Pago) ou testa pares código + e-mail em massa.
 *
 * O contador mora no banco (`consumir_limite`, migration 0009) porque cada
 * invocação de Edge Function é um processo novo: memória local não conta nada.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ErroApp, ipDe } from './http.ts'

export interface Regra {
  /** Quantas chamadas cabem na janela. */
  maximo: number
  /** Tamanho da janela, em segundos. */
  janelaSegundos: number
}

/**
 * Consome uma chamada de cada chave e recusa com 429 se alguma estourou.
 *
 * A chave sempre leva o nome da função, para o limite do rastreio não comer o
 * do checkout. Se o banco falhar, a chamada PASSA: o limite é proteção contra
 * abuso, e derrubar a venda por causa dele seria pior do que o abuso.
 */
export async function limitar(
  db: SupabaseClient,
  funcao: string,
  chaves: string[],
  regra: Regra,
): Promise<void> {
  for (const chave of chaves) {
    const { data, error } = await db.rpc('consumir_limite', {
      p_chave: `${funcao}:${chave}`,
      p_janela_segundos: regra.janelaSegundos,
      p_maximo: regra.maximo,
    })

    if (error) {
      console.error(`[limite ${funcao}] contador indisponível:`, error.message)
      return
    }
    if (data === false) {
      throw new ErroApp(
        'muitas_tentativas',
        'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
        429,
        `chave ${chave}`,
      )
    }
  }
}

/** Atalho para o caso comum: limite por IP de quem chamou. */
export function limitarPorIp(db: SupabaseClient, request: Request, funcao: string, regra: Regra) {
  return limitar(db, funcao, [`ip:${ipDe(request)}`], regra)
}
