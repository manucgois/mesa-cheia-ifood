import { supabase } from './db.js';

// Simula o login no Portal do Parceiro: o restaurante já existe no iFood,
// então aqui ele só se encontra na lista e entra no painel. Nada é cadastrado.

const busca = document.getElementById('busca');
const lista = document.getElementById('lista-restaurantes');

let restaurantes = [];

async function iniciar() {
  // Só os restaurantes "da base do iFood" (os que têm cidade)
  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, nome, cozinha, bairro, cidade')
    .not('cidade', 'is', null)
    .order('nome');

  if (error) {
    console.error(error);
    lista.innerHTML = '<p class="erro espaco">Não foi possível carregar os restaurantes. Recarregue a página.</p>';
    return;
  }

  restaurantes = data;
  mostrar(restaurantes);
}

// Filtra enquanto a pessoa digita, pelo nome ou pela cidade
busca.addEventListener('input', () => {
  const termo = normalizar(busca.value);
  const encontrados = restaurantes.filter((r) =>
    normalizar(r.nome).includes(termo) || normalizar(r.cidade).includes(termo)
  );
  mostrar(encontrados);
});

function mostrar(itens) {
  if (itens.length === 0) {
    lista.innerHTML = '<p class="dica espaco">Nenhum restaurante encontrado. Tente outro nome ou cidade.</p>';
    return;
  }

  lista.innerHTML = itens.map((r) => `
    <a class="restaurante-item" href="painel.html?r=${encodeURIComponent(r.id)}">
      <span>
        <strong>${escapar(r.nome)}</strong>
        <span class="dica">${escapar(r.cozinha)}${r.bairro ? ' · ' + escapar(r.bairro) : ''} · ${escapar(r.cidade)}</span>
      </span>
      <span class="restaurante-entrar">Entrar →</span>
    </a>
  `).join('');
}

// Tira acentos e maiúsculas: "sao paulo" encontra "São Paulo"
function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

iniciar();