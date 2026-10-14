/**
 * Cliente Supabase e leitura de configuração das Edge Functions.
 *
 * Importado por TODAS as funções — é o único lugar que toca a service_role e
 * as variáveis de ambiente. Quem precisa de uma chave que o navegador nunca
 * deve ver (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
 * `MERCADO_PAGO_ACCESS_TOKEN`) passa por aqui.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ErroApp } from './http.ts'

/**
 * Cliente com a service_role.
 *
 * A service_role ignora o RLS, então é ela — e só ela — que pode ler `orders`.
 * Nunca deve ir para o front: qualquer um com essa chave lê todos os pedidos.
 */
export function admin(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    // Falha de configuração, não de requisição: mensagem para o operador.
    throw new ErroApp(
      'configuracao_incompleta',
      'Serviço temporariamente indisponível.',
      500,
      'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente',
    )
  }

  // Sem sessão para persistir nem token para renovar: cada invocação é um
  // processo novo que vive poucos segundos — guardar estado aqui só geraria
  // cliente "logado" que não existe na chamada seguinte.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Lê uma variável obrigatória, falhando cedo e com nome claro.
 *
 * Falhar na primeira chamada é melhor do que falhar no meio do processamento,
 * depois de já ter gravado meio pedido.
 */
export function variavel(nome: string): string {
  const valor = Deno.env.get(nome)
  if (!valor) {
    throw new ErroApp('configuracao_incompleta', 'Serviço temporariamente indisponível.', 500, `variável ${nome} ausente`)
  }
  return valor
}

/** URL pública do site, usada nos links do e-mail. */
export function urlDoSite(): string {
  return Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173'
}

/**
 * Base para buscar as fontes usadas na geração do PDF.
 *
 * A geração roda na Edge Function, e ela não tem a pasta `public/` do projeto.
 * As fontes vêm do site publicado, então é preciso que ele já esteja no ar —
 * antes de gerar o primeiro certificado. Apontar para `supabase.co` ou para
 * qualquer CDN dá o mesmo resultado.
 */
export function baseDasFontes(): string {
  return Deno.env.get('FONTS_BASE_URL') ?? urlDoSite()
}
