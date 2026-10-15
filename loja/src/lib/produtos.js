/**
 * Os produtos à venda, por slug (`/produto/:slug`).
 *
 * Por enquanto só existe UM produto de verdade (o digital): slug fora desta
 * lista cai na tela "Certificado não encontrado". Os outros níveis ficam
 * desligados no banco até virarem produto real — ver migration 0007.
 *
 * Separado do `Produto.jsx` porque o `App` também precisa saber (ele desenha
 * o título da página fora do pacote do produto — `TopoDoProduto`).
 */
export const PRODUTOS = {
  'certificado-digital': { nome: 'Certificado Digital' },
}
