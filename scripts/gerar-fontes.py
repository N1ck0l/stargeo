"""
Fontes do certificado: instâncias estáticas para o PDF + tabela de larguras.

    pip install fonttools brotli
    python scripts/gerar-fontes.py [PlayfairDisplay-Italic[wght].ttf]

Por que existe: as fontes do site são VARIÁVEIS (um arquivo cobre vários
pesos). O navegador escolhe o peso pelo CSS, mas o pdf-lib embute a instância
PADRÃO do arquivo — e a padrão da Montserrat é a Thin (peso 100). Todo texto
em Montserrat do PDF saía fininho, diferente da prévia. Aqui cada peso usado
no certificado vira um arquivo estático (`loja/public/fonts/pdf/`), e é isso
que o PDF embute.

A tabela de larguras (`shared/certificado/metricas.js`) é o que faz a prévia e
o PDF quebrarem as linhas no MESMO lugar: os dois medem o texto com os mesmos
números, tirados destes arquivos, em vez de cada lado medir com o seu motor.

O argumento opcional é a Playfair Display Italic variável do Google Fonts
(github.com/google/fonts, ofl/playfairdisplay, licença OFL). Com ele, o script
também gera `loja/public/fonts/playfair-display-italic.woff2` (subconjunto
latino, para o navegador). Sem ele, reaproveita esse arquivo já gerado.
"""
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FONTES = os.path.join(RAIZ, 'loja', 'public', 'fonts')
SAIDA_PDF = os.path.join(FONTES, 'pdf')
os.makedirs(SAIDA_PDF, exist_ok=True)

# Latim básico + Latin-1 + Latin Extended-A + pontuação tipográfica: cobre
# português e os nomes europeus comuns sem carregar a fonte inteira.
UNICODES_LATINOS = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) +
    [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x2032, 0x2033, 0x2212, 0x20AC]
)

italico_fonte = os.path.join(FONTES, 'playfair-display-italic.woff2')
if len(sys.argv) > 1:
    original = TTFont(sys.argv[1])
    opcoes = subset.Options()
    opcoes.flavor = 'woff2'
    opcoes.layout_features = ['*']
    sub = subset.Subsetter(opcoes)
    sub.populate(unicodes=UNICODES_LATINOS)
    sub.subset(original)
    original.flavor = 'woff2'
    original.save(italico_fonte)
    print('playfair-display-italic.woff2', os.path.getsize(italico_fonte) // 1024, 'KB')


def estatica(arquivo, peso):
    fonte = TTFont(os.path.join(FONTES, arquivo))
    if 'fvar' in fonte:
        fonte = instancer.instantiateVariableFont(fonte, {'wght': peso}, updateFontNames=True)
    return fonte


# chave usada no desenho -> (arquivo de origem, peso, arquivo do PDF)
PDF = {
    'sans': ('montserrat-400-600.woff2', 400, 'montserrat-400.woff2'),
    'sansMedio': ('montserrat-400-600.woff2', 500, 'montserrat-500.woff2'),
    'sansItalico': ('montserrat-400i.woff2', 400, 'montserrat-400i.woff2'),
    'serif': ('playfair-display-400-700.woff2', 400, 'playfair-400.woff2'),
    'serifItalico': ('playfair-display-italic.woff2', 400, 'playfair-italic-400.woff2'),
    'grego': ('eb-garamond-italic-grego.woff2', 400, 'eb-garamond-italic-grego.woff2'),
}

metricas = {}
for chave, (origem, peso, destino) in PDF.items():
    fonte = estatica(origem, peso)
    # TTF puro para o navegador ("Baixar PDF" na página dedicada): o pdf-lib
    # embute TTF direto, sem o descompressor de woff2 (WASM) no bundle. O
    # servidor continua com o woff2, menor para baixar.
    fonte.flavor = None
    fonte.save(os.path.join(SAIDA_PDF, destino.replace('.woff2', '.ttf')))
    fonte.flavor = 'woff2'
    fonte.save(os.path.join(SAIDA_PDF, destino))

    # Larguras de avanço por caractere, em unidades da fonte. Sem kerning e
    # sem ligaduras: o pdf-lib não aplica nenhum dos dois ao desenhar, e a
    # prévia desliga os dois no CSS — assim as larguras batem.
    cmap = fonte.getBestCmap()
    hmtx = fonte['hmtx']
    larguras = {str(cp): hmtx[nome][0] for cp, nome in cmap.items() if cp < 0x2200}
    metricas[chave] = {
        'arquivo': destino,
        'unidades': fonte['head'].unitsPerEm,
        'larguras': larguras,
    }
    print(f'{chave:13} {destino:32} {os.path.getsize(os.path.join(SAIDA_PDF, destino)) // 1024} KB, {len(larguras)} caracteres')

destino_js = os.path.join(RAIZ, 'shared', 'certificado', 'metricas.js')
os.makedirs(os.path.dirname(destino_js), exist_ok=True)
with open(destino_js, 'w', encoding='utf-8') as saida:
    saida.write(
        '// GERADO por scripts/gerar-fontes.py — não edite à mão.\n'
        '// Larguras de avanço (unidades da fonte) das fontes do PDF, por code point.\n'
        '// Usadas pela prévia E pelo PDF para quebrar o texto no mesmo lugar.\n'
        'export const METRICAS = '
    )
    json.dump(metricas, saida, separators=(',', ':'))
    saida.write('\n')
print('metricas.js', os.path.getsize(destino_js) // 1024, 'KB')
