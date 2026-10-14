/**
 * Loja Stellara: prévia do certificado (o SVG da mesma folha do PDF), configurador
 * do produto (formulário, validação, moderação de mensagem, preço) e
 * rastreamento de pedidos — mais a casca do App (rotas, rodapé) e as regras
 * de CSS das quais a prévia depende para escalar e para as utilities do
 * Tailwind vencerem.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CertificadoPreview } from '../loja/src/components/CertificadoPreview.jsx'
import Loja from '../loja/src/App.jsx'
import Editar from '../loja/src/pages/Editar.jsx'
import { Link } from '../loja/src/lib/Link.jsx'
import Produto from '../loja/src/pages/Produto.jsx'
import Rastrear from '../loja/src/pages/Rastrear.jsx'
import { getStar } from '../shared/stars.js'

afterEach(cleanup)

const estrela = getStar('kaus-australis')

// === Prévia do certificado (a folha de `shared/certificado/desenho.js` em SVG) ===
describe('CertificadoPreview', () => {
  it('mostra o nome, a estrela e as coordenadas reais', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="Geovanna" code="SG-TEST-TEST" />)
    const texto = document.body.textContent

    // A marca é desenho (curvas), não texto; o título é texto.
    expect(texto).toContain('CERTIFICADO DE DEDICAÇÃO')
    expect(texto).toContain('Geovanna')
    expect(texto).toContain('Kaus Australis')
    // A letra grega e os símbolos astronômicos são o motivo de o PDF usar as
    // fontes do site em vez das padrão do pdf-lib.
    expect(texto).toContain('ε Sagittarii')
    expect(texto).toContain('18h 24m 10.32s')
    expect(texto).toContain('−34° 23′ 04.62″')
    expect(texto).toContain('SG-TEST-TEST')
  })

  it('é a folha A4 em RETRATO, em milímetros, como o PDF', () => {
    // Medidas batendo com o arquivo que vai por e-mail: 210 × 297 mm no
    // viewBox, e largura 100% — o SVG escala sozinho para qualquer caixa.
    const { container } = render(<CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" />)
    const folha = container.querySelector('svg.certificado')

    expect(folha.getAttribute('viewBox')).toBe('0 0 210 297')
    expect(folha.getAttribute('width')).toBe('100%')
  })

  it('converte o corpo da fonte por multiplicação — a divisão inflava 8×', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" />)
    const titulo = screen.getByText('CERTIFICADO DE DEDICAÇÃO')

    // 17 pt × 0,3528 mm/pt = 6,0 mm no viewBox em milímetros. Dividindo,
    // sairia 48 mm: o título oito vezes maior, estourando a folha.
    expect(parseFloat(titulo.getAttribute('font-size'))).toBeCloseTo(6.0, 1)
  })

  it('desliga kerning e ligaduras, que o PDF não aplica', () => {
    render(<CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" />)
    const titulo = screen.getByText('CERTIFICADO DE DEDICAÇÃO')
    // Ligados, a tela encurtaria pares como "AV" e "fi" e as linhas sairiam
    // mais curtas que no papel — a quebra deixaria de bater.
    expect(titulo.style.fontKerning).toBe('none')
    expect(titulo.style.fontVariantLigatures).toBe('none')
  })

  it('traz os seis dados astronômicos e o mapa do céu da constelação', () => {
    const { container } = render(<CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" />)
    const texto = container.textContent
    for (const rotulo of ['CONSTELAÇÃO', 'TIPO ESPECTRAL', 'ASCENSÃO RETA', 'DECLINAÇÃO', 'MAGNITUDE', 'DISTÂNCIA']) {
      expect(texto).toContain(rotulo)
    }
    // O mapa: legenda da constelação e dezenas de estrelas reais desenhadas.
    expect(texto).toContain('SAGITTARIUS · J2000')
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(40)
  })

  it('tem texto de apoio quando o nome está vazio', () => {
    // Nome vazio mostra o texto de exemplo — nem folha em branco, nem
    // `undefined` impresso no papel.
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
    // Só espaço em branco não é mensagem: o bloco não nasce, e nada de
    // imprimir "undefined" no lugar do texto ausente.
    render(<CertificadoPreview estrela={estrela} honoreeName="Ana" message="   " code="X" />)
    expect(screen.queryByText('Documento simbólico. Coordenadas conferidas com o SIMBAD.')).toBeTruthy()
    expect(document.body.textContent).not.toContain('undefined')
  })

  it('a versão clara usa o fundo de papel', () => {
    const { container } = render(
      <CertificadoPreview estrela={estrela} honoreeName="Ana" code="X" light />,
    )
    expect(container.querySelector('svg.certificado').dataset.tema).toBe('claro')
    expect(container.querySelector('linearGradient stop').getAttribute('stop-color')).toBe('#fffdf7')
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

// === Configurador do produto ===
describe('configurador', () => {
  it('mostra o céu real da estrela escolhida, o mesmo que vai na folha', async () => {
    window.history.pushState(null, '', '/produto/certificado-digital?estrela=antares')
    render(<Produto slug="certificado-digital" />)
    // O mini mapa carrega sob demanda; a legenda acompanha a constelação.
    expect(await screen.findByText(/O céu de Escorpião, como sai na folha/)).toBeTruthy()
    const mapa = await screen.findByRole('img', { name: /Mapa do céu em volta de Antares/ })
    expect(mapa.querySelectorAll('circle').length).toBeGreaterThan(20)
    window.history.pushState(null, '', '/')
  })

  // --- Moderação: telefone na mensagem é vetor de golpe ---
  it('avisa sobre telefone, que é vetor de golpe', async () => {
    render(<Produto slug="certificado-digital" />)

    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), {
      target: { value: 'Ana' },
    })
    fireEvent.change(screen.getByLabelText(/Mensagem no certificado/i), {
      target: { value: 'Me liga no (11) 98765-4321' },
    })
    // A validação roda no blur: sem disparar o evento, o campo ainda conta
    // como "intocado" e o aviso não aparece.
    fireEvent.blur(screen.getByLabelText(/Mensagem no certificado/i))

    expect(await screen.findByText(/não pode conter telefone/i)).toBeTruthy()
  })

  // --- Formulário: erro de validação só depois que o campo é tocado ---
  it('não reclama do campo vazio antes de a pessoa tocar nele', () => {
    // Erro cedo demais é o que faz a pessoa fechar a aba: o nome obrigatório
    // só reclama depois do blur, nunca na primeira pintura.
    render(<Produto slug="certificado-digital" />)
    expect(screen.queryByText(/campo vazio/i)).toBeNull()
  })

  it('esconde o erro de campo que ainda não foi tocado', () => {
    // Digitar uma letra só já deixa o campo abaixo do mínimo (2), mas sem
    // blur ainda não há erro — "tocado" aqui é ter saído do campo.
    render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), { target: { value: 'A' } })
    expect(screen.queryByText(/campo vazio/i)).toBeNull()
  })

  it('mostra o erro depois que o campo é tocado', () => {
    render(<Produto slug="certificado-digital" />)
    const campo = screen.getByLabelText(/Nome de quem recebe/i)
    fireEvent.change(campo, { target: { value: 'A' } })
    fireEvent.blur(campo)
    expect(screen.getByText(/campo vazio/i)).toBeTruthy()
  })

  it('marca o campo inválido para leitores de tela', () => {
    // `aria-invalid` é o gancho que o `finalizar` usa para achar o primeiro
    // campo errado e levar o foco até lá.
    render(<Produto slug="certificado-digital" />)
    const campo = screen.getByLabelText(/Nome de quem recebe/i)
    fireEvent.change(campo, { target: { value: 'A' } })
    fireEvent.blur(campo)
    expect(campo.getAttribute('aria-invalid')).toBe('true')
  })

  // --- Prévia ao vivo: o que é digitado aparece no certificado ---
  it('a prévia acompanha o que é digitado', () => {
    const { container } = render(<Produto slug="certificado-digital" />)
    fireEvent.change(screen.getByLabelText(/Nome de quem recebe/i), {
      target: { value: 'Beatriz Souza' },
    })
    expect(container.textContent).toContain('Beatriz Souza')
  })

  it('trocar de estrela muda a prévia', () => {
    // Os dados astronômicos da folha são os do catálogo novo — mesma fonte
    // (`shared/stars.js`) que alimenta o PDF.
    const { container } = render(<Produto slug="certificado-digital" />)
    fireEvent.click(screen.getByRole('button', { name: /Sirius/ }))
    expect(container.textContent).toContain('α Canis Majoris')
  })

  // --- Moderação: contador do limite de 600 caracteres ---
  it('conta os caracteres da mensagem', () => {
    render(<Produto slug="certificado-digital" />)
    const campo = screen.getByLabelText(/Mensagem no certificado/i)
    fireEvent.change(campo, { target: { value: 'olá' } })
    expect(screen.getByText('3/600')).toBeTruthy()
  })

  // --- Checkout: o preço é calculado no servidor (Mercado Pago), nunca na tela ---
  it('avisa que o preço vem do servidor, e não da tela', () => {
    render(<Produto slug="certificado-digital" />)
    expect(document.body.textContent).toMatch(/Mercado Pago/i)
  })

  // --- Dica do e-mail: a prop se chama `dica`, não `hint` ---
  it('mostra a dica do e-mail (o certificado chega para lá)', () => {
    // Regressão: o campo passava `hint="…"` e o componente só lia `dica`, então
    // o texto de ajuda ficava invisível mesmo com a prop preenchida.
    render(<Produto slug="certificado-digital" />)
    expect(screen.getByText(/É para cá que o certificado chega/i)).toBeTruthy()
  })

  it('slug descontinuado cai na tela de não encontrado, não em erro', () => {
    // Os níveis mapa impresso e premium ficaram desligados no banco (migration
    // 0007): um link antigo — de e-mail, de pedido velho — tem que degradar
    // com elegância, sem derrubar a tela de erro da casca.
    render(<Produto slug="certificado-premium" />)
    expect(screen.getByText(/Certificado não encontrado/)).toBeTruthy()
    expect(screen.queryByText('Algo saiu errado por aqui')).toBeNull()
  })
})

// === Link de navegação interna ===
describe('Link', () => {
  afterEach(() => {
    // Os testes de âncora instalam um stub de `scrollIntoView` (jsdom não o
    // tem); removê-lo aqui não afeta os demais, que rodam pelo `?.()`.
    delete Element.prototype.scrollIntoView
    window.history.pushState(null, '', '/')
  })

  it('executa o onClick do chamador e ainda navega pela SPA', () => {
    // Regressão: `{...resto}` vinha depois do handler de navegação, então o
    // `onClick` do chamador SUBSTITUÍA a navegação — o link do menu mobile
    // (que passa onClick para fechar o menu) virava `<a>` nativa e
    // recarregava a SPA inteira.
    const aoClicar = vi.fn()
    render(
      <Link para="/rastrear" onClick={aoClicar}>
        Rastrear pedido
      </Link>,
    )

    fireEvent.click(screen.getByText('Rastrear pedido'))

    expect(aoClicar).toHaveBeenCalledTimes(1)
    // pushState = navegação interna, sem recarregar a página.
    expect(window.location.pathname).toBe('/rastrear')
  })

  it('deixa o chamador cancelar a navegação com preventDefault', () => {
    // Mesmo contrato do `onClick` nativo de uma `<a>`: quem chama pode
    // decidir que o clique não deve navegar.
    render(
      <Link
        para="/rastrear"
        onClick={(evento) => {
          evento.preventDefault()
        }}
      >
        Rastrear pedido
      </Link>,
    )

    fireEvent.click(screen.getByText('Rastrear pedido'))
    expect(window.location.pathname).toBe('/')
  })

  it('navega normalmente quando ninguém passa onClick', () => {
    render(<Link para="/rastrear">Rastrear pedido</Link>)
    fireEvent.click(screen.getByText('Rastrear pedido'))
    expect(window.location.pathname).toBe('/rastrear')
  })

  it('rola até a seção quando o destino é uma âncora da mesma tela', () => {
    // Regressão: `navegar` comparava a URL inteira com o pathname, então
    // `/#faq` caía no caminho genérico, empurrava a URL e rolava para o TOPO —
    // o link de FAQ do rodapé nunca chegava ao FAQ.
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    window.history.pushState(null, '', '/')

    render(
      <>
        <Link para="/#faq">Perguntas frequentes</Link>
        <div id="faq" />
      </>,
    )
    fireEvent.click(screen.getByText('Perguntas frequentes'))

    expect(window.location.pathname).toBe('/')
    expect(window.location.hash).toBe('#faq')
    // Mesma tela: `replaceState`, sem encher o histórico de âncoras.
    expect(rolar).toHaveBeenCalledWith({ behavior: 'smooth' })
  })

  it('ao trocar de tela, espera a seção nascer e rola até ela', async () => {
    // A seção do destino só existe DEPOIS do render da tela nova — por isso a
    // tentativa adiada: sem ela, o clique a partir de outra rota não rolava.
    const rolar = vi.fn()
    Element.prototype.scrollIntoView = rolar
    window.history.pushState(null, '', '/rastrear')
    render(<Loja />)

    fireEvent.click(screen.getByRole('link', { name: 'Perguntas frequentes' }))

    expect(window.location.pathname).toBe('/')
    await screen.findByRole('heading', { name: 'Perguntas frequentes' })
    await waitFor(() => expect(rolar).toHaveBeenCalled())
  })
})

// === Acesso do cliente à página própria (/editar) ===
describe('acesso do cliente', () => {
  afterEach(() => {
    localStorage.clear()
    window.history.pushState(null, '', '/')
  })

  it('pede o código da página', () => {
    render(<Editar />)
    expect(screen.getByLabelText(/Código da página/i)).toBeTruthy()
  })

  it('leva para a edição com o código no formato certo, em maiúsculas', () => {
    // A tela só resolve o código: o login de verdade (e-mail + token) é do
    // EdicaoPagina, em /p/:code/editar. Minúsculas na entrada saem
    // maiúsculas, como o servidor normaliza.
    render(<Editar />)
    fireEvent.change(screen.getByLabelText(/Código da página/i), {
      target: { value: 'sg-ab3k-9zxm' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(window.location.pathname).toBe('/p/SG-AB3K-9ZXM/editar')
  })

  it('recusa código fora do formato, sem sair da tela', () => {
    render(<Editar />)
    fireEvent.change(screen.getByLabelText(/Código da página/i), {
      target: { value: '12345' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(screen.getByRole('alert').textContent).toMatch(/SG-XXXX-XXXX/)
    expect(window.location.pathname).toBe('/')
  })

  it('pré-preenche o código do último pedido deste navegador', () => {
    // O checkout grava `stellara:ultimo-pedido` antes de sair para o pagamento
    // — quem acabou de comprar não digita o código de novo.
    localStorage.setItem(
      'stellara:ultimo-pedido',
      JSON.stringify({ code: 'SG-AB3K-9ZXM', email: 'ana@exemplo.com' }),
    )
    render(<Editar />)
    expect(screen.getByLabelText(/Código da página/i).value).toBe('SG-AB3K-9ZXM')
  })

  it('lê a chave antiga de antes do renome, ainda sem a nova', () => {
    // Navegador que comprou antes da troca de marca não pode ficar sem o
    // código pré-preenchido — só trocamos o nome da chave, não a dívida.
    localStorage.setItem(
      'stargeo:ultimo-pedido',
      JSON.stringify({ code: 'SG-AB3K-9ZXM', email: 'ana@exemplo.com' }),
    )
    render(<Editar />)
    expect(screen.getByLabelText(/Código da página/i).value).toBe('SG-AB3K-9ZXM')
  })

  it('o rodapé oferece o acesso em todas as telas', () => {
    // Sem este link, o cliente só descobria a edição pelo pé da própria
    // página /p/ — que é justamente a página que ele não sabe que existe.
    render(<Loja />)
    expect(screen.getByRole('link', { name: /Editar minha página/i })).toBeTruthy()
  })
})

// === Rastreio: consulta protegida por código + e-mail ===
describe('rastreamento', () => {
  it('pede código e e-mail — o código sozinho não protege nada', () => {
    // Os dois campos têm `label` ligada por `htmlFor`: se o id se perder,
    // `getByLabelText` falha antes de qualquer asserção de texto.
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
    // 404 do servidor vira alerta genérico: a mensagem não pode nem dizer
    // que o código existe nem qual dos dois campos estava errado.
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

// === Home: apresentação do produto, antes de qualquer venda ===
describe('vitrine da home', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/')
  })

  it('não anuncia os níveis que ainda não existem', () => {
    // Regressão: a home anunciava três produtos (mapa impresso e premium)
    // que não existem de verdade — e qualquer link para eles levava a uma
    // página que não pode ser comprada (migration 0007 os desligou).
    window.history.pushState(null, '', '/')
    const { container } = render(<Loja />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

    expect(hrefs.some((href) => href?.includes('certificado-mapa-impresso'))).toBe(false)
    expect(hrefs.some((href) => href?.includes('certificado-premium'))).toBe(false)
    expect(document.body.textContent).not.toContain('Mapa Impresso')
    expect(document.body.textContent).not.toContain('Premium')
  })

  it('mostra a folha do certificado na home, com o nome digitado ao vivo', () => {
    // A home é de apresentação: o OBJETO (a mesma folha do configurador)
    // aparece antes de qualquer preço, e o nome digitado entra nela na hora.
    window.history.pushState(null, '', '/')
    const { container } = render(<Loja />)

    expect(container.textContent).toContain('CERTIFICADO DE DEDICAÇÃO')

    fireEvent.change(screen.getByLabelText(/Escreva um nome/i), {
      target: { value: 'Beatriz' },
    })
    expect(container.textContent).toContain('Beatriz')
  })
})

// === Casca do App: rotas e rodapé ===
describe('casca da loja', () => {
  // O cabeçalho e o rodapé só existem no App. Renderizar as páginas isoladas
  // não os alcança — foi assim que um `ANO` solto no rodapé chegou ao ar e
  // derrubou todas as telas.
  afterEach(() => {
    localStorage.clear()
    window.history.pushState(null, '', '/')
  })

  it.each(['/', '/rastrear', '/editar', '/produto/certificado-digital', '/obrigado'])(
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
    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} Stellara`))).toBeTruthy()
  })
})

// === Regras de CSS das quais a prévia depende (fontes e @layer) ===
describe('prévia do certificado', () => {
  it('importa as fontes que o PDF usa, senão a folha sai em Georgia', () => {
    // Lido do disco, não do bundle: o que quebra em produção é o `@import`
    // sumir do CSS final, não o componente.
    const css = readFileSync(join(process.cwd(), 'loja/src/index.css'), 'utf8')
    expect(css).toMatch(/@import\s+["'][^"']*fonts\.css["']/)
  })

  it('mantém .btn e .pilha em @layer components, senão a utility não vence', () => {
    // CSS fora de camada vence qualquer utility do Tailwind. Sem a camada,
    // `.btn { display: inline-flex }` engolia o `hidden` do "Comprar
    // certificado" — que aparecia no celular, por cima do botão "Menu" —, e
    // `.pilha { max-width: 72rem }` engolia o `max-w-2xl` de Rastrear.
    const css = readFileSync(join(process.cwd(), 'loja/src/index.css'), 'utf8')
    const camadas = [...css.matchAll(/@layer components \{[\s\S]*?\n\}/g)].map((m) => m[0])

    expect(camadas.some((bloco) => bloco.includes('.btn {'))).toBe(true)
    expect(camadas.some((bloco) => bloco.includes('.pilha {'))).toBe(true)
  })

  it('a folha escala sozinha pelo viewBox, sem medir a tela', () => {
    // Antes, um contêiner media a largura e aplicava `transform: scale()` —
    // em jsdom (sem layout) o fator dava 0 e a folha sumia. O SVG com viewBox
    // e largura 100% não depende de medida nenhuma.
    render(<Produto slug="certificado-digital" />)
    const folha = document.querySelector('svg.certificado')
    expect(folha).toBeTruthy()
    expect(folha.getAttribute('width')).toBe('100%')
    expect(document.querySelector('[style*="scale("]')).toBeNull()
  })
})
