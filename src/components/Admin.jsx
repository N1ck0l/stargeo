import { useState } from 'react'
import { DEFAULTS } from '../../loja/src/data/defaults'
import { useContent } from '../../loja/src/lib/contentContext'

/**
 * Painel de edição.
 *
 * O site é estático, sem servidor: não há como gravar no lugar. Então o
 * painel edita, mostra a prévia e **baixa um `conteudo.json`**. O passo final
 * é colocar esse arquivo em `public/` e publicar de novo.
 *
 * A "senha" é só um trinco: tudo roda no navegador dela, então qualquer pessoa
 * com o link vê o mesmo JavaScript. Ela serve para não receber visita por
 * curiosidade — não é segurança de verdade.
 */

const PALAVRA = 'stellara'

/**
 * Campo de texto único do painel: `textarea` quando `rows > 1`, senão `input`.
 *
 * Controlado de ponta a ponta — o valor e a mudança vêm de fora (`content`),
 * então não há estado duplicado a sincronizar. `hint` é a linha de apoio que
 * explica o comportamento do campo (o que acontece quando fica vazio, por
 * exemplo).
 */
function Campo({ label, value, onChange, placeholder, rows = 1, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-wide text-gold/80 uppercase">{label}</span>
      {rows > 1 ? (
        <textarea
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full resize-y rounded-xl border border-white/15 bg-night/60 px-3 py-2 text-sm text-ivory outline-none transition focus:border-gold/60"
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-white/15 bg-night/60 px-3 py-2 text-sm text-ivory outline-none transition focus:border-gold/60"
        />
      )}
      {hint && <span className="mt-1 block text-xs text-ivory/50">{hint}</span>}
    </label>
  )
}

/**
 * Tela de edição completa.
 *
 * Importado por: `App.jsx`, só quando o caminho é `/admin`, e sempre via
 * `lazy()`. Exports: `Admin`.
 *
 * Duas telas dentro de um componente: a do "trinco" (`PALAVRA`) e a do
 * editor. Ambas são puramente locais — o estado vive no `ContentProvider`,
 * que na página de admin nasce com `editable` e NÃO busca o `conteudo.json`,
 * para o painel editar os padrões em vez de sobrescrever o que já está salvo.
 *
 * O botão "Voltar ao padrão" substitui o objeto inteiro por `DEFAULTS` e
 * também o texto da carta (`setCartaTexto`), que é o único campo mantido em
 * estado local do componente — ele vira e volta entre string e array.
 */
export function Admin() {
  const { content, setContent } = useContent()
  const [liberado, setLiberado] = useState(false)
  const [chave, setChave] = useState('')
  const [copiado, setCopiado] = useState('')
  const [cartaTexto, setCartaTexto] = useState(content.carta.join('\n\n'))

  const set = (campo) => (valor) => setContent((c) => ({ ...c, [campo]: valor }))

  const exportar = () => {
    const saida = {
      ...content,
      carta: cartaTexto
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean),
    }
    const blob = new Blob([JSON.stringify(saida, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.download = 'conteudo.json'
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
    setCopiado('Baixado! Agora coloque o arquivo em public/ e publique de novo.')
    setTimeout(() => setCopiado(''), 6000)
  }

  if (!liberado) {
    return (
      <div className="star-bg flex min-h-dvh items-center justify-center px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (chave.trim().toLowerCase() === PALAVRA) setLiberado(true)
            else setChave('')
          }}
          className="w-full max-w-xs text-center"
        >
          <svg width="44" height="44" viewBox="0 0 72 72" aria-hidden="true" className="mx-auto text-gold">
            <path
              d="M36 4 L41.8 26.2 L65 29 L47 43.8 L52.5 66 L36 53.4 L19.5 66 L25 43.8 L7 29 L30.2 26.2 Z"
              fill="currentColor"
            />
          </svg>
          <h1 className="font-serif mt-5 text-2xl">Painel da Stellara</h1>
          <p className="mt-2 text-sm text-ivory/60">Área de edição dos textos.</p>
          <input
            type="password"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            aria-label="Senha"
            className="mt-6 w-full rounded-xl border border-white/15 bg-night/60 px-4 py-2.5 text-center text-ivory outline-none focus:border-gold/60"
            placeholder="senha"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-night transition hover:bg-gold-soft"
          >
            Entrar
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="star-bg min-h-dvh px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-[10px] tracking-[0.3em] text-gold uppercase">
              Painel da Stellara
            </p>
            <h1 className="font-serif mt-1 text-3xl">Editar os textos</h1>
          </div>
          <a href="/" className="rounded-full border border-white/20 px-4 py-2 text-sm text-ivory/80 transition hover:border-gold hover:text-gold">
            Ver o site
          </a>
        </div>

        <div className="mb-8 rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm text-gold-soft">
          <p className="font-medium">Como aplicar as mudanças</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ivory/75">
            <li>Edite os textos aqui.</li>
            <li>Clique em <strong>Baixar conteudo.json</strong>.</li>
            <li>Copie o arquivo baixado para a pasta <code className="text-gold">public/</code> do projeto, substituindo o antigo.</li>
            <li>Rode <code className="text-gold">npm run build</code> e arraste a pasta <code className="text-gold">dist/</code> para o Netlify.</li>
          </ol>
          <p className="mt-3 text-xs text-ivory/60">
            Quem já abriu o site vai ver um aviso de “versão nova” e pode atualizar na hora.
          </p>
        </div>

        {/*
          A mensagem pessoal vem PRIMEIRO, não no fim da lista.
          É o campo mais importante do painel — a parte escrita de verdade — e
          ficava buried depois da carta, entre 14 outros campos.
        */}
        <div className="space-y-8">
          <section className="space-y-4 rounded-2xl border border-gold/25 bg-gold/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">
              Mensagem pessoal
            </h2>
            <Campo
              label="Sua mensagem"
              value={content.mensagemPessoal}
              onChange={set('mensagemPessoal')}
              rows={8}
              placeholder="Escreva aqui, com as suas palavras."
              hint="Vazio = a seção não aparece no site. Parágrafos separados por linha em branco."
            />
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">Identidade</h2>
            <Campo label="Nome completo" value={content.nome} onChange={set('nome')} />
            <Campo label="Nome abreviado" value={content.nomeCurto} onChange={set('nomeCurto')} />
            <Campo
              label="Assinatura"
              value={content.assinatura}
              onChange={set('assinatura')}
              placeholder="Com amor, …"
              hint="Vazio = não aparece."
            />
            <Campo label="Data da dedicação" value={content.data} onChange={set('data')} />
            <Campo label="Registro do certificado" value={content.registro} onChange={set('registro')} />
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">Tela inicial</h2>
            <Campo label="Linha do título" value={content.tituloHero} onChange={set('tituloHero')} />
            <Campo
              label="Frase digitada"
              value={content.fraseHero}
              onChange={set('fraseHero')}
              hint="É a linha que se escreve letra a letra."
            />
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">A estrela</h2>
            <Campo label="Título" value={content.tituloEstrela} onChange={set('tituloEstrela')} />
            <Campo label="Descrição" value={content.descricaoEstrela} onChange={set('descricaoEstrela')} rows={4} />
            <p className="text-xs text-ivory/50">
              Os dados científicos (coordenadas, magnitude, distância) não são editáveis de
              propósito: são fatos conferidos contra o SIMBAD.
            </p>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">Carta</h2>
            <Campo label="Título" value={content.tituloCarta} onChange={set('tituloCarta')} />
            <Campo
              label="Parágrafos"
              value={cartaTexto}
              onChange={setCartaTexto}
              rows={14}
              hint="Cada parágrafo é separado por uma linha em branco."
            />
          </section>

          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-display text-xs tracking-[0.25em] text-gold uppercase">O que mostrar</h2>
            {[
              ['mostrarMensagem', 'Mostrar a seção de mensagem pessoal'],
              ['mostrarMira', 'Mostrar o botão da Mira celeste'],
            ].map(([campo, rotulo]) => (
              <label key={campo} className="flex cursor-pointer items-center gap-3 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={content[campo] !== false}
                  onChange={(e) => set(campo)(e.target.checked)}
                  className="h-4 w-4 accent-[#d8b66a]"
                />
                {rotulo}
              </label>
            ))}
          </section>
        </div>

        <div className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-gold/30 bg-[#0f0a26]/95 p-4 backdrop-blur">
          <button
            type="button"
            onClick={exportar}
            className="rounded-full bg-gold px-6 py-2.5 text-sm font-medium text-night transition hover:bg-gold-soft"
          >
            Baixar conteudo.json
          </button>
          <button
            type="button"
            onClick={() => {
              setContent(DEFAULTS)
              setCartaTexto(DEFAULTS.carta.join('\n\n'))
            }}
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-ivory/80 transition hover:border-gold hover:text-gold"
          >
            Voltar ao padrão
          </button>
          {copiado && <span className="text-sm text-gold-soft">{copiado}</span>}
        </div>

        <p className="mt-8 text-center text-xs text-ivory/40">
          Esta página não é segura de verdade: roda inteira no navegador. Ela protege
          contra curiosidade, não contra quem souber abrir o código.
        </p>
      </div>
    </div>
  )
}