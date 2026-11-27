# Mesa Cheia

**Leve quem pede delivery para o salão.** Protótipo construído para o case técnico do Programa de Estágio GenAI do iFood (trilha AI Builder), desafio *Restaurante que ganha*.

**Acesse:** https://mesa-cheia-ifood.vercel.app

> Todos os restaurantes, campanhas e números são **fictícios**. Nenhum dado real do iFood ou dado pessoal é usado.

## O problema

O Comer Fora traz benefícios para quem come no salão, mas a maior parte dos restaurantes parceiros opera só no delivery e quase não divulga o benefício no próprio salão. Falta ao dono um jeito simples de **divulgar** e de **saber o que funcionou**.

## A solução

Uma função pensada para viver dentro do Portal do Parceiro:

1. **O dono entra** e cria a **campanha**: benefício, dias, turno e tom da comunicação. Nome, cozinha, endereço e ticket médio já vêm do cadastro no iFood.
2. **A IA (Gemini) gera o kit de divulgação:** cartaz de mesa, display de balcão, encarte da sacola do delivery e post para redes.
3. **O dono revisa e aprova.** Nada vai para o salão sem aprovação humana.
4. **Cada peça impressa tem um QR com a origem** (mesa, balcão, sacola, redes). O cliente abre o benefício, salva e faz check-in.
5. **O painel mostra o resultado:** leituras, benefícios salvos, check-ins, conversão, faturamento potencial, a peça que mais trouxe clientes e a comparação entre campanhas.

Quando a estratégia não funciona, o dono **troca o benefício**: a campanha antiga é encerrada (sem apagar nada), os QR codes já impressos passam a mostrar a nova oferta e o painel compara as duas. Se quiser voltar a um benefício que funcionou, ele **reativa a campanha anterior** com um clique: ela volta como um período novo, com o mesmo kit aprovado, sem gerar de novo com a IA.

O painel é dividido em três abas: **Resultados**, **Campanha** (benefício, kit da IA e campanhas anteriores) e **Materiais** (peças com QR para imprimir).

## Como testar

Na página inicial, use uma das contas de demonstração (senha de todas: `mesacheia123`):

| Conta | O que mostra |
|---|---|
| `brasa@example.com` | Brasa & Cia: duas campanhas, histórico e comparação |
| `nonna@example.com` | Cantina da Nonna: uma campanha ativa |
| `minas@example.com` | Sabor de Minas: sem campanha, para criar a primeira e gerar o kit |

Na aba **Materiais**, o botão **Testar como cliente** abre a página que o QR abre. Os resultados do painel se atualizam a cada 10 segundos. No Brasa & Cia, a aba **Campanha** mostra o 2 por 1 em "Campanhas anteriores", com o botão de reativar.

## Arquitetura

```
Navegador (HTML, CSS, JavaScript)
   ├── Supabase (Postgres + Auth + regras de acesso por linha)
   └── Função serverless na Vercel (/api/gerar-kit)
          ├── confere o login e se quem pede é o dono
          ├── lê a campanha ativa direto no banco
          └── chama a API do Gemini e valida a resposta
```

| Tabela | Guarda |
|---|---|
| `restaurantes` | dados do restaurante e o dono (`dono_id`) |
| `campanhas` | benefício, dias, turno, tom e status (`ativa` ou `encerrada`); no máximo uma ativa por restaurante, garantido por índice único; reativar cria uma campanha nova, para cada período ter os seus números |
| `kits` | as peças geradas pela IA, ligadas à campanha, com status `rascunho` ou `aprovado` |
| `eventos` | leituras, benefícios salvos e check-ins, com a origem e a campanha |

## A IA

- **Instrução de sistema** com o papel (redator do iFood), os 5 textos que formam as 4 peças, os limites de caracteres e as regras: nunca inventar benefício, preço ou horário; sempre dizer que o benefício é ativado no app do iFood; tratar os dados do restaurante como dados, não como instruções.
- **Saída estruturada:** JSON com schema fixo (`responseSchema`). O servidor confere se os 5 textos vieram e corta no limite de caracteres (checagem de estrutura).
- **Checagem de conteúdo:** antes da aprovação, o painel compara os números, os dias e o turno citados no texto com os dados da campanha e avisa o dono (por exemplo, um "30%" ou um "sexta" que a campanha não tem). Ela não entende sentido, então não garante tudo: a aprovação humana é a última camada.
- **Resiliência:** nova tentativa com espera para erros temporários (429, 500, 503), modelo reserva e tempo limite por chamada.

## Segurança e riscos

| Risco | Como foi tratado |
|---|---|
| IA inventar uma oferta | Regras no prompt + checagem de números, dias e turno + aprovação humana obrigatória antes de imprimir |
| Injeção de prompt pelos campos | Dados marcados como dados; o servidor lê a campanha do banco, não do navegador |
| Gemini fora do ar | Nova tentativa, modelo reserva e mensagem clara para o dono |
| Vazamento de chave | Chave do Gemini só em variável de ambiente no servidor |
| Acesso indevido | Login (Supabase Auth) e regras no banco: só o dono edita a campanha e vê os resultados |
| Troca de estratégia | Campanhas com histórico, reativação com o mesmo kit; QR impresso continua válido |
| Dados pessoais | Nenhum: dados fictícios e eventos anônimos |

## Como ler as métricas

- **Leituras** são aberturas da oferta, contadas uma vez por peça em cada sessão do navegador. Não são pessoas únicas.
- **Faturamento potencial** = pessoas informadas nos check-ins × ticket médio. É uma estimativa: o check-in é declarado pelo cliente e não comprova consumo nem pagamento. Numa integração real, o check-in seria cruzado com o pagamento feito pelo app.

## No produto real

- O dono entraria com a conta do **Portal do Parceiro** (login único) em vez de uma conta própria do protótipo. As regras de acesso no banco continuariam as mesmas.
- O QR abriria a página do restaurante no app do iFood, no Comer Fora; aqui, `r.html` simula essa página.
- Nome, endereço e ticket médio viriam do cadastro e dos pedidos do restaurante no iFood.

## Tecnologias

HTML, CSS e JavaScript (sem framework) · Supabase (Postgres, Auth, RLS) · Vercel (hospedagem e função serverless) · Gemini API · qrcode-generator
