import { supabase } from './db.js';

const id = new URLSearchParams(window.location.search).get('r');
const area = document.getElementById('dados');

async function carregar() {
  if (!id) {
    area.innerHTML = '<p class="erro">Restaurante não encontrado. <a href="index.html">Cadastre-se</a>.</p>';
    return;
  }

  const { data: r, error } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !r) {
    area.innerHTML = '<p class="erro">Restaurante não encontrado. <a href="index.html">Cadastre-se</a>.</p>';
    return;
  }

  area.innerHTML = `
    <h2>${escapar(r.nome)}</h2>
    <p class="dica">${escapar(r.cozinha)}${r.bairro ? ' · ' + escapar(r.bairro) : ''}</p>
    <p class="espaco"><span class="selo">${escapar(r.beneficio_tipo)}</span></p>
    <p>${escapar(r.beneficio || '')}</p>
    <p class="dica">${escapar(r.beneficio_dias)} · ${escapar(r.beneficio_turno)}</p>
    <p class="dica espaco">Guarde o link desta página: é o seu painel.</p>
  `;
}

// Transforma o texto em texto "inofensivo" antes de colocar no HTML
function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

carregar();