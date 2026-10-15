/**
 * Par de estrelas (migration 0020) — "o outro pedido do par".
 *
 * Usado por quem desenha o certificado (webhook, correção e entrega pelo
 * painel: a linha "Em par com …"), pela página (`get-page`: o link para a
 * estrela do par) e pelo rastreio (a tela de obrigado mostra as duas).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { primeiroNome } from './pagina.ts'

export interface DadosDoPar {
  orderId: string
  code: string
  starSlug: string
  starName: string
  honoreeName: string
  para: string
  pagina: string | null
}

/** O outro pedido do grupo, com a estrela e a página; `null` fora de um par. */
export async function dadosDoPar(db: SupabaseClient, orderId: string, groupId: unknown): Promise<DadosDoPar | null> {
  if (!groupId) return null
  const { data: outros } = await db
    .from('orders')
    .select('id, code, star_slug, honoree_name')
    .eq('group_id', String(groupId))
  const outro = (outros ?? []).find((o: { id: string }) => o.id !== orderId)
  if (!outro) return null

  const [{ data: estrela }, { data: pagina }] = await Promise.all([
    db.from('stars').select('name').eq('slug', outro.star_slug).maybeSingle(),
    db.from('pages').select('code').eq('order_id', outro.id).eq('status', 'published').maybeSingle(),
  ])

  return {
    orderId: outro.id,
    code: outro.code,
    starSlug: outro.star_slug,
    starName: estrela?.name ?? outro.star_slug,
    honoreeName: outro.honoree_name,
    para: primeiroNome(outro.honoree_name),
    pagina: pagina?.code ?? null,
  }
}

/** Os campos que o desenho do certificado lê (`starName` e nome do par). */
export function parParaCertificado(par: DadosDoPar | null) {
  return par ? { parEstrela: par.starName, parNome: par.honoreeName } : {}
}
