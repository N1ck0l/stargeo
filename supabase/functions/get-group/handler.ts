/**
 * Página de um grupo de estrelas — `/g/GR-XXXX-XXXX` (migration 0021).
 *
 * Todas as estrelas compradas juntas, para o mapa do céu inteiro ("a
 * constelação da família"). O código do grupo é a credencial, como o da
 * página: quem tem o link vê. Só sai o que as páginas individuais já mostram
 * a quem tem o link delas — primeiro nome, estrela, posição e o endereço da
 * página —, e só de pedidos PAGOS com página publicada.
 *
 * Revelação na data (0019): enquanto as páginas estiverem guardadas, o grupo
 * também fica — só a data e o nome do grupo.
 *
 * Publicada com `--no-verify-jwt`; `index.ts` só faz o `Deno.serve`.
 */
import { comHandler, ErroApp, json, lerJson } from '../_shared/http.ts'
import { admin } from '../_shared/supabase.ts'
import { aindaGuardada } from '../_shared/datas.ts'
import { primeiroNome } from '../_shared/pagina.ts'

const RE_CODIGO = /^GR-[A-Z0-9]{4}-[A-Z0-9]{4}$/

export const paginaDoGrupo = comHandler(async (request) => {
  const { code } = (await lerJson(request)) as { code?: string }
  const codigo = String(code ?? '').trim().toUpperCase()
  if (!RE_CODIGO.test(codigo)) throw new ErroApp('codigo_invalido', 'Endereço de grupo inválido.', 422)

  const db = admin()
  const { data: grupo } = await db.from('grupos').select('id, nome').eq('code', codigo).maybeSingle()
  if (!grupo) throw new ErroApp('nao_encontrado', 'Não encontramos este grupo de estrelas.', 404)

  const { data: pedidos } = await db
    .from('orders')
    .select('id, honoree_name, star_slug, status, reveal_on, created_at')
    .eq('group_id', grupo.id)
  const pagos = ((pedidos ?? []) as Array<Record<string, string | null>>)
    .filter((p) => p.status === 'approved')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  if (!pagos.length) throw new ErroApp('nao_encontrado', 'Não encontramos este grupo de estrelas.', 404)

  const guardadas = pagos.filter((p) => aindaGuardada(p.reveal_on))
  if (guardadas.length) {
    return json(request, { nome: grupo.nome, guardada: { revelaEm: guardadas[0].reveal_on, total: pagos.length } })
  }

  const estrelas = []
  for (const p of pagos) {
    const [{ data: estrela }, { data: pagina }] = await Promise.all([
      db
        .from('stars')
        .select('slug, name, bayer, constellation, sigla, ra_hours, dec_degrees, magnitude')
        .eq('slug', String(p.star_slug))
        .maybeSingle(),
      db.from('pages').select('code').eq('order_id', String(p.id)).eq('status', 'published').maybeSingle(),
    ])
    if (!estrela || !pagina) continue
    estrelas.push({
      pagina: pagina.code,
      para: primeiroNome(String(p.honoree_name ?? '')),
      estrela: estrela.name,
      bayer: estrela.bayer,
      constelacao: estrela.constellation,
      sigla: estrela.sigla,
      ra: Number(estrela.ra_hours),
      dec: Number(estrela.dec_degrees),
      magnitude: Number(estrela.magnitude),
    })
  }
  if (!estrelas.length) throw new ErroApp('nao_encontrado', 'Não encontramos este grupo de estrelas.', 404)

  return json(request, { nome: grupo.nome, estrelas })
}, 'get-group')
