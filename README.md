# Stellara — Kaus Australis para Geovanna

Aplicação web (SPA) romântica e interativa: um certificado de estrela dedicado a **Geovanna Beatriz Santos Trindade**, destacando **Kaus Australis (ε Sagittarii)**, a estrela mais brilhante de Sagitário.

> **Pendências e o que falta** estão em [PENDENCIAS.md](PENDENCIAS.md).

## Como iniciar

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (em geral `http://localhost:5173`).

Para gerar a versão de produção:

```bash
npm run build
npm run preview
```

Para publicar na internet, veja **[DEPLOY.md](DEPLOY.md)**.

## Scripts

| Comando         | O que faz                                              |
| --------------- | ------------------------------------------------------ |
| `npm run dev`   | Servidor de desenvolvimento com recarga automática      |
| `npm run build` | Gera a versão de produção em `dist/`                    |
| `npm run preview` | Serve localmente o build de produção                  |
| `npm run lint`  | Verificação de estilo e erros comuns (oxlint)           |
| `npm test`      | Verificação numérica da projeção + testes de componente |

## Stack

- React 19 + Vite
- Tailwind CSS 4
- Canvas HTML5 para o mapa celeste e o campo de estrelas
- html-to-image (download do certificado em PNG)

## Animações

O movimento faz parte da experiência, mas nunca atropela o conteúdo:

| Onde | O quê |
| --- | --- |
| Fundo | Nebulosas à deriva, estrelas com parallax, meteoros e cintilações |
| Início | Anéis orbitais, brilho pulsante, máquina de escrever, parallax na rolagem |
| Rolagem | Barra de progresso, revelação por seção, parágrafos que surgem sozinhos |
| Mapa | A figura do bule de chá se traça sozinha ao entrar na tela |
| Certificado | Entrada do diálogo, brilho na borda, selo de ouro que carimba |
| Menu | Seção ativa sinalizada, sublinhado deslizante, barra que encolhe ao rolar |

Duas regras valem para tudo isso:

- **Movimento reduzido é respeitado.** Com `prefers-reduced-motion`, nenhuma
  animação CSS roda, os dois canvas de fundo desenham uma única vez e ficam
  parados, e todo conteúdo aparece sem transição. Nada fica invisível.
- **Desempenho.** Tudo roda em um único laço de `requestAnimationFrame` por
  canvas; a nebulosa é rasterizada uma vez e reaproveitada. As revelações usam
  `transform` (GPU) em vez de propriedades que forçam layout. E o trabalho
  para quando não está sendo visto: os dois canvas de fundo e o mapa celeste
  pausam fora da viewport e com a aba escondida, e sob movimento reduzido o
  mapa só redesenha quando algo muda de fato.

## Mira celeste (câmera + bússola)

O botão **"✦ Achar no céu real"** (também no menu) abre uma tela cheia com a
câmera do aparelho, e usa a bússola para mostrar para onde fica Kaus Australis.

### Precisa de HTTPS

Câmera, localização e sensores de orientação **só funcionam em contexto
seguro**. Em `localhost` funciona, mas `http://` num IP da rede local **não**.
Se for publicar, use HTTPS — Netlify e Vercel dão certificado automático.

### Como funciona

1. Converte AR/Declinação da estrela em **altura e azimute** para o lugar e a
   hora atual (tempo sideral local).
2. Lê a orientação do aparelho e calcula para onde a câmera está apontando.
3. Desenha a seta e o texto de orientação, além do **bule de chá inteiro**,
   para ela reconhecer o desenho.

No rodapé fica a posição calculada da estrela, a do aparelho e a precisão
estimada da bússola.

### Recursos

- **"Aonde está agora?"** — responde se a estrela está visível neste momento,
  quando nasce e se pôre, qual a melhor janela da noite e para onde olhar.
  Varre 24 h em passos de 4 min procurando as travessias do horizonte.
- **Aviso de bússola ruim** — quando o Android informa desvio alto (típico
  dentro de casa), explica como recalibrar movendo o celular em forma de 8.
- **Ajuste do campo de visão** — cada aparelho tem uma câmera diferente
  (55°–80°). O botão *Calibrar* abre um controle para acertar pelo que se vê.
- **Rastros de estrelas** — botão *Rastros*: acumula o quadro da câmera sobre
  um canvas, e depois de alguns minutos dá para salvar a imagem dos arcos.

### Limites honestos

- A bússola do celular é imprecisa: **±10° a ±20°** em geral, e pior dentro de
  casa. Em céu aberto e longe de prédios, fica mais confiável.
- O campo de visão da câmera varia entre aparelhos (55°–80°); usamos 68° como
  aproximação.
- A mira funciona melhor **à noite** — de dia, Kaus Australis não é visível a
  olho nu.
- Sem sensores (computador), a tela ainda mostra a posição calculada da estrela,
  mas não acompanha o aparelho.
- Sem localização, oferecemos 11 cidades brasileiras como alternativa.

O aviso de sensor só aparece quando **nenhum evento chega** em 3,5 s — não
confiamos na resposta da API de permissão, que em alguns navegadores recusa
mesmo quando os sensores funcionam.

## Desempenho

Duas partes do site só são usadas depois de um clique, então são carregadas
sob demanda em vez de entrar no pacote inicial:

| Parte | gzip | Quando baixa |
| --- | --- | --- |
| `html-to-image` | 5 kB | Ao clicar em "Baixar PNG" |
| `SkyFinder` + `sky.js` | 6 kB | Ao abrir a Mira celeste |

Isso tirou **9 kB da carga inicial** (101 kB → 92 kB, somando JS e CSS). Não é
um ganho espetacular: cerca de metade do que sobra é o próprio React
(`react-dom` sozinho tem 610 KB de código-fonte).

A página inicial baixa 11 arquivos. Quem nunca abrir a Mira celeste nunca baixa
o código dela.

## Aplicativo e compartilhamento

- **Instalável.** Ícones próprios (incluindo a versão *maskable* do Android),
  manifesto e `theme-color`. No celular: *Compartilhar → Adicionar à tela de
  início*. Abre sem barra de navegador, com o ícone da estrela.
- **Funciona offline.** O `sw.js` é gerado durante o build com a lista real de
  arquivos, então a segunda visita abre sem internet — verificado cortando a
  rede: o site inteiro, com fontes e animações, continua igual.
- **Fica atualizado.** O `conteudo.json` é buscado da rede primeiro, então um
  texto novo aparece na publicação seguinte sem depender de limpeza de cache.
  Uma página de erro (404) nunca é guardada no cache offline.
- **Prévia ao compartilhar.** `og:image` gerada com as fontes reais do site, de
  modo que o link no WhatsApp abre com o desenho certo em vez de um cartão
  cinza. A URL da imagem é absoluta, como o Open Graph exige.

O service worker só é registrado em produção; no `npm run dev` ele é removido de
propósito, para não servir arquivos velhos enquanto se programa.

## Mensagem pessoal

A seção que vale mais: **é a parte escrita por você**.

Edite `personalMessage` em `src/data/star.js`. Enquanto estiver vazia a seção
nem aparece — nada de seção vazia ou texto de exemplo no site.

```js
personalMessage: `Primeira linha.

Segunda linha, depois de uma linha em branco.`,
```

Aparece como um bilhete de papel, levemente torto, que se endireita ao passar
o ponteiro.

## Robustez

- **Fronteira de erro** envolvendo a aplicação inteira (`ErrorBoundary`): um
  bug em qualquer componente vira uma tela legível com botão de recarregar, em
  vez de uma página branca.
- **Câmera nunca fica ligada sozinha.** Se a Mira for fechada enquanto o
  navegador ainda está pedindo permissão, o stream que chegar depois é parado
  na hora — o indicador de câmera do aparelho não fica aceso.
- **Fontes locais** em `public/fonts`, uma por família e estilo. Nada é
  carregado do Google: sem internet ou com o Google bloqueado, o desenho é
  idêntico, e nada é pedido a um servidor terceiro.
- **Área segura do iPhone** (`safe-area-inset`) no menu e na Mira celeste, para
  nada ficar embaixo do entalhe ou da barra de gesto.
- `text-size-adjust: 100%` para o Safari não inflar o texto ao girar o celular.

## Painel de edição (`/admin`)

Para mexer nos textos **sem tocar em código**. Senha padrão: `stargeo` (troque em
`src/components/Admin.jsx`).

O site é estático e não tem servidor, então o painel não grava sozinho: ele
**baixa um `conteudo.json`**. O caminho é:

1. Edite em `/admin` e clique em **Baixar conteudo.json**.
2. Coloque o arquivo em `public/`, substituindo o antigo.
3. `npm run build` e arraste a `dist/` para o Netlify.

Quem já tinha o site aberto recebe o aviso de "versão nova" e atualiza na hora.

O que dá para editar: nome, assinatura, data, título e frase do início, título
e descrição da estrela, todos os parágrafos da carta, **a mensagem personal**,
e o que aparece (mensagem e Mira celeste). A mensagem pessoal fica no **topo**
do painel, por ser a parte mais importante.

**O que não é editável:** as coordenadas, magnitude, distância e espectro de
Kaus Australis. São fatos conferidos contra o SIMBAD, não texto.

> A senha é um trinco, não segurança: o painel roda inteiro no navegador dela.
> Serve para não receber visita por curiosidade, não contra quem abrir o código.

### Aviso de versão nova

O `UpdateNotice` aparece quando um service worker novo termina de instalar e
fica esperando. O `sw.js` **não** se assume sozinho — sem `skipWaiting()` no
`install`, ele não troca o JavaScript embaixo de quem está lendo. O botão
*Atualizar agora* manda a mensagem que libera a troca, e o `controllerchange`
recarrega a página com o site novo.

## Estrutura

```
src/
├── components/      Hero, SkyMap, StarDetails, LoveLetter, Navbar, Footer…
├── data/star.js     ← personalize aqui: nome, dedicatória, carta e assinatura
├── lib/astro.js     projeção gnomônica, formatação de coordenadas, zoom
└── lib/astro.test.mjs

test/                testes de componente (vitest + jsdom)
```

## O mapa do céu

O mapa usa **projeção gnomônica** — a mesma dos atlas celestes impressos, em que
os ângulos entre as estrelas são reais. Ela segue a convenção de quem olha para
cima: norte para cima e leste (AR crescente) para a esquerda, de modo que o
bule de chá aparece exatamente como está no céu real do Brasil.

Interações: arrastar, roda do mouse, pinça com dois dedos, botões de zoom,
clique/toque nas estrelas e navegação por teclado (setas, `+`/`-`, `0`).

`npm test` roda duas baterias:

- `src/lib/astro.test.mjs` (node puro) confere a projeção numericamente:
  coordenadas padrão, retificação de grandes circunferências, preservação de
  ângulos, arrasto e zoom ancorado no cursor.
- `src/lib/sky.test.mjs` (node puro) confere a posição celeste: culminação,
  nascer e pôr do sol, visibilidade por estação e cidade, e o cálculo de
  direção da Mira.
- `test/` (vitest + jsdom) cobre os componentes: o modal do certificado e a
  Mira celeste (foco, `Esc`, trava de rolagem), o menu mobile, o mapa do céu
  sob movimento reduzido e o vínculo entre o painel e o site.

## Acessibilidade

- Funciona por teclado, inclusive o mapa do céu e os dois diálogos, com anel de
  foco dourado visível em todos os controles.
- Os diálogos (certificado e Mira celeste) prendem o foco, fecham com `Esc`,
  travam a rolagem do fundo e devolvem o foco ao fechar.
- O mapa desenhado em canvas tem uma lista textual equivalente para leitores de tela.
- `prefers-reduced-motion` desliga as animações e o loop de canvas contínuo.
  Mesmo assim o mapa continua **operável**: os botões e as setas redesenham a
  tela sob demanda, porque sem laço de animação nada mais atualizaria o desenho.
- No modo de Alto Contraste do Windows o mapa é preservado com `forced-color-adjust: none` (o conteúdo de um canvas é bitmap e não seria repintado).
- Sem JavaScript, a página mostra o texto em vez de ficar visualmente vazia
  (as animações de entrada partem de `opacity: 0`).

## Impressão

O certificado tem **duas versões**, alternadas pelos botões do modal:

| Botão | Quando usar |
| --- | --- |
| **Imprimir escuro** | PDF para tela ou celular. É a versão original. |
| **Imprimir claro** | Papel de verdade. Fundo marfim, muito menos tinta. |

As duas são o mesmo documento escrito em variáveis CSS (`.certificate-paper` /
`.certificate-light`), então não há como uma divergir da outra.

**Por que isso importa:** o certificado é escuro. Navegadores descartam fundos
ao imprimir, então sem `print-color-adjust: exact` o texto claro sairia
invisível. E em impressora jato de tinta — que não imprime fundos escuros —
o certificado sairia em branco.

Use **"Salvar como PDF"** no diálogo de impressão para gerar o arquivo.

O botão **Baixar PNG** exporta sempre a versão escura, que é a original.

## Personalização rápida

Edite `src/data/star.js` para ajustar a dedicatória, a carta ou o campo `from`
(assinatura, que aparece ao final da carta e do certificado).