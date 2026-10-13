import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // As Edge Functions importam o SDK do Supabase pelo especificador do Deno
    // (`npm:...`), que o Node não entende. O alias deixa um teste importar o
    // módulo da função sem precisar de um runtime Deno.
    alias: {
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
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
    // separada, com `node src/lib/astro.test.mjs`, porque ela encerra o
    // processo com process.exit e não se sairia bem dentro do vitest.
    include: ['test/**/*.test.{js,jsx}'],
  },
})