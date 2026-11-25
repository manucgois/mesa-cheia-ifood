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

const NOMES_ORIGEM = {
  mesa: 'Cartaz de mesa',
  balcao: 'Display de balcão',
  sacola: 'Encarte da sacola',
  redes: 'Redes sociais',
};

let restauranteAtual = null; // guardamos para usar o ticket médio


let kitAtual = null; // o kit mais recente salvo no banco

// ---------- Restaurante ----------

async function carregar() {
  if (!id) return mostrarNaoEncontrado();

  const { data: r, error } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !r) return mostrarNaoEncontrado();

  areaDados.innerHTML = `
    <h2>${escapar(r.nome)}</h2>
    <p class="dica">${escapar(r.cozinha)}${r.bairro ? ' · ' + escapar(r.bairro) : ''}</p>
    <p class="espaco"><span class="selo">${escapar(r.beneficio_tipo)}</span></p>
    <p>${escapar(r.beneficio || '')}</p>
    <p class="dica">${escapar(r.beneficio_dias)} · ${escapar(r.beneficio_turno)}</p>
    <button id="botao-copiar" class="botao secundario">Copiar link do painel</button>
    <p class="dica espaco">Guarde este link: é o acesso ao seu painel.</p>
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
  secaoResultados.hidden = false;
  secaoKit.hidden = false;
  await carregarKit();
  await carregarResultados();
  setInterval(carregarResultados, 10000); // atualiza a cada 10 segundos
}

function mostrarNaoEncontrado() {
  areaDados.innerHTML = '<p class="erro">Restaurante não encontrado. <a href="index.html">Cadastre-se</a>.</p>';
}

// ---------- Kit ----------

async function carregarKit() {
  const { data } = await supabase
    .from('kits')
    .select('*')
    .eq('restaurante_id', id)
    .order('criado_em', { ascending: false })
    .limit(1);

  kitAtual = data && data.length > 0 ? data[0] : null;
  if (kitAtual) preencherCampos(kitAtual);
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

    // 2. Guarda como rascunho no banco
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

function lerCampos() {
  const textos = {};
  CAMPOS.forEach((campo) => {
    textos[campo] = document.getElementById(campo).value.trim();
  });
  return textos;
}

function mostrarStatus() {
  if (!kitAtual) {
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

  const { data: eventos, error } = await supabase
    .from('eventos')
    .select('tipo, origem, pessoas')
    .eq('restaurante_id', id);

  if (error) return console.error(error);

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
    ${barra('Leram o QR', leituras, leituras)}
    ${barra('Salvaram o benefício', salvos, leituras)}
    ${barra('Fizeram check-in', checkins, leituras)}
  `;

  // Tabela por origem e a peça campeã (a que trouxe mais check-ins)
  const origens = Object.keys(NOMES_ORIGEM);
  const campea = origens.reduce((melhor, o) =>
    contar('checkin', o) > contar('checkin', melhor) ? o : melhor, origens[0]);
  const temCampea = contar('checkin', campea) > 0;

  const linhas = origens.map((o) => `
    <tr>
      <td>${NOMES_ORIGEM[o]} ${temCampea && o === campea ? '<span class="selo">Campeã</span>' : ''}</td>
      <td>${contar('leitura', o)}</td>
      <td>${contar('checkin', o)}</td>
      <td>${percentual(contar('checkin', o), contar('leitura', o))}%</td>
    </tr>
  `).join('');

  areaOrigem.innerHTML = `
    <table class="tabela">
      <thead><tr><th>Peça</th><th>Leituras</th><th>Check-ins</th><th>Conversão</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>
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

function barra(rotulo, valor, total) {
  return `
    <div class="barra-linha">
      <div class="barra-rotulo"><span>${rotulo}</span><strong>${valor}</strong></div>
      <div class="barra"><span style="width: ${percentual(valor, total)}%"></span></div>
    </div>
  `;
}

function percentual(parte, total) {
  return total ? Math.round((parte / total) * 100) : 0;
}

function formatarReais(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

carregar();