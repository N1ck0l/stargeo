/**
 * Ambiente de teste dos componentes React (Vitest + jsdom).
 *
 * Roda via `vitest run`, que por sua vez é o último passo de `npm test`. Os
 * testes numéricos de astronomia (astro/sky) e os da moderação NÃO passam por
 * aqui: são scripts Node puros (`node shared/astro.test.mjs` etc.), porque
 * usam `process.exit` e não se dariam bem dentro do runner.
 *
 * O ponto não óbvio deste arquivo são os aliases `npm:*` — as Edge Functions
 * Deno importam com esse prefixo, e os mesmos módulos (`shared/pdf.js`) são
 * testados aqui em Node. Sem o alias, o Vitest falharia em resolver
 * 'npm:pdf-lib' antes de qualquer teste rodar.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // As Edge Functions (e o `shared/pdf.js`, que só o servidor usa) importam
    // pacotes npm com o prefixo `npm:`, que o Deno exige mas o Node não entende.
    // O alias deixa os testes importarem esses módulos sem um runtime Deno.
    alias: {
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
      'npm:pdf-lib': 'pdf-lib',
      'npm:@pdf-lib/fontkit': '@pdf-lib/fontkit',
      'npm:wawoff2': 'wawoff2',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setup.js',
    // `forks` não subiu workers nesta máquina (timeout no Windows/OneDrive);
    // `threads` é mais confiável e suficiente para estes testes.
    pool: 'threads',
    // Só os testes de componente. A verificação numérica da projeção roda
    // separada, com `node shared/astro.test.mjs`, porque ela encerra o
    // processo com process.exit e não se sairia bem dentro do vitest.
    include: ['test/**/*.test.{js,jsx}'],
  },
})