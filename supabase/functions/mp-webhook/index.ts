/**
 * Webhook do Mercado Pago. O fluxo inteiro — e a explicação de cada passo —
 * está em `webhook.ts`; aqui só a publicação no runtime do Deno.
 */
import { webhook } from './webhook.ts'

Deno.serve(webhook)
