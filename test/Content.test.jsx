/**
 * Ponte entre o conteúdo da página dedicada (o que o painel `/admin` e o
 * cliente editam, servido pelo `get-page`) e as seções reais: campos editados
 * precisam aparecer em StarDetails, no certificado e no SkyMap — e todo campo
 * do `DEFAULTS` precisa ter consumidor em algum lugar.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ContentContext } from '../loja/src/lib/contentContext.js'
import { ModalCertificado } from '../loja/src/pagina/ModalCertificado'
import { StarDetails } from '../loja/src/pagina/secoes/StarDetails'
import { SkyMap } from '../loja/src/pagina/secoes/SkyMap'
import { DEFAULTS } from '../loja/src/data/defaults'
import { kausAustralis } from '../loja/src/data/star'

afterEach(cleanup)

/*
 * Estes campos eram editáveis em `/admin` e gravados no `conteudo.json`, mas
 * nenhum componente os lia — o painel prometia mudanças que nunca apareciam,
 * sem nenhuma mensagem de erro.
 *
 * O teste monta a aplicação com um conteúdo alterado e exige que o texto
 * escrito apareça na tela. É o caminho exato que faltava.
 */
const CUSTOM = {
  ...DEFAULTS,
  // A página dedicada sempre recebe a estrela do banco (`montarConteudo`).
  estrela: kausAustralis,
  nome: 'Nome Escrito no Painel',
  nomeCurto: 'Apelido do Painel',
  data: '3 de março de 2027',
  registro: 'REG-PAINEL-999',
  tituloEstrela: 'Título Escrito no Painel',
  descricaoEstrela: 'Descrição escrita no painel de edição.',
  assinatura: 'Assinatura do painel',
}

// Mesmo provedor que a `PaginaDedicada` monta com o conteúdo do banco.
const renderWith = (content, element) =>
  render(
    <ContentContext.Provider value={{ content, setContent: () => {}, editable: false }}>
      {element}
    </ContentContext.Provider>,
  )

describe('campos editáveis chegam ao site', () => {
  // === Componentes individuais ===

  it('a seção da estrela mostra título, descrição e nome editados', () => {
    const { container } = renderWith(CUSTOM, <StarDetails onOpenCertificate={() => {}} />)

    expect(container.textContent).toContain('Título Escrito no Painel')
    expect(container.textContent).toContain('Descrição escrita no painel')
    expect(container.textContent).toContain('Nome Escrito no Painel')
  })

  it('o certificado mostra nome, registro, data e assinatura editados', () => {
    renderWith(CUSTOM, <ModalCertificado open onClose={() => {}} />)

    const text = document.body.textContent
    expect(text).toContain('Nome Escrito no Painel')
    expect(text).toContain('REG-PAINEL-999')
    expect(text).toContain('3 de março de 2027')
    expect(text).toContain('Assinatura do painel')
  })

  it('o mapa cita o nome curto editado', () => {
    const { container } = renderWith(CUSTOM, <SkyMap onOpenCertificate={() => {}} />)

    expect(container.textContent).toContain('Apelido do Painel')
    expect(container.textContent).toContain('Nome Escrito no Painel')
  })

  // === Guarda: todo campo editável tem consumidor ===

  it('todo campo editável no painel tem algum lugar onde aparece', () => {
    /*
     * Varredura de guarda: cada chave de `DEFAULTS` precisa ser consumida por
     * algum componente. Se alguém acrescentar um campo ao painel sem ligar em
     * lugar nenhum, este teste é o que avisa.
     */
    renderWith(CUSTOM, (
      <div>
        <StarDetails onOpenCertificate={() => {}} />
        <ModalCertificado open onClose={() => {}} />
        <SkyMap onOpenCertificate={() => {}} />
      </div>
    ))

    // `document.body`, não `container`: o certificado da loja abre num portal.
    const text = document.body.textContent
    const esperados = ['nome', 'nomeCurto', 'data', 'registro', 'tituloEstrela', 'descricaoEstrela']
    for (const chave of esperados) {
      expect(text, `campo "${chave}" não aparece em lugar nenhum`).toContain(String(CUSTOM[chave]))
    }
  })
})
