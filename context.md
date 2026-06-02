# Bem Seguro Hub — Context

## Leia isto antes de qualquer tarefa

Este documento descreve o projeto, decisões de arquitetura, padrões de código, e armadilhas conhecidas.
Leia integralmente antes de implementar qualquer feature. Atualize este documento sempre que uma nova decisão, padrão ou hurdle for descoberto.

---

## Visão geral

Sistema de automação de cotações de seguro auto para a corretora Bem Seguro.
Recebe dados de um veículo/segurado via API REST, dispara cotação simultânea em 8 seguradoras via Aggilizador/Multicalculo, faz polling até receber prêmios e PDFs, e persiste os resultados.

O sistema é consumido via API por outros sistemas e operado via painel admin web.

## Repositórios e serviços

| Componente       | URL / ID                                      | Status     |
|------------------|-----------------------------------------------|------------|
| GitHub (backend) | https://github.com/Avila237/bemseguro         | Ativo      |
| Supabase         | https://yixgolukvqbbjjkszhjg.supabase.co      | Ativo      |
| Railway          | (pendente — conectar ao GitHub)                | Pendente   |
| Lovable (admin)  | (pendente — projeto criado, sem build)         | Pendente   |
| Anthropic        | console.anthropic.com                          | Ativo      |

## Stack

| Camada           | Tecnologia                                    |
|------------------|-----------------------------------------------|
| Backend          | Node.js + Express (Railway)                   |
| Banco + Auth     | Supabase (PostgreSQL + Auth + Edge Functions) |
| Frontend/Admin   | Lovable (React + shadcn/ui)                   |
| IA               | Claude API (assistente operacional)           |
| Cotação          | Aggilizador (api-prod.aggilizador.com.br) + Multicalculo (api.multicalculo.net) |
| Monitoring       | Better Stack ou Axiom + Sentry (a configurar) |

## Arquitetura de cotação

```
Cliente (API REST ou Painel Admin)
  → POST /api/v1/cotacoes
    → Edge Function run-quote (Supabase, fire-and-forget, retorna 202)
      → Railway /quote/auto (Worker Thread)
        → Login Aggilizador (session cache 55min)
        → Lookup placa (Multicalculo API)
        → calcularV2 (dispara 8 seguradoras)
        → Polling versoes (até 25 rounds × 8s, aguarda pathPdf)
        → Edge Function save-cotacoes
          → Supabase (salva cotações + atualiza status OS)
  → GET /api/v1/cotacoes/:id (polling do status pelo cliente)
```

## Endpoints da API

| Método | Endpoint                     | Auth       | Descrição                                    |
|--------|------------------------------|------------|----------------------------------------------|
| GET    | /health                      | Nenhuma    | Healthcheck                                  |
| POST   | /api/v1/cotacoes             | API key    | Cria OS e dispara cotação (retorna 202)      |
| GET    | /api/v1/cotacoes/:id         | API key    | Status e resultados da OS                    |
| POST   | /api/v1/lookup/placa         | API key    | Consulta dados do veículo pela placa         |

Auth via header `x-api-key`, validado contra hash bcrypt na tabela `api_keys`.

## Seguradoras configuradas

Aliro, Allianz, HDI, Mapfre, Sura, Tokio Marine, Yelum (Liberty Site), Zurich.

Credenciais e configurações (sucursal, filial, comissão) ficam na tabela `seguradoras` do Supabase, **nunca hardcoded no código**.

CORRETORA_ID: `d256d28a-b6ac-4077-b183-71f3780f0192`

## Banco de dados — tabelas

### os_cotacao
Ordens de serviço de cotação.

| Coluna        | Tipo                    | Notas                                    |
|---------------|-------------------------|------------------------------------------|
| id            | uuid PK                 | gen_random_uuid()                        |
| status        | enum                    | pendente, cotando, cotado, erro, cancelada |
| placa         | text                    |                                          |
| cpf           | text                    |                                          |
| nome          | text nullable           |                                          |
| email         | text nullable           |                                          |
| cep           | text nullable           |                                          |
| dados_risco   | jsonb                   | Dados do veículo/condutor                |
| api_key_id    | uuid FK                 | Quem disparou                            |
| error_message | text nullable           | Mensagem de erro se status=erro          |
| created_at    | timestamptz             | default now()                            |
| updated_at    | timestamptz             | default now()                            |

### cotacoes
Resultados por seguradora.

| Coluna        | Tipo                    | Notas                                    |
|---------------|-------------------------|------------------------------------------|
| id            | uuid PK                 |                                          |
| os_id         | uuid FK → os_cotacao    |                                          |
| seguradora    | text                    | Nome da seguradora                       |
| premio        | numeric                 |                                          |
| franquia      | numeric nullable        |                                          |
| cobertura     | text nullable           |                                          |
| url_pdf       | text nullable           |                                          |
| nro_calculo   | text nullable           |                                          |
| detalhes      | jsonb nullable          | Dados brutos (truncados a 3000 chars)    |
| created_at    | timestamptz             |                                          |

### seguradoras
Configuração e credenciais das seguradoras.

| Coluna        | Tipo                    | Notas                                    |
|---------------|-------------------------|------------------------------------------|
| id            | uuid PK                 |                                          |
| nome          | text unique             | Ex: "Aliro", "HDI"                       |
| nome_seguradora | text                  | Nome no Aggilizador                      |
| ativa         | boolean                 | default true                             |
| seguradora_id | integer                 | ID no Aggilizador (ex: 22, 5, 4...)      |
| credenciais   | jsonb                   | login, senha, códigos específicos        |
| config        | jsonb                   | comissão, desconto, filial, sucursal     |
| created_at    | timestamptz             |                                          |

### api_keys
Chaves de API para consumidores.

| Coluna        | Tipo                    | Notas                                    |
|---------------|-------------------------|------------------------------------------|
| id            | uuid PK                 |                                          |
| nome          | text                    | Identificador legível                    |
| key_hash      | text                    | bcrypt hash da chave                     |
| ativa         | boolean                 | default true                             |
| rate_limit    | integer                 | Requests/minuto, default 60              |
| created_at    | timestamptz             |                                          |
| last_used_at  | timestamptz nullable    |                                          |

### audit_log
Log de todas as chamadas à API.

| Coluna          | Tipo                    | Notas                                  |
|-----------------|-------------------------|----------------------------------------|
| id              | uuid PK                 |                                        |
| api_key_id      | uuid FK nullable        |                                        |
| endpoint        | text                    |                                        |
| method          | text                    |                                        |
| request_payload | jsonb nullable          | Body sem dados sensíveis               |
| response_status | integer                 |                                        |
| duration_ms     | integer nullable        |                                        |
| created_at      | timestamptz             |                                        |

## Estrutura do backend (Node.js)

```
bem-seguro-hub/
  src/
    index.js              # Express + boot + warm-up
    routes/
      health.js
      quote.js            # POST /api/v1/cotacoes, GET /api/v1/cotacoes/:id
      lookup.js           # POST /api/v1/lookup/placa
    services/
      aggilizador.js      # login, calcularV2, montagem de payload
      session.js          # Cache de token compartilhado (TTL 55min)
      fipe.js             # 4 estratégias de resolução FIPE
      supabase.js         # Client Supabase (service_role)
    workers/
      quote-worker.js     # Worker Thread: cotação + polling + save
    utils/
      parsers.js          # parseDataNasc, parseEstadoCivil, parseSexo, etc.
      auth.js             # Middleware de API key
      logger.js           # Log estruturado com contexto
    config/
      seguradoras.js      # Carrega seguradoras do Supabase no startup
  tests/
    routes/
    services/
    workers/
    utils/
  context.md
  package.json
  Dockerfile
  .env.example
  .gitignore
```

## Frontend — Painel Admin

Painel administrativo web, no mesmo repositório, servido pelo Express em produção.

### Stack

| Camada      | Tecnologia        |
|-------------|-------------------|
| Bundler     | Vite 5            |
| UI          | React 18          |
| Estilo      | Tailwind CSS 3    |
| Roteamento  | React Router v6   |
| Testes      | Vitest            |

### Localização e scripts

- Código em `admin/` (estrutura própria, com `package.json` separado do backend).
- Build: `npm run build:admin` (na raiz) → output estático em `admin/dist`.
- Dev: `npm run dev:admin` (na raiz) → dev server do Vite.
- O Express serve `/admin` a partir de `admin/dist`, com **fallback SPA** para
  `index.html` (habilita o client-side routing do React Router). `vite.config.js`
  usa `base: '/admin/'` para casar com esse prefixo.

### Variáveis de ambiente (Vite)

Prefixo `VITE_` obrigatório (expostas ao browser). Usar sempre a **anon key** pública.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

> O frontend **não** guarda segredos do backend. O lookup de placa passa pela
> Edge Function `lookup-placa` (que detém o token do Railway no servidor), então
> não existem `VITE_RAILWAY_*` no admin.

### Design system ("Clareza Operacional")

Tokens e classes do design (de claude.ai/design) vivem em
`admin/src/styles/theme.css` — **fonte canônica do visual**, carregado
globalmente em `main.jsx`. Cada tela nova deve reusar estes tokens/classes.

- **Tipografia:** IBM Plex Sans (interface) + IBM Plex Mono (placas, CPF, IDs,
  JSON, valores técnicos), via Google Fonts.
- **Cor:** tokens **OKLCH** em CSS custom properties (`--brand` laranja,
  `--blue` apoio, neutros branco-quente, `--st-*` por status do enum).
- **Classes utilitárias/componentes:** `.btn`/`.btn-primary`/`.btn-lg`, `.input`,
  `.field`/`.label`, `.badge`/`.st-*`, `.card`, `.row`/`.col`/`.gap-*`, `.mono`,
  `.muted`/`.soft`, etc. — ver `theme.css`.
- **Ícones:** set stroke estilo lucide em `admin/src/components/Icons.jsx`.
- **Geometria:** raios `--r-xs..xl`, sombras `--sh-sm..pop`.

> Obs.: Login, Dashboard e o shell (Sidebar/Topbar/Layout) usam os tokens OKLCH
> de `theme.css`. O `tailwind.config.js` ainda traz uma paleta hex aproximada
> (legado), mas as telas novas devem usar `theme.css`. Tailwind segue disponível
> para utilitários pontuais.

### Componentes de layout

- `Sidebar` — menu lateral (wordmark BemSeguro + nav). Migrado para os tokens
  OKLCH de `theme.css`; item ativo via `NavLink` (`aria-current`) com realce
  laranja (`--brand-tint`/`--brand-text`) e barra lateral.
- `Topbar` — título + subtítulo da página, **ações da própria tela** (`actions`),
  sino de alertas e avatar com o e-mail do usuário (de `supabase.auth.getUser`).
  Migrado para tokens OKLCH.
- `Page` — wrapper de tela: renderiza a `Topbar` (com `title/subtitle/actions`)
  + corpo rolável. Cada página usa `<Page>` para injetar suas ações no header.
- `Layout` — shell: `Sidebar` + coluna de conteúdo (recebe o `Outlet`).
- `ProtectedRoute` — verifica sessão Supabase Auth e redireciona para `/admin/login`.
- `Ui.jsx` — primitivos compartilhados: `Card`, `StatusBadge`, `Bars`, `SegLogo`,
  `Empty`, `Skeleton`.
- `Icons.jsx` — set de ícones stroke (mapa `Icon` + exports nomeados).

### Rotas

- `/admin/login` — tela de login (pública). Componente `pages/Login.jsx`.
- `/admin/dashboard` — Dashboard (Tela 02). Componente `pages/Dashboard.jsx`.
- `/admin/ordens` — Lista de Ordens de Serviço (Tela 03). Componente
  `pages/OrdemServico.jsx`. Linhas navegam para `/admin/ordens/:id`.
- `/admin/ordens/:id` — Detalhe da OS (Tela 04). Componente `pages/DetalheOS.jsx`.
- `/admin/nova-cotacao` — Nova Cotação (Tela 05). Componente `pages/NovaCotacao.jsx`.
- `/admin/seguradoras` — Seguradoras (Tela 06). Componente `pages/Seguradoras.jsx`.
- `/admin/api-keys` — API Keys (Tela 07). Componente `pages/ApiKeys.jsx`.
- `/admin/audit-log` — Audit Log (Tela 08). Componente `pages/AuditLog.jsx`.
- `/admin/monitoring` — Monitoring (Tela 09). Componente `pages/Monitoring.jsx`.
- Demais rotas ficam dentro do `Layout`, protegidas por `ProtectedRoute`.
- `/admin/` redireciona para `/admin/dashboard`.

### Autenticação

- Login via `supabase.auth.signInWithPassword({ email, password })` (anon key no browser).
- Sem cadastro público — usuários criados manualmente no Supabase Auth.
- Pós-login redireciona para `/admin/dashboard`; se já houver sessão ativa, o
  `Login` redireciona direto pro dashboard.
- `ProtectedRoute` checa `supabase.auth.getSession()` e manda pro `/admin/login`
  quando não há sessão.

### Estrutura de páginas

- `admin/src/pages/` — **uma página por tela**. Implementadas:
  - `Login.jsx` — Tela 01 (login), seguindo o design "Telas (Figma)": split de
    duas colunas (painel de marca laranja com gradiente/pills + formulário),
    inputs com ícone, mostrar/ocultar senha, botão primário com seta/spinner.
    Responsivo: abaixo de 860px a coluna de marca some (só o formulário).
  - `Dashboard.jsx` — Tela 02. 5 KPIs (OS hoje, Cotando, Cotado c/ %, Pendente,
    Com erro), card "Cotações recebidas hoje" (nº + média + barras de 14 dias),
    card "Alertas" (OS travadas > 10min + erros, clicáveis), tabela "Últimas OS"
    e ranking "Melhor taxa de retorno". Loading skeletons, **auto-refresh a cada
    60s**, botão "Atualizar", estado vazio amigável e estado de erro.
  - `OrdemServico.jsx` — Tela 03 (lista de OS). Tabs de status com contadores,
    busca com **debounce de 300ms** (nome/placa/CPF/nº OS), filtros de ramo e
    período (De/Até), tabela ordenada (mais recente) com **paginação** (limit/
    offset), menu de ações por linha (Ver detalhes / Recotar / Cancelar),
    skeletons, estado vazio. Botões "Exportar" (placeholder) e "Nova Cotação".
  - `DetalheOS.jsx` — Tela 04 (detalhe da OS). Header com `OS-XXXXX` + placa +
    nome, badges (status/ramo/origem/prioridade), ações Validar/Comparar
    (placeholders), Recotar (real) e Cancelar OS. Coluna esquerda = cards de
    cotação (badge da seguradora, Melhor Preço no 1º, prêmio em destaque,
    franquia/cobertura/tempo/nº cálculo, PDF abre `url_pdf`, Selecionar
    placeholder); coluna direita = cards Segurado/Veículo/Condutor/Apólice
    Anterior + JSON dos `dados_risco`. **Polling de 5s** enquanto `cotando`,
    skeletons, estado vazio e **404** se a OS não existir.
  - `NovaCotacao.jsx` — Tela 05 (criação manual de OS). 4 seções: Cliente/Lead
    (toggle Novo/Existente — Existente é placeholder), Dados da OS (tipo só Auto
    ativo; Residencial/Empresarial desabilitados; prioridade; observações),
    Veículo e Condutor (lookup de placa, campos auto-preenchidos, toggle
    "condutor é o próprio segurado") e Apólice Anterior (colapsável). Máscaras de
    CPF/CNPJ, telefone e CEP; validação client-side com destaque vermelho; botão
    "Criar OS" com loading; toast de sucesso; "Descartar" e "Voltar".
  - `Seguradoras.jsx` — Tela 06. Banner de segurança (credenciais nunca no
    painel), header "X de Y ativas", e um card por seguradora (sigla colorida,
    nome + slug, "Configurada", métricas placeholder, toggle Ativo/Inativo que
    faz UPDATE em `seguradoras.ativa`, engrenagem placeholder). Inativa = card com
    opacidade reduzida. Skeleton no load e estado vazio.
  - `ApiKeys.jsx` — Tela 07. Tabela de chaves (nome, chave truncada, criada em,
    último uso, rate limit, status, Revogar) e modal de criação que gera a chave,
    salva e a exibe **uma única vez** com botão copiar. Skeleton e estado vazio.
  - `AuditLog.jsx` — Tela 08. Registro de chamadas à API (debug de integrações).
    Barra de filtros: busca por endpoint/API key (**debounce 300ms**), dropdown
    de endpoints (lista distinta dinâmica), dropdown de status HTTP (200, 202,
    400, 401, 404, 500) e campo de Data. Tabela ordenada pela mais recente:
    Data/hora (`dd/mm HH:mm:ss`), Método (badge colorida — POST laranja, GET azul,
    PUT âmbar, DELETE vermelho), Endpoint, API key (nome ou "interno" se
    `api_key_id` nulo), Status HTTP (badge — 2xx verde, 3xx azul, 4xx amarelo,
    5xx vermelho) e Duração (`ms`/`s`, realçada em vermelho acima de 1s). Rodapé
    "X chamadas · janela de 24h" + **paginação server-side (20/página)**.
    Skeleton no load e estado vazio. Botão "Exportar CSV" (placeholder).
  - `Monitoring.jsx` — Tela 09. Painel técnico de saúde da operação. Header com
    badge de saúde do **Railway** (`GET /health` direto do browser — público, sem
    auth) e botão "Atualizar". 4 cards de métricas (tempo médio de cotação, taxa
    de sucesso global, sessão Aggilizador, erros 24h), gráfico "Cotações por dia"
    (30 dias, barras CSS proporcionais ao máximo), "Taxa de sucesso por
    seguradora" (barras horizontais) e lista "Erros recentes" (24h). **Queries
    reais** (sem mock), skeleton no load, **auto-refresh a cada 60s** e estado de
    erro. (O card "Sessão Aggilizador" segue **placeholder** — mesmo widget da
    Sidebar/API Keys — até existir endpoint de TTL real.)
  - Todas as telas do design (01–09) implementadas.

- O badge ao lado de "Ordens de Serviço" na Sidebar mostra o total de OS com
  status `pendente`/`cotando` (via `lib/osStats.js`, atualizado a cada 60s).

### Queries Supabase (Dashboard)

Em `admin/src/lib/dashboard.js` (`carregarDashboard()`), via client anon sob RLS
do usuário autenticado:

- `os_cotacao` `created_at >= início do dia` → contadores por status (hoje).
- `os_cotacao` `order created_at desc limit 5` → tabela "Últimas OS"; o veículo
  sai de `dados_risco` (suporta formato novo/legado) e o nº de OS deriva do uuid.
- `cotacoes` `created_at >= 14 dias` → total de hoje, série diária (barras) e
  ranking por seguradora (taxa = OS retornadas / OS despachadas no dia).
- `cotacoes` `os_id in (últimas)` → melhor preço (menor prêmio) por OS.
- `os_cotacao` `status in ('cotando','erro')` → alertas (travadas > 10min via
  `updated_at`; erros recentes via `error_message`).

### Queries Supabase (Lista de OS)

Em `admin/src/lib/ordens.js`:

- `carregarLista({status,busca,ramo,de,ate,page})` — `os_cotacao` com `select`
  `{ count: 'exact' }`, filtros dinâmicos (`eq status`, `eq dados_risco->>ramo`,
  `gte/lte created_at`, `.or(ilike nome/placa/cpf + id prefix p/ nº OS)`),
  `order created_at desc` e `range()` (paginação). Depois, `cotacoes`
  `os_id in (ids)` → melhor preço (menor prêmio) por OS.
- `contarStatus(filtros)` — `os_cotacao select('status')` sob os mesmos filtros
  (exceto o status) → contadores das tabs.
- `cancelarOS(id)` — `os_cotacao update status='cancelada'`.
- `lib/osStats.js` `contarOSAtivas()` — `count` de `os_cotacao` com
  `status in ('pendente','cotando')` (badge da Sidebar).

### Queries Supabase (Detalhe da OS)

Em `admin/src/lib/detalhe.js`:

- `carregarOS(id)` — `os_cotacao select('*') eq id maybeSingle()` (lança
  `OSNaoEncontrada` → 404 na tela) + `cotacoes select('*') eq os_id
  order premio asc`.
- `recotarOS(os)` — `supabase.functions.invoke('run-quote', { body: { os_id,
  dados_risco } })` para disparar nova cotação (a anon key/Authorization é
  resolvida pelo client). Reaproveita a Edge Function existente.
- `cancelarOS(id)` — reusa `lib/ordens.js`.
- **Polling**: enquanto `os.status === 'cotando'`, a tela rechama `carregarOS`
  a cada **5s** (sem skeleton) até o status virar `cotado`/`erro`/`cancelada`;
  o `setInterval` é limpo quando o status muda ou o componente desmonta.
- Os dados de Segurado/Veículo/Condutor/Apólice saem de `os_cotacao.dados_risco`
  (formato estruturado novo), com fallback para as colunas da própria OS
  (`nome`, `cpf`, `email`, `cep`, `placa`).

### Nova Cotação — lookup de placa e payload (Tela 05)

Em `admin/src/lib/cotacao.js`:

- **`lookupPlaca(placa)`** — chama `supabase.functions.invoke('lookup-placa',
  { body: { placa } })`. A Edge Function `lookup-placa` é quem fala com o Railway
  (`/lookup/placa`) usando o secret token guardado **no servidor** — nenhum
  segredo vai pro bundle do browser. Retorna `{ encontrado, modelo, anoModelo,
  anoFabricacao, fipe, chassi }`. Disparado no `onBlur` do campo Placa (e no
  botão "Buscar placa"); com spinner; se `success:false`, marca "não encontrada"
  e permite preenchimento manual.
- **`montarPayloadV2(form)`** — monta o payload **formato v2**:

  ```json
  {
    "ramo": "auto", "origem": "Manual", "prioridade": "Média", "observacoes": "",
    "segurado":  { "nome", "cpf", "dataNascimento": "DD/MM/AAAA", "sexo": "M|F",
                   "estadoCivil", "cep", "email", "telefone" },
    "veiculo":   { "placa", "modelo", "anoModelo", "anoFabricacao", "chassi", "fipe" },
    "condutor":  { "nome", "cpf", "dataNascimento", "sexo", "relacaoSegurado" },
    "apoliceAnterior": { "seguradora", "numero", "classeBonus", "sinistro" }
  }
  ```

  Sexo (Masculino/Feminino → `M`/`F`), estado civil normalizado
  (`casado`/`solteiro`/…), data convertida para `DD/MM/AAAA`. Quando "condutor é
  o próprio segurado", o bloco `condutor` recebe nome/cpf do segurado e
  `relacaoSegurado: 'segurado'`.
- **`criarCotacao(payload)`** — `supabase.functions.invoke('run-quote', { body })`
  e retorna o `id` da OS criada (`data.id || data.os_id`) para redirecionar a
  `/admin/ordens/:id`.

### Queries Supabase + RLS (Seguradoras)

Em `admin/src/lib/seguradoras.js`:

- **`listarSeguradoras()`** — `seguradoras select('id,nome,nome_seguradora,ativa')
  order nome`. **Nunca** seleciona `credenciais` (segurança — senhas ficam só no
  backend). O badge "Configurada" é exibido para toda linha (assume-se que estar
  na tabela = configurada), sem consultar credenciais.
- **`setAtiva(id, ativa)`** — `seguradoras update({ ativa }).eq('id', id)` (toggle
  Ativo/Inativo, com update otimista + reversão em erro).

**RLS necessária** (a tabela `seguradoras` hoje só é acessível pelo
`service_role`). Para o painel (usuário autenticado) ler e ligar/desligar sem
expor credenciais, criar políticas no Supabase:

```sql
-- Leitura: authenticated pode ler as linhas (colunas sensíveis ficam protegidas
-- por column-level grants OU simplesmente não são selecionadas pelo frontend).
create policy "seguradoras_select_auth" on seguradoras
  for select to authenticated using (true);

-- Update: authenticated só pode alterar (na prática, só mexe em `ativa`).
create policy "seguradoras_update_ativa_auth" on seguradoras
  for update to authenticated using (true) with check (true);
```

> Idealmente restringir o UPDATE apenas à coluna `ativa` via
> `GRANT UPDATE (ativa) ON seguradoras TO authenticated` (column-level), mantendo
> `credenciais`/`config` fora do alcance do role autenticado. Alternativa mais
> segura: expor o toggle por uma Edge Function `seguradora-toggle` (service_role)
> em vez de UPDATE direto.

**TODO — métricas placeholder:** taxa de retorno, tempo médio, último sucesso e
erros 24h são **mock determinístico** (`metricasPlaceholder(nome)` em
`lib/seguradoras.js`), pois ainda não há fonte real. Implementar agregação a
partir de `cotacoes`/`audit_log` por seguradora (ex.: taxa = retornos/disparos,
tempo médio do polling, contagem de erros nas últimas 24h). O "Testar conexões"
e a engrenagem de config também são placeholders.

### Queries Supabase + RLS (API Keys)

Em `admin/src/lib/apiKeys.js`:

- **`listarApiKeys()`** — `api_keys select(id,nome,key_hash,ativa,rate_limit,
  created_at,last_used_at) order created_at desc`.
- **`gerarChave()`** — gera `bsh_live_` + 24 hex via `crypto.getRandomValues`.
- **`criarApiKey({nome, rateLimit})`** — `insert({ nome, key_hash: chave, ativa,
  rate_limit })`. **No piloto, `key_hash` guarda a chave em texto plano.**
- **`revogarApiKey(id)`** — `update({ ativa: false }).eq('id', id)`.
- **`truncarChave(k)`** — exibição `bsh_live_xxxx…yyyy`.

**Fluxo de criação:** o operador informa nome + rate limit → "Gerar chave" gera a
chave, faz o `insert` e a exibe **uma única vez** (com botão copiar e aviso). Ao
recarregar a lista, só aparece a versão truncada de `key_hash`.

**RLS necessária** (a tabela `api_keys` hoje só é acessível pelo `service_role`).
Para o painel (usuário autenticado) listar/criar/revogar:

```sql
create policy "api_keys_select_auth" on api_keys
  for select to authenticated using (true);
create policy "api_keys_insert_auth" on api_keys
  for insert to authenticated with check (true);
create policy "api_keys_update_auth" on api_keys
  for update to authenticated using (true) with check (true);
```

**TODOs:**
- **bcrypt no hardening:** trocar o `key_hash` em texto plano por um hash bcrypt
  (gerar a chave, exibir 1x, salvar só o hash; validação por hash no backend).
  Hoje, como é texto plano, um admin autenticado consegue ler a chave inteira via
  `key_hash` — aceitável só no piloto.
- **Widget "Sessão Aggilizador"** (rodapé da Sidebar): hoje é **placeholder
  estático** (badge "Ativa", timer 41:08, barra 74%). Falta um endpoint que
  exponha o TTL real da sessão Aggilizador (a sessão vive na main thread do
  backend, cache de 55min) — ligar o widget a esse dado quando existir.

### Queries Supabase + RLS (Audit Log)

Em `admin/src/lib/auditLog.js`:

- **`carregarAudit({busca,endpoint,status,data,page})`** — `audit_log` com
  `select('id,endpoint,method,response_status,duration_ms,created_at,api_key_id,
  api_keys(nome)', { count: 'exact' })`. O **join em `api_keys`** (embedding do
  PostgREST via a FK `api_key_id`) traz o nome da chave; quando `api_key_id` é
  nulo, a tela mostra "interno". Filtros dinâmicos: `eq endpoint`, `eq
  response_status`, janela de tempo (`gte/lte created_at` — **últimas 24h** por
  padrão, ou o **dia inteiro** se `data` for informada), e busca `or(endpoint
  ilike, api_key_id in (...))` — o segundo termo resolve antes os ids das
  `api_keys` cujo `nome` casa com a busca. Ordena `created_at desc` e pagina com
  `range()` (**server-side, 20/página**).
- **`listarEndpoints()`** — `audit_log select('endpoint')` na janela atual →
  lista distinta para o dropdown de endpoints.
- Helper `dataHora(iso)` em `lib/format.js` → `dd/mm HH:mm:ss` (horário local).

**RLS necessária** (a tabela `audit_log` hoje só é acessível pelo `service_role`;
**ler pelo client anon do painel não funciona sem policy** — e o Claude Code não
tem acesso ao banco para criá-la). Adicionar no Supabase uma policy de **leitura**
para o usuário autenticado (o painel só lê; quem grava é o backend via
service_role):

```sql
create policy "audit_log_select_auth" on audit_log
  for select to authenticated using (true);
```

> O join `api_keys(nome)` também depende da policy de SELECT em `api_keys`
> (`api_keys_select_auth`, já documentada acima). Não há policy de INSERT/UPDATE
> para `authenticated` em `audit_log` — a escrita continua exclusiva do backend.

### Queries Supabase (Monitoring)

Em `admin/src/lib/monitoring.js`. `carregarMonitoring()` dispara as queries em
paralelo (`Promise.all`) e agrega tudo em memória. **Fonte de dados por card:**

| Card / bloco                       | Fonte                                                                 |
|------------------------------------|-----------------------------------------------------------------------|
| **Tempo médio de cotação (s)**     | `audit_log` `eq endpoint='/quote/auto'` `gte 14d` → média de `duration_ms` dos últimos 7 dias (em s). Delta "vs semana passada" = compara com os 7 dias anteriores (dias 7–14). |
| **Taxa de sucesso global (%)**     | `os_cotacao` `gte 7d` → `count(status='cotado') / total`.             |
| **Sessão Aggilizador**             | **Placeholder** (Ativa, "expira em 41:08 · cache 55min") — sem fonte real ainda (ver TODO do widget). |
| **Erros (24h)**                    | `os_cotacao` `eq status='erro'` `gte 48h` → `count` na janela de 24h; delta = vs as 24h anteriores. |
| **Cotações por dia (30 dias)**     | `cotacoes` `gte 30d` → agrupa `created_at` por dia (série de 30 posições; heights proporcionais ao máximo, últimos 5 dias em destaque laranja). |
| **Taxa de sucesso por seguradora** | `cotacoes` `gte 30d` → por seguradora, `count(premio>0) / count(total)` (barras horizontais, ordenadas pela taxa). |
| **Erros recentes (24h)**           | `os_cotacao` `eq status='erro'` `gte 48h` `order updated_at desc` → linhas das últimas 24h (`error_message`, `numeroOS(id)`, tempo relativo). A seguradora é exibida como **"Aggilizador"** (erros de OS são globais — não há seguradora associada à OS). |

- **`checarRailway()`** — `fetch('https://bemseguro-production.up.railway.app/health')`
  (GET público, sem auth, direto do browser). `true` se 2xx; `false` em erro de
  rede/status → badge "Railway saudável" / "Railway indisponível" / "Verificando…".
- Ícone `wifi` adicionado a `components/Icons.jsx` (card de sessão).
- **RLS:** reusa as policies de SELECT já documentadas para `os_cotacao`,
  `cotacoes`, `audit_log` (esta última ainda **pendente** — ver Audit Log acima).

### Testes

- **Vitest + Testing Library** (jsdom), **separado do Jest do backend**.
- O Jest da API ignora `admin/` (via `jest.testPathIgnorePatterns`).
- Rodar com `cd admin && npm test`.

### Build em produção (Docker)

- `Dockerfile` faz **multi-stage build**: o stage 1 instala as deps do admin e roda
  `npm run build:admin`; o stage 2 (runtime) copia apenas `admin/dist` para a imagem,
  sem carregar as devDependencies do front.

## Variáveis de ambiente

```env
# Railway
PORT=8080
RAILWAY_SECRET_TOKEN=<gerar com openssl rand -hex 32>

# Aggilizador
AGGER_LOGIN=<email corretora>
AGGER_SENHA=<senha corretora>

# Supabase
SUPABASE_URL=https://yixgolukvqbbjjkszhjg.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Anthropic
ANTHROPIC_API_KEY=<api key>

# Ambiente
NODE_ENV=production
LOG_LEVEL=info
```

Nunca commitar `.env`. O `.env.example` lista as variáveis sem valores.

## Padrões de código

### Geral
- Node.js com CommonJS (`require`) — sem TypeScript no backend por simplicidade
- Express 4.x
- Sem ORM — queries via Supabase client JS ou REST direto
- Logs em português com contexto: `[worker|ABC1D23] OS=xxx | seguradora=HDI | status=ok`
- Testes com o framework que o Claude Code escolher (Jest ou Vitest), cobrindo cada feature

### Worker Threads
- Cada cotação roda em Worker Thread separada (paralelismo real)
- Worker recebe dados via `workerData`, retorna via `parentPort.postMessage`
- Funções utilitárias são importadas via `require` (não duplicadas como no código original)
- Worker NÃO faz `require('express')` nem acessa o servidor HTTP

### Session Cache
- Token Aggilizador compartilhado na main thread
- TTL de 55 minutos (token real expira em ~60min)
- Pattern de `loginPromise` para evitar logins concorrentes
- Se worker recebe 401, manda `{ invalidateSession: true }` pra main thread

### Resolução FIPE (4 estratégias, em cascata)
1. Explícito em `dados_risco.fipe` (cliente já mandou)
2. Lookup por placa via Multicalculo API
3. Mapa local de modelos populares
4. Busca dinâmica por modelo via API Aggilizador

### Polling de cotação
- Até 25 rounds com intervalo de 8 segundos (~3min20s máximo)
- Condição de saída: `semRetorno === 0 AND semPdf === 0` (todas retornaram COM PDF)
- Fallback: se `semRetorno === 0` e passou de 10 rounds, finaliza mesmo sem PDF
- Cada round loga: `polling 5 | premio=3 | aguardando=5 | sem_pdf=1`

## Hurdles conhecidos (do sistema original)

1. **Login token dentro de `data.token`**, não na raiz da resposta — verificar ambos
2. **Sessões lotadas** — Aggilizador retorna lista de sessões ativas quando cheio; fazer logout da mais antiga e tentar de novo
3. **pctAjuste deve ser 100** — Tokio Marine rejeita com valores menores
4. **Polling deve aguardar PDFs** — sair só com `semRetorno=0` resulta em `url_pdf` nulo
5. **cotacoes acumula rows** — se reprocessar, filtrar pela janela de tempo ou deletar anteriores
6. **Nunca usar RLS em `profiles` que faz SELECT em `profiles`** — recursão infinita no Supabase
7. **Yahoo/sites com TLS fingerprinting** — não se aplica neste projeto, mas registrado como referência

## Limitações conhecidas

1. **Graceful shutdown marca _todas_ as OS em `cotando` como erro.** No
   encerramento (SIGTERM/SIGINT), após aguardar os workers (timeout de 30s), o
   backend marca como `erro` toda OS ainda em `cotando` — e o startup faz o
   mesmo com as órfãs (`cotando` há mais de 5min). No **piloto com instância
   única** no Railway isso é **correto**: como só existe um container, qualquer
   OS em `cotando` durante o shutdown é necessariamente dele.

   ⚠️ **Se escalar horizontalmente** (múltiplas réplicas do backend), esse reset
   passa a ser perigoso: um container ao reiniciar marcaria como erro também as
   OS que **outra réplica** está processando ativamente. Antes de rodar mais de
   uma instância, é preciso **escopar o reset por `instance_id`** (ou similar):
   cada worker grava o id do seu container na OS, e o shutdown/startup só mexe
   nas OS da própria instância. Ver `gracefulShutdown` e `resetCotandoAntigas`
   em `src/index.js`.

## O que NÃO está no escopo do piloto

- WhatsApp / Twilio / Meta Cloud API
- Gemini (consolidado em Claude)
- Kanban, SLA, Renovações, Sinistros, Carteira de Apólices
- Ranking de performance, Reuniões, Marketing
- RBAC complexo (4 roles) — piloto usa admin único
- Multi-ramo (só seguro auto)
- CRM Bubble (migração separada)
- Domínio customizado (usa URLs padrão Railway/Supabase/Lovable)

## Regras do projeto

1. **Nenhuma credencial no código** — tudo via env vars ou tabela `seguradoras`
2. **Repo sempre privado**
3. **Testes para cada feature** — sem exceção
4. **Claude Code lê este context.md antes de qualquer tarefa**
5. **Claude Code nunca commita direto** — sempre revisão humana antes
6. **Mudanças incrementais** — cada commit é testável e funcional
7. **Backend primeiro** — painel consome API pronta
8. **Logs estruturados em português** — time não-técnico precisa entender