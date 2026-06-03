# Armazenamento de documentos (CNH e CRLV)

Infraestrutura para guardar os documentos do cliente (CNH do segurado, CNH do
condutor e CRLV do veículo) que a IA lê e extrai durante a integração CRM + IA.

- **Arquivos** (binários) → **Supabase Storage**, bucket privado `documentos-clientes`.
- **Metadados + resultado da extração** → tabela `documentos_os` (Postgres), criada
  pela migration [`db/migrations/006-documentos-os.sql`](../db/migrations/006-documentos-os.sql).

> O Postgres guarda **só a referência** ao arquivo (`storage_bucket` +
> `storage_path`), nunca o binário. Isso mantém o banco leve e centraliza o
> controle de acesso no Storage.

---

## Tabela `documentos_os`

| Coluna             | Tipo                    | Notas                                                        |
|--------------------|-------------------------|--------------------------------------------------------------|
| id                 | uuid PK                 | `gen_random_uuid()`                                          |
| os_id              | uuid FK → os_cotacao    | `ON DELETE CASCADE` (apaga os docs junto com a OS)           |
| tipo               | text                    | `cnh_segurado` \| `cnh_condutor` \| `crlv` (CHECK)           |
| storage_path       | text                    | Caminho do arquivo dentro do bucket                          |
| storage_bucket     | text                    | default `documentos-clientes`                                |
| mime_type          | text nullable           | Ex.: `image/jpeg`, `application/pdf`                         |
| tamanho_bytes      | integer nullable        |                                                              |
| dados_extraidos    | jsonb nullable          | Resultado da extração pela IA                                |
| confianca_extracao | numeric(3,2) nullable   | 0.00–1.00 (confiança da IA na extração)                      |
| revisado           | boolean                 | default `false`                                              |
| revisado_por       | uuid FK → auth.users    | Quem revisou (nullable até a revisão)                        |
| revisado_em        | timestamptz nullable    |                                                              |
| created_at         | timestamptz             | default `now()`                                              |
| updated_at         | timestamptz             | default `now()`, mantido por trigger                         |

**RLS** (igual às demais tabelas do painel): o usuário **autenticado** pode
`SELECT`/`INSERT`/`UPDATE` os metadados. A escrita do **arquivo** no Storage,
porém, é exclusiva do `service_role` (ver políticas do Storage abaixo).

---

## Bucket `documentos-clientes`

- **Privado** — sem acesso público; nenhum arquivo é servido por URL aberta.
- O acesso aos arquivos é feito sempre **pelo backend com a service_role**
  (download direto ou URL assinada de curta duração), nunca pelo browser direto.

### Estrutura de paths

```
{os_id}/{tipo}-{timestamp}.{ext}
```

Exemplos:

```
abc123e4-.../cnh_segurado-20260603.jpg
abc123e4-.../cnh_condutor-20260603.jpg
abc123e4-.../crlv-20260603.pdf
```

Agrupar por `os_id` (uma "pasta" por OS) facilita listar/limpar todos os
documentos de uma OS de uma vez e casa com o `ON DELETE CASCADE` da tabela.

### Retenção

**Política: reter por 5 anos a partir de `created_at`.** Ainda **não
automatizada** — hoje é só uma diretriz. Quando for implementada, varrer
`documentos_os` por `created_at < now() - interval '5 years'`, remover o objeto
do Storage e a linha (ou expor uma Edge Function / pg_cron agendado para isso).

---

## Como criar o bucket manualmente (Supabase Dashboard)

> Passo manual — **o Claude Code não cria o bucket**; o operador cria no Dashboard.

1. No Supabase Dashboard, abra **Storage** no menu lateral.
2. Clique em **New bucket**.
3. **Name:** `documentos-clientes` (exatamente este — é o default da coluna
   `storage_bucket`).
4. **Public bucket:** deixe **DESMARCADO** (bucket privado).
5. (Opcional) **Restrict file MIME types:** `image/jpeg, image/png, application/pdf`.
   **File size limit:** ex. `10 MB`.
6. Clique em **Create bucket**.
7. Confirme que o bucket aparece com o cadeado de **privado** (não "Public").

---

## Política de RLS do Storage (somente service_role)

Os objetos do Storage vivem na tabela `storage.objects`, que também tem RLS.
Como o bucket é privado e **todo acesso passa pelo backend (service_role)**, a
postura é: **nenhuma policy para `anon`/`authenticated`** neste bucket. O
`service_role` **ignora RLS** (bypassa as policies), então não precisa de policy
explícita para funcionar — basta **não** criar policies que liberem os outros
roles.

Em outras palavras: por padrão, sem nenhuma policy de Storage para este bucket,
**só o service_role consegue ler/escrever**, que é exatamente o desejado. Não
crie policies de `SELECT`/`INSERT` em `storage.objects` para `documentos-clientes`.

> Se algum dia o painel precisar exibir os documentos direto do browser, **não**
> torne o bucket público nem libere `authenticated` no Storage. Em vez disso, o
> backend gera uma **URL assinada** de curta duração (ver abaixo) e o front usa
> essa URL temporária.

Caso queira ser explícito e travar o bucket via SQL (defensivo — opcional):

```sql
-- Bloqueio explicito do bucket documentos-clientes para anon/authenticated.
-- (service_role bypassa RLS e segue tendo acesso total.)
create policy "documentos_clientes_no_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id <> 'documentos-clientes');
```

> Em geral isso **não é necessário** — basta não criar policies liberando o
> bucket. Use só se já houver uma policy ampla em `storage.objects` que precise
> ser excepcionada.

---

## Como acessar os arquivos via service_role no backend

O backend já usa o client com a **service_role key** em
[`src/services/supabase.js`](../src/services/supabase.js) (`getSupabase()`).
A API de Storage sai do mesmo client.

### Upload (gravar um documento)

```js
const { getSupabase } = require('../services/supabase');

async function salvarDocumento(osId, tipo, buffer, { mimeType, ext }) {
  const supabase = getSupabase();
  // timestamp via Date no backend (no Postgres usamos now()).
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const path = `${osId}/${tipo}-${stamp}.${ext}`;

  const { error } = await supabase.storage
    .from('documentos-clientes')
    .upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) throw error;

  // Grava a referencia + metadados na tabela.
  const { data, error: dbErr } = await supabase
    .from('documentos_os')
    .insert({
      os_id: osId,
      tipo,
      storage_path: path,
      storage_bucket: 'documentos-clientes',
      mime_type: mimeType,
      tamanho_bytes: buffer.length,
    })
    .select('id')
    .single();
  if (dbErr) throw dbErr;
  return data.id;
}
```

### Download (ler o arquivo, ex. para mandar à IA)

```js
const supabase = getSupabase();
const { data, error } = await supabase.storage
  .from('documentos-clientes')
  .download(storagePath);            // storagePath vindo de documentos_os
if (error) throw error;
const buffer = Buffer.from(await data.arrayBuffer());
// buffer -> enviar para a extracao (Claude API / OCR)
```

### URL assinada (exibir no painel sem tornar o bucket público)

```js
const supabase = getSupabase();
const { data, error } = await supabase.storage
  .from('documentos-clientes')
  .createSignedUrl(storagePath, 60); // expira em 60s
if (error) throw error;
// data.signedUrl -> entregue ao front; expira sozinha.
```

> A geração da URL assinada acontece **no backend** (service_role). O front
> recebe só a URL temporária — a service_role key nunca vai para o browser.
