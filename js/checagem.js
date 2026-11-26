// Checagem de conteúdo do kit: compara o que a IA (ou o dono) escreveu com os dados da campanha.
// Não bloqueia nada: devolve uma lista de alertas para o dono conferir antes de aprovar.
// Cobre os erros mais caros de imprimir: número (preço, percentual, horário), dia e turno errados.
// Limite: não entende sentido. "Dois smash" escrito por extenso, por exemplo, não é conferido.

const NOMES_CAMPOS = {
  titulo_cartaz: 'Título do cartaz',
  texto_cartaz: 'Texto do cartaz',
  chamada_qr: 'Chamada do QR',
  encarte_delivery: 'Encarte da sacola',
  post_redes: 'Post para redes',
};

// Palavras que indicam cada dia (sem acento, minúsculas). "ter" fica de fora: em português,
// é também o verbo ("vai ter"), e daria alerta falso.
const DIAS = {
  Seg: ['segunda', 'seg'],
  Ter: ['terca'],
  Qua: ['quarta', 'qua'],
  Qui: ['quinta', 'qui'],
  Sex: ['sexta', 'sex'],
  'Sáb': ['sabado', 'sab', 'fim de semana'],
  Dom: ['domingo', 'dom', 'fim de semana'],
};

// Palavras que contradizem o turno escolhido
const CONTRARIO_DO_TURNO = {
  'Almoço': ['noite', 'noturno', 'jantar'],
  Noturno: ['almoco', 'meio-dia', 'meio dia'],
};

export function verificarKit(textos, campanha) {
  const alertas = [];

  // Números que a campanha permite: os que aparecem no benefício e no detalhe (ex.: "2 por 1", "20%")
  const permitidos = new Set(extrairNumeros(`${campanha.beneficio_tipo} ${campanha.beneficio || ''}`));
  const diasDaCampanha = (campanha.beneficio_dias || '').split(',').map((d) => d.trim());
  const turnoContrario = CONTRARIO_DO_TURNO[campanha.beneficio_turno] || [];

  for (const [campo, nome] of Object.entries(NOMES_CAMPOS)) {
    const texto = textos[campo] || '';
    const limpo = normalizar(texto);

    // 1. Números que não estão na campanha (preço, percentual, horário inventado)
    const numerosNoTexto = texto.match(/\d+(?:[.,]\d+)?/g) || [];
    for (const original of new Set(numerosNoTexto)) {
      if (!permitidos.has(original.replace(',', '.'))) {
        alertas.push(`${nome}: cita "${original}", que não está na campanha.`);
      }
    }

    // 2. Dias citados que a campanha não inclui
    for (const [dia, palavras] of Object.entries(DIAS)) {
      if (diasDaCampanha.includes(dia)) continue;
      const citou = palavras.find((p) => new RegExp(`\\b${p}\\b`).test(limpo));
      if (citou) alertas.push(`${nome}: cita "${exibir(citou)}", mas a campanha vale só ${campanha.beneficio_dias}.`);
    }

    // 3. Turno que contradiz o escolhido
    const errado = turnoContrario.find((p) => new RegExp(`\\b${p}\\b`).test(limpo));
    if (errado) alertas.push(`${nome}: cita "${exibir(errado)}", mas o turno é ${campanha.beneficio_turno}.`);
  }

  return [...new Set(alertas)]; // "fim de semana" vale para sábado e domingo: um alerta só
}

// Devolve os acentos para mostrar a palavra ao dono
function exibir(palavra) {
  const comAcento = { terca: 'terça', sabado: 'sábado', sab: 'sáb', almoco: 'almoço' };
  return comAcento[palavra] || palavra;
}

function extrairNumeros(texto) {
  return (texto.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
}

// Tira acentos e maiúsculas: "Sábado" e "sabado" viram a mesma coisa
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}