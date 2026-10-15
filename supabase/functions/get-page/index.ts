/**
 * Publica a leitura da página dedicada. O handler (com toda a documentação)
 * mora em `handler.ts`, separado para o teste do fluxo inteiro chamá-lo.
 */
import { paginaPublica } from './handler.ts'

Deno.serve(paginaPublica)
