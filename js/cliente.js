import { supabase } from './db.js';

const ORIGENS = ['mesa', 'balcao', 'sacola', 'redes'];

const params = new URLSearchParams(window.location.search);
const id = params.get('r');
const origemDaUrl = params.get('o');
const origem = ORIGENS.includes(origemDaUrl) ? origemDaUrl : null; // só aceita origens válidas

const area = document.getElementById('conteudo');

async function iniciar() {
  if (!id) return naoEncontrado();

  // Busca só as colunas que o cliente precisa ver
  const { data: r, error } = await supabase
    .from('restaurantes')
    .select('nome, cozinha, bairro, beneficio_tipo, beneficio, beneficio_dias, beneficio_turno')
    .eq('id', id)
    .single();

  if (error || !r) return naoEncontrado();

  document.title = `${r.nome} · Comer Fora`;
  mostrarRestaurante(r);

  // Registra a leitura do QR uma vez por sessão (recarregar a página não conta de novo)
  if (!jaFez('leitura', sessionStorage)) {
    if (await registrar('leitura')) marcar('leitura', sessionStorage);
  }
}

function mostrarRestaurante(r) {
  // Avatar: a primeira letra do nome, no lugar da foto que o restaurante teria no app
  const inicial = r.nome.trim().charAt(0).toUpperCase();

  area.innerHTML = `
    <header class="cliente-banner">
      <div class="cliente-banner-conteudo">
        <p class="marca-branca">iFood pra comer fora</p>
        <div class="cliente-restaurante">
          <div class="avatar">${escapar(inicial)}</div>
          <div>
            <h1>${escapar(r.nome)}</h1>
            <p class="sub">${escapar(r.cozinha)}${r.bairro ? ' · ' + escapar(r.bairro) : ''}</p>
          </div>
        </div>
      </div>
    </header>

    <main class="cliente-container">
      <div class="beneficio">
        <p class="dica">Benefício pra você</p>
        <p class="beneficio-tipo">${escapar(r.beneficio_tipo)}</p>
        <p>${escapar(r.beneficio || '')}</p>
        <p class="espaco">
          <span class="chip">${escapar(r.beneficio_dias)}</span>
          <span class="chip">${escapar(r.beneficio_turno)}</span>
        </p>
        <div id="acoes"></div>
      </div>

      <p class="como-funciona-titulo">Como funciona</p>
      <ol class="como-funciona">
        <li>Salve o benefício.</li>
        <li>Vá ao restaurante no dia e turno indicados.</li>
        <li>Faça check-in e mostre a tela ao garçom.</li>
      </ol>
    </main>
  `;
  mostrarAcoes();
}

// Mostra o botão certo para a etapa em que o cliente está
function mostrarAcoes() {
  const acoes = document.getElementById('acoes');

  if (jaFez('checkin', localStorage)) {
    acoes.innerHTML = '<p class="sucesso">Check-in feito! Mostre esta tela ao garçom para usar o benefício.</p>';
    return;
  }

  if (jaFez('salvo', localStorage)) {
    acoes.innerHTML = `
      <p class="sucesso">Benefício salvo! Faça o check-in quando chegar ao restaurante.</p>
      <label for="pessoas">Quantas pessoas na mesa?</label>
      <select id="pessoas">
        <option>1</option><option selected>2</option><option>3</option>
        <option>4</option><option>5</option><option>6</option>
      </select>
      <button id="botao-checkin" class="botao botao-escuro">Fazer check-in</button>
    `;
    document.getElementById('botao-checkin').addEventListener('click', async (evento) => {
      evento.target.disabled = true;
      const pessoas = Number(document.getElementById('pessoas').value);
      if (await registrar('checkin', pessoas)) marcar('checkin', localStorage);
      mostrarAcoes();
    });
    return;
  }

  acoes.innerHTML = '<button id="botao-salvar" class="botao botao-escuro">Salvar benefício</button>';
  document.getElementById('botao-salvar').addEventListener('click', async (evento) => {
    evento.target.disabled = true;
    if (await registrar('beneficio_salvo')) marcar('salvo', localStorage);
    mostrarAcoes();
  });
}

// Grava um evento no banco. Devolve true se deu certo.
async function registrar(tipo, pessoas = null) {
  const { error } = await supabase
    .from('eventos')
    .insert({ restaurante_id: id, tipo, origem, pessoas });
  if (error) console.error(error);
  return !error;
}

// Lembra o que este navegador já fez, para não contar o mesmo cliente duas vezes
function jaFez(acao, armazenamento) {
  try {
    return armazenamento.getItem(`${acao}-${id}`) === 'sim';
  } catch {
    return false;
  }
}

function marcar(acao, armazenamento) {
  try {
    armazenamento.setItem(`${acao}-${id}`, 'sim');
  } catch {
    // sem armazenamento (ex.: navegação anônima): segue sem lembrar
  }
}

function naoEncontrado() {
  area.innerHTML = '<main class="cliente-container" style="margin-top: 24px"><p class="erro">Restaurante não encontrado.</p></main>';
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

iniciar();