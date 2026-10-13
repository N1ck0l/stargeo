/**
 * Conteúdo padrão do site — a versão embutida no pacote.
 *
 * Fica aqui separado do provedor para que o módulo do React exporte só
 * componentes, e para ficar óbvio onde editar quando não se usa o painel.
 *
 * Os dados científicos da estrela NÃO estão aqui: são fatos, conferidos
 * contra o SIMBAD, e ficam em `star.js`.
 */
import { honoree, letterParagraphs } from './star'

export const DEFAULTS = {
  nome: honoree.fullName,
  nomeCurto: honoree.firstName,
  assinatura: honoree.from,
  data: honoree.dedicatedOn,
  registro: honoree.certificateId,

  // Início
  tituloHero: 'a luz mais brilhante de Sagitário',
  fraseHero: 'Uma estrela real, a ε Sagittarii, escolhida para você.',

  // Seção da estrela
  tituloEstrela: 'Kaus Australis, agora também Geovanna',
  descricaoEstrela:
    'Kaus Australis é a estrela mais brilhante de Sagitário. Do hemisfério sul — e especialmente do Brasil — ela se mostra a olho nu, sem telescópio, como um ponto firme no arco do arqueiro. Os números abaixo são reais; o nome batizado é só seu.',

  // Carta
  tituloCarta: 'Para ser lida sob as estrelas',
  carta: letterParagraphs,

  // Mensagem pessoal (a parte escrita por você)
  mensagemPessoal: honoree.personalMessage ?? '',

  // Ligações
  mostrarMensagem: true,
  mostrarMira: true,
}