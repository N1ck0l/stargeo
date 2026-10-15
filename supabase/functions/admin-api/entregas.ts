/**
 * Entregas travadas — separado do `index.ts` (que sobe o servidor ao ser
 * importado) para o teste conseguir chamar a regra direto.
 */
export interface PedidoPago {
  id: string
  code: string
  honoree_name: string
  created_at: string
  certificate_path: string | null
  pages: Array<{ id: string }> | { id: string } | null
}

/**
 * Pedidos PAGOS há mais de 10 minutos sem PDF ou sem página — o webhook
 * falhou no meio (PDF, Storage, catálogo) e ninguém recebeu nada. O e-mail
 * fica de fora de propósito: sem o domínio, ele falha em todo pedido, e o
 * presente já está entregue pela página.
 */
export function entregasTravadas(pagos: PedidoPago[], agora = Date.now()) {
  const limite = agora - 10 * 60_000
  return pagos
    .filter((p) => new Date(p.created_at).getTime() < limite)
    .map((p) => {
      const temPagina = Array.isArray(p.pages) ? p.pages.length > 0 : Boolean(p.pages)
      const motivos = [!p.certificate_path && 'sem PDF', !temPagina && 'sem página'].filter(Boolean)
      return { id: p.id, code: p.code, paraQuem: p.honoree_name, motivo: motivos.join(' e ') }
    })
    .filter((p) => p.motivo)
}
