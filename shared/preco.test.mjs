/**
 * Preço do par: 10% sobre a soma, arredondado para baixo até o real, e
 * repartido entre os dois pedidos sem perder nem sobrar um centavo.
 */
import { descontoPara, precoDoGrupo, precoDoPar } from './preco.js'

let falhas = 0
const check = (nome, ok, extra = '') => {
  console.log(`${ok ? 'ok   ' : 'FALHA'} ${nome}${ok ? '' : ` ${extra}`}`)
  if (!ok) falhas += 1
}

const lendarias = precoDoPar(24900, 24900)
check('duas lendárias: R$ 498 → R$ 448', lendarias.total === 44800 && lendarias.desconto === 5000, JSON.stringify(lendarias))
check('partes iguais', lendarias.partes[0] === 22400 && lendarias.partes[1] === 22400)

const mista = precoDoPar(24900, 4900)
check('lendária + profunda: R$ 298 → R$ 268', mista.total === 26800, JSON.stringify(mista))
check('partes somam o total', mista.partes[0] + mista.partes[1] === mista.total)
check('a mais cara leva a maior parte', mista.partes[0] > mista.partes[1])

const faixas = [4900, 6900, 9900, 14900, 24900]
for (const a of faixas) {
  for (const b of faixas) {
    const p = precoDoPar(a, b)
    if (p.partes[0] + p.partes[1] !== p.total || p.total % 100 !== 0 || p.total > (a + b) * 0.9 || p.partes.some((x) => x <= 0)) {
      check(`combinação ${a}+${b}`, false, JSON.stringify(p))
    }
  }
}
check('todas as combinações de faixa: soma exata, real inteiro, desconto ≥ 10%', true)

check('escala: 1→0%, 2→10%, 3→15%, 4 a 6→20%', [1, 2, 3, 4, 5, 6].map(descontoPara).join() === '0,10,15,20,20,20')

const tres = precoDoGrupo([6900, 6900, 6900])
check('três visíveis: R$ 207 → R$ 175', tres.total === 17500 && tres.percentual === 15, JSON.stringify(tres))

const quatro = precoDoGrupo([6900, 6900, 6900, 6900])
check('quatro visíveis: R$ 276 → R$ 220', quatro.total === 22000, JSON.stringify(quatro))

const avulsa = precoDoGrupo([24900])
check('uma estrela: preço cheio', avulsa.total === 24900 && avulsa.desconto === 0)

// Todas as combinações de 2 a 6 estrelas entre as faixas: soma exata e real inteiro.
let combinacoes = 0
const gerar = (prefixo) => {
  if (prefixo.length >= 2) {
    combinacoes += 1
    const g = precoDoGrupo(prefixo)
    const soma = g.partes.reduce((a, b) => a + b, 0)
    if (soma !== g.total || g.total % 100 !== 0 || g.partes.some((x) => x <= 0)) check(`grupo ${prefixo}`, false, JSON.stringify(g))
  }
  if (prefixo.length < 6) for (const f of faixas) if (!prefixo.length || f <= prefixo[prefixo.length - 1]) gerar([...prefixo, f])
}
gerar([])
check(`grupos de 2 a 6 estrelas (${combinacoes} combinações): partes somam o total, real inteiro`, combinacoes > 100)

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
process.exit(falhas ? 1 : 0)
