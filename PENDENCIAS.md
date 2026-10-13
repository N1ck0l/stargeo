# Pendências

Estado em 12 de outubro de 2026. O site está publicado e completo; o que
sobra divide-se entre o que só o dono pode fazer e o que dá para melhorar.

---

## 1. Só você pode fazer

### 1.1 Escrever a mensagem pessoal  ← o mais importante

A seção existe e só aparece quando está preenchida. Abra `/admin` (senha
`stargeo`), escreva em **Mensagem pessoal** (primeiro campo do painel), clique
em *Baixar conteudo.json*, coloque o arquivo em `public/` e publique de novo.

Enquanto isso, o site está entregue sem o pedaço mais pessoal dele.

### 1.2 Testar no iPhone

É o maior risco técnico em aberto. Todo o código de iOS (permissão de
movimento, área segura, `play()` da câmera, `text-size-adjust`) foi escrito a
partir de documentação, **nunca executado num iPhone**.

Verifique com atenção:

- a câmera liga e mostra o céu
- o menu não fica embaixo do entalhe nem da barra de gesto
- a bússola responde (no Safari é preciso **Configurações → Safari →
   Movimentação e Orientação**)
- o certificado abre e os dois botões de impressão funcionam

### 1.3 Testar a Mira celeste de noite, ao ar livre

Os rastros de estrelas e a bússola só podem ser julgados de verdade no
celular dela, à noite. Bússola dentro de casa erra ±20° ou mais — isso é
esperado, não é defeito.

Nesta versão a seta de direção foi corrigida: antes, em metade das posições
(quando o aparelho apontava para o lado oposto ao da estrela, atravessando o
norte) ela mandava virar para o lado errado. Ainda vale confirmar no escuro.

### 1.4 Trocar a URL (opcional, mas muda a impressão)

Hoje: `papaya-dieffenbachia-483678.netlify.app`.
Em **Site settings → Change site name** dá para deixar mais curto e bonito
(de graça).

> Ao trocar o domínio, atualize também a URL em `index.html` — a imagem de
> prévia (`og:image`, `twitter:image`) e o `canonical` são **absolutos**, e
> uma URL relativa não é aceita pelo WhatsApp nem pelo Twitter.

### 1.5 Senha do painel

A padrão é `stargeo`, em `PALAVRA` no arquivo `src/components/Admin.jsx`.
Troque se achar que adivinharem fácil. **Não é segurança de verdade** — o
painel roda inteiro no navegador dela.

### 1.6 Ligar a loja

O código da loja está pronto e testado, mas nunca rodou contra o Mercado Pago
de verdade. Para ela existir:

1. Preencher o `.env` e publicar as quatro Edge Functions (ver `LOJA.md`).
2. Cadastrar o webhook no painel do Mercado Pago e copiar o segredo.
3. Fazer uma compra de teste ponta a ponta com cartão de teste — conferir que
   o e-mail chega, que o link baixa o PDF e que o PDF está correto.
4. Antes de abrir ao público: trocar os preços de exemplo no seed, revisar a
   lista de termos bloqueados em `shared/moderation.js` e restringir o CORS às
   origens reais.

O ponto mais frágil é a moderação: o certificado vende texto impresso que o
cliente escreve e o vendedor não lê antes de entregar. O filtro roda duas
vezes (na compra e no webhook), mas nenhuma lista de termos é completa — vale
acompanhar os primeiros pedidos de perto.

---

## 2. Melhorias que dá para fazer

Nada de bloqueante. Sãooma de polimento:

### 2.1 Cabeçalhos de segurança não aplicados

O `netlify.toml` tem `X-Content-Type-Options`, `Referrer-Policy`,
`X-Frame-Options`, `Permissions-Policy` e `Strict-Transport-Security`, mas
**só valem se o repositório estiver conectado** à Netlify. Publicando
arrastando a pasta, eles não entram. Num presente íntimo o risco é
praticamente nulo — dá para deixar assim.

### 2.2 Os ícones e a imagem de prévia estão grandes

`og-image.png` tem 201 KB, e os ícones de 512 px uns 130 KB cada. Funcionam,
mas acima de um certo tamanho alguns mensageiros deixam de exibir a prévia.
Dá para recomprimir sem perda visível.

---

## 3. O que foi corrigido nesta rodada

Uma revisão completa do código encontrou problemas reais, todos resolvidos:

| O que era | Consequência |
| --- | --- |
| `wrap180` não normalizava entrada negativa | A Mira celeste **invertia a seta** e nunca alinhava quando o aparelho apontava para o lado oposto ao da estrela |
| Aviso de "versão nova" nunca aparecia | Publicar texto novo dependia de a pessoa recarregar sozinha |
| 4 campos do `/admin` sem efeito | "Data da dedicação", "Registro", título e descrição da estrela eram editáveis e **não apareciam** |
| Mapa ignorava botão e teclado sob movimento reduzido | Quem pediu menos movimento perdia o controle por teclado |
| Corrida no `getUserMedia` | A câmera podia ficar **ligada em segundo plano** ao fechar a Mira no meio da permissão |
| Fontes: 14 arquivos, 5 conteúdos idênticos | Peso baixado duas vezes e peso tipográfico não era o pedido |
| SW gravava 404 no cache offline | Sem internet, qualquer endereço mostrava a página de erro |
| `conteudo.json` servia do cache primeiro | Texto novo só aparecia na publicação *seguinte* |
| Versão clara do certificado saía com folha escura | "Imprimir claro" gastava tinta como se fosse a escura |
| Mira celeste não era um diálogo | Sem `Esc`, foco preso ou trava de rolagem; o teclado vazava para o site |
| Pinça trocava a estrela selecionada | Zoom com dois dedos mudava o painel sem querer |
| Bilhete rotacionado duas vezes | Inclinação de -1,2° em vez de -0,6°, e o hover não endireitava |
| 42 estrelas com ascensão reta inválida | Kaus Australis era desenhada **duas vezes** na Mira |
| `og:image` relativa | Sem prévia no WhatsApp/Twitter |
| Conteúdo invisível sem JavaScript | Página em branco se o JS falhasse |

Ganhos: **6 correções de bug** (com testes que falham se voltarem), lint limpo
pela primeira vez, **10 arquivos de fonte a menos**, e a bateria de testes foi
de 95 para **151 verificações**.

---

## 4. Estado atual, para conferência

| Item | Situação |
| --- | --- |
| Build | limpo, sem erro (site e loja) |
| Lint | limpo, sem aviso |
| Testes | 37 do site + 19 da loja, todos passando |
| Pacote inicial | 94 kB gzip (JS 84,7 + CSS 9,1) |
| PWA / offline | funcionando, verificado cortando a rede |
| `/admin` | publicado, funciona em `/admin` e `/admin/` |
| Conteúdo | `public/conteudo.json`, padrão embutido como reserva |
| Loja | código pronto, nunca rodou contra o Mercado Pago real |

### Fluxo para mudar um texto

1. `npm run dev` (opcional, para conferir)
2. Abrir `/admin`, editar, *Baixar conteudo.json*
3. Colocar o arquivo em `public/`, substituindo o antigo
4. `npm run build`
5. Arrastar `dist/` para o Netlify Drop

Quem já tinha o site aberto recebe o aviso de "versão nova" e atualiza na hora.

### Onde mexer

- `src/data/star.js` — dados científicos (conferidos contra o SIMBAD) e o
  conteúdo padrão
- `src/data/defaults.js` — o texto que o `/admin` mostra antes de editar
- `src/data/brightStars.js` — 90 estrelas para o céu em volta na Mira celeste
- `src/components/Admin.jsx` — o painel, incluindo a senha
