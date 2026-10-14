/**
 * Carrega o catálogo (`catalogo.ndjson` de `scripts/gerar-catalogo.mjs`) na
 * tabela `stars` do Supabase.
 *
 *     node scripts/carregar-catalogo.mjs <catalogo.ndjson>
 *
 * Upsert por `slug`, em lotes, pela Management API (lê
 * `SUPABASE_ACCESS_TOKEN` e `VITE_SUPABASE_URL` do `.env`, como o
 * `publicar:supabase`). Atualiza os DADOS da estrela e nunca o estado da
 * exclusividade (`status`, `order_id`, reservas): rodar de novo não
 * "desdedica" nenhuma estrela vendida.
 *
 * Precisa da migration 0010 aplicada antes (colunas e faixas).
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('Uso: node scripts/carregar-catalogo.mjs <catalogo.ndjson>')
  process.exit(1)
}

const raiz = resolve(import.meta.dirname, '..')
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, '')]),
)
const token = env.SUPABASE_ACCESS_TOKEN
const ref = (env.VITE_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!token || !ref) {
  console.error('Falta SUPABASE_ACCESS_TOKEN ou VITE_SUPABASE_URL no .env.')
  process.exit(1)
}

const COLUNAS = {
  slug: 'text', hip: 'integer', name: 'text', bayer: 'text', constellation: 'text',
  constellation_latin: 'text', sigla: 'text', spectral_type: 'text', ra_hours: 'double precision',
  dec_degrees: 'double precision', magnitude: 'double precision', distance_ly: 'double precision',
  bv: 'real', hd: 'integer', faixa: 'text', best_month: 'text', story: 'text', featured: 'boolean',
  curada: 'boolean', visibility: 'text',
}
const nomes = Object.keys(COLUNAS)

async function sql(query) {
  for (let tentativa = 1; ; tentativa += 1) {
    const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (resposta.ok) return resposta.json()
    const corpo = await resposta.text()
    // Limite de taxa ou instabilidade: espera e tenta de novo, poucas vezes.
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < 5) {
      await new Promise((r) => setTimeout(r, 2000 * tentativa))
      continue
    }
    throw new Error(`SQL falhou (${resposta.status}): ${corpo.slice(0, 500)}`)
  }
}

const linhas = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const LOTE = 1500
const marca = '$cat$'
const t0 = Date.now()

for (let i = 0; i < linhas.length; i += LOTE) {
  const lote = linhas.slice(i, i + LOTE).map((e) => Object.fromEntries(nomes.map((k) => [k, e[k] ?? null])))
  const json = JSON.stringify(lote)
  if (json.includes(marca)) throw new Error('O delimitador apareceu nos dados.')

  await sql(`
    insert into public.stars (${nomes.join(', ')})
    select ${nomes.join(', ')}
    from jsonb_to_recordset(${marca}${json}${marca}::jsonb)
      as x(${nomes.map((k) => `${k} ${COLUNAS[k]}`).join(', ')})
    on conflict (slug) do update set
      ${nomes.filter((k) => k !== 'slug').map((k) => `${k} = excluded.${k}`).join(',\n      ')}
  `)
  process.stdout.write(`\r${Math.min(i + LOTE, linhas.length)}/${linhas.length} estrelas`)
}

const [resumo] = await sql(`
  select count(*) as total,
         count(*) filter (where status = 'dedicada') as dedicadas,
         count(*) filter (where faixa is null) as sem_faixa
  from public.stars`)
console.log(`\nPronto em ${Math.round((Date.now() - t0) / 1000)} s:`, resumo)
