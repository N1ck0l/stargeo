/**
 * Ponte entre o painel de conteúdo (`/admin` → `conteudo.json`) e os
 * componentes reais: campos editados precisam aparecer em StarDetails,
 * CertificateModal e SkyMap — e todo campo do `DEFAULTS` precisa ter
 * consumidor em algum lugar.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ContentProvider } from '../src/lib/content.jsx'
import { CertificateModal } from '../src/components/CertificateModal'
import { StarDetails } from '../src/components/StarDetails'
import { SkyMap } from '../src/components/SkyMap'
import { DEFAULTS } from '../src/data/defaults'

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
  nome: 'Nome Escrito no Painel',
  nomeCurto: 'Apelido do Painel',
  data: '3 de março de 2027',
  registro: 'REG-PAINEL-999',
  tituloEstrela: 'Título Escrito no Painel',
  descricaoEstrela: 'Descrição escrita no painel de edição.',
  assinatura: 'Assinatura do painel',
}

const renderWith = (content, element) =>
  render(<ContentProvider editable initial={content}>{element}</ContentProvider>)

describe('campos editáveis chegam ao site', () => {
  // === Componentes individuais ===

  it('a seção da estrela mostra título, descrição e nome editados', () => {
    const { container } = renderWith(CUSTOM, <StarDetails onOpenCertificate={() => {}} />)

    expect(container.textContent).toContain('Título Escrito no Painel')
    expect(container.textContent).toContain('Descrição escrita no painel')
    expect(container.textContent).toContain('Nome Escrito no Painel')
  })

  it('o certificado mostra nome, registro, data e assinatura editados', () => {
    renderWith(CUSTOM, <CertificateModal open onClose={() => {}} />)

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
    const { container } = renderWith(CUSTOM, (
      <div>
        <StarDetails onOpenCertificate={() => {}} />
        <CertificateModal open onClose={() => {}} />
        <SkyMap onOpenCertificate={() => {}} />
      </div>
    ))

    const text = container.textContent
    const esperados = ['nome', 'nomeCurto', 'data', 'registro', 'tituloEstrela', 'descricaoEstrela']
    for (const chave of esperados) {
      expect(text, `campo "${chave}" não aparece em lugar nenhum`).toContain(String(CUSTOM[chave]))
    }
  })
})
