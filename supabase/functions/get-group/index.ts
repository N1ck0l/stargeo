/**
 * Publica a página do grupo. O handler (com a documentação) mora em
 * `handler.ts`, separado para o teste do fluxo inteiro chamá-lo.
 */
import { paginaDoGrupo } from './handler.ts'

Deno.serve(paginaDoGrupo)
