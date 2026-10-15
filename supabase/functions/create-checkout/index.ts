/**
 * Publica o checkout. O handler (com toda a documentação) mora em
 * `checkout.ts`, separado para o teste do fluxo inteiro chamá-lo sem servidor.
 */
import { checkout } from './checkout.ts'

Deno.serve(checkout)
