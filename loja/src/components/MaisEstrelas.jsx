import { useState } from 'react'
import { MAX_ESTRELAS, descontoPara } from '../../../shared/preco.js'
import { reais } from '../lib/catalogo.js'
import { ExploradorDeEstrelas } from './ExploradorDeEstrelas.jsx'

/**
 * "Mais de uma estrela" no configurador — de 2 a 6 pessoas numa compra
 * (migrations 0020 e 0021). Cada pessoa: nome, estrela e nome opcional para
 * a estrela. Um explorador só, para a pessoa sendo escolhida — seis abertos
 * de uma vez pesariam e confundiriam no celular.
 *
 * O estado mora no `Produto` (é ele que valida, mostra a prévia e envia);
 * aqui é só a interface. `outras` = `[{ id, nome, apelido, estrela }]`.
 */
let proximoId = 1

function novaPessoa() {
  proximoId += 1
  return { id: proximoId, nome: '', apelido: '', estrela: null }
}

export function MaisEstrelas({ principal, outras, setOutras, nomeGrupo, setNomeGrupo, erroDe, marcarTocado, aoVerFolha }) {
  const [escolhendo, setEscolhendo] = useState(null)
  const total = outras.length + 1
  const usadas = new Set([principal.slug, ...outras.map((o) => o.estrela?.slug).filter(Boolean)])
  const mudar = (id, campos) => setOutras((lista) => lista.map((o) => (o.id === id ? { ...o, ...campos } : o)))

  function adicionar() {
    const nova = novaPessoa()
    setOutras((lista) => [...lista, nova])
    setEscolhendo(nova.id)
  }

  function remover(id) {
    setOutras((lista) => lista.filter((o) => o.id !== id))
    if (escolhendo === id) setEscolhendo(null)
    aoVerFolha(0)
  }

  const pessoaEscolhendo = outras.find((o) => o.id === escolhendo)

  return (
    <div className="mt-8 rounded-2xl border border-gold/25 bg-gold/[0.04] p-5">
      <h3 className="font-display text-base text-ivory">Mais de uma estrela</h3>
      <p className="mt-1 text-xs leading-relaxed text-ivory/60">
        Uma estrela para cada pessoa — casal, irmãos, a família inteira. Cada uma ganha o próprio certificado e a
        própria página, e todas aparecem juntas num mesmo céu. Desconto: 2 estrelas, {descontoPara(2)}%; 3,{' '}
        {descontoPara(3)}%; 4 a {MAX_ESTRELAS}, {descontoPara(4)}%.
      </p>

      {outras.length > 0 && (
        <ol className="mt-5 space-y-4">
          {outras.map((o, i) => {
            const indisponivel = Boolean(o.estrela?.status) && o.estrela.status !== 'disponivel'
            return (
              <li key={o.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs tracking-[0.2em] text-gold/80 uppercase">Pessoa {i + 2}</p>
                  <button type="button" onClick={() => remover(o.id)} className="text-xs text-ivory/50 hover:text-red-300">
                    Remover
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <CampoSimples
                    id={`pessoa-${o.id}-nome`}
                    rotulo={`Nome da pessoa ${i + 2}`}
                    obrigatorio
                    value={o.nome}
                    onChange={(v) => mudar(o.id, { nome: v })}
                    onBlur={() => marcarTocado(`outra.${o.id}.honoreeName`)}
                    erro={erroDe(o.id, 'honoreeName')}
                    maxLength={80}
                  />
                  <CampoSimples
                    id={`pessoa-${o.id}-apelido`}
                    rotulo={`Nome para a estrela ${i + 2} (opcional)`}
                    value={o.apelido}
                    onChange={(v) => mudar(o.id, { apelido: v })}
                    onBlur={() => marcarTocado(`outra.${o.id}.starNickname`)}
                    erro={erroDe(o.id, 'starNickname')}
                    maxLength={40}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  {o.estrela ? (
                    <span className="text-ivory/85">
                      <span className="font-serif text-ivory">{o.estrela.name}</span>
                      <span className="text-ivory/50"> · {o.estrela.constellation} · {reais(o.estrela.precoCentavos)}</span>
                      {indisponivel && <span className="block text-xs text-amber-200">Esta já tem dono — escolha outra.</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-ivory/55">Sem estrela escolhida ainda.</span>
                  )}
                  <span className="flex gap-2">
                    {o.estrela && (
                      <button type="button" onClick={() => aoVerFolha(i + 1)} className="rounded-full border border-white/15 px-3 py-1 text-xs text-ivory/75 hover:border-gold hover:text-gold">
                        Ver a folha
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEscolhendo(escolhendo === o.id ? null : o.id)}
                      aria-expanded={escolhendo === o.id}
                      className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold hover:text-night"
                    >
                      {o.estrela ? 'Trocar a estrela' : 'Escolher a estrela'}
                    </button>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {pessoaEscolhendo && (
        <div className="mt-5 rounded-xl border border-gold/30 p-4">
          <ExploradorDeEstrelas
            selecionada={pessoaEscolhendo.estrela?.slug}
            aoEscolher={(e) => {
              if (usadas.has(e.slug) && e.slug !== pessoaEscolhendo.estrela?.slug) return
              mudar(pessoaEscolhendo.id, { estrela: e })
              aoVerFolha(outras.findIndex((o) => o.id === pessoaEscolhendo.id) + 1)
              setEscolhendo(null)
            }}
            titulo={`Estrela de ${pessoaEscolhendo.nome.trim().split(' ')[0] || 'quem recebe'}`}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {total < MAX_ESTRELAS && (
          <button type="button" onClick={adicionar} className="btn btn-secundario text-sm">
            + Adicionar {outras.length ? 'mais uma pessoa' : 'outra pessoa'}
          </button>
        )}
        {outras.length > 0 && (
          <span className="text-xs text-ivory/55">
            {total} estrelas · {descontoPara(total)}% de desconto
          </span>
        )}
      </div>

      {total >= 3 && (
        <div className="mt-5 max-w-sm">
          <CampoSimples
            id="nome-grupo"
            rotulo="Nome do grupo (opcional)"
            value={nomeGrupo}
            onChange={setNomeGrupo}
            onBlur={() => marcarTocado('groupName')}
            erro={erroDe(null, 'groupName')}
            placeholder="Ex.: Família Souza"
            maxLength={40}
            dica="Sai nos certificados (“Uma das quatro estrelas · Família Souza”) e na página do grupo."
          />
        </div>
      )}
    </div>
  )
}

function CampoSimples({ id, rotulo, obrigatorio, erro, dica, onChange, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">
        {rotulo}
        {obrigatorio && <span className="ml-1 text-gold" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        className="campo"
        {...props}
        onChange={(e) => onChange(e.target.value)}
        required={obrigatorio}
        aria-invalid={erro ? 'true' : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
      />
      {erro && (
        <p id={`${id}-erro`} className="mt-2 text-xs text-red-300">
          {erro}
        </p>
      )}
      {dica && !erro && <p className="mt-1.5 text-xs text-ivory/45">{dica}</p>}
    </div>
  )
}
