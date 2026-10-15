/**
 * Grupo de estrelas (migrations 0020 e 0021) — "os outros pedidos do grupo".
 *
 * Usado por quem desenha o certificado (webhook, correção e entrega pelo
 * painel: a linha "Em par com …" / "Uma das quatro estrelas · …"), pela página
 * (`get-page`: os links para as outras estrelas e para a página do grupo) e
 * pelo rastreio (a tela de obrigado manda todas).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { primeiroNome } from './pagina.ts'
import { linhaDoGrupo } from '../../../shared/grupo.js'

export interface OutroDoGrupo {
  orderId: string
  code: string
  starSlug: string
  starName: string
  honoreeName: string
  para: string
  pagina: string | null
}

export interface DadosDoGrupo {
  /** Endereço da página do grupo (`/g/CODE`); nulo para pares antigos sem linha em `grupos`. */
  code: string | null
  nome: string | null
  total: number
  outros: OutroDoGrupo[]
}

/** Os outros pedidos do grupo, com estrela e página; `null` fora de um grupo. */
export async function dadosDoGrupo(db: SupabaseClient, orderId: string, groupId: unknown): Promise<DadosDoGrupo | null> {
  if (!groupId) return null
  const [{ data: pedidos }, { data: grupo }] = await Promise.all([
    db.from('orders').select('id, code, star_slug, honoree_name, created_at').eq('group_id', String(groupId)),
    db.from('grupos').select('code, nome').eq('id', String(groupId)).maybeSingle(),
  ])
  const todos = (pedidos ?? []) as Array<{ id: string; code: string; star_slug: string; honoree_name: string; created_at?: string }>
  if (todos.length < 2) return null
  // Na ordem da compra: a primeira pessoa primeiro em todo lugar.
  todos.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))

  const outros = await Promise.all(
    todos
      .filter((o) => o.id !== orderId)
      .map(async (o) => {
        const [{ data: estrela }, { data: pagina }] = await Promise.all([
          db.from('stars').select('name').eq('slug', o.star_slug).maybeSingle(),
          db.from('pages').select('code').eq('order_id', o.id).eq('status', 'published').maybeSingle(),
        ])
        return {
          orderId: o.id,
          code: o.code,
          starSlug: o.star_slug,
          starName: estrela?.name ?? o.star_slug,
          honoreeName: o.honoree_name,
          para: primeiroNome(o.honoree_name),
          pagina: pagina?.code ?? null,
        }
      }),
  )

  return { code: grupo?.code ?? null, nome: grupo?.nome ?? null, total: todos.length, outros }
}

/** O outro pedido de um PAR (grupo de dois); `null` em qualquer outro caso. */
export async function dadosDoPar(db: SupabaseClient, orderId: string, groupId: unknown): Promise<OutroDoGrupo | null> {
  const grupo = await dadosDoGrupo(db, orderId, groupId)
  return grupo?.total === 2 ? grupo.outros[0] : null
}

/** Os campos que o desenho do certificado lê (`grupo_linha` no pedido). */
export function linhaParaCertificado(grupo: DadosDoGrupo | null): { grupo_linha?: string } {
  if (!grupo) return {}
  return {
    grupo_linha: linhaDoGrupo({
      total: grupo.total,
      nome: grupo.nome,
      outros: grupo.outros.map((o) => ({ estrela: o.starName, nome: o.honoreeName })),
    }),
  }
}
