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