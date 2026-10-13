/**
 * Tipos do Deno para o typecheck no editor.
 *
 * As Edge Functions rodam no runtime do Deno (Supabase Edge), não no Node.
 * Sem isto, o TypeScript acusa `Deno` como não encontrado em toda linha que lê
 * variável de ambiente — e é justamente aí que mora o risco, porque
 * `Deno.env.get()` devolve `string | undefined` e um `undefined` esquecido
 * vira erro em produção.
 *
 * Só o que o projeto usa está declarado aqui: `env`, `serve` e o Web Crypto,
 * que já existe no DOM lib.
 *
 * Instalação real: `deno` não é dependência deste projeto (que roda em Node),
 * então quem quiser os tipos completos pode rodar `deno check` com o CLI.
 */
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined
    set(key: string, value: string): void
    has(key: string): boolean
  }

  const env: Env

  function serve(handler: (request: Request) => Response | Promise<Response>, options?: unknown): void
}
