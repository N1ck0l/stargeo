/**
 * Publica o backend no Supabase: migrations pendentes e Edge Functions.
 *
 *     npm run publicar:supabase
 *
 * O push no GitHub publica só a loja (Netlify). Banco e funções vivem no
 * Supabase e precisam deste passo — SEMPRE antes do push quando a mudança
 * mexe nos dois lados, porque a função nova pode depender de coluna nova.
 *
 * Lê do `.env`:
 *   - `SUPABASE_ACCESS_TOKEN` — token pessoal (supabase.com/dashboard/account/tokens)
 *   - `VITE_SUPABASE_URL`     — de onde sai o ref do projeto
 *
 * 1. Migrations: compara `supabase/migrations/NNNN_nome.sql` com
 *    `supabase_migrations.schema_migrations` e aplica as que faltam, uma por
 *    transação, registrando no histórico (o mesmo que o `supabase db push`
 *    faria, sem precisar da senha do banco). Falhou uma, para tudo.
 * 2. Funções: `supabase functions deploy` de todas, com bundle pela API
 *    (`--use-api`, sem Docker). O `verify_jwt` de cada uma vem do
 *    `supabase/config.toml`.
 *
 * `--so-migrations` ou `--so-funcoes` fazem só uma das partes.
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const raiz = resolve(import.meta.dirname, '..')

function lerEnv() {
  const env = {}
  for (const linha of readFileSync(join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const casado = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (casado) env[casado[1]] = casado[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = lerEnv()
const token = env.SUPABASE_ACCESS_TOKEN
const ref = (env.VITE_SUPABASE_URL ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!token || !ref) {
  console.error('Falta SUPABASE_ACCESS_TOKEN ou VITE_SUPABASE_URL no .env.')
  process.exit(1)
}

const args = process.argv.slice(2)
const fazerMigrations = !args.includes('--so-funcoes')
const fazerFuncoes = !args.includes('--so-migrations')

async function sql(query) {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const corpo = await resposta.text()
  if (!resposta.ok) throw new Error(`SQL falhou (${resposta.status}): ${corpo}`)
  return JSON.parse(corpo)
}

/** Literal SQL com dollar-quoting, num marcador que não aparece no texto. */
function literal(texto) {
  let marca = 'mig'
  while (texto.includes(`$${marca}$`)) marca += 'x'
  return `$${marca}$${texto}$${marca}$`
}

if (fazerMigrations) {
  const aplicadas = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((l) => l.version))
  const pendentes = readdirSync(join(raiz, 'supabase/migrations'))
    .filter((nome) => /^\d+_.+\.sql$/.test(nome))
    .sort()
    .filter((nome) => !aplicadas.has(nome.split('_')[0]))

  if (!pendentes.length) console.log('Migrations: nada pendente.')

  for (const arquivo of pendentes) {
    const [versao, ...resto] = arquivo.replace(/\.sql$/, '').split('_')
    const conteudo = readFileSync(join(raiz, 'supabase/migrations', arquivo), 'utf8')
    console.log(`Migration ${arquivo}…`)
    await sql(
      `begin;\n${conteudo}\n;insert into supabase_migrations.schema_migrations (version, name, statements) ` +
        `values (${literal(versao)}, ${literal(resto.join('_'))}, array[${literal(conteudo)}]);\ncommit;`,
    )
    console.log(`Migration ${arquivo} aplicada.`)
  }
}

if (fazerFuncoes) {
  const funcoes = readdirSync(join(raiz, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)

  console.log(`Funções: ${funcoes.join(', ')}`)
  // Uma string só, com shell: no Windows o `npx` é um `.cmd`, que o Node não
  // executa sem shell — e lista de argumentos + shell gera o aviso DEP0190.
  // Nada aqui vem de fora: nomes de pasta (`[a-z-]`) e o ref do projeto.
  execSync(`npx --yes supabase@2 functions deploy ${funcoes.join(' ')} --project-ref ${ref} --use-api`, {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  })
}

console.log('Pronto.')
