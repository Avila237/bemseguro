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
| GET    | /session/status              | Nenhuma    | Estado da sessão Aggilizador (TTL p/ o painel) |
| POST   | /api/v1/cotacoes             | API key    | Cria OS e dispara cotação (retorna 202)      |
| POST   | /api/v1/cotacoes-com-docs    | API key    | Cria OS com CNH/CRLV p/ a IA extrair (202)   |
| GET    | /api/v1/cotacoes/:id         | API key    | Status e resultados da OS                    |
| POST   | /api/v1/lookup/placa         | API key    | Consulta dados do veículo pela placa         |
| POST   | /extract/cnh                 | x-secret-token | Extrai dados de uma CNH via Claude API   |
| POST   | /extract/crlv                | x-secret-token | Extrai dados de um CRLV via Claude API   |

Auth via header `x-api-key`, validado contra hash bcrypt na tabela `api_keys`.
As rotas internas `/quote/*` e `/extract/*` usam `x-secret-token`
(`RAILWAY_SECRET_TOKEN`), não API key — são chamadas server-to-server.

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
| status        | enum `os_status`        | pendente, extraindo_documentos, revisao_manual, cotando, cotado, callback_pendente, erro, cancelada |
| placa         | text nullable           | null até a IA extrair (ver nota abaixo)  |
| cpf           | text nullable           | null até a IA extrair (ver nota abaixo)  |
| nome          | text nullable           |                                          |
| email         | text nullable           |                                          |
| cep           | text nullable           |                                          |
| dados_risco   | jsonb                   | Dados do veículo/condutor                |
| api_key_id    | uuid FK                 | Quem disparou                            |
| error_message | text nullable           | Mensagem de erro se status=erro          |
| created_at    | timestamptz             | default now()                            |
| updated_at    | timestamptz             | default now()                            |

> **`placa` e `cpf` são nullable** (migração
> `db/migrations/007-placa-cpf-nullable.sql`). Antes eram `NOT NULL`, mas a
> **feature de integração CRM + IA** cria a OS em `extraindo_documentos`
> (via `/api/v1/cotacoes-com-docs`) **antes** de conhecer placa/CPF — esses
> campos chegam só depois que a IA lê CNH/CRLV e são preenchidos via `UPDATE`.
> Nos fluxos diretos (`/api/v1/cotacoes`/run-quote) ambos continuam obrigatórios
> (validados na entrada).

**Status do ciclo de vida (`os_status`):** `pendente` → `cotando` → `cotado`,
com `erro`/`cancelada` como terminais. Os três abaixo foram adicionados pela
migração `db/migrations/005-status-novos-extracao-callback.sql` e **dependem da
feature de integração CRM + IA** (leitura de documentos por IA e reenvio da
cotação ao CRM) — só aparecem quando essa integração estiver ativa:

- **`extraindo_documentos`** — a IA está lendo CNH/CRLV (transitório, segundos).
  Azul; o detalhe da OS faz polling enquanto está neste estado (como em `cotando`).
- **`revisao_manual`** — a IA achou conflito entre o formulário e os documentos;
  **espera ação do operador** (abrir a OS, confirmar/corrigir antes de cotar). Âmbar.
- **`callback_pendente`** — cotação pronta, mas o callback para o CRM falhou;
  **retry automático** pendente. Azul claro (em transição).

Apresentação centralizada em `admin/src/lib/format.js` → **`STATUS_META`**
(`{ label, classe }`, fonte única; `STATUS_LABEL` é derivado dela), com as classes
`.st-extraindo_documentos` / `.st-revisao_manual` / `.st-callback_pendente` em
`theme.css`. Reaproveitada por `StatusBadge`, pelos filtros da Lista de OS
(`TABS`), pelos contadores (`contarStatus`/Dashboard) e pela Ajuda (artigo 04).

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

### documentos_os
Referências aos documentos (CNH/CRLV) enviados via CRM e lidos pela IA. Criada
pela migração `db/migrations/006-documentos-os.sql`. **Depende da feature de
integração CRM + IA** (mesma da migração 005). O arquivo binário fica no
**Storage** (bucket `documentos-clientes`); aqui guardamos só a **referência**
(`storage_bucket` + `storage_path`) e o resultado da extração.

| Coluna             | Tipo                    | Notas                                            |
|--------------------|-------------------------|--------------------------------------------------|
| id                 | uuid PK                 | `gen_random_uuid()`                              |
| os_id              | uuid FK → os_cotacao    | `ON DELETE CASCADE` (apaga docs junto com a OS)  |
| tipo               | text                    | `cnh_segurado` / `cnh_condutor` / `crlv` (CHECK) |
| storage_path       | text                    | Caminho do arquivo no bucket                     |
| storage_bucket     | text                    | default `documentos-clientes`                    |
| mime_type          | text nullable           | Ex.: `image/jpeg`, `application/pdf`             |
| tamanho_bytes      | integer nullable        |                                                  |
| dados_extraidos    | jsonb nullable          | Resultado da extração pela IA                    |
| confianca_extracao | numeric(3,2) nullable   | 0.00–1.00 (confiança da IA)                      |
| revisado           | boolean                 | default `false`                                  |
| revisado_por       | uuid FK → auth.users    | Quem revisou (nullable até a revisão)            |
| revisado_em        | timestamptz nullable    |                                                  |
| created_at         | timestamptz             | default `now()`                                  |
| updated_at         | timestamptz             | default `now()`, mantido por trigger             |

**RLS:** usuário `authenticated` pode `SELECT`/`INSERT`/`UPDATE` os **metadados**
(policies `documentos_os_select_auth` / `_insert_auth` / `_update_auth`, na
migração 006). A escrita do **arquivo** no Storage é exclusiva do `service_role`.

> A migração 006 também declara `update_updated_at_column()` via
> `create or replace` (o schema inicial não está versionado no repo, então não se
> pode assumir que a função já existe) e cria o trigger `documentos_os_updated_at`.

### Storage — bucket `documentos-clientes`
Bucket **privado** (sem acesso público) para os arquivos de CNH/CRLV. Todo acesso
passa pelo **backend com a service_role** (download direto ou URL assinada de
curta duração) — nunca pelo browser direto, e a anon key nunca lê o bucket.

- **Estrutura de paths:** `{os_id}/{tipo}-{timestamp}.{ext}`
  (ex.: `abc123/cnh_segurado-20260603.jpg`). Agrupar por `os_id` facilita
  listar/limpar todos os documentos de uma OS de uma vez.
- **Retenção:** 5 anos a partir de `created_at` — **política, ainda não
  automatizada** (hoje é só diretriz; futuramente varrer + remover via pg_cron ou
  Edge Function).
- **Criação manual:** o bucket é criado **manualmente** no Supabase Dashboard
  (a migração 006 **não** cria o bucket). Passo a passo, políticas de RLS do
  Storage (só `service_role` lê/escreve) e exemplos de upload/download/URL
  assinada no backend: ver **`docs/storage-documentos.md`**.

### Extração de documentos por IA (`/extract`)

Endpoints internos no Railway que recebem um documento (CNH ou CRLV), guardam o
arquivo no **Storage**, chamam a **Claude API** para extrair os dados e persistem
tudo em `documentos_os`. Fazem parte da feature de integração CRM + IA.

- **Rotas** (`src/routes/extract.js`): `POST /extract/cnh` e `POST /extract/crlv`.
  - Auth: header **`x-secret-token`** (`RAILWAY_SECRET_TOKEN`) — mesmas chamadas
    server-to-server do `/quote`, **não** API key. Sem token → **401**.
  - Upload via **`multipart/form-data`**, campo **`arquivo`** (multer, memória).
  - Campos do form: **`os_id`** (obrigatório) e, só para CNH, **`tipo`** opcional
    (`cnh_segurado` default ou `cnh_condutor`); CRLV é sempre `crlv`.
  - Valida **MIME** (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`)
    → MIME fora da lista = **400**. Sem arquivo / sem `os_id` / `tipo` de CNH
    inválido = **400**.
  - Valida **tamanho** (máx **10MB**) → acima = **413**.
  - Log: `[extract] tipo=cnh_segurado tamanho=Xkb mime=... os=...`.

  **Fluxo completo de cada request:**
  1. **Valida a OS** — `os_cotacao select('id').eq('id', os_id).maybeSingle()`.
     OS inexistente → **404** (antes de qualquer upload ou chamada à IA). Erro de
     banco na validação → **500**.
  2. **Upload no Storage** — `getSupabase().storage.from('documentos-clientes')
     .upload(path, buffer, { contentType, upsert:false })`. `path` =
     `{os_id}/{tipo}-{timestamp}.{ext}` (timestamp em segundos; extensão derivada
     do MIME: jpeg→`jpg`, png→`png`, webp→`webp`, pdf→`pdf`). Falha no upload →
     **500** e **a IA não é chamada**.
  3. **Extração por IA** — `extrairDocumento({ tipoDocumento, base64Image,
     mimeType })` (o `tipoDocumento` é o tipo-base `cnh`/`crlv`, que seleciona o
     prompt). Falha da IA → **502** (o arquivo já está no Storage).
  4. **Insert em `documentos_os`** — `os_id`, `tipo`, `storage_path`,
     `storage_bucket`, `mime_type`, `tamanho_bytes`, `dados_extraidos` (= `dados`
     da IA), `confianca_extracao` (= **média** das confianças individuais, ou
     `null` se vazio), `revisado:false`; `.select('id').single()`.
  5. **Resposta 200** — `{ success, tipo, documento_id, storage_path, dados,
     confianca, observacoes, modelo, tokensUsados }`.

  **Comportamento em falhas (rollback parcial):** o upload acontece **antes** do
  insert. Se o insert em `documentos_os` falhar (passo 4), o endpoint retorna
  **500**, mas **o arquivo permanece no Storage** sem a row de metadados — fica um
  órfão. Registra-se um **warning** (`Insert em documentos_os falhou (arquivo ja
  no Storage: documentos-clientes/...)`). O mesmo vale para falha de IA (passo 3):
  arquivo no Storage sem extração. Não há limpeza automática do órfão hoje (a
  política de retenção de 5 anos eventualmente o cobre); reprocessar a mesma OS
  gera um novo arquivo com timestamp diferente (sem colisão de path).
- **Wrapper** (`src/services/anthropic.js`): `extrairDocumento({ tipoDocumento,
  base64Image, mimeType })` → `{ dados, confianca, observacoes, modelo,
  tokensUsados }`.
  - Modelo **`claude-sonnet-4-5`** (override via env `ANTHROPIC_MODEL`).
  - Chama a Messages API por `fetch` (`https://api.anthropic.com/v1/messages`,
    header `anthropic-version: 2023-06-01`). PDF vira bloco `document`; imagem,
    bloco `image`.
  - **Parse robusto** (`extrairJSON`): a Claude pode devolver prosa/markdown ao
    redor do JSON — tenta o texto cru, remove cercas ```` ```json ````, e recorta
    do primeiro `{` ao último `}`.
  - **Retry exponencial** via `retryComBackoff` (`src/utils/retry.js`) — 429/5xx/
    timeout/rede; 4xx de dados/auth não são retentados.
  - Exceptions capturadas no **Sentry** com tags `component: anthropic,
    operation: extrair_documento`.
- **Prompts** (`src/prompts/cnh.md`, `src/prompts/crlv.md`): instruções de
  extração, em português, pedindo **APENAS JSON** (sem markdown) no formato
  `{ dados, confianca, observacoes }` com **confiança 0–1 por campo**. CNH: nome,
  CPF, data de nascimento (ISO), sexo (M/F), validade. CRLV: placa, chassi, marca,
  modelo, ano fab./modelo, FIPE (se visível), RENAVAM, CPF/nome/endereço do
  proprietário. Editar a extração = mexer **só** nesses `.md` (lidos e cacheados
  em runtime; não precisam de rebuild).
- **Testes:** `tests/routes/extract.test.js` (supertest, com **Supabase mockado**
  — Storage `upload` + tabela `insert`: 401 sem token, 400 sem arquivo/sem
  `os_id`/`tipo` inválido, 404 OS inexistente, 400 MIME inválido, 413 grande
  demais, 200 com upload+IA+insert e `documento_id`, média de confiança, 500 em
  falha de upload, 500 + warning em falha de insert, 502 em falha de IA, PDF/CRLV)
  e `tests/services/anthropic.test.js` (parse robusto, montagem da requisição,
  bloco image vs document, sem API key, 4xx não retentado).

### Cotação com documentos — `/api/v1/cotacoes-com-docs`

Endpoint para o **CRM** criar uma cotação enviando os **documentos** do cliente
(CNH/CRLV) em vez dos dados já estruturados. A OS nasce em `extraindo_documentos`
e o preenchimento de `placa`/`cpf` (e demais campos do veículo/segurado) fica a
cargo da **IA** (via `/extract`, no processamento async). Implementado em
`src/routes/cotacao-com-docs.js`.

**Diferença para `/api/v1/cotacoes` (run-quote):** o `/api/v1/cotacoes` recebe os
dados **já estruturados** (formato v2 ou legado) e vai direto para `cotando`. O
`/api/v1/cotacoes-com-docs` recebe **multipart com arquivos**, cria a OS em
`extraindo_documentos`, e só depois a IA lê os documentos e segue o fluxo de
cotação. É o ponto de entrada do CRM que ainda não tem os dados do veículo.

- **Auth:** header **`x-api-key`** validado via RPC **`validar_api_key`** (bcrypt +
  prefixo — mesma da Edge Function run-quote/get-cotacoes). Sem chave → **401**;
  chave inválida/inativa → **401**; erro no RPC → **500**. Roda **antes** do
  multer (requisição sem chave não consome o upload).
- **Body (`multipart/form-data`):**
  - Campos obrigatórios: `nome`, `telefone`, `cep_pernoite` (`12345678` ou
    `12345-678`), `estado_civil`, `uso` (`passeio`|`comercial`), `dono_eh_condutor`
    (`true`|`false`), `renovacao` (`true`|`false`).
  - Arquivos: `cnh_segurado` (obrig.), `crlv` (obrig.), `cnh_condutor` (obrig.
    **só se** `dono_eh_condutor=false`). MIME `jpeg/png/webp/pdf`, máx **10MB**.
  - Opcionais: `external_ref` (ID do lead no CRM), `callback_url` (**HTTPS** —
    validada; HTTP/ inválida → **400**).
  - `Idempotency-Key` (header, opcional): mesma chave nas últimas 24h → **200**
    replay com a OS anterior (sem criar OS nova). Reusa a coluna
    `os_cotacao.idempotency_key` (índice único parcial da migração 004); trata
    corrida `23505` como replay. (Sem comparação byte-a-byte do corpo — os
    binários inviabilizam; a chave de uso único já protege contra duplicação.)
- **Validações → 400:** campos obrigatórios ausentes (lista em `campos`), `uso`
  inválido, `dono_eh_condutor`/`renovacao` fora de `true|false`, `cep_pernoite`
  inválido, `callback_url` não-HTTPS, arquivos obrigatórios faltando. Arquivo
  acima de 10MB → **413**; MIME não suportado → **400**.
- **Fluxo:**
  1. Cria a OS: `status:'extraindo_documentos'`, `nome` (coluna), `cep` (=
     `cep_pernoite` em dígitos), `cpf:null`, `placa:null` (a IA preenche depois),
     `api_key_id` (da chave validada), `idempotency_key`, e `dados_risco =
     { uso, estado_civil, dono_eh_condutor, renovacao, external_ref, callback_url,
     telefone }`. ⚠️ `telefone` **não tem coluna** em `os_cotacao` → vai em
     `dados_risco`.
  2. Mantém os arquivos **em memória** (não sobe no Storage aqui — quem faz isso é
     o `/extract`).
  3. Dispara o processamento **async (fire-and-forget)** via `fetch` para
     **`/quote/auto-com-docs`** (ver seção abaixo) com `x-secret-token`, passando
     `{ os_id, form, documentos:[{ tipo, base64, mimeType, tamanho, filename }] }`.
     A URL-base vem de `RAILWAY_URL` (fallback `http://127.0.0.1:$PORT`).
  4. Grava `audit_log` (`endpoint:/api/v1/cotacoes-com-docs`, `auth:api_key`,
     **payload mascarado sem binários** — `telefone:'***'`, `docs:N`,
     `callback_url` como booleano).
  5. Responde **202** imediato: `{ os_id, status:'extraindo_documentos',
     external_ref, message }`.
- **Log:** `[cotacao-com-docs] OS criada=X | placa=pendente | docs=Y arquivos`.
  Erros não-tratados vão para o **Sentry** (tag `component: cotacao-com-docs`).
- **Testes:** `tests/routes/cotacao-com-docs.test.js` (supertest + Supabase/multer
  mockados): 401 sem chave, 400 sem campos/sem `cnh_segurado`/sem `crlv`/
  `dono_eh_condutor=false` sem `cnh_condutor`/`callback_url` HTTP/`uso` inválido,
  202 criando OS + disparando worker + audit, 3 documentos, e replay 200 por
  Idempotency-Key.

### Worker de cotação com documentos — `/quote/auto-com-docs`

Endpoint **interno** que recebe os documentos (base64) + dados do formulário e
processa tudo num **Worker Thread**: extrai por IA, faz o merge, valida cruzado e
decide entre **cotar** ou mandar para **revisão manual**. É o passo seguinte do
`/api/v1/cotacoes-com-docs` (que o dispara). Rota em
`src/routes/quote-auto-com-docs.js`; lógica em
`src/workers/quote-com-docs-worker.js` (`processarComDocs`, exportada e testável).

- **Auth:** `x-secret-token` (`RAILWAY_SECRET_TOKEN`), igual ao `/quote/auto`.
  Sem token → **401**; sem `os_id` ou `documentos` vazio → **400**. Responde
  **202** imediato `{ accepted:true, os_id }` e processa em background.
- **Limite de payload (50mb):** o body traz os documentos em **base64** (grande),
  então **só esta rota** usa `express.json({ limit: '50mb' })`; as demais seguem
  no default de **100kb**. Em `src/index.js`, o parser de 50mb é montado **antes**
  do `express.json()` global no path `/quote/auto-com-docs` (o parser global pula
  bodies já parseados via `req._body`). Sem isso, o fluxo
  `/api/v1/cotacoes-com-docs → /quote/auto-com-docs` estourava
  **`PayloadTooLargeError: request entity too large`**.
- A rota obtém a **sessão** (`getSession`, p/ o `mcToken` do lookup FIPE) —
  *best-effort*: se o login falhar, segue sem token e o worker manda p/ revisão
  manual ao não validar a placa, em vez de travar a OS.

**Fluxo do worker (`processarComDocs`):**

1. **Extração paralela** — `Promise.all` chamando o endpoint interno
   `/extract/{cnh|crlv}` para cada documento (multipart com o arquivo decodificado
   + `os_id` + `tipo`). Cada chamada faz upload no Storage + IA + insert em
   `documentos_os`. **Qualquer falha** → OS vira **`erro`** com
   `"Falha na extração do documento: {tipo}. Erro: {detalhe}"`.
2. **Merge form + IA** — combina o formulário (nome, telefone, cep_pernoite,
   estado_civil, uso, dono_eh_condutor, renovacao) com a **CNH do segurado** (cpf,
   data_nascimento, sexo, validade_cnh), o **CRLV** (placa, chassi, marca, modelo,
   anos, cpf_proprietario) e a **CNH do condutor** (se houver). Monta `dados_risco`
   no formato v2 (`segurado`/`veiculo`/`condutor`).
3. **Validações cruzadas** — coleta TODOS os problemas:
   - **(a) Confiança IA** — campo crítico (`cpf`, `placa`, `data_nascimento`,
     `chassi`, `nome`) com confiança `< 0.7` (ou ausente) →
     `"Baixa confiança na extração do campo {campo}"`.
   - **(b) Nome form vs CNH** — similaridade `< 0.8` (via `utils/similaridade.js`)
     → `"Nome no formulário ('{form}') diferente do nome na CNH ('{cnh}')"`.
   - **(c) CNH do segurado vencida** — `validade_cnh < hoje` →
     `"CNH do segurado vencida em {data}"`.
   - **(d) CNH do condutor vencida** (se aplicável) → idem para o condutor.
   - **(e) CPF proprietário ≠ CPF segurado com `dono_eh_condutor=true`** →
     `"CPF do proprietário no CRLV (...) diferente do CPF do segurado na CNH (...),
     mas formulário indicou que dono é condutor"`.
   - **(f) Lookup FIPE** — `buscarFipePorPlaca(placa, mcToken)`; se não encontrar →
     `"Não foi possível identificar o veículo via lookup FIPE pela placa {placa}"`.
     Se encontrar, o `fipe` (e ano/chassi faltantes) **enriquece** o payload.
4. **Decisão** — atualiza a OS com `placa`/`cpf`/`dados_risco` e:
   - **Sem problemas** → `status='cotando'` e **dispara a cotação real** via
     `POST /quote/auto` (reaproveita o worker de cotação existente) com o payload
     v2. Se o disparo falhar, a OS vira `erro`.
   - **Com problemas** → `status='revisao_manual'`, `error_message` = todos os
     problemas concatenados por `\n` (mensagens amigáveis).
- **Logs:** `[quote-com-docs] OS={id} iniciando extração de {N} documentos` /
  `... extração concluída em {ms}ms` / `... validações cruzadas: {N} problemas
  encontrados` / `... → revisão manual` ou `... → cotando`. Erros não-tratados →
  **Sentry** (tags `component: quote-com-docs-worker`, `os_id`).
- **`src/utils/similaridade.js`** — `compararNomes(a, b)` → `{ similaridade
  (0–1), igual (≥0.8) }`. Normaliza (lowercase, sem acentos, sem pontuação, sem
  conectivos `da/de/do/...`) e usa **Levenshtein normalizado** (`1 −
  distância/maxLen`). Também exporta `normalizar` e `levenshtein`.
- **Testes:** `tests/workers/quote-com-docs-worker.test.js` (fluxo feliz →
  cotando; falha de extração → erro; confiança baixa / CNH vencida / nome
  divergente / FIPE ausente / CPF divergente → revisão manual; múltiplos problemas
  listados), `tests/routes/quote-auto-com-docs.test.js` (401, 400 sem os_id, 202,
  worker disparado), `tests/utils/similaridade.test.js` e
  `tests/routes/payload-limit.test.js` (regressão do limite: 202 com body > 100kb
  na rota de docs, 413 em rota default).

## Estrutura do backend (Node.js)

```
bem-seguro-hub/
  src/
    index.js              # Express + boot + warm-up
    routes/
      health.js
      quote.js            # POST /api/v1/cotacoes, GET /api/v1/cotacoes/:id
      lookup.js           # POST /api/v1/lookup/placa
      session.js          # GET /session/status (estado da sessão p/ o painel, CORS)
      extract.js          # POST /extract/cnh, /extract/crlv (upload + Claude API)
      cotacao-com-docs.js # POST /api/v1/cotacoes-com-docs (multipart CRM + docs)
      quote-auto-com-docs.js # POST /quote/auto-com-docs (dispara o worker de docs)
    prompts/
      cnh.md              # Prompt de extração da CNH (instruções p/ a Claude API)
      crlv.md             # Prompt de extração do CRLV
    services/
      aggilizador.js      # login, calcularV2, montagem de payload
      anthropic.js        # Wrapper da Claude API (extrairDocumento, parse robusto)
      session.js          # Cache de token compartilhado (TTL 55min)
      fipe.js             # 4 estratégias de resolução FIPE
      supabase.js         # Client Supabase (service_role)
    workers/
      quote-worker.js     # Worker Thread: cotação + polling + save
      quote-com-docs-worker.js # Worker: extração IA + merge + validação cruzada + decisão
    utils/
      parsers.js          # parseDataNasc, parseEstadoCivil, parseSexo, etc.
      auth.js             # Middleware de API key
      logger.js           # Log estruturado com contexto
      similaridade.js     # compararNomes (Levenshtein) p/ validação cruzada
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

> ⚠️ **Build time, não runtime.** O Vite **embeda** essas variáveis no bundle
> durante `npm run build:admin` — elas precisam existir **no build do Docker**, não
> só no runtime do container. Por isso o Dockerfile declara `ARG VITE_SUPABASE_URL`
> / `ARG VITE_SUPABASE_ANON_KEY` (→ `ENV`) no stage `admin-build`, **antes** do
> `RUN npm run build:admin`. Se faltarem no build, o bundle sai vazio e o painel
> quebra em produção com **`supabaseUrl is required`**. No **Railway**, variáveis
> com prefixo `VITE_` definidas no painel são passadas como **build args**
> automaticamente quando há um `ARG` correspondente no Dockerfile (não basta
> configurá-las só como env de runtime).

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
  O avatar é um botão que abre um **dropdown** (ancorado à direita, fecha com
  clique fora ou `ESC`) com duas opções: **Meu perfil** (navega para
  `/admin/perfil` via `useNavigate`) e **Sair** (chama `supabase.auth.signOut()`,
  mostra "Saindo…" e redireciona para `/admin/login`). Migrado para tokens OKLCH.
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
- `/admin/ajuda` — Ajuda & Documentação (Tela 11). Componente `pages/Ajuda.jsx`.
- `/admin/perfil` — Meu Perfil / Conta do Operador (Tela 12). Componente
  `pages/MeuPerfil.jsx`. Acessível pelo **dropdown do avatar** (não tem item na
  Sidebar). Cada usuário vê só a própria conta (garantido pelo `ProtectedRoute`).
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
    painel), header "X de Y ativas" + **dropdown de Janela (24h / 7 / 30 dias,
    padrão 7)**, e um card por seguradora (sigla colorida, nome + slug,
    "Configurada", **métricas reais** via `getMetricasTodas` — taxa de retorno com
    cor por faixa ≥90 verde/≥85 azul/<85 âmbar + tooltip da aproximação, tempo
    médio, último sucesso, erros 24h "global"; **loading** com skeleton ao trocar
    a janela; **"Sem dados suficientes"** quando não há cotações no período),
    toggle Ativo/Inativo que faz UPDATE em `seguradoras.ativa`, engrenagem
    placeholder). Inativa = card com opacidade reduzida. Skeleton no load e estado
    vazio.
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
    de sucesso global, **sessão Aggilizador real** via `GET /session/status`,
    erros 24h), gráfico "Cotações por dia"
    (30 dias, barras CSS proporcionais ao máximo), "Taxa de sucesso por
    seguradora" (barras horizontais) e lista "Erros recentes" (24h). **Queries
    reais** (sem mock), skeleton no load, **auto-refresh a cada 60s** e estado de
    erro. (O card "Sessão Aggilizador" segue **placeholder** — mesmo widget da
    Sidebar/API Keys — até existir endpoint de TTL real.)
  - `Ajuda.jsx` — Tela 11 (Central de Ajuda & Documentação). Layout em duas
    colunas: índice navegável à esquerda (busca com **debounce 300ms**, 9 seções
    numeradas 01–09 com ícone, item ativo realçado, card "Precisa de ajuda?" com
    atalho para o Runbook) + artigo à direita. Mostra **um artigo por vez** na
    tela (clique no índice ou no botão "Próximo" troca o artigo); todos os
    artigos ficam no DOM para o **`@media print`** revelar o guia inteiro.
    Cada artigo tem breadcrumb, "Seção XX", título, corpo (parágrafos, listas,
    passos, callouts info/atenção/perigo/dica, blocos de código com copiar,
    tabelas, glossário, FAQ, placeholders de screenshot) e footer com
    "Próximo" + "Última atualização". Botão **"Imprimir guia"** no header e
    **"Imprimir runbook"** na seção 08 (CSS de impressão esconde sidebar/topbar/
    índice). Conteúdo vem de `data/ajuda.js` (ver abaixo). **Sem dados do
    Supabase** — é conteúdo estático.
  - `MeuPerfil.jsx` — Tela 12 (Meu Perfil / Conta do Operador). Banner de
    identidade (avatar com iniciais, nome, papel, selo "Visível apenas para
    você") + 3 blocos: **Dados da conta** (somente leitura — nome, e-mail "não
    editável", papel, último login com tempo relativo, data de criação; lidos de
    `supabase.auth.getUser()` → `email`, `user_metadata.full_name`, `created_at`,
    `last_sign_in_at`), **Trocar senha** (senha atual/nova/confirmar com
    validação client-side: atual obrigatória, nova ≥8 e ≠ atual, confirmação
    bate; ao salvar faz `signInWithPassword` p/ checar a atual e depois
    `updateUser({ password })`; medidor de força + estados verde/vermelho inline)
    e **Histórico de atividade** (via `lib/perfil.js`, ver abaixo). Skeleton no
    load. Acessível só pelo próprio usuário (não há "admin vê outro perfil").
  - Todas as telas do design (01–09 + 11/Ajuda + 12/Meu Perfil) implementadas.

- O badge ao lado de "Ordens de Serviço" na Sidebar mostra o total de OS com
  status `pendente`/`cotando` (via `lib/osStats.js`, atualizado a cada 60s).

### Conteúdo da Ajuda (Tela 11)

O texto das 9 seções vive **separado do componente**, como estrutura de dados em
`admin/src/data/ajuda.js` (exporta `SECOES` + `LAST_UPDATED`). O `Ajuda.jsx` só
renderiza — para editar/adicionar conteúdo, mexa **apenas no `data/ajuda.js`**.

- Cada seção: `{ id, num, label, icon, kw, title, lead, blocks }`. `icon` é uma
  chave de `components/Icons.jsx`; `kw` são palavras-chave extras para a busca do
  índice (a busca casa em `label + title + kw`).
- `blocks` é uma lista de blocos tipados renderizados por um `Block` em
  `Ajuda.jsx`. Tipos: `p`, `h3` (com `id` opcional p/ âncora), `ul`, `steps`,
  `callout` (`variant: info|atencao|perigo|dica`), `code` (`label`/`lang`/`code`),
  `shot` (placeholder de screenshot), `glossary`, `faq`, `table`, `statuses`
  (badges de status), `printRunbook` (botão de imprimir só o runbook).
- **Markup inline** dentro dos textos: `**negrito**`, `` `mono` ``, `{kbd:F5}`,
  `{badge:cotando|Cotando}` (badge de status), `{ok:Ativa}` (verde) e `{star}`
  (asterisco laranja de campo obrigatório). O campo `code` é renderizado cru.
- Para adicionar uma seção nova: acrescente um objeto em `SECOES` (novo `id`/`num`)
  — ela aparece automaticamente no índice e na navegação "Próximo". Para um tipo de
  bloco novo, adicione o `case` correspondente no `Block` de `Ajuda.jsx`.
- A data de "Última atualização" exibida nos artigos vem de `LAST_UPDATED`.
- A rota é `/admin/ajuda` (item "Ajuda & Docs" na Sidebar, via `lib/nav.js`).

### Meu Perfil (Tela 12) — histórico de atividade

Em `admin/src/lib/perfil.js`:

- **`carregarHistorico(limit = 20)`** — `audit_log` `select(id,endpoint,method,
  response_status,request_payload,created_at)` filtrando **`request_payload->>auth
  = 'painel'`** (filtro JSONB via `.eq('request_payload->>auth','painel')`),
  `order created_at desc` `limit 20`. Cada linha é normalizada por
  **`descreverAtividade(r)`** → `{ ico, tone, text, sub }` (recotar → "Recotou a
  OS-XXXXXX"; disparo com `placa` → "Disparou cotação para a placa …"; status
  ≥400 → "Falha em …"; fallback genérico).
- **Aproximação do histórico (Opção A):** o `audit_log` **não tem `user_id`**. As
  ações do painel chegam com **JWT** (não API key), então `api_key_id` é nulo e
  não identifica quem agiu. Usamos `request_payload->>auth = 'painel'`, que traz o
  **histórico GERAL do painel** (todas as ações via Hub), não por usuário — a tela
  deixa isso explícito ("Mostrando o histórico geral do painel").
- **Papel/role** é fixo **"Operador"** (placeholder) — não há RBAC no piloto.

**TODOs (Tela 12):**
- **RBAC real:** hoje o piloto usa acesso único e o papel é sempre "Operador".
  Introduzir papéis (ex.: Operador/Administrador) e refletir em `MeuPerfil` e nas
  permissões quando houver RBAC.
- **`user_id` no `audit_log`:** adicionar coluna `user_id` (preenchida com o id do
  JWT na Edge Function) para o histórico ser **por usuário** (Opção B), em vez do
  filtro global atual por `request_payload->>auth = 'painel'`.

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
- `cancelarOS(id)` — `os_cotacao update status='cancelada'` **+ `.select('id')`**
  para confirmar que a linha foi alterada. Se vier **0 linhas sem erro** (caso
  típico de RLS sem policy de UPDATE), **lança** — antes o botão "Cancelar" não
  fazia nada silenciosamente (update bloqueado, sem erro no console). Usado pelo
  detalhe (com estado `cancelando` no botão) e pelo menu de cada linha da lista.
- `lib/osStats.js` `contarOSAtivas()` — `count` de `os_cotacao` com
  `status in ('pendente','cotando')` (badge da Sidebar).

**RLS necessária para cancelar (UPDATE em `os_cotacao`):** as leituras já
funcionam, mas **cancelar exige uma policy de UPDATE** para o usuário autenticado
do painel — caso contrário o update é descartado em silêncio (0 linhas, sem
erro). Criar no Supabase (mudança manual, fora do alcance do Claude Code):

```sql
create policy "os_cotacao_update_auth" on os_cotacao
  for update to authenticated using (true) with check (true);
```

> Idealmente restringir ao necessário (ex.: só permitir transição para
> `cancelada`) ou expor o cancelamento por uma Edge Function `os-cancel`
> (service_role) em vez de UPDATE direto do client.

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
- **`getMetricas(seguradora, janelaDias=7)`** / **`getMetricasTodas(seguradoras,
  janelaDias=7)`** — métricas **reais** agregadas de `cotacoes` + `os_cotacao` no
  período. `getMetricasTodas` faz **2 queries em batch** (OSs do período +
  `cotacoes ... .in('seguradora', nomes)`) e devolve `{ [nome]: metricas }`;
  `getMetricas` é a versão de 1 seguradora (2 queries, `.eq('seguradora')`). A
  janela é filtrada no SQL (`gte created_at`) **e** em JS (testável). Retorno:
  `{ taxaRetorno|null, tempoMedio|null, ultimoSucesso|null, erros24h, semDados,
  amostra }`. Métricas por seguradora:
  - **Taxa de retorno (%)** — `count(OSs cotado no período com premio>0 dessa
    seguradora) / count(OSs cotado no período)`. **Aproximação:** como só há linha
    em `cotacoes` quando a seguradora **retornou** (não existe registro de "não
    respondeu"), assume-se que toda seguradora ativa participou de todas as OSs
    concluídas no período. Varia com a amostra (UI mostra tooltip "Calculada com
    base nas OSs cotadas no período. Pode variar conforme a amostra.").
  - **Tempo médio (s)** — média de `cotacao.created_at − os.created_at` das
    cotações da seguradora no período.
  - **Último sucesso** — `max(cotacoes.created_at)` com `premio>0` no período.
  - **Erros 24h** — contagem **global** de OSs `status='erro'` nas últimas 24h
    (mesmo número p/ todas: não há erro por seguradora). UI rotula "(global)".
  - **`semDados`** — `true` quando não há OSs concluídas no período ou a
    seguradora não tem cotações nele (ex.: ativada recentemente) → UI mostra
    "Sem dados suficientes no período".

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

As métricas por seguradora (taxa de retorno, tempo médio, último sucesso, erros
24h) são **reais** — agregadas de `cotacoes`/`os_cotacao` via `getMetricasTodas`
(ver acima). A janela é configurável no header (**24h / 7 dias / 30 dias**,
padrão 7). Ainda são **placeholder**: o botão "Testar conexões" e a engrenagem de
config de cada seguradora.

**RLS adicional p/ as métricas:** `getMetricas*` lê `os_cotacao` e `cotacoes` —
reusa as policies de SELECT `authenticated` já documentadas para essas tabelas
(ver Monitoring / Ordens). Sem elas, as métricas retornam vazio (cai em
"Sem dados suficientes").

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
| **Sessão Aggilizador**             | **Real** via `GET /session/status` (Railway). Rótulo/cor por TTL (verde >10min, amarelo 1–10min, vermelho expirada); sub "expira em MM:SS · última renovação há X". "Indisponível" (cinza) se o Railway não responder — carregado com `.catch(()=>null)`, independente das métricas. |
| **Erros (24h)**                    | `os_cotacao` `eq status='erro'` `gte 48h` → `count` na janela de 24h; delta = vs as 24h anteriores. |
| **Cotações por dia (30 dias)**     | `cotacoes` `gte 30d` → agrupa `created_at` por dia (série de 30 posições; heights proporcionais ao máximo, últimos 5 dias em destaque laranja). |
| **Taxa de sucesso por seguradora** | `cotacoes` `gte 30d` → por seguradora, `count(premio>0) / count(total)` (barras horizontais, ordenadas pela taxa). |
| **Erros recentes (24h)**           | `os_cotacao` `eq status='erro'` `gte 48h` `order updated_at desc` → linhas das últimas 24h (`error_message`, `numeroOS(id)`, tempo relativo). A seguradora é exibida como **"Aggilizador"** (erros de OS são globais — não há seguradora associada à OS). |

- **`checarRailway()`** — `fetch('https://bemseguro-production.up.railway.app/health')`
  (GET público, sem auth, direto do browser). `true` se 2xx; `false` em erro de
  rede/status → badge "Railway saudável" / "Railway indisponível" / "Verificando…".
- **`getSessionStatus()`** (`lib/sessionStatus.js`) — `fetch('…/session/status')`
  (GET público, sem auth). Devolve `{ ativa, expira_em, ttl_segundos,
  ultima_renovacao }`. Helpers no mesmo módulo: `formatTTL(seg)` → "MM:SS",
  `faixaSessao(estado)` → `{ nivel, cor, tint, badge, rotulo }` (verde >10min ·
  amarelo 1–10min · vermelho expirada), `TTL_TOTAL_S` (55min, p/ a barra).
  Usado pelo **widget da Sidebar** (`SessaoAggilizador`, auto-refresh 30s,
  fallback "Status indisponível") e pelo **card de Monitoring**.
- Ícone `wifi` adicionado a `components/Icons.jsx` (card de sessão).
- **RLS:** reusa as policies de SELECT já documentadas para `os_cotacao`,
  `cotacoes`, `audit_log` (esta última ainda **pendente** — ver Audit Log acima).

### Testes

- **Vitest + Testing Library** (jsdom), **separado do Jest do backend**.
- O Jest da API ignora `admin/` (via `jest.testPathIgnorePatterns`).
- Rodar com `cd admin && npm test`.

### Rodar o backend localmente

- Instalar deps: `npm install` (na raiz).
- Configurar o `.env` na raiz (ver "Variáveis de ambiente" abaixo) — sem
  `SUPABASE_*` / `AGGER_*` a API sobe, mas cotações e queries falham.
- Subir a API: **`npm run dev`** ou **`npm start`** — ambos rodam `node
  src/index.js` (são equivalentes; `dev` existe por convenção). A porta padrão é
  `8080` (`PORT` no `.env`) e a raiz `/` redireciona para `/admin`.
- Painel admin: build estático servido pela API em `/admin` após `npm run
  build:admin`, ou dev server do Vite com `npm run dev:admin` (ver "Painel admin").
- Testes do backend: `npm test` (Jest na raiz; ignora `admin/`).

### Build em produção (Docker)

- `Dockerfile` faz **multi-stage build**: o stage 1 instala as deps do admin e roda
  `npm run build:admin`; o stage 2 (runtime) copia apenas `admin/dist` para a imagem,
  sem carregar as devDependencies do front.
- O stage 1 (`admin-build`) declara `ARG VITE_SUPABASE_URL` / `ARG
  VITE_SUPABASE_ANON_KEY` e os promove a `ENV` **antes** do `RUN npm
  run build:admin`, para o Vite embedá-los no bundle. **No Railway, essas
  variáveis precisam estar configuradas como build args** (variáveis `VITE_` do
  painel viram build args automaticamente por causa do `ARG` correspondente) —
  só env de runtime não basta, senão o painel quebra com `supabaseUrl is
  required`. Ver "Variáveis de ambiente (Vite)" acima.

## Variáveis de ambiente

```env
# Railway
PORT=8080
RAILWAY_SECRET_TOKEN=<gerar com openssl rand -hex 32>
# Opcional: URL-base p/ o auto-disparo do worker em /api/v1/cotacoes-com-docs.
# Ausente => usa http://127.0.0.1:$PORT (chamada local, o caso normal no Railway).
RAILWAY_URL=

# Aggilizador
AGGER_LOGIN=<email corretora>
AGGER_SENHA=<senha corretora>

# Supabase
SUPABASE_URL=https://yixgolukvqbbjjkszhjg.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Anthropic
ANTHROPIC_API_KEY=<api key>           # usada pela extração de documentos (/extract)
ANTHROPIC_MODEL=claude-sonnet-4-5     # opcional; default do wrapper se ausente

# Sentry (monitoring de erros — vazio desativa)
SENTRY_DSN=<dsn do projeto Sentry>

# Ambiente
NODE_ENV=production
LOG_LEVEL=info
```

Nunca commitar `.env`. O `.env.example` lista as variáveis sem valores.

## Monitoring externo

- **Uptime Robot** monitora `GET /health` a cada **5 min** (endpoint público, sem
  auth) — alerta se o Railway cair.
- **Sentry** captura exceptions não-tratadas do backend, configurado via env
  `SENTRY_DSN`. Inicializado em `src/instrument.js`, carregado como **primeiro
  require** de `src/index.js` (antes de qualquer outro módulo). Cobre: erros de
  rota Express (`Sentry.setupExpressErrorHandler`), falhas dos Worker Threads de
  cotação (`captureException` nos listeners `error`/`exit` em `routes/quote.js`,
  tag `component: quote-worker`) e o retry esgotado do `calcularV2` em
  `services/aggilizador.js` (tag `component: aggilizador, operation: calcularV2`;
  o 401 de sessão é ignorado por ser fluxo tratado). `tracesSampleRate: 0` e
  `sendDefaultPii: false` (sem performance tracing nem PII).
- Para **testar localmente**, basta setar `SENTRY_DSN` no `.env`. Sem a variável,
  o Sentry fica **desativado** (log `[sentry] SENTRY_DSN não configurado`) e a
  aplicação roda normalmente.

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

2. **Idempotência compara dados persistidos, não o payload bruto.** Na criação de
   OS com `Idempotency-Key` (Edge Function `run-quote`), a checagem de "corpo
   igual" no replay compara `placa`/`cpf` + `dados_risco` **da OS já persistida**
   (via JSON canônico) — não o corpo cru da requisição. Para o fluxo do painel
   isso cobre 100% dos casos.

   ⚠️ **TODO** — se algum dia for necessário garantir comparação **byte-a-byte**
   do payload original (ex.: integração com CRMs que enviam campos extras que não
   são persistidos em `dados_risco`), adicionar uma coluna **`request_hash`**
   (SHA-256 do body) em `os_cotacao` e comparar por ela em vez dos campos
   persistidos. Ver a checagem de idempotência em
   `edge-functions/run-quote-definitiva.ts` e a migração
   `db/migrations/004-os-idempotency.sql`.

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