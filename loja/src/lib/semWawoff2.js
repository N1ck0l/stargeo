/**
 * No lugar do `npm:wawoff2` no bundle da loja (alias em `loja/vite.config.js`).
 *
 * O navegador gera o PDF com as fontes em TTF (`formatoFonte: 'ttf'`), que
 * não precisam de descompressão — então o descompressor de woff2 (um módulo
 * WASM pensado para Node) nunca é carregado aqui. Se for, é bug de chamada.
 */
export function decompress() {
  throw new Error('woff2 não é usado no navegador: gere o PDF com formatoFonte "ttf".')
}
