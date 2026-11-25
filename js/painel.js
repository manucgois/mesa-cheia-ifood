import { supabase } from './db.js';

const CAMPOS = ['titulo_cartaz', 'texto_cartaz', 'chamada_qr', 'encarte_delivery', 'post_redes'];

const id = new URLSearchParams(window.location.search).get('r');
const areaDados = document.getElementById('dados');
const secaoKit = document.getElementById('kit');
const kitCampos = document.getElementById('kit-campos');
const kitStatus = document.getElementById('kit-status');
const kitMensagem = document.getElementById('kit-mensagem');
const botaoGerar = document.getElementById('botao-gerar');
const botaoRascunho = document.getElementById('botao-rascunho');
const botaoAprovar = document.getElementById('botao-aprovar');
const secaoMateriais = document.getElementById('materiais');
const areaPecas = document.getElementById('pecas');
const linkTeste = document.getElementById('link-teste');
const secaoResultados = document.getElementById('resultados');
const areaMetricas = document.getElementById('metricas');
const areaFunil = document.getElementById('funil');
const areaOrigem = document.getElementById('por-origem');
const textoCampanhaResultados = document.getElementById('resultados-campanha');
const blocoComparacao = document.getElementById('comparacao-bloco');
const areaComparacao = document.getElementById('comparacao');
const secaoCampanha = document.getElementById('campanha');
const areaCampanhaAtual = document.getElementById('campanha-atual');
const formCampanha = document.getElementById('form-campanha');
const campanhaAviso = document.getElementById('campanha-aviso');
const campanhaMensagem = document.getElementById('campanha-mensagem');
const botaoSalvarCampanha = document.getElementById('botao-salvar-campanha');
const botaoCancelarCampanha = document.getElementById('botao-cancelar-campanha');

const NOMES_ORIGEM = {
  mesa: 'Cartaz de mesa',
  balcao: 'Display de balcão',
  sacola: 'Encarte da sacola',
  redes: 'Redes sociais',
};

let restauranteAtual = null; // guardamos para usar o ticket médio


let campanhas = [];              // todas as campanhas do restaurante, da mais nova para a mais antiga
let campanhaAtual = null;        // a campanha ativa (ou null, se não houver)
let temCampanhaAnterior = false; // já existiu alguma campanha encerrada?
let kitAtual = null;             // o kit mais recente DA CAMPANHA ATIVA

// ---------- Restaurante ----------

async function carregar() {
  if (!id) return mostrarNaoEncontrado();

  const { data: r, error } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !r) return mostrarNaoEncontrado();

  // Informações à esquerda e o botão de copiar à direita (no celular, um embaixo do outro)
  areaDados.innerHTML = `
    <div class="dados-linha">
      <div>
        <h2>${escapar(r.nome)}</h2>
        <p class="dica">${escapar(r.cozinha)}${r.bairro ? ' · ' + escapar(r.bairro) : ''}</p>
        <p class="dica">
          ${r.ticket_medio ? 'Ticket médio ' + formatarReais(Number(r.ticket_medio)) + ' · ' : ''}Tom ${escapar(r.tom)}
        </p>
      </div>
      <div class="dados-acoes">
        <button id="botao-copiar" class="botao secundario">Copiar link do painel</button>
        <p class="dica">Guarde este link: é o acesso ao seu painel.</p>
      </div>
    </div>
  `;
  document.getElementById('botao-copiar').addEventListener('click', async (evento) => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      evento.target.textContent = 'Link copiado!';
    } catch {
      evento.target.textContent = 'Copie o endereço na barra do navegador';
    }
  });

  restauranteAtual = r;
  await carregarCampanha();
  setInterval(carregarResultados, 10000); // atualiza a cada 10 segundos
}

// ---------- Campanha ----------

async function carregarCampanha() {
  const { data, error } = await supabase
    .from('campanhas')
    .select('*')
    .eq('restaurante_id', id)
    .order('criada_em', { ascending: false });

  if (error) {
    console.error(error);
    return mostrarMensagemCampanha('Não foi possível carregar a campanha. Recarregue a página.', 'erro');
  }

  campanhas = data;
  campanhaAtual = data.find((c) => c.status === 'ativa') || null;
  temCampanhaAnterior = data.some((c) => c.status === 'encerrada');
  mostrarCampanha();

  // Sem campanha ativa não há kit para gerar nem material para imprimir
  secaoKit.hidden = !campanhaAtual;
  secaoResultados.hidden = data.length === 0;
  if (campanhaAtual) {
    await carregarKit();
  } else {
    kitAtual = null;
    secaoMateriais.hidden = true;
  }
  await carregarResultados();
}

function mostrarCampanha() {
  secaoCampanha.hidden = false;

  if (!campanhaAtual) {
    areaCampanhaAtual.innerHTML = temCampanhaAnterior
      ? '<p class="dica">Nenhuma campanha ativa. Escolha o novo benefício para voltar a divulgar.</p>'
      : '<p class="dica">Escolha o benefício do Comer Fora. É ele que a IA vai divulgar nos materiais.</p>';
    abrirFormulario('criar');
    return;
  }

  const c = campanhaAtual;
  areaCampanhaAtual.innerHTML = `
    <div class="dados-linha">
      <div>
        <p class="espaco"><span class="selo">${escapar(c.beneficio_tipo)}</span> ${escapar(c.beneficio || '')}</p>
        <p class="dica">${escapar(c.beneficio_dias)} · ${escapar(c.beneficio_turno)} · ativa desde ${formatarData(c.criada_em)}</p>
      </div>
      <div class="dados-acoes">
        <button id="botao-trocar" class="botao secundario">Trocar benefício</button>
      </div>
    </div>
  `;
  formCampanha.hidden = true;
  document.getElementById('botao-trocar').addEventListener('click', () => abrirFormulario('trocar'));
}

// modo 'criar': primeira campanha (ou depois de uma falha); modo 'trocar': encerra a atual e cria outra
function abrirFormulario(modo) {
  formCampanha.reset();
  formCampanha.dataset.modo = modo;
  formCampanha.hidden = false;
  mostrarMensagemCampanha('', '');

  const trocando = modo === 'trocar';
  botaoSalvarCampanha.textContent = trocando ? 'Confirmar troca' : 'Criar campanha';
  botaoCancelarCampanha.hidden = !trocando;
  campanhaAviso.hidden = !trocando;
  campanhaAviso.textContent = trocando
    ? 'Ao confirmar, a campanha atual é encerrada e os números dela ficam guardados. ' +
      'Os QR codes já impressos continuam funcionando e passam a mostrar o novo benefício, ' +
      'mas o texto impresso fala do benefício antigo: gere e aprove o novo kit e reimprima os materiais.'
    : '';

  const botaoTrocar = document.getElementById('botao-trocar');
  if (botaoTrocar) botaoTrocar.hidden = trocando;
}

botaoCancelarCampanha.addEventListener('click', () => mostrarCampanha());

formCampanha.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const dias = [...formCampanha.querySelectorAll('input[name="dias"]:checked')]
    .map((caixa) => caixa.value);
  if (dias.length === 0) {
    return mostrarMensagemCampanha('Escolha pelo menos um dia para o benefício.', 'erro');
  }

  const campos = formCampanha.elements;
  const nova = {
    restaurante_id: id,
    beneficio_tipo: campos.beneficio_tipo.value,
    beneficio: campos.beneficio.value.trim() || null,
    beneficio_dias: dias.join(', '),
    beneficio_turno: campos.turno.value,
  };

  botaoSalvarCampanha.disabled = true;

  // 1. Encerra a campanha atual. Precisa vir antes: o banco só aceita UMA ativa por restaurante.
  //    Nada é apagado: a campanha fica guardada, com os eventos e o kit dela.
  if (campanhaAtual) {
    const { error } = await supabase
      .from('campanhas')
      .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
      .eq('id', campanhaAtual.id);
    if (error) {
      console.error(error);
      botaoSalvarCampanha.disabled = false;
      return mostrarMensagemCampanha('Não foi possível encerrar a campanha atual. Tente de novo.', 'erro');
    }
  }

  // 2. Cria a nova campanha
  const { error } = await supabase.from('campanhas').insert(nova);
  botaoSalvarCampanha.disabled = false;
  if (error) {
    console.error(error);
    await carregarCampanha(); // mostra o estado real do banco (sem ativa, se o passo 1 funcionou)
    return mostrarMensagemCampanha('Não foi possível criar a campanha. Tente de novo.', 'erro');
  }

  mostrarMensagem('', ''); // apaga a mensagem do kit da campanha anterior
  await carregarCampanha();
  mostrarMensagemCampanha('Campanha criada! Agora gere o kit de divulgação com IA.', 'ok');
});

function mostrarMensagemCampanha(texto, tipo) {
  campanhaMensagem.textContent = texto;
  campanhaMensagem.className = 'mensagem ' + tipo;
}

function mostrarNaoEncontrado() {
  areaDados.innerHTML = '<p class="erro">Restaurante não encontrado. <a href="index.html">Cadastre-se</a>.</p>';
}

// ---------- Kit ----------

async function carregarKit() {
  const { data } = await supabase
    .from('kits')
    .select('*')
    .eq('campanha_id', campanhaAtual.id) // só o kit da campanha ativa
    .order('criado_em', { ascending: false })
    .limit(1);

  kitAtual = data && data.length > 0 ? data[0] : null;
  if (kitAtual) {
    preencherCampos(kitAtual);
  } else {
    limparCampos(); // campanha nova: os textos da anterior não servem mais
  }
  mostrarStatus();
  mostrarMateriais();
}

botaoGerar.addEventListener('click', async () => {
  botaoGerar.disabled = true;
  botaoGerar.textContent = 'Gerando com IA...';
  mostrarMensagem('', '');

    try {
    // 1. Pede o kit para a função no servidor
    const resposta = await fetch('/api/gerar-kit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: id }),
      signal: AbortSignal.timeout(60000), // o painel desiste depois de 60 segundos
    });

    // Lê como texto primeiro: se o servidor quebrar, a resposta pode não ser JSON
    const texto = await resposta.text();
    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch {
      throw new Error('O servidor não respondeu como esperado. Tente de novo em instantes.');
    }
    if (!resposta.ok) throw new Error(resultado.erro || 'Erro ao gerar o kit.');

    // 2. Guarda como rascunho no banco. O resultado já traz o campanha_id
    //    da campanha que a IA usou (o servidor é quem decide qual é a ativa).
    const { data, error } = await supabase
      .from('kits')
      .insert({ restaurante_id: id, ...resultado, status: 'rascunho' })
      .select()
      .single();
    if (error) throw new Error('O kit foi gerado, mas não foi salvo. Tente de novo.');

    kitAtual = data;
    preencherCampos(kitAtual);
    mostrarStatus();
    mostrarMateriais();
    mostrarMensagem('Kit gerado. Revise os textos antes de aprovar.', 'ok');
  } catch (erro) {
    if (erro.name === 'TimeoutError') {
      mostrarMensagem('A geração demorou demais. Tente de novo.', 'erro');
    } else {
      mostrarMensagem(erro.message, 'erro');
    }
  } finally {
    botaoGerar.disabled = false;
    botaoGerar.textContent = kitAtual ? 'Gerar nova versão com IA' : 'Gerar kit com IA';
  }
});

botaoRascunho.addEventListener('click', () => salvar('rascunho'));
botaoAprovar.addEventListener('click', () => salvar('aprovado'));

async function salvar(status) {
  if (!kitAtual) return;

  const textos = lerCampos();
  if (CAMPOS.some((campo) => !textos[campo])) {
    return mostrarMensagem('Preencha todas as peças antes de salvar.', 'erro');
  }

  const { data, error } = await supabase
    .from('kits')
    .update({ ...textos, status })
    .eq('id', kitAtual.id)
    .select()
    .single();

  if (error) return mostrarMensagem('Não foi possível salvar. Tente de novo.', 'erro');

  kitAtual = data;
  mostrarStatus();
  mostrarMensagem(status === 'aprovado' ? 'Kit aprovado!' : 'Rascunho salvo.', 'ok');
  mostrarMateriais();
}

// ---------- Funções de apoio ----------

function preencherCampos(kit) {
  CAMPOS.forEach((campo) => {
    document.getElementById(campo).value = kit[campo] || '';
  });
  kitCampos.hidden = false;
  botaoGerar.textContent = 'Gerar nova versão com IA';
}

function limparCampos() {
  CAMPOS.forEach((campo) => {
    document.getElementById(campo).value = '';
  });
  kitCampos.hidden = true;
  botaoGerar.textContent = 'Gerar kit com IA';
}

function lerCampos() {
  const textos = {};
  CAMPOS.forEach((campo) => {
    textos[campo] = document.getElementById(campo).value.trim();
  });
  return textos;
}

function mostrarStatus() {
  if (!kitAtual && temCampanhaAnterior) {
    kitStatus.innerHTML = '<span class="aviso" style="display:block">Benefício novo: gere e aprove o kit desta campanha e reimprima os materiais. Os impressos atuais falam da campanha anterior.</span>';
  } else if (!kitAtual) {
    kitStatus.innerHTML = '';
  } else if (kitAtual.status === 'aprovado') {
    kitStatus.innerHTML = '<span class="selo">Aprovado</span>';
  } else {
    kitStatus.innerHTML = '<span class="selo selo-rascunho">Rascunho: revise antes de aprovar</span>';
  }
}

function mostrarMensagem(texto, tipo) {
  kitMensagem.textContent = texto;
  kitMensagem.className = 'mensagem ' + tipo;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// ---------- Materiais com QR code ----------

function mostrarMateriais() {
  if (!kitAtual || kitAtual.status !== 'aprovado') {
    secaoMateriais.hidden = true; // só imprime o que o dono aprovou
    return;
  }

  const base = `${window.location.origin}/r.html?r=${id}&o=`;
  linkTeste.href = base + 'mesa';

  areaPecas.innerHTML = `
    <div class="peca">
      <p class="peca-tipo">Cartaz de mesa</p>
      <h3>${escapar(kitAtual.titulo_cartaz)}</h3>
      <p>${escapar(kitAtual.texto_cartaz)}</p>
      <div class="qr">${gerarQr(base + 'mesa')}</div>
      <p><strong>${escapar(kitAtual.chamada_qr)}</strong></p>
      <p class="peca-marca">iFood pra comer fora</p>
    </div>

    <div class="peca peca-pequena">
      <p class="peca-tipo">Display de balcão</p>
      <h3>${escapar(kitAtual.titulo_cartaz)}</h3>
      <div class="qr">${gerarQr(base + 'balcao')}</div>
      <p><strong>${escapar(kitAtual.chamada_qr)}</strong></p>
      <p class="peca-marca">iFood pra comer fora</p>
    </div>

    <div class="peca">
      <p class="peca-tipo">Encarte da sacola do delivery</p>
      <p>${escapar(kitAtual.encarte_delivery)}</p>
      <div class="qr">${gerarQr(base + 'sacola')}</div>
      <p><strong>${escapar(kitAtual.chamada_qr)}</strong></p>
      <p class="peca-marca">iFood pra comer fora</p>
    </div>

    <div class="peca nao-imprimir">
      <p class="peca-tipo">Post para redes sociais</p>
      <p>${escapar(kitAtual.post_redes)}</p>
      <p class="dica espaco">Link para colocar na bio ou no post:</p>
      <p class="link">${escapar(base + 'redes')}</p>
    </div>
  `;

  secaoMateriais.hidden = false;
}

function gerarQr(texto) {
  const qr = qrcode(0, 'M'); // 0 = tamanho automático; M = correção de erro média
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag(4, 2); // tamanho de cada quadradinho e margem
}

document.getElementById('botao-imprimir').addEventListener('click', () => window.print());

// ---------- Resultados ----------

async function carregarResultados() {
  if (document.hidden) return; // aba em segundo plano: não consulta o banco à toa

  if (campanhas.length === 0) return; // ainda não há campanha: nada para medir

  const { data: todos, error } = await supabase
    .from('eventos')
    .select('tipo, origem, pessoas, campanha_id')
    .eq('restaurante_id', id);

  if (error) return console.error(error);

  // Os números principais são da campanha ativa (ou da última, se nenhuma estiver ativa)
  const foco = campanhaAtual || campanhas[0];
  const eventos = todos.filter((e) => e.campanha_id === foco.id);
  textoCampanhaResultados.textContent =
    `${foco.status === 'ativa' ? 'Campanha atual' : 'Última campanha'}: ${foco.beneficio_tipo}` +
    `${foco.beneficio ? ' ' + foco.beneficio : ''} · desde ${formatarData(foco.criada_em)}`;
  mostrarComparacao(todos);

  // Conta os eventos de um tipo (e, se informada, de uma origem)
  const contar = (tipo, origem) =>
    eventos.filter((e) => e.tipo === tipo && (origem === undefined || e.origem === origem)).length;

  const leituras = contar('leitura');
  const salvos = contar('beneficio_salvo');
  const checkins = contar('checkin');
  const pessoas = eventos
    .filter((e) => e.tipo === 'checkin')
    .reduce((soma, e) => soma + (e.pessoas || 0), 0);
  const ticket = Number(restauranteAtual.ticket_medio) || 0;

  areaMetricas.innerHTML = `
    ${cartaoMetrica('Leituras do QR', leituras)}
    ${cartaoMetrica('Benefícios salvos', salvos)}
    ${cartaoMetrica('Check-ins', checkins)}
    ${cartaoMetrica('Conversão', percentual(checkins, leituras) + '%', 'check-ins ÷ leituras', true)}
    ${cartaoMetrica('Pessoas atendidas', pessoas)}
    ${cartaoMetrica('Faturamento estimado', ticket ? formatarReais(pessoas * ticket) : '—',
        ticket ? 'pessoas × ticket médio' : 'informe o ticket médio no cadastro')}
  `;

  areaFunil.innerHTML = `
    ${barra('Leram o QR', leituras, leituras, false)}
    ${barra('Salvaram o benefício', salvos, leituras)}
    ${barra('Fizeram check-in', checkins, leituras)}
  `;

  // Lista por origem e a peça campeã (a que trouxe mais check-ins)
  const origens = Object.keys(NOMES_ORIGEM);
  const campea = origens.reduce((melhor, o) =>
    contar('checkin', o) > contar('checkin', melhor) ? o : melhor, origens[0]);
  const temCampea = contar('checkin', campea) > 0;

  // data-rotulo: no celular o CSS mostra esse nome em cima de cada número
  const linhas = origens.map((o) => {
    const ehCampea = temCampea && o === campea;
    return `
      <div class="origem ${ehCampea ? 'origem-campea' : ''}">
        <div class="origem-nome">${NOMES_ORIGEM[o]} ${ehCampea ? '<span class="selo">Campeã</span>' : ''}</div>
        <div class="origem-valor" data-rotulo="Leituras">${contar('leitura', o)}</div>
        <div class="origem-valor" data-rotulo="Check-ins">${contar('checkin', o)}</div>
        <div class="origem-valor" data-rotulo="Conversão">${percentual(contar('checkin', o), contar('leitura', o))}%</div>
      </div>
    `;
  }).join('');

  areaOrigem.innerHTML = `
    <div class="origens">
      <div class="origem origem-cabecalho">
        <div>Peça</div><div>Leituras</div><div>Check-ins</div><div>Conversão</div>
      </div>
      ${linhas}
    </div>
  `;
}

// Uma linha por campanha: mostra qual benefício trouxe mais gente ao salão
function mostrarComparacao(todos) {
  blocoComparacao.hidden = campanhas.length < 2;
  if (campanhas.length < 2) return;

  const linhasDados = campanhas.map((c) => {
    const daCampanha = todos.filter((e) => e.campanha_id === c.id);
    const leituras = daCampanha.filter((e) => e.tipo === 'leitura').length;
    const checkins = daCampanha.filter((e) => e.tipo === 'checkin').length;
    return { c, leituras, checkins, conversao: percentual(checkins, leituras) };
  });

  // Melhor conversão: só entre campanhas que já tiveram leitura, e só se não houver empate
  const comLeitura = linhasDados.filter((l) => l.leituras > 0);
  const maior = Math.max(...comLeitura.map((l) => l.conversao));
  const lideres = comLeitura.filter((l) => l.conversao === maior);
  const melhor = comLeitura.length > 1 && lideres.length === 1 ? lideres[0] : null;

  const linhas = linhasDados.map((l) => {
    const periodo = l.c.encerrada_em
      ? `${formatarData(l.c.criada_em)} a ${formatarData(l.c.encerrada_em)}`
      : `desde ${formatarData(l.c.criada_em)}`;
    const selos =
      (l.c.status === 'ativa' ? ' <span class="selo">Ativa</span>' : '') +
      (l === melhor ? ' <span class="selo">Melhor conversão</span>' : '');
    return `
      <div class="origem ${l === melhor ? 'origem-campea' : ''}">
        <div class="origem-nome">
          ${escapar(l.c.beneficio_tipo)}${selos}
          <span class="dica" style="display:block; width:100%; font-weight:400">${escapar(l.c.beneficio || '')} · ${periodo}</span>
        </div>
        <div class="origem-valor" data-rotulo="Leituras">${l.leituras}</div>
        <div class="origem-valor" data-rotulo="Check-ins">${l.checkins}</div>
        <div class="origem-valor" data-rotulo="Conversão">${l.conversao}%</div>
      </div>
    `;
  }).join('');

  areaComparacao.innerHTML = `
    <div class="origens">
      <div class="origem origem-cabecalho">
        <div>Campanha</div><div>Leituras</div><div>Check-ins</div><div>Conversão</div>
      </div>
      ${linhas}
    </div>
  `;
}

function cartaoMetrica(rotulo, valor, nota = '', destaque = false) {
  return `
    <div class="metrica ${destaque ? 'metrica-destaque' : ''}">
      <p class="metrica-rotulo">${rotulo}</p>
      <p class="metrica-valor">${valor}</p>
      ${nota ? `<p class="metrica-nota">${nota}</p>` : ''}
    </div>
  `;
}

// mostrarPercentual = false na primeira barra, que é sempre 100%
function barra(rotulo, valor, total, mostrarPercentual = true) {
  const pct = mostrarPercentual ? ` <span class="barra-pct">· ${percentual(valor, total)}%</span>` : '';
  return `
    <div class="barra-linha">
      <div class="barra-rotulo"><span>${rotulo}</span><strong>${valor}${pct}</strong></div>
      <div class="barra"><span style="width: ${percentual(valor, total)}%"></span></div>
    </div>
  `;
}

function percentual(parte, total) {
  return total ? Math.round((parte / total) * 100) : 0;
}

function formatarData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarReais(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

carregar();