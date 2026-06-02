# Testes manuais — Idempotência da Edge Function `run-quote`

As Edge Functions rodam em Deno no Supabase (imports de `esm.sh`/`deno.land`,
globais `Deno`/`serve`) e **não** são executadas pelo Jest/Vitest deste repo.
Por isso, os cenários de idempotência são verificados **manualmente** (curl ou o
painel). A lógica relacionada está em
[`edge-functions/run-quote-definitiva.ts`](../../edge-functions/run-quote-definitiva.ts)
e o schema em
[`db/migrations/004-os-idempotency.sql`](../../db/migrations/004-os-idempotency.sql).

> Pré-requisitos: migração 004 aplicada; função deployada; um JWT de painel
> autenticado **ou** uma `x-api-key` válida. Substitua `URL`, `TOKEN` e o corpo.

```sh
URL="https://<project>.supabase.co/functions/v1/run-quote"
AUTH="Authorization: Bearer <JWT_DO_PAINEL>"        # ou: "x-api-key: <CHAVE>"
BODY='{"ramo":"auto","segurado":{"nome":"Teste","cpf":"12345678900","cep":"98700000"},"veiculo":{"placa":"JCU9D37","modelo":"VW POLO","fipe":"005954-9"}}'
```

## 1. Mesma `Idempotency-Key` + mesmo corpo → mesma OS (replay)

```sh
# 1ª chamada — cria a OS (HTTP 202)
curl -i -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" \
  -H "Idempotency-Key: teste-abc-001" -d "$BODY"

# 2ª chamada idêntica — NÃO cria nova OS
curl -i -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" \
  -H "Idempotency-Key: teste-abc-001" -d "$BODY"
```

**Esperado na 2ª chamada:**
- Status **200** (não 202).
- Header **`Idempotent-Replayed: true`**.
- Mesmo `os_id` da 1ª chamada.
- Apenas **uma** linha em `os_cotacao` com `idempotency_key = 'teste-abc-001'`.

## 2. Mesma `Idempotency-Key` + corpo diferente → 409 Conflict

```sh
BODY2='{"ramo":"auto","segurado":{"nome":"Outro","cpf":"99999999999","cep":"01001000"},"veiculo":{"placa":"ABC1D23","modelo":"FIAT ARGO","fipe":"003318-2"}}'

curl -i -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" \
  -H "Idempotency-Key: teste-abc-001" -d "$BODY2"
```

**Esperado:**
- Status **409**.
- Corpo com `error: "Idempotency-Key já utilizada nas últimas 24h com um corpo diferente"`
  e o `os_id` original.
- Nenhuma OS nova criada.

## 3. Sem o header → comportamento atual (sem mudança)

```sh
curl -i -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" -d "$BODY"
curl -i -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" -d "$BODY"
```

**Esperado:** ambas retornam **202** e criam **duas** OS distintas
(`idempotency_key` nulo nas duas). Sem header → sem idempotência.

## 4. Clique duplo / corrida (mesma chave em paralelo) → uma OS só

```sh
# dispara duas em paralelo com a mesma chave nova
curl -s -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" \
  -H "Idempotency-Key: teste-corrida-002" -d "$BODY" &
curl -s -X POST "$URL" -H "$AUTH" -H "Content-Type: application/json" \
  -H "Idempotency-Key: teste-corrida-002" -d "$BODY" &
wait
```

**Esperado:** as duas respostas apontam para o **mesmo `os_id`**; apenas uma OS é
criada. O índice único parcial `os_cotacao_idempotency_key_uidx` faz a 2ª inserção
falhar com `23505`, e a função responde com o replay (200 + `Idempotent-Replayed: true`).

---

## Cobertura automatizada relacionada (Vitest)

O lado do **frontend** é coberto automaticamente em
[`admin/src/pages/__tests__/NovaCotacao.test.jsx`](../../admin/src/pages/__tests__/NovaCotacao.test.jsx):

- `gerarIdempotencyKey` gera chaves únicas com prefixo `painel-` (formato uuid v4);
- `NovaCotacao` envia uma `Idempotency-Key` `painel-<uuid>` ao criar a OS;
- cada sessão de formulário usa uma `Idempotency-Key` distinta (chave estável por
  sessão → clique duplo reusa a mesma e não duplica a OS).
