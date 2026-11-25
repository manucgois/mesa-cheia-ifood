import { supabase } from './db.js';

const form = document.getElementById('form-cadastro');
const botao = document.getElementById('botao-salvar');
const mensagem = document.getElementById('mensagem');

form.addEventListener('submit', async (evento) => {
  evento.preventDefault(); // impede o navegador de recarregar a página

  // Junta os dias marcados num texto: "Ter, Qua"
  const dias = [...form.querySelectorAll('input[name="dias"]:checked')]
    .map((caixa) => caixa.value);

  if (dias.length === 0) {
    mostrarErro('Escolha pelo menos um dia para o benefício.');
    return;
  }

  const campos = form.elements;
  const restaurante = {
    nome: campos.nome.value.trim(),
    cozinha: campos.cozinha.value,
    bairro: campos.bairro.value.trim() || null,
    ticket_medio: campos.ticket.value ? Number(campos.ticket.value) : null,
    beneficio_tipo: campos.beneficio_tipo.value,
    beneficio: campos.beneficio.value.trim() || null,
    beneficio_dias: dias.join(', '),
    beneficio_turno: campos.turno.value,
    tom: campos.tom.value,
  };

  botao.disabled = true;
  botao.textContent = 'Cadastrando...';

  // Grava no banco e devolve o id criado
  const { data, error } = await supabase
    .from('restaurantes')
    .insert(restaurante)
    .select('id')
    .single();

  if (error) {
    console.error(error);
    mostrarErro('Não foi possível salvar. Tente de novo.');
    botao.disabled = false;
    botao.textContent = 'Cadastrar restaurante';
    return;
  }

  // Leva o dono para o painel do restaurante que acabou de ser criado
  window.location.href = `painel.html?r=${data.id}`;
});

function mostrarErro(texto) {
  mensagem.textContent = texto;
  mensagem.className = 'mensagem erro';
}