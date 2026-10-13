import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CertificadoPreview } from '../loja/src/components/CertificadoPreview.jsx'
import Loja from '../loja/src/App.jsx'
import Produto from '../loja/src/pages/Produto.jsx'
import Rastrear from '../loja/src/pages/Rastrear.jsx'
import { getStar } from '../shared/stars.js'

afterEach(cleanup)

const estrela = getStar('kaus-australis')

describe('CertificadoPreview', () => {
  it('mostra o nome, a estrela e as coordenadas reais', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="Geovanna" code="SG-TEST-TEST" />)
    const texto = document.body.textContent

    expect(texto).toContain('StarGeo')
    expect(texto).toContain('Geovanna')
    expect(texto).toContain('Kaus Australis')
    // A letra grega e os símbolos astronômicos são o motivo de o PDF usar as
    // fontes do site em vez das padrão do pdf-lib.
    expect(texto).toContain('ε Sagittarii')
    expect(texto).toContain('18h 24m 10.32s')
    expect(texto).toContain('−34° 23′ 04.62″')
    expect(texto).toContain('SG-TEST-TEST')
  })

  it('usa a folha A4 em milímetros, para bater com o PDF', () => {
    const { container } = render(<CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" />)
    const folha = container.querySelector('.certificado')

    expect(folha.style.width).toBe('210mm')
    expect(folha.style.height).toBe('297mm')
  })

  it('tem texto de apoio quando o nome está vazio', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="" code="X" />)
    expect(document.body.textContent).toContain('Nome de quem recebe')
  })

  it('mostra a mensagem e a assinatura quando existem', () => {
    render(
      <CertificadoPreview
        estrela={estrela}
        honoreeName="Ana"
        message="Uma frase com a minha letra."
        fromName="Com amor"
        code="X"
      />,
    )
    const texto = document.body.textContent
    expect(texto).toContain('Uma frase com a minha letra.')
    expect(texto).toContain('Com amor')
  })

  it('esconde a mensagem quando está vazia', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="Ana" message="   " code="X" />)
    expect(screen.queryByText('Documento simbólico. Coordenadas conferidas com o SIMBAD.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('undefined')
  })

  it('a versão clara usa o fundo de papel', () => {
    const { container } = render(
      <CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" light />,
    )
    // jsdom expande o hex para rgb() dentro do gradiente, então comparamos
    // com o valor computado, não com `#fffdf7`.
    expect(container.querySelector('.certificado').style.background).toContain('rgb(255, 253, 247)')
  })

  it('reduz o corpo do nome em vez de cortar o sobrenome', () => {
    const { container } = render(
      <CertificadoPreview
        estrela={estrela}
        honoreeName="Maria Fernanda Oliveira dos Santos Albuquerque"
        code="X"
      />,
    )
    // O nome inteiro precisa aparecer: o que pode encolher é o corpo, nunca o
    // sobrenome — cortar o nome de alguém é pior do que letra miúda.
    expect(container.textContent).toContain('Albuquerque')
  })
})

describe('configurador', () => {
  it('avisa sobre telefone, que é vetor de golpe', async () => {
    render(<Produto slug="certificado-mapa-impresso" />)

    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), {
      target: { value: 'Ana' },
    })
    fireEvent.change(screen.getByLabelText(/Mensagem no certificado/i), {
      target: { value: 'Me liga no (11) 98765-4321' },
    })
    fireEvent.blur(screen.getByLabelText(/Mensagem no certificado/i))

    expect(await screen.findByText(/não pode conter telefone/i)).toBeTruthy()
  })

  it('não reclama do campo vazio antes de a pessoa tocar nele', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    expect(screen.queryByText(/campo vazio/i)).toBeNull()
  })

  it('esconde o erro de campo que ainda não foi tocado', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), { target: { value: 'A' } })
    expect(screen.queryByText(/campo vazio/i)).toBeNull()
  })

  it('mostra o erro depois que o campo é tocado', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    const campo = screen.getByLabelText(/Nome de quem recebe/i)
    fireEvent.change(campo, { target: { value: 'A' } })
    fireEvent.blur(campo)
    expect(screen.getByText(/campo vazio/i)).toBeTruthy()
  })

  it('marca o campo inválido para leitores de tela', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    const campo = screen.getByLabelText(/Nome de quem recebe/i)
    fireEvent.change(campo, { target: { value: 'A' } })
    fireEvent.blur(campo)
    expect(campo.getAttribute('aria-invalid')).toBe('true')
  })

  it('a prévia acompanha o que é digitado', () => {
    const { container } = render(<Produto slug="certificado-mapa-impresso" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), {
      target: { value: 'Beatriz Souza' },
    })
    expect(container.textContent).toContain('Beatriz Souza')
  })

  it('trocar de estrela muda a prévia', () => {
    const { container } = render(<Produto slug="certificado-mapa-impresso" />)
    fireEvent.click(screen.getByRole('button', { name: /Sirius/ }))
    expect(container.textContent).toContain('α Canis Majoris')
  })

  it('conta os caracteres da mensagem', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    const campo = screen.getByLabelText(/Mensagem no certificado/i)
    fireEvent.change(campo, { target: { value: 'olá' } })
    expect(screen.getByText('3/600')).toBeTruthy()
  })

  it('avisa que o preço vem do servidor, e não da tela', () => {
    render(<Produto slug="certificado-mapa-impresso" />)
    expect(document.body.textContent).toMatch(/Mercado Pago/i)
  })
})

describe('rastreamento', () => {
  it('pede código e e-mail — o código sozinho não protege nada', () => {
    render(<Rastrear />)
    expect(screen.getByLabelText(/Código do pedido/i)).toBeTruthy()
    expect(screen.getByLabelText(/E-mail da compra/i)).toBeTruthy()
  })

  it('não deixa consultar sem os dois campos', () => {
    const { container } = render(<Rastrear />)
    const botao = container.querySelector('button[type="submit"]')
    // `required` no HTML é o que impede o envio vazio; testar isso aqui
    // confirmaria o navegador, não o componente.
    expect(botao).toBeTruthy()
    expect(screen.getByLabelText(/Código do pedido/i).required).toBe(true)
    expect(screen.getByLabelText(/E-mail da compra/i).required).toBe(true)
  })

  it('não deixa o resultado vazar para quem não tem o par certo', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ erro: 'nao_encontrado', mensagem: 'Não encontramos pedido com esse código e e-mail.' }),
    })

    render(<Rastrear />)
    fireEvent.change(screen.getByLabelText(/Código do pedido/i), { target: { value: 'SG-AB3K-9ZXM' } })
    fireEvent.change(screen.getByLabelText(/E-mail da compra/i), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: /Consultar pedido/i }))

    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).not.toMatch(/e-mail não confere|existe/i)
  })
})

describe('casca da loja', () => {
  // O cabeçalho e o rodapé só existem no App. Renderizar as páginas isoladas
  // não os alcança — foi assim que um `ANO` solto no rodapé chegou ao ar e
  // derrubou todas as telas.
  afterEach(() => {
    localStorage.clear()
    window.history.pushState(null, '', '/')
  })

  it.each(['/', '/rastrear', '/produto/certificado-digital', '/obrigado'])(
    'monta a rota %s sem cair na tela de erro',
    (caminho) => {
      window.history.pushState(null, '', caminho)
      const { container } = render(<Loja />)

      expect(screen.queryByText('Algo saiu errado por aqui')).toBeNull()
      expect(container.querySelector('footer')).toBeTruthy()
    },
  )

  it('o rodapé mostra o ano corrente, e não uma variável solta', () => {
    render(<Loja />)
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} StarGeo`))).toBeTruthy()
  })
})

describe('prévia do certificado', () => {
  it('importa as fontes que o PDF usa, senão a folha sai em Georgia', () => {
    const css = readFileSync(join(process.cwd(), 'loja/src/index.css'), 'utf8')
    expect(css).toMatch(/@import\s+["'][^"']*fonts\.css["']/)
  })

  it('escala por um número medido — um calc devolve comprimento e é descartado', () => {
    // jsdom não mede layout: sem esta largura o fator seria 0 e a folha sairia invisível.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })

    try {
      render(<Produto slug="certificado-digital" />)
      const escalado = [...document.querySelectorAll('[style*="scale"]')].find(
        (el) => el.style.transform.includes('scale('),
      )

      expect(escalado).toBeTruthy()
      // 400 px de contêiner sobre 793.7 px de folha = 0.50396...
      expect(escalado.style.transform).toMatch(/^scale\(0\.50[0-9]+\)$/)
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
      else delete HTMLElement.prototype.clientWidth
    }
  })
})
