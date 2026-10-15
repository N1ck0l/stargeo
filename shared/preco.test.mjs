/**
 * Preço do par: 10% sobre a soma, arredondado para baixo até o real, e
 * repartido entre os dois pedidos sem perder nem sobrar um centavo.
 */
import { precoDoPar } from './preco.js'

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

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTODOS OS TESTES PASSARAM')
process.exit(falhas ? 1 : 0)
