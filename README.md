# Painel de Vendas — Eventos Presenciais IFT

Painel que acompanha, em tempo real, as vendas e os leads dos dois eventos
presenciais da IFT: **Dinâmicas de Alto Impacto** e **ANIMA Day**.

Ele lê três lugares no Google Sheets, faz as contas e mostra tudo numa tela só.
Quando alguém digita uma venda nova na planilha, o painel se atualiza sozinho —
sem ninguém precisar recarregar a página.

> **Este guia foi escrito para quem não programa.** Cada passo é um clique
> descrito. Se em algum momento a tela que você está vendo não parecer com o que
> está escrito aqui, pare e peça ajuda em vez de adivinhar.

---

## O que o painel mostra

| Card | O que significa |
|---|---|
| **Total Custo Campanha** | Quanto foi gasto em tráfego pago no período (já com imposto) |
| **Faturamento Líquido** | Quanto entrou de venda de ingresso no período |
| **Retorno** | Faturamento menos custo. Verde = lucro, vermelho = prejuízo |
| **Leads Total** | Quantas pessoas se cadastraram no período |
| **Participantes** | Quantas cadeiras vão estar ocupadas no evento |
| **Custo por Lead** | Quanto custou, em média, cada cadastro |
| **Individual / Duplo / Triplo** | Quantos ingressos de cada tipo foram vendidos |
| **Embaixador / Convidados / Total** | Quantos embaixadores diferentes trouxeram gente, e quantos convidados vieram |

Mais um gráfico de linha com **leads por dia** e **vendas por dia**.

Você pode filtrar por **evento**, por **nome/edição** (o nome atual ou os nomes
antigos, separados) e por **intervalo de datas**.

### Como as contas são feitas

- Ingresso individual custa **R$ 91,16** (dá para mudar esse valor na tela de Configuração)
- Ingresso duplo = 2 × R$ 91,16 = R$ 182,32 · Triplo = 3 × R$ 91,16 = R$ 273,48
- **Convite de embaixador é gratuito** e não entra no faturamento
- **Retorno** = Faturamento Líquido − Total Custo Campanha
- **Participantes** = individuais + (duplos × 2) + (triplos × 3) + embaixadores + convidados
- **Embaixadores** conta *nomes diferentes*: se a Maria trouxe 3 convidados,
  ela conta como 1 embaixador e 3 convidados

---

## Antes de começar: o que você vai precisar

1. Uma conta Google com acesso às duas planilhas
2. Uma conta gratuita em [render.com](https://render.com) (é onde o painel vai morar)
3. Uns 30 minutos

Você **não** precisa instalar nada no seu computador.

---

## Passo 1 — Criar a "chave" do Google

O painel funciona 24 horas por dia, mesmo com você dormindo. Para isso ele
precisa de uma identidade própria para entrar nas planilhas — uma espécie de
funcionário robô. É isso que a gente vai criar agora. **É de graça.**

1. Abra o [Google Cloud Console](https://console.cloud.google.com/).
2. No topo da tela, clique no seletor de projeto e depois em **"Novo projeto"**.
   Dê o nome **`Painel Eventos IFT`** e clique em **Criar**.
3. Espere alguns segundos e confirme que o projeto novo está selecionado no topo.
4. Na barra de busca do topo, digite **`Google Sheets API`** e clique no
   resultado. Depois clique no botão azul **Ativar**.
5. Na barra de busca, digite **`Contas de serviço`** e clique no resultado.
6. Clique em **"Criar conta de serviço"**.
   - Nome: **`painel-eventos`**
   - Clique em **Criar e continuar**, depois em **Continuar** e em **Concluído**
     (pode pular as permissões — o painel não precisa delas).
7. A conta vai aparecer numa lista, com um e-mail parecido com
   `painel-eventos@painel-eventos-ift.iam.gserviceaccount.com`.
   **Copie esse e-mail e guarde** — você vai usar no Passo 2.
8. Clique nessa conta, vá na aba **Chaves** → **Adicionar chave** → **Criar nova chave**.
9. Escolha o tipo **JSON** e clique em **Criar**.
10. Um arquivo `.json` vai ser baixado no seu computador. **Esse arquivo é a chave.**

> ⚠️ **Esse arquivo é uma senha.** Não mande por WhatsApp, não coloque no Google
> Drive compartilhado e não suba para o GitHub. Ele fica só no seu computador e
> vai ser colado uma vez no Render, no Passo 3.

---

## Passo 2 — Dar acesso às planilhas

O robô existe, mas ainda não enxerga nada. Vamos convidá-lo para as planilhas,
igualzinho a convidar uma pessoa.

Faça isso nas **duas** planilhas:

- **BASE DE LEADS** — [abrir](https://docs.google.com/spreadsheets/d/1ZfYGvQU4NsKrVMSLdHrAe9UJFtyUpNaC22qBQlrScbg/edit)
- **TRÁFEGO IFT** — [abrir](https://docs.google.com/spreadsheets/d/1e1Uf7GyBiP1pMCBJGl12PldPYQSsQtuFGqmaCIHcw48/edit)

Em cada uma:

1. Clique no botão **Compartilhar**, no canto superior direito.
2. Cole o e-mail do robô que você guardou no Passo 1.
3. Escolha a permissão **Leitor** (só leitura — o painel nunca escreve nas planilhas).
4. **Desmarque** a caixinha "Notificar as pessoas" (é um robô, não tem caixa de entrada).
5. Clique em **Compartilhar**.

---

## Passo 3 — Colocar o painel no ar

1. Entre em [render.com](https://render.com) e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New** → **Web Service**.
3. Conecte a sua conta do GitHub e escolha o repositório
   **`dashboard-eventos-presenciais`**.
4. O Render costuma preencher tudo sozinho. Confira se está assim:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Role até **Environment Variables** e adicione duas:

   | Nome | Valor |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Abra o arquivo `.json` do Passo 1 num editor de texto, selecione **tudo** (Ctrl+A), copie e cole aqui |
   | `WEBHOOK_TOKEN` | Invente uma senha longa, tipo `ift-painel-2026-xK9m2Qw`. Anote — você vai usar no Passo 4 |

6. Clique em **Create Web Service** e espere uns 3 minutos.
7. No topo da tela vai aparecer o endereço do painel, algo como
   `https://painel-eventos-ift.onrender.com`. **É esse o link que você
   compartilha com a equipe.**

> **Sobre o plano grátis do Render:** se ninguém abrir o painel por uns 15
> minutos, ele "dorme" para economizar. A primeira pessoa que abrir depois
> disso vai esperar uns 30 segundos a mais para a tela carregar. Se isso
> incomodar, o plano pago mais barato resolve.

---

## Passo 4 — Ligar a atualização instantânea

Sem este passo o painel já funciona, mas confere as planilhas a cada 5 minutos.
Com este passo, ele reage no mesmo instante em que alguém digita uma venda.

Faça isso nas **duas** planilhas:

1. Abra a planilha e vá em **Extensões** → **Apps Script**.
2. Apague tudo o que estiver escrito na tela.
3. Abra o arquivo [`apps-script/aviso-de-edicao.gs`](apps-script/aviso-de-edicao.gs)
   deste repositório, copie o conteúdo inteiro e cole na tela do Apps Script.
4. Lá no começo do código, troque as duas linhas:
   - `URL_DO_PAINEL` → o endereço do Passo 3 **com `/api/webhook/sheets` no final**.
     Exemplo: `https://painel-eventos-ift.onrender.com/api/webhook/sheets`
   - `SENHA_DO_AVISO` → a mesma senha que você pôs em `WEBHOOK_TOKEN` no Passo 3
5. Clique no ícone de **salvar** (disquete).
6. No seletor de função, no topo, escolha **`instalarGatilho`** e clique em **Executar**.
7. O Google vai pedir permissão. Clique em **Revisar permissões** → escolha sua
   conta → **Avançado** → **Acessar (não seguro)** → **Permitir**.
   (O aviso de "não seguro" aparece porque é um script seu, feito em casa, e não
   um aplicativo publicado na loja do Google. Pode seguir.)
8. Deve aparecer a mensagem *"Pronto! O painel vai ser avisado..."*.

Para conferir: escolha a função **`testarAviso`**, execute, e veja se o horário
da "última leitura" muda no painel.

---

## Como usar no dia a dia

Abra o link e pronto. A tela tem duas abas:

### Aba "Painel"
Os cards, o gráfico e os filtros. Escolha o evento, escolha o período
(ou use os atalhos *Hoje*, *7 dias*, *30 dias*, *Este mês*, *Tudo*) e os
números se recalculam na hora.

O seletor **"Nome / edição"** deixa você ver o evento com o nome atual, com os
nomes antigos, ou os dois juntos.

### Aba "Configuração"
É aqui que você mexe quando alguma coisa muda, **sem precisar de programador**:

- **Nomes e apelidos dos eventos** — se o evento for renomeado de novo, adicione
  o nome novo aqui e o painel passa a reconhecê-lo. Vale para a sigla do tráfego
  pago (ex.: `DAI`) e para o nome por extenso das planilhas.
- **Nomes que o painel não reconheceu** — a lista mais útil da tela. Mostra o que
  apareceu nas planilhas e não bateu com nenhum apelido cadastrado, ou seja,
  **não está sendo contado em lugar nenhum**. Se algum for dos seus eventos,
  escolha a qual pertence e clique em Adicionar.
- **Preço do ingresso** — hoje R$ 91,16.
- **Ajustes avançados** — de onde o painel lê os dados. Só mexa se alguma aba for
  renomeada. O botão *"Verificar conexão com as planilhas"* mostra os nomes reais
  das abas, útil para conferir a grafia.

Depois de mexer em qualquer coisa, clique em **Salvar alterações**.

---

## Quando alguma coisa der errado

| O que você vê | O que fazer |
|---|---|
| Uma tarja amarela dizendo **"Modo demonstração"** | A chave do Google não chegou. Confira se `GOOGLE_SERVICE_ACCOUNT_JSON` foi colada inteira no Render, sem faltar pedaço. |
| **"Falha ao ler as planilhas"** com erro 403 | O robô não foi convidado. Refaça o Passo 2 nas duas planilhas. |
| **"Falha ao ler as planilhas"** com erro 400 ou *Unable to parse range* | O nome de alguma aba está diferente. Vá em Configuração → *Verificar conexão com as planilhas* e compare com o que está em *Ajustes avançados*. |
| Um evento aparece **zerado** | Vá em Configuração e olhe *"Nomes que o painel não reconheceu"*. Provavelmente a campanha usa uma sigla que ainda não foi cadastrada. |
| Aviso de **"registros sem data válida"** | A aba de compradores não tem data na coluna configurada. Ajuste a *Coluna da data* em Ajustes avançados. |
| A venda nova **não apareceu na hora** | O aviso da planilha falhou. Clique em *Atualizar agora* para destravar e refaça o Passo 4. |
| O painel demora ~30s para abrir | Normal no plano grátis do Render depois de um tempo parado. |

---

## Para quem for mexer no código

```bash
npm install          # instala tudo
npm run dev:server   # servidor em http://localhost:3000
npm run dev:web      # interface em http://localhost:5173
npm test             # roda os testes (precisa de npm run build antes)
npm run build        # gera a versão de produção
npm start            # roda a versão de produção
```

Sem a chave do Google, o painel sobe em **modo demonstração**, com números
inventados — dá para desenvolver e revisar a tela sem tocar nas planilhas reais.

### Como está organizado

```
config/event-config.default.json   Mapeamento de nomes padrão (ponto de restauração)
data/event-config.json             O que a tela de Configuração grava (não versionado)
shared/types.ts                    Tipos usados pelo servidor e pela interface
server/src/normalize.ts            Lê datas, dinheiro e colunas das planilhas
server/src/matching.ts             Decide de qual evento é cada linha
server/src/metrics.ts              Faz as contas dos cards e do gráfico
server/src/sheets.ts               Conversa com a Google Sheets API
server/src/loader.ts               Transforma as células cruas em linhas normalizadas
server/src/store.ts                Guarda os dados em memória e avisa as telas abertas
server/src/index.ts                API + WebSocket + entrega da interface
web/src/                           A interface (React)
apps-script/aviso-de-edicao.gs     Script que vai dentro das planilhas
```

### Por que ler aba por aba

A planilha **BASE DE LEADS** tem quase 3 MB e anos de histórico de vários outros
produtos da empresa. Exportar o arquivo inteiro trava e corta antes de chegar nas
abas que interessam. Por isso o painel usa `spreadsheets.values.get` pedindo o
range de uma aba só — cada leitura fica pequena e confiável.

### Cuidado com siglas curtas

O reconhecimento de eventos é conservador de propósito. Siglas de até 4 letras
(`PAI`, `DAI`, `DI`) só são aceitas quando aparecem **entre colchetes** no nome da
campanha ou quando são a célula inteira. Isso evita que `PAI` case por acidente
dentro de outra palavra. Nomes por extenso, de 5 letras ou mais, também casam por
conteúdo. Os testes em `server/test/matching.test.js` travam esse comportamento
usando nomes de campanha reais da planilha.
