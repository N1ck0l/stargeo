/**
 * As 90 estrelas mais brilhantes do céu (magnitude até 3), para a
 * Mira celeste mostrar o céu real em volta de Sagitário.
 *
 * Fonte: catálogo da d3-celestial (derivado do Hipparcos). As posições foram
 * conferidas contra o SIMBAD — dez estrelas de referência bateram em
 * 0,000°–0,001°. As magnitudes variam entre catálogos; a posição não.
 *
 * n: nome próprio, quando conhecido (por posição, não pelo catálogo)
 * m: magnitude aparente
 * ra: ascensão reta em horas (J2000)
 * dec: declinação em graus (J2000)
 */

/**
 * Normaliza a ascensão reta para [0, 24).
 *
 * 42 das 90 estrelas vieram do catálogo com RA negativa (o catálogo usa
 * [-12, +12], a convenção do d3-celestial). A matemática é periódica em 360°,
 * então a posição no céu continuava correta por coincidência — mas o domínio
 * estava errado, e isso quebrava a comparação de coordenadas: a deduplicação
 * por nome + RA em `SkyFinder` nunca casava, e Kaus Australis era desenhada
 * duas vezes, uma como estrela do fundo e outra do bule de chá.
 */
function normaliza(lista) {
  return lista.map((star) => ({
    ...star,
    ra: ((star.ra % 24) + 24) % 24,
  }))
}

const BRIGHT_STARS = [{"n":"Sirius","m":-1.44,"ra":6.75248,"dec":-16.7161},{"n":"Canopus","m":-0.62,"ra":6.3992,"dec":-52.6957},{"n":null,"m":-0.05,"ra":-9.73898,"dec":19.1824},{"n":null,"m":-0.01,"ra":-9.33986,"dec":-60.834},{"n":null,"m":0.03,"ra":-5.38435,"dec":38.7837},{"n":"Capella","m":0.08,"ra":5.27815,"dec":45.998},{"n":"Rigel","m":0.18,"ra":5.2423,"dec":-8.2016},{"n":"Procyon","m":0.4,"ra":7.65503,"dec":5.225},{"n":"Achernar","m":0.45,"ra":1.62857,"dec":-57.2368},{"n":"Betelgeuse","m":0.45,"ra":5.91953,"dec":7.4071},{"n":null,"m":0.61,"ra":-9.93627,"dec":-60.373},{"n":null,"m":0.76,"ra":-4.15361,"dec":8.8683},{"n":null,"m":0.77,"ra":-11.55669,"dec":-63.0991},{"n":"Aldebaran","m":0.87,"ra":4.59868,"dec":16.5093},{"n":null,"m":0.98,"ra":-10.58012,"dec":-11.1613},{"n":null,"m":1.06,"ra":-7.50987,"dec":-26.432},{"n":"Pollux","m":1.16,"ra":7.75527,"dec":28.0262},{"n":null,"m":1.17,"ra":-1.03915,"dec":-29.6222},{"n":null,"m":1.25,"ra":-11.20465,"dec":-59.6888},{"n":null,"m":1.25,"ra":-3.30947,"dec":45.2803},{"n":null,"m":1.35,"ra":-9.34025,"dec":-60.8372},{"n":"Regulus","m":1.36,"ra":10.13953,"dec":11.9672},{"n":"Adhara","m":1.5,"ra":6.9771,"dec":-28.9721},{"n":"Castor","m":1.58,"ra":7.57663,"dec":31.8883},{"n":null,"m":1.59,"ra":-11.48057,"dec":-57.1132},{"n":null,"m":1.62,"ra":-6.43985,"dec":-37.1038},{"n":"Bellatrix","m":1.64,"ra":5.41885,"dec":6.3497},{"n":"Elnath","m":1.65,"ra":5.4382,"dec":28.6075},{"n":"Miaplacidus","m":1.67,"ra":9.21999,"dec":-69.7172},{"n":"Alnilam","m":1.69,"ra":5.60356,"dec":-1.2019},{"n":null,"m":1.73,"ra":-1.86278,"dec":-46.961},{"n":"Alnitak","m":1.74,"ra":5.67931,"dec":-1.9426},{"n":null,"m":1.75,"ra":8.15887,"dec":-47.3366},{"n":null,"m":1.76,"ra":-11.09951,"dec":55.9598},{"n":"Mirfak","m":1.79,"ra":3.40538,"dec":49.8612},{"n":null,"m":1.79,"ra":-5.59713,"dec":-34.3846},{"n":"Dubhe","m":1.81,"ra":11.06213,"dec":61.751},{"n":"Wezen","m":1.83,"ra":7.13986,"dec":-26.3932},{"n":null,"m":1.85,"ra":-10.20765,"dec":49.3133},{"n":"Avior","m":1.86,"ra":8.37523,"dec":-59.5095},{"n":null,"m":1.86,"ra":-6.37802,"dec":-42.9978},{"n":"Menkalinan","m":1.9,"ra":5.99215,"dec":44.9474},{"n":null,"m":1.91,"ra":-7.18892,"dec":-69.0277},{"n":"Alhena","m":1.93,"ra":6.62853,"dec":16.3993},{"n":"Alsephina","m":1.93,"ra":8.74506,"dec":-54.7088},{"n":null,"m":1.94,"ra":-3.57254,"dec":-56.7351},{"n":"Polaris","m":1.97,"ra":2.5303,"dec":89.2641},{"n":"Mirzam","m":1.98,"ra":6.37833,"dec":-17.9559},{"n":"Alphard","m":1.99,"ra":9.45979,"dec":-8.6586},{"n":"Hamal","m":2.01,"ra":2.11956,"dec":23.4624},{"n":"Algieba","m":2.01,"ra":10.33287,"dec":19.8415},{"n":"Diphda","m":2.04,"ra":0.72649,"dec":-17.9866},{"n":null,"m":2.05,"ra":-5.07891,"dec":-26.2967},{"n":null,"m":2.06,"ra":-9.88863,"dec":-36.37},{"n":"Alpheratz","m":2.07,"ra":0.13979,"dec":29.0904},{"n":"Mirach","m":2.07,"ra":1.1622,"dec":35.6206},{"n":"Saiph","m":2.07,"ra":5.79594,"dec":-9.6696},{"n":null,"m":2.07,"ra":-9.15491,"dec":74.1555},{"n":null,"m":2.07,"ra":-1.28887,"dec":-46.8846},{"n":null,"m":2.08,"ra":-6.41776,"dec":12.56},{"n":"Algol","m":2.09,"ra":3.13615,"dec":40.9556},{"n":"Almach","m":2.1,"ra":2.06499,"dec":42.3297},{"n":"Denebola","m":2.14,"ra":11.81766,"dec":14.5721},{"n":null,"m":2.15,"ra":0.94515,"dec":60.7167},{"n":null,"m":2.2,"ra":-11.30805,"dec":-48.9599},{"n":"Naos","m":2.21,"ra":8.05973,"dec":-40.0031},{"n":null,"m":2.21,"ra":9.28483,"dec":-59.2752},{"n":null,"m":2.22,"ra":-8.42187,"dec":26.7147},{"n":"Suhail","m":2.23,"ra":9.13327,"dec":-43.4326},{"n":null,"m":2.23,"ra":-10.60124,"dec":54.9254},{"n":null,"m":2.23,"ra":-3.62953,"dec":40.2567},{"n":"Schedar","m":2.24,"ra":0.67512,"dec":56.5373},{"n":null,"m":2.24,"ra":-6.05657,"dec":51.4889},{"n":"Mintaka","m":2.25,"ra":5.53345,"dec":-0.2991},{"n":"Caph","m":2.28,"ra":0.15297,"dec":59.1498},{"n":null,"m":2.29,"ra":-10.33521,"dec":-53.4664},{"n":null,"m":2.29,"ra":-7.99444,"dec":-22.6217},{"n":null,"m":2.29,"ra":-7.16394,"dec":-34.2932},{"n":null,"m":2.3,"ra":-9.30118,"dec":-47.3882},{"n":null,"m":2.33,"ra":-9.40821,"dec":-42.1578},{"n":"Merak","m":2.34,"ra":11.03069,"dec":56.3824},{"n":null,"m":2.35,"ra":-9.25022,"dec":27.0742},{"n":null,"m":2.38,"ra":-2.26357,"dec":9.875},{"n":null,"m":2.39,"ra":-6.29187,"dec":-39.03},{"n":"Ankaa","m":2.4,"ra":0.43807,"dec":-42.306},{"n":"Phecda","m":2.41,"ra":11.89718,"dec":53.6948},{"n":null,"m":2.43,"ra":-6.82703,"dec":-15.7249},{"n":null,"m":2.44,"ra":-0.93709,"dec":28.0828},{"n":"Aludra","m":2.45,"ra":7.40159,"dec":-29.3031},{"n":null,"m":2.45,"ra":-2.69034,"dec":62.5856}]

/**
 * Lista normalizada, que é o que a Mira celeste consome. Normalizar deixa o
 * domínio da AR sempre em [0, 24) — ver `normaliza` acima.
 */
export const brightStars = normaliza(BRIGHT_STARS)
