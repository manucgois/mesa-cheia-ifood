import { supabase } from './db.js';

// Login real com o Supabase Auth. Quem entra é o DONO de um restaurante;
// o painel descobre sozinho qual é o restaurante dele.

const SENHA_DEMO = 'mesacheia123';
const CONTAS_DEMO = [
  { email: 'brasa@example.com', nome: 'Brasa & Cia', detalhe: 'Hambúrguer · 2 campanhas e histórico de resultados' },
  { email: 'nonna@example.com', nome: 'Cantina da Nonna', detalhe: 'Italiana · 1 campanha ativa' },
  { email: 'minas@example.com', nome: 'Sabor de Minas', detalhe: 'Brasileira · sem campanha: crie a primeira' },
];

const form = document.getElementById('form-login');
const campoEmail = document.getElementById('email');
const campoSenha = document.getElementById('senha');
const botao = document.getElementById('botao-entrar');
const mensagem = document.getElementById('mensagem');
const areaContas = document.getElementById('contas-demo');
const areaConectado = document.getElementById('ja-conectado');

// Lista das contas de demonstração: um clique preenche o formulário
areaContas.innerHTML = CONTAS_DEMO.map((c) => `
  <button type="button" class="restaurante-item usar-conta" data-email="${c.email}">
    <span>
      <strong>${c.nome}</strong>
      <span class="dica">${c.detalhe} · ${c.email}</span>
    </span>
    <span class="restaurante-entrar">Usar esta conta</span>
  </button>
`).join('');

document.querySelectorAll('.usar-conta').forEach((elemento) => {
  elemento.addEventListener('click', () => {
    campoEmail.value = elemento.dataset.email;
    campoSenha.value = SENHA_DEMO;
    mostrarMensagem('Conta preenchida. Clique em Entrar.', 'ok');
    botao.focus();
  });
});

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  botao.disabled = true;
  botao.textContent = 'Entrando...';
  mostrarMensagem('', '');

  const { error } = await supabase.auth.signInWithPassword({
    email: campoEmail.value.trim(),
    password: campoSenha.value,
  });

  if (error) {
    console.error(error);
    botao.disabled = false;
    botao.textContent = 'Entrar';
    // Mensagem genérica de propósito: não conta se o erro foi no e-mail ou na senha
    return mostrarMensagem('E-mail ou senha incorretos.', 'erro');
  }

  // A sessão fica guardada pelo Supabase no navegador; o painel a lê
  window.location.href = 'painel.html';
});

// Já está logado? Oferece ir direto para o painel
async function verificarSessao() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  areaConectado.hidden = false;
  areaConectado.innerHTML = `
    Você já está conectado como <b>${escapar(session.user.email)}</b>.
    <a href="painel.html">Ir para o painel</a> ·
    <button type="button" class="link-botao" id="botao-sair">Sair</button>
  `;
  document.getElementById('botao-sair').addEventListener('click', async () => {
    await supabase.auth.signOut();
    areaConectado.hidden = true;
  });
}

function mostrarMensagem(texto, tipo) {
  mensagem.textContent = texto;
  mensagem.className = 'mensagem ' + tipo;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

verificarSessao();