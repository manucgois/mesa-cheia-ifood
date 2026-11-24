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
    <p class="dica espaco">Guarde o link desta página: é o seu painel.</p>
  `;

  secaoKit.hidden = false;
  await carregarKit();
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

carregar();