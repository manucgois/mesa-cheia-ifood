import { supabase } from './db.js';
import { verificarKit } from './checagem.js';

const CAMPOS = ['titulo_cartaz', 'texto_cartaz', 'chamada_qr', 'encarte_delivery', 'post_redes'];

let id = null; // o id do restaurante do dono logado (descoberto no carregar)
const areaDados = document.getElementById('dados');
const secaoKit = document.getElementById('kit');
const kitCampos = document.getElementById('kit-campos');
const kitStatus = document.getElementById('kit-status');
const areaAlertas = document.getElementById('kit-alertas');
const kitMensagem = document.getElementById('kit-mensagem');
const botaoGerar = document.getElementById('botao-gerar');
const botaoRascunho = document.getElementById('botao-rascunho');
const botaoAprovar = document.getElementById('botao-aprovar');
const secaoMateriais = document.getElementById('materiais');
const areaPecas = document.getElementById('pecas');
const linkTeste = document.getElementById('link-teste');
const secaoResultados = document.getElementById('resultados');
const areaMetricas = document.getElementById('metricas');
const areaPorDia = document.getElementById('por-dia');
const areaInsight = document.getElementById('insight');
const semResultados = document.getElementById('sem-resultados');
const comResultados = document.getElementById('com-resultados');
const navAbas = document.getElementById('abas');
const avisoPendente = document.getElementById('aba-pendente');
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
const blocoAnteriores = document.getElementById('anteriores-bloco');
const areaAnteriores = document.getElementById('anteriores');

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
  // 1. Sem login, não há painel: volta para a tela de entrada
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html#entrar';
    return;
  }

  // 2. O restaurante é descoberto pela conta, não pelo endereço da página
  const { data: r, error } = await supabase
    .from('restaurantes')
    .select('*')
    .eq('dono_id', session.user.id)
    .maybeSingle();

  if (error || !r) return mostrarNaoEncontrado();
  id = r.id;

  // Dados que já vêm do cadastro do restaurante no iFood: o dono não digita nada aqui
  const local = [r.bairro, r.cidade].filter(Boolean).map(escapar).join(', ');
  areaDados.innerHTML = `
    <div class="dados-linha">
      <div>
        <h2>${escapar(r.nome)}</h2>
        <p class="dica">${escapar(r.cozinha)}${local ? ' · ' + local : ''}</p>
        <p class="dica">
          ${r.ticket_medio ? 'Ticket médio por pessoa ' + formatarReais(Number(r.ticket_medio)) + ' · ' : ''}dados do seu cadastro no iFood
        </p>
      </div>
      <div class="dados-acoes">
        <button id="botao-sair" class="botao secundario">Sair</button>
        <p class="dica">Conectado como ${escapar(session.user.email)}</p>
      </div>
    </div>
  `;

  document.getElementById('botao-sair').addEventListener('click', sair);

  restauranteAtual = r;
  await carregarCampanha();
  navAbas.hidden = false;
  abrirAbaInicial();
  setInterval(carregarResultados, 10000); // atualiza a cada 10 segundos
}

// ---------- Abas ----------
// Cada aba é uma tarefa do dono: ver resultados, cuidar da campanha, imprimir materiais.

const ABAS = ['resultados', 'campanha', 'materiais'];

function mostrarAba(nome) {
  if (!ABAS.includes(nome) || abaBloqueada(nome)) nome = 'campanha';
  ABAS.forEach((aba) => {
    const ativa = aba === nome;
    document.getElementById(`aba-${aba}`).hidden = !ativa;
    const botao = document.getElementById(`aba-btn-${aba}`);
    botao.setAttribute('aria-selected', String(ativa));
    botao.classList.toggle('ativa', ativa);
  });
  history.replaceState(null, '', '#' + nome); // recarregar a página volta para a mesma aba
  if (nome === 'resultados') carregarResultados();
}

// Materiais só existem depois que o dono aprova o kit
function abaBloqueada(nome) {
  return nome === 'materiais' && !(kitAtual && kitAtual.status === 'aprovado');
}

// Atualiza o estado das abas: Materiais bloqueada e o aviso "pendente" na Campanha
function atualizarAbas() {
  const botaoMateriais = document.getElementById('aba-btn-materiais');
  const bloqueada = abaBloqueada('materiais');
  botaoMateriais.disabled = bloqueada;
  botaoMateriais.title = bloqueada ? 'Aprove o kit na aba Campanha para liberar os materiais' : '';
  avisoPendente.hidden = !!(campanhaAtual && kitAtual && kitAtual.status === 'aprovado');
}

// Quem já tem campanha cai nos Resultados; quem ainda não tem, na Campanha
function abrirAbaInicial() {
  const pedida = window.location.hash.slice(1);
  if (ABAS.includes(pedida)) return mostrarAba(pedida);
  mostrarAba(campanhaAtual ? 'resultados' : 'campanha');
}

document.querySelectorAll('.aba-botao').forEach((botao) => {
  botao.addEventListener('click', () => mostrarAba(botao.dataset.aba));
});
document.querySelectorAll('.ir-campanha').forEach((botao) => {
  botao.addEventListener('click', () => mostrarAba('campanha'));
});

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
  semResultados.hidden = data.length > 0;
  comResultados.hidden = data.length === 0;
  if (campanhaAtual) {
    await carregarKit();
  } else {
    kitAtual = null;
    secaoMateriais.hidden = true;
  }
  atualizarAbas();
  await carregarResultados();
}

function mostrarCampanha() {
  secaoCampanha.hidden = false;
  mostrarAnteriores();

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
        <p class="dica">${escapar(c.beneficio_dias)} · ${escapar(c.beneficio_turno)}${c.tom ? ' · tom ' + escapar(c.tom) : ''} · ativa desde ${formatarData(c.criada_em)}</p>
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
    tom: campos.tom.value, // cada campanha pode ter um tom diferente
  };

  botaoSalvarCampanha.disabled = true;

  // 1. Encerra a campanha atual. Precisa vir antes: o banco só aceita UMA ativa por restaurante.
  if (!(await encerrarAtiva())) {
    botaoSalvarCampanha.disabled = false;
    return mostrarMensagemCampanha('Não foi possível encerrar a campanha atual. Tente de novo.', 'erro');
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

// Encerra a campanha ativa (se houver). Nada é apagado: ela fica guardada, com os eventos e o kit.
// Devolve true se deu certo.
async function encerrarAtiva() {
  if (!campanhaAtual) return true;
  const { error } = await supabase
    .from('campanhas')
    .update({ status: 'encerrada', encerrada_em: new Date().toISOString() })
    .eq('id', campanhaAtual.id);
  if (error) console.error(error);
  return !error;
}

// ---------- Campanhas anteriores e reativação ----------

// Duas campanhas são "a mesma oferta" quando benefício, detalhe, dias, turno e tom são iguais
function mesmaOferta(a, b) {
  return ['beneficio_tipo', 'beneficio', 'beneficio_dias', 'beneficio_turno', 'tom']
    .every((campo) => (a[campo] || '') === (b[campo] || ''));
}

// Só faz sentido reativar uma oferta que não está no ar agora, e só a versão mais recente dela
function podeReativar(c) {
  if (c.status !== 'encerrada') return false;
  if (campanhaAtual && mesmaOferta(c, campanhaAtual)) return false;
  const maisRecente = campanhas.find((outra) => outra.status === 'encerrada' && mesmaOferta(outra, c));
  return maisRecente === c; // campanhas vem da mais nova para a mais antiga
}

function mostrarAnteriores() {
  const anteriores = campanhas.filter((c) => c.status === 'encerrada');
  blocoAnteriores.hidden = anteriores.length === 0;

  areaAnteriores.innerHTML = anteriores.map((c) => `
    <div class="anterior" data-id="${c.id}">
      <div class="anterior-linha">
        <div>
          <p><span class="selo selo-cinza">${escapar(c.beneficio_tipo)}</span> ${escapar(c.beneficio || '')}</p>
          <p class="dica">${escapar(c.beneficio_dias)} · ${escapar(c.beneficio_turno)} · ${formatarData(c.criada_em)} a ${formatarData(c.encerrada_em)}</p>
        </div>
        ${podeReativar(c)
          ? '<button type="button" class="botao secundario botao-reativar">Reativar</button>'
          : `<span class="dica">${campanhaAtual && mesmaOferta(c, campanhaAtual) ? 'Igual à campanha ativa' : 'Já reativada depois'}</span>`}
      </div>
      <div class="anterior-confirmar" hidden>
        <p class="aviso">${campanhaAtual
          ? `A campanha <b>${escapar(campanhaAtual.beneficio_tipo)}</b> será encerrada e os números dela ficam guardados. `
          : ''}O <b>${escapar(c.beneficio_tipo)}</b> volta como uma campanha nova, com o kit aprovado dele. Se você guardou os materiais impressos dessa campanha, eles voltam a valer.</p>
        <div class="acoes">
          <button type="button" class="botao secundario botao-cancelar-reativar">Cancelar</button>
          <button type="button" class="botao botao-confirmar-reativar">Confirmar reativação</button>
        </div>
      </div>
    </div>
  `).join('');

  areaAnteriores.querySelectorAll('.anterior').forEach((linha) => {
    const confirmar = linha.querySelector('.anterior-confirmar');
    const botaoReativar = linha.querySelector('.botao-reativar');
    if (!botaoReativar) return; // oferta já no ar: sem botão
    botaoReativar.addEventListener('click', () => { confirmar.hidden = false; botaoReativar.hidden = true; });
    linha.querySelector('.botao-cancelar-reativar').addEventListener('click', () => { confirmar.hidden = true; botaoReativar.hidden = false; });
    linha.querySelector('.botao-confirmar-reativar').addEventListener('click', (evento) => {
      evento.target.disabled = true;
      reativar(campanhas.find((c) => c.id === linha.dataset.id));
    });
  });
}

// Reativar = criar uma campanha NOVA igual à antiga e copiar o kit aprovado dela.
// Assim o histórico fica limpo: cada período tem a sua linha e os seus números.
async function reativar(antiga) {
  mostrarMensagemCampanha('Reativando...', '');

  // 1. O kit aprovado mais recente da campanha antiga (pode não existir)
  const { data: kits } = await supabase
    .from('kits')
    .select('*')
    .eq('campanha_id', antiga.id)
    .eq('status', 'aprovado')
    .order('criado_em', { ascending: false })
    .limit(1);
  const kitAntigo = kits && kits.length > 0 ? kits[0] : null;

  // 2. Encerra a ativa (o banco só aceita uma ativa por restaurante)
  if (!(await encerrarAtiva())) {
    await carregarCampanha();
    return mostrarMensagemCampanha('Não foi possível encerrar a campanha atual. Tente de novo.', 'erro');
  }

  // 3. Cria a campanha nova com o mesmo benefício, dias, turno e tom
  const { data: nova, error } = await supabase
    .from('campanhas')
    .insert({
      restaurante_id: id,
      beneficio_tipo: antiga.beneficio_tipo,
      beneficio: antiga.beneficio,
      beneficio_dias: antiga.beneficio_dias,
      beneficio_turno: antiga.beneficio_turno,
      tom: antiga.tom,
    })
    .select()
    .single();
  if (error) {
    console.error(error);
    await carregarCampanha();
    return mostrarMensagemCampanha('Não foi possível reativar. Tente de novo.', 'erro');
  }

  // 4. Copia o kit aprovado, já aprovado: os materiais ficam liberados sem chamar a IA
  if (kitAntigo) {
    const copia = { restaurante_id: id, campanha_id: nova.id, status: 'aprovado' };
    CAMPOS.forEach((campo) => { copia[campo] = kitAntigo[campo]; });
    const { error: erroKit } = await supabase.from('kits').insert(copia);
    if (erroKit) console.error(erroKit);
  }

  mostrarMensagem('', '');
  await carregarCampanha();
  mostrarMensagemCampanha(
    kitAntigo
      ? 'Campanha reativada com o kit aprovado. Os materiais já estão liberados.'
      : 'Campanha reativada. Ela não tinha kit aprovado: gere um com IA.',
    'ok'
  );
}

function mostrarMensagemCampanha(texto, tipo) {
  campanhaMensagem.textContent = texto;
  campanhaMensagem.className = 'mensagem ' + tipo;
}

function mostrarNaoEncontrado() {
  areaDados.innerHTML = '<p class="erro">Esta conta não tem restaurante ligado a ela. <button type="button" class="link-botao" id="botao-sair">Sair</button></p>';
  document.getElementById('botao-sair').addEventListener('click', sair);
}

async function sair() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

// Se a sessão acabar (logout em outra aba, por exemplo), volta para a entrada
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') window.location.href = 'index.html';
});

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
      headers: {
        'Content-Type': 'application/json',
        // O token prova para o servidor quem está pedindo (ele confere se é o dono)
        Authorization: `Bearer ${await tokenAtual()}`,
      },
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
    atualizarAbas();
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

  // Com alertas, o primeiro clique em Aprovar só avisa; o segundo aprova (a decisão é do dono)
  if (status === 'aprovado' && alertasAtuais.length > 0 && !confirmouAlertas) {
    confirmouAlertas = true;
    return mostrarMensagem('O kit tem alertas. Confira os textos e clique em Aprovar de novo para aprovar mesmo assim.', 'erro');
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
  mostrarMateriais();
  atualizarAbas();
  if (status === 'aprovado') {
    kitMensagem.className = 'mensagem ok';
    kitMensagem.innerHTML = 'Kit aprovado! <button type="button" class="link-botao" id="ver-materiais">Ver os materiais para imprimir →</button>';
    document.getElementById('ver-materiais').addEventListener('click', () => mostrarAba('materiais'));
  } else {
    mostrarMensagem('Rascunho salvo.', 'ok');
  }
}

// ---------- Funções de apoio ----------

// Pega o token da sessão na hora (o Supabase renova sozinho quando ele expira)
async function tokenAtual() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? session.access_token : '';
}

function preencherCampos(kit) {
  CAMPOS.forEach((campo) => {
    document.getElementById(campo).value = kit[campo] || '';
  });
  kitCampos.hidden = false;
  botaoGerar.textContent = 'Gerar nova versão com IA';
  atualizarAlertas();
}

// ---------- Checagem de conteúdo ----------
// Compara os textos com a campanha (números, dias e turno) e avisa o dono antes de aprovar.

let alertasAtuais = [];
let confirmouAlertas = false;

function atualizarAlertas() {
  confirmouAlertas = false; // texto mudou: o dono precisa olhar de novo
  alertasAtuais = campanhaAtual ? verificarKit(lerCampos(), campanhaAtual) : [];
  areaAlertas.hidden = alertasAtuais.length === 0;
  areaAlertas.innerHTML = `
    <b>Confira antes de aprovar:</b>
    <ul>${alertasAtuais.map((a) => `<li>${escapar(a)}</li>`).join('')}</ul>
    <span class="dica">A checagem compara números, dias e turno com a campanha. Ela não garante tudo: a revisão continua sendo sua.</span>
  `;
}

// Reconfere a cada alteração que o dono faz nos textos
CAMPOS.forEach((campo) => {
  document.getElementById(campo).addEventListener('input', atualizarAlertas);
});

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
  if (document.hidden) return; // aba do navegador em segundo plano: não consulta o banco à toa
  if (document.getElementById('aba-resultados').hidden) return; // só calcula quando a aba está aberta
  if (campanhas.length === 0) return; // ainda não há campanha: nada para medir

  const { data: todos, error } = await supabase
    .from('eventos')
    .select('tipo, origem, pessoas, campanha_id, criado_em')
    .eq('restaurante_id', id);

  if (error) return console.error(error);

  // Os números principais são da campanha ativa (ou da última, se nenhuma estiver ativa)
  const foco = campanhaAtual || campanhas[0];
  const eventos = todos.filter((e) => e.campanha_id === foco.id);
  textoCampanhaResultados.innerHTML =
    `<span class="selo">${foco.status === 'ativa' ? 'Campanha atual' : 'Última campanha'}</span> ` +
    `${escapar(foco.beneficio_tipo)}${foco.beneficio ? ' ' + escapar(foco.beneficio) : ''} · desde ${formatarData(foco.criada_em)}`;

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

  // 4 números, cada um aparece uma vez só. O funil fica dentro dos cartões (as barras).
  areaMetricas.innerHTML = `
    ${kpi('Leituras do QR', leituras, 'aberturas da oferta (uma por peça, por sessão)')}
    ${kpi('Salvaram o benefício', salvos, `${percentual(salvos, leituras)}% das leituras`, percentual(salvos, leituras))}
    ${kpi('Check-ins', checkins, `${percentual(checkins, leituras)}% de conversão`, percentual(checkins, leituras), true)}
    ${kpi('Faturamento potencial', ticket ? formatarReais(pessoas * ticket) : '—',
        ticket ? `${pessoas} pessoas × ticket médio ${formatarReais(ticket)} · sem confirmação de consumo` : 'ticket médio indisponível')}
  `;

  mostrarPorOrigem(contar, checkins);
  mostrarPorDia(eventos, foco);
  mostrarComparacao(todos);
}

// Barras com os check-ins de cada peça, e a frase que resume o resultado
function mostrarPorOrigem(contar, totalCheckins) {
  const linhas = Object.keys(NOMES_ORIGEM).map((o) => ({
    origem: o,
    leituras: contar('leitura', o),
    checkins: contar('checkin', o),
  }));
  linhas.forEach((l) => { l.conversao = percentual(l.checkins, l.leituras); });

  const maior = Math.max(...linhas.map((l) => l.checkins));
  const lideres = linhas.filter((l) => l.checkins === maior && maior > 0);
  const campea = lideres.length === 1 ? lideres[0] : null; // empate: ninguém é campeã

  // A leitura rápida: calculada pelo código, a partir dos números (não pela IA)
  if (totalCheckins === 0) {
    areaInsight.textContent = 'Ainda não há check-ins nesta campanha. Os números aparecem aqui assim que os clientes usarem o QR.';
  } else if (campea) {
    areaInsight.innerHTML = `<b>${NOMES_ORIGEM[campea.origem]}</b> trouxe ${percentual(campea.checkins, totalCheckins)}% dos check-ins desta campanha, com ${campea.conversao}% de conversão.`;
  } else {
    areaInsight.textContent = 'Duas peças empatam em check-ins nesta campanha.';
  }

  areaOrigem.innerHTML = `<div class="pecas-barras">${linhas.map((l) => `
    <div class="peca-barra ${l === campea ? 'peca-barra-campea' : ''}">
      <div class="peca-barra-nome">${NOMES_ORIGEM[l.origem]}${l === campea ? ' <span class="selo">Campeã</span>' : ''}</div>
      <div class="barra"><span style="width: ${maior ? Math.round((l.checkins / maior) * 100) : 0}%"></span></div>
      <div class="peca-barra-valor"><b>${l.checkins}</b> check-ins · ${l.conversao}% de ${l.leituras} leituras</div>
    </div>`).join('')}
  </div>`;
}

// Gráfico de colunas com os check-ins de cada dia (até 14 dias, desde o início da campanha)
function mostrarPorDia(eventos, campanha) {
  const DIA = 24 * 60 * 60 * 1000;
  const hoje = inicioDoDia(new Date());
  const fim = campanha.encerrada_em ? inicioDoDia(new Date(campanha.encerrada_em)) : hoje;
  const inicioCampanha = inicioDoDia(new Date(campanha.criada_em));
  const inicio = new Date(Math.max(inicioCampanha, fim - 13 * DIA));

  const dias = [];
  for (let d = inicio.getTime(); d <= fim.getTime(); d += DIA) {
    dias.push({ data: new Date(d), checkins: 0 });
  }
  eventos.filter((e) => e.tipo === 'checkin').forEach((e) => {
    const indice = Math.round((inicioDoDia(new Date(e.criado_em)) - inicio) / DIA);
    if (dias[indice]) dias[indice].checkins++;
  });

  const maior = Math.max(1, ...dias.map((d) => d.checkins));
  const total = dias.reduce((soma, d) => soma + d.checkins, 0);
  const curto = (data) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  areaPorDia.innerHTML = `
    <div class="colunas-dia" role="img" aria-label="${total} check-ins entre ${curto(dias[0].data)} e ${curto(dias[dias.length - 1].data)}">
      ${dias.map((d) => `
        <div class="coluna-dia" title="${curto(d.data)}: ${d.checkins} check-ins">
          <span class="coluna-valor">${d.checkins || ''}</span>
          <span class="coluna" style="height: ${Math.round((d.checkins / maior) * 100)}%"></span>
          <span class="coluna-data">${curto(d.data)}</span>
        </div>`).join('')}
    </div>
  `;
}

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
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
      (l === melhor ? ' <span class="selo">Melhor conversão</span>' : '') +
      (podeReativar(l.c) ? ' <button type="button" class="link-botao ir-anteriores">Reativar →</button>' : '');
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

// Um cartão de número. Com "barra", mostra a etapa do funil em relação às leituras.
// O atalho "Reativar →" da comparação leva para a lista de campanhas anteriores
function irParaAnteriores(evento) {
  if (!evento.target.classList.contains('ir-anteriores')) return;
  mostrarAba('campanha');
  blocoAnteriores.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
areaComparacao.addEventListener('click', irParaAnteriores); // registrado uma vez só

function kpi(rotulo, valor, nota, barra = null, destaque = false) {
  return `
    <div class="kpi ${destaque ? 'kpi-destaque' : ''}">
      <p class="kpi-rotulo">${rotulo}</p>
      <p class="kpi-valor">${valor}</p>
      <p class="kpi-nota">${nota}</p>
      ${barra !== null ? `<div class="barra kpi-barra"><span style="width: ${barra}%"></span></div>` : ''}
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