/**
 * Reexporta a matemática celeste de `shared/astro.js`.
 *
 * A loja, a geração do PDF e os testes importam direto de `shared/`. Este
 * arquivo existe só para que o site pessoal (que é um presente pronto e não
 * muda mais) continue importando do mesmo lugar de sempre.
 *
 * Nada aqui é implementado: se uma função está neste módulo, o código está em
 * `shared/astro.js`. É o que impede as coordenadas de divergirem entre o
 * presente e a loja.
 */
export * from '../../shared/astro.js'
