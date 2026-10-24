# Subprojeto G — Pedidos online: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir pedidos de **retirada** e **entrega** pelo link do restaurante, pagos na entrega/retirada, aceitos ou recusados pela equipe, com alerta de pedido novo — sem mudar o pedido de mesa.

**Architecture:** O pedido existente ganha um tipo (`fulfillment`: mesa/retirada/entrega). Uma migration nova (`011_online_orders.sql`) adiciona colunas, `delivery_zones`, `order_addresses`, novos status e substitui `place_guest_order`, `advance_order`, `save_restaurant_settings` e `consume_public_rate_limit`. Regras de fluxo e cálculo ficam em funções puras (`src/lib/order-flow.ts`, `src/lib/online-order.ts`) usadas pela API, pelo checkout, pelo acompanhamento e pelo novo quadro da gestão (`src/components/order-board.tsx`).

**Tech Stack:** Next.js 16.4 (App Router, webpack), React 19, TypeScript 6, Supabase (Postgres/RLS/Realtime), Zod 4, PGlite (testes de banco), `node:test` com transpilação TS (`scripts/lib/ts-loader.mjs`), Playwright 1.64.

Spec: `docs/superpowers/specs/2026-10-24-g-pedidos-online-design.md`.

## Global Constraints

- Trabalhar somente em `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/g-pedidos-online`. Nunca editar, fazer checkout ou rodar servidor em `C:\Users\medei\OneDrive\Desktop\work\mvp-web` (o Codex trabalha lá no `main`).
- Servidor de teste sempre na porta **3101** (`.env.development.local` e `.env.production.local` já definem `NEXT_PUBLIC_APP_URL=http://localhost:3101`). Playwright sempre com `PLAYWRIGHT_BASE_URL=http://localhost:3101 PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe"`.
- Build sempre `npm run build -- --webpack`.
- Nunca alterar migrations 001–010; tudo novo vai em `supabase/migrations/011_online_orders.sql`. Não aplicar a migration no Supabase hospedado (isso é decisão do usuário, depois do merge).
- Pedido de mesa (`/r/<slug>?mesa=N`) deve continuar idêntico em comportamento e contrato; testes de banco e Playwright existentes devem continuar passando (falha pré-existente conhecida: `tests/management-auth.spec.ts:38`, 401 vs 403).
- Preço, taxa, total, bairro, mínimo e troco sempre validados/calculados no servidor; o cliente só envia `expected_price` como hoje.
- Pagamento só na entrega/retirada: `dinheiro` | `cartao` | `pix`. Sem agendamento, mapas, Pix online, cupons ou impressão.
- Endereço é dado pessoal: tabela `order_addresses`, leitura só por membros do restaurante e pela sessão do pedido; nunca em logs.
- Nada de `console.*` em `src/`; logs só pelo `logger` com eventos/operações/códigos da lista fechada de `src/lib/observability/core.ts`.
- A demonstração (`/r/demo`, `/demo/gestao`) continua apenas com mesa.
- Commits terminam com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Adicionar arquivos ao git explicitamente; nunca commitar `.env*` nem `next-env.d.ts`.
- Antes de usar API do Next, conferir `node_modules/next/dist/docs/` (versão difere do treino).
- Testes `RUN_CONNECTED_LIVE=1` tocam o Supabase real: só com autorização explícita do usuário (e exigem a migration 011 aplicada lá).

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `supabase/migrations/011_online_orders.sql` | Criar | Schema, RLS e funções do pedido online |
| `scripts/lib/test-db.mjs` | Criar | Inicializa PGlite com papéis e migrations (compartilhado) |
| `scripts/test-database.mjs` | Modificar | Usar `test-db.mjs`; incluir migration 011 |
| `scripts/test-online-orders.mjs` | Criar | Verificações de banco do pedido online |
| `src/lib/order-flow.ts` | Criar | Tipos de status/tipo, rótulos, ações e etapas por tipo |
| `src/lib/online-order.ts` | Criar | Totais, troco, mensagem/link do WhatsApp |
| `src/lib/order-alerts.ts` | Criar | Regra pura do alerta |
| `scripts/test-online.mjs` | Criar | Unitários das três libs acima |
| `src/lib/connected-types.ts` | Modificar | Tipos de zona, pedido e catálogo |
| `src/lib/catalog.ts` | Modificar | Zonas no catálogo; chave `v2` |
| `src/lib/observability/core.ts`, `src/lib/client-api.ts` | Modificar | Novos códigos de erro e mensagens |
| `src/lib/rate-limit.ts` | Modificar | Escopo `order_online` |
| `src/app/api/restaurants/[id]/orders/route.ts` | Modificar | Payload por tipo |
| `src/app/api/restaurants/[id]/orders/[orderId]/route.ts` | Modificar | GET com endereço/pagamento; PATCH com novas transições |
| `src/app/api/restaurants/[id]/catalog/route.ts` | Modificar | Ação `save_delivery_zone`; settings com modalidades |
| `src/app/api/restaurants/[id]/workspace/route.ts` | Modificar | Zonas, endereço e "cliente novo" |
| `src/components/demo-provider.tsx` | Modificar | Tipo `Checkout` estendido |
| `src/components/connected-menu-provider.tsx` | Modificar | Envio do pedido online |
| `src/components/fulfillment-fields.tsx` | Criar | Campos de retirada/entrega/pagamento do checkout |
| `src/components/menu-app.tsx` | Modificar | Checkout usa os campos novos quando sem mesa |
| `src/components/connected-tracking.tsx` | Modificar | Etapas e textos por tipo |
| `src/components/order-board.tsx` | Criar | Quadro de pedidos com aceite/recusa/WhatsApp |
| `src/components/delivery-settings.tsx` | Criar | Modalidades, mínimo e bairros |
| `src/components/use-order-alerts.ts` | Criar | Som, título e notificação |
| `src/components/connected-admin.tsx` | Modificar | Usar `OrderBoard`, `DeliverySettings`, alertas |
| `src/app/privacidade/page.tsx`, `src/app/r/[slug]/privacidade/page.tsx` | Modificar | Endereço de entrega |
| `tests/online-orders-live.spec.ts` | Criar | Fluxo completo opt-in no Supabase real |
| `package.json` | Modificar | Scripts `test:online` e `test:database` |
| `PRODUCT.md`, `docs/CONTEXTO-PARA-CLAUDE-CODE.md` | Modificar | Delivery deixa de ser fora do MVP |

---

### Task 1: Migration 011 e verificações de banco

**Files:**
- Create: `supabase/migrations/011_online_orders.sql`
- Create: `scripts/lib/test-db.mjs`
- Modify: `scripts/test-database.mjs` (linhas 1–42: inicialização)
- Create: `scripts/test-online-orders.mjs`
- Modify: `package.json` (script `test:database`)

**Interfaces:**
- Produces (SQL): colunas `restaurants.pickup_enabled`, `delivery_enabled`, `delivery_min_order_cents`; tabela `delivery_zones(id, restaurant_id, name, fee_cents, estimate_minutes, active, position)`; colunas `orders.fulfillment`, `delivery_fee_cents`, `payment_method`, `change_for_cents`; `orders.table_id` anulável; tabela `order_addresses(order_id, restaurant_id, zone_id, zone_name, street, number, complement, reference)`; status `aguardando_aceite`, `recusado`, `saiu_para_entrega`.
- Produces (RPC): `place_guest_order(p_restaurant, p_token_hash, p_key, p_payload)` aceitando `fulfillment`, `payment_method`, `change_for_cents`, `address{zone_id,street,number,complement,reference}`, retornando `{id, number, total_cents, status}`; `advance_order(...)` com as transições da spec; `save_delivery_zone(p_restaurant, p_id, p_name, p_fee, p_estimate, p_active, p_position) → uuid`; `save_restaurant_settings` aceitando `pickup_enabled`, `delivery_enabled`, `delivery_min_order_cents`; `consume_public_rate_limit` aceitando `order_online` (12 por janela).
- Produces (JS): `createTestDatabase(): Promise<PGlite>` em `scripts/lib/test-db.mjs`.
- Erros novos (texto da exceção): `PICKUP_DISABLED`, `DELIVERY_DISABLED`, `INVALID_ZONE`, `INVALID_ADDRESS`, `BELOW_MINIMUM`, `INVALID_PAYMENT`, `INVALID_CHANGE`.

- [ ] **Step 1: Extrair a inicialização do PGlite**

Criar `scripts/lib/test-db.mjs` com o bloco que hoje está no topo de `scripts/test-database.mjs` (criação de papéis/esquemas e o laço de migrations), acrescentando a 011:

```js
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const MIGRATIONS = [
  "001_foundation.sql",
  "002_connected_management.sql",
  "003_video_observations.sql",
  "004_cart_associations.sql",
  "005_video_storage.sql",
  "006_photo_observations.sql",
  "007_product_options.sql",
  "008_product_feedback.sql",
  "009_social_feedback.sql",
  "010_pilot_rate_limits.sql",
  "011_online_orders.sql",
];

// Supabase-owned schemas/roles are represented locally; business SQL is unchanged.
export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 -- Test-only digest stand-in: PGlite lacks pgcrypto. Cryptography is not tested here.
 create function extensions.digest(text,text) returns bytea language sql immutable as $$select convert_to(md5($1),'UTF8')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
`);
  for (const file of MIGRATIONS) {
    const sql = readFileSync(
      new URL("../../supabase/migrations/" + file, import.meta.url),
      "utf8",
    )
      .replace("create extension if not exists pgcrypto;", "")
      .replace(
        "alter publication supabase_realtime add table public.orders;",
        "",
      );
    await db.exec(sql);
  }
  return db;
}
```

Em `scripts/test-database.mjs`, substituir as linhas desde `import { PGlite } …` até o fim do laço `for (const file of [...]) { … }` por:

```js
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";
const db = await createTestDatabase();
let count = 0;
```

(Remover a importação de `readFileSync` se o restante do arquivo não a usar — conferir com `grep -n readFileSync scripts/test-database.mjs`.)

Em `package.json`, trocar o script por:

```json
"test:database": "node scripts/test-database.mjs && node scripts/test-online-orders.mjs",
```

- [ ] **Step 2: Escrever as verificações de banco (falham sem a migration)**

Criar `scripts/test-online-orders.mjs`:

```js
import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "10000000-0000-4000-8000-0000000000a1",
  b = "10000000-0000-4000-8000-0000000000b1",
  ownerA = "20000000-0000-4000-8000-0000000000a1",
  ownerB = "20000000-0000-4000-8000-0000000000b1",
  staffA = "20000000-0000-4000-8000-0000000000a2",
  ca = "30000000-0000-4000-8000-0000000000a1",
  pa = "40000000-0000-4000-8000-0000000000a1",
  table = "60000000-0000-4000-8000-0000000000a1",
  zone = "90000000-0000-4000-8000-0000000000a1",
  zoneOff = "90000000-0000-4000-8000-0000000000a2",
  zoneB = "90000000-0000-4000-8000-0000000000b1";
const allDay = JSON.stringify(
  Array.from({ length: 7 }, (_, day) => ({ day, open: "00:00", close: "23:59:59" })),
);
await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  `insert into restaurants(id,name,slug,accepting_orders,opening_hours,pickup_enabled,delivery_enabled,delivery_min_order_cents)
   values($1,'Casa A','casa-a',true,$3,true,true,3000),($2,'Casa B','casa-b',true,$3,false,false,0)`,
  [a, b, allDay],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [ca, a]);
await db.query(
  "insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,'Burger',2500,true)",
  [pa, a, ca],
);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);
await db.query(
  `insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active) values
   ($1,$4,'Centro',700,40,true),($2,$4,'Longe',1500,60,false),($3,$5,'Outro',500,30,true)`,
  [zone, zoneOff, zoneB, a, b],
);
let session = 0;
async function guest() {
  session++;
  const token = String(session).padStart(64, "0");
  await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
    [a, token],
  );
  return token;
}
async function ok(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
async function root() {
  await db.exec("reset role");
}
async function login(user) {
  await root();
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function anon() {
  await root();
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role anon");
}
const items = (quantity) => [{ product_id: pa, quantity, expected_price: 2500, note: "" }];
const base = { name: "Cliente Teste", phone: "11988887777", marketing_consent: false };
const delivery = (over = {}) => ({
  ...base,
  fulfillment: "entrega",
  payment_method: "dinheiro",
  change_for_cents: 10000,
  address: { zone_id: zone, street: "Rua das Flores", number: "120", complement: "Apto 3", reference: "Portão azul" },
  items: items(2),
  ...over,
});
async function place(token, payload, key = crypto.randomUUID()) {
  await root();
  const { rows } = await db.query("select place_guest_order($1,$2,$3,$4) as r", [
    a,
    token,
    key,
    JSON.stringify(payload),
  ]);
  return rows[0].r;
}
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}
async function advance(user, order, expected, status, reason = null, estimate = null) {
  await login(user);
  const { rows } = await db.query("select advance_order($1,$2,$3,$4,$5,$6) as r", [
    a,
    order,
    expected,
    status,
    reason,
    estimate,
  ]);
  return rows[0].r;
}

await ok("table order keeps its contract and starts as recebido", async () => {
  const r = await place(await guest(), { ...base, table_id: table, items: items(1) });
  assert.equal(r.status, "recebido");
  const { rows } = await db.query("select fulfillment,table_id,payment_method,delivery_fee_cents from orders where id=$1", [r.id]);
  assert.deepEqual(rows[0], { fulfillment: "mesa", table_id: table, payment_method: null, delivery_fee_cents: 0 });
});

let pickupId;
await ok("pickup order needs payment, has no table and awaits acceptance", async () => {
  const token = await guest();
  await rejects(() => place(token, { ...base, fulfillment: "retirada", items: items(1) }), "INVALID_PAYMENT");
  const r = await place(token, { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) });
  pickupId = r.id;
  assert.equal(r.status, "aguardando_aceite");
  assert.equal(r.total_cents, 2500);
  const { rows } = await db.query("select table_id,fulfillment from orders where id=$1", [r.id]);
  assert.deepEqual(rows[0], { table_id: null, fulfillment: "retirada" });
});

let deliveryId;
await ok("delivery adds the zone fee on the server and stores the address snapshot", async () => {
  const r = await place(await guest(), delivery());
  deliveryId = r.id;
  assert.equal(r.status, "aguardando_aceite");
  assert.equal(r.total_cents, 2500 * 2 + 700);
  const { rows } = await db.query("select zone_name,street,number from order_addresses where order_id=$1", [r.id]);
  assert.deepEqual(rows[0], { zone_name: "Centro", street: "Rua das Flores", number: "120" });
});

await ok("delivery rejects disabled modes, foreign or paused zones, bad address, minimum and change", async () => {
  const token = await guest();
  await rejects(() => place(token, delivery({ address: { ...delivery().address, zone_id: zoneOff } })), "INVALID_ZONE");
  await rejects(() => place(token, delivery({ address: { ...delivery().address, zone_id: zoneB } })), "INVALID_ZONE");
  await rejects(() => place(token, delivery({ address: { ...delivery().address, street: "R" } })), "INVALID_ADDRESS");
  await rejects(() => place(token, delivery({ items: items(1) })), "BELOW_MINIMUM");
  await rejects(() => place(token, delivery({ change_for_cents: 1000 })), "INVALID_CHANGE");
  await rejects(() => place(token, delivery({ payment_method: "cartao", change_for_cents: 10000 })), "INVALID_CHANGE");
  await root();
  await db.query("update restaurants set delivery_enabled=false,pickup_enabled=false where id=$1", [a]);
  await rejects(() => place(token, delivery()), "DELIVERY_DISABLED");
  await rejects(() => place(token, { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) }), "PICKUP_DISABLED");
  await db.query("update restaurants set delivery_enabled=true,pickup_enabled=true where id=$1", [a]);
});

await ok("idempotent retry returns the same order; changed payload with same key conflicts", async () => {
  const token = await guest();
  const key = crypto.randomUUID();
  const first = await place(token, delivery(), key);
  const again = await place(token, delivery(), key);
  assert.equal(again.id, first.id);
  await rejects(() => place(token, delivery({ payment_method: "pix", change_for_cents: null }), key), "IDEMPOTENCY_CONFLICT");
});

await ok("acceptance requires an estimate; refusal requires a reason", async () => {
  await rejects(() => advance(staffA, pickupId, "aguardando_aceite", "recebido"), "INVALID_TRANSITION");
  await rejects(() => advance(staffA, pickupId, "aguardando_aceite", "em_preparo", null, 20), "INVALID_TRANSITION");
  const accepted = await advance(staffA, pickupId, "aguardando_aceite", "recebido", null, 20);
  assert.equal(accepted.status, "recebido");
  const other = await place(await guest(), delivery());
  await rejects(() => advance(ownerA, other.id, "aguardando_aceite", "recusado", "x"), "INVALID_TRANSITION");
  await advance(ownerA, other.id, "aguardando_aceite", "recusado", "Fora da área");
  await root();
  const { rows } = await db.query("select status,cancellation_reason from orders where id=$1", [other.id]);
  assert.deepEqual(rows[0], { status: "recusado", cancellation_reason: "Fora da área" });
});

await ok("pickup ends at entregue after pronto; delivery must go out for delivery first", async () => {
  await advance(staffA, pickupId, "recebido", "em_preparo");
  await advance(staffA, pickupId, "em_preparo", "pronto");
  await rejects(() => advance(staffA, pickupId, "pronto", "saiu_para_entrega"), "INVALID_TRANSITION");
  await advance(staffA, pickupId, "pronto", "entregue");
  await advance(staffA, deliveryId, "aguardando_aceite", "recebido", null, 45);
  await advance(staffA, deliveryId, "recebido", "em_preparo");
  await advance(staffA, deliveryId, "em_preparo", "pronto");
  await rejects(() => advance(staffA, deliveryId, "pronto", "entregue"), "INVALID_TRANSITION");
  await advance(staffA, deliveryId, "pronto", "saiu_para_entrega");
  await advance(staffA, deliveryId, "saiu_para_entrega", "entregue");
});

await ok("an order out for delivery can be cancelled with a reason", async () => {
  const r = await place(await guest(), delivery());
  await advance(staffA, r.id, "aguardando_aceite", "recebido", null, 30);
  await advance(staffA, r.id, "recebido", "em_preparo");
  await advance(staffA, r.id, "em_preparo", "pronto");
  await advance(staffA, r.id, "pronto", "saiu_para_entrega");
  await advance(staffA, r.id, "saiu_para_entrega", "cancelado", "Cliente ausente");
});

await ok("addresses are readable by members only, never by anon or another tenant", async () => {
  await login(staffA);
  assert.equal((await db.query("select 1 from order_addresses where order_id=$1", [deliveryId])).rows.length, 1);
  await login(ownerB);
  assert.equal((await db.query("select 1 from order_addresses where order_id=$1", [deliveryId])).rows.length, 0);
  await anon();
  await rejects(() => db.query("select 1 from order_addresses"), "permission denied");
  await root();
});

await ok("anon reads only active zones; only the owner saves zones of their own restaurant", async () => {
  await anon();
  const { rows } = await db.query("select id from delivery_zones where restaurant_id=$1 order by name", [a]);
  assert.deepEqual(rows.map((r) => r.id), [zone]);
  await rejects(() => db.query("insert into delivery_zones(restaurant_id,name,fee_cents,estimate_minutes) values($1,'X',1,10)", [a]), "permission denied");
  await login(staffA);
  await rejects(() => db.query("select save_delivery_zone($1,$2,'Novo',100,20,true,0)", [a, crypto.randomUUID()]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select save_delivery_zone($1,$2,'Invasão',100,20,true,0)", [b, zone]), "FORBIDDEN");
  await login(ownerA);
  const id = crypto.randomUUID();
  await db.query("select save_delivery_zone($1,$2,'Jardins',900,50,true,2)", [a, id]);
  await db.query("select save_delivery_zone($1,$2,'Jardins',950,55,false,2)", [a, id]);
  await root();
  const saved = await db.query("select fee_cents,estimate_minutes,active from delivery_zones where id=$1", [id]);
  assert.deepEqual(saved.rows[0], { fee_cents: 950, estimate_minutes: 55, active: false });
});

await ok("settings persist the online modes and minimum, keeping existing fields", async () => {
  await login(ownerA);
  await db.query("select save_restaurant_settings($1,$2,$3)", [
    a,
    JSON.stringify({
      name: "Casa A", subtitle: "", phone: "", address: "", privacy_email: "a@a.com",
      retention_days: 90, accepting_orders: true, opening_hours: JSON.parse(allDay),
      pickup_enabled: false, delivery_enabled: true, delivery_min_order_cents: 4500,
    }),
    1,
  ]);
  await root();
  const { rows } = await db.query("select pickup_enabled,delivery_enabled,delivery_min_order_cents from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0], { pickup_enabled: false, delivery_enabled: true, delivery_min_order_cents: 4500 });
});

await ok("order_online is a valid rate-limit scope with 12 attempts per window", async () => {
  const subject = "f".repeat(64);
  let last;
  for (let i = 0; i < 13; i++)
    last = (await db.query("select consume_public_rate_limit($1,'order_online',$2) as r", [a, subject])).rows[0].r;
  assert.equal(last.allowed, false);
});

await db.close();
console.log(`${count} online-order database checks passed.`);
```

Run: `node scripts/test-online-orders.mjs`
Expected: FAIL ao abrir a migration `011_online_orders.sql` (ENOENT) — esperado, ela ainda não existe.

- [ ] **Step 3: Escrever a migration**

Criar `supabase/migrations/011_online_orders.sql`:

```sql
-- Online orders: pickup and delivery alongside table orders. Payment happens at pickup/delivery.
alter table public.restaurants
  add column pickup_enabled boolean not null default false,
  add column delivery_enabled boolean not null default false,
  add column delivery_min_order_cents integer not null default 0
    check (delivery_min_order_cents between 0 and 1000000);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  fee_cents integer not null check (fee_cents between 0 and 100000),
  estimate_minutes integer not null check (estimate_minutes between 5 and 240),
  active boolean not null default true,
  position integer not null default 0 check (position between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (restaurant_id, id)
);
create unique index delivery_zones_name on public.delivery_zones(restaurant_id, lower(trim(name)));
alter table public.delivery_zones enable row level security;
revoke all on public.delivery_zones from anon, authenticated;
grant select on public.delivery_zones to anon, authenticated;
create policy public_zones on public.delivery_zones for select using (active or is_member(restaurant_id));

alter table public.orders
  add column fulfillment text not null default 'mesa' check (fulfillment in ('mesa','retirada','entrega')),
  add column delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 100000),
  add column payment_method text check (payment_method in ('dinheiro','cartao','pix')),
  add column change_for_cents integer check (change_for_cents between 1 and 10000000);
alter table public.orders alter column table_id drop not null;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega','entregue','recusado','cancelado'));
alter table public.orders add constraint orders_fulfillment_table check ((fulfillment = 'mesa') = (table_id is not null));
alter table public.orders add constraint orders_fulfillment_fee check (fulfillment = 'entrega' or delivery_fee_cents = 0);
alter table public.orders add constraint orders_fulfillment_payment check ((fulfillment = 'mesa') = (payment_method is null));
alter table public.orders add constraint orders_change check (
  change_for_cents is null or (payment_method = 'dinheiro' and change_for_cents >= total_cents));

-- Delivery address is personal data: separate table, members only, written by the RPC.
create table public.order_addresses (
  order_id uuid primary key,
  restaurant_id uuid not null,
  zone_id uuid not null,
  zone_name text not null,
  street text not null check (length(trim(street)) between 3 and 150),
  number text not null check (length(trim(number)) between 1 and 20),
  complement text not null default '' check (length(complement) <= 80),
  reference text not null default '' check (length(reference) <= 150),
  foreign key (restaurant_id, order_id) references public.orders(restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, zone_id) references public.delivery_zones(restaurant_id, id)
);
alter table public.order_addresses enable row level security;
revoke all on public.order_addresses from anon, authenticated;
grant select on public.order_addresses to authenticated;
create policy member_read on public.order_addresses for select to authenticated using (is_member(restaurant_id));

create or replace function public.place_guest_order(p_restaurant uuid,p_token_hash text,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare guest guest_sessions; rest restaurants; previous orders; created orders; item jsonb; product products;
 prepared jsonb:='[]'; selected_ids uuid[]; removed text[]; additions jsonb; unit_price integer;
 fingerprint text; total integer:=0; contact_id uuid; local_time timestamp; new_contact boolean:=false;
 kind text; payment text; change_for integer; fee integer:=0; zone delivery_zones; addr jsonb; initial text;
begin
 select * into guest from guest_sessions where restaurant_id=p_restaurant and token_hash=p_token_hash and expires_at>now() for update;
 if not found then raise exception 'SESSION_EXPIRED'; end if;
 fingerprint:=encode(digest(p_payload::text,'sha256'),'hex');
 select * into previous from orders where restaurant_id=p_restaurant and guest_session_id=guest.id and idempotency_key=p_key;
 if found then
  if previous.payload_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('id',previous.id,'number',previous.number,'total_cents',previous.total_cents,'status',previous.status);
 end if;
 if (select count(*) from orders where guest_session_id=guest.id and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMITED'; end if;
 select * into rest from restaurants where id=p_restaurant for share;
 if not rest.accepting_orders then raise exception 'CLOSED'; end if;
 local_time:=now() at time zone rest.timezone;
 if not exists(select 1 from jsonb_array_elements(rest.opening_hours) h where (h->>'day')::int=extract(dow from local_time)::int and local_time::time >= (h->>'open')::time and local_time::time < (h->>'close')::time) then raise exception 'CLOSED'; end if;
 kind:=coalesce(p_payload->>'fulfillment','mesa');
 if kind not in ('mesa','retirada','entrega') then raise exception 'INVALID_INPUT'; end if;
 if kind='mesa' then
  if not exists(select 1 from dining_tables where id=(p_payload->>'table_id')::uuid and restaurant_id=p_restaurant and active) then raise exception 'INVALID_TABLE'; end if;
 else
  if kind='retirada' and not rest.pickup_enabled then raise exception 'PICKUP_DISABLED'; end if;
  if kind='entrega' and not rest.delivery_enabled then raise exception 'DELIVERY_DISABLED'; end if;
  payment:=p_payload->>'payment_method';
  if payment is null or payment not in ('dinheiro','cartao','pix') then raise exception 'INVALID_PAYMENT'; end if;
  change_for:=nullif(p_payload->>'change_for_cents','')::integer;
 end if;
 if kind='entrega' then
  addr:=p_payload->'address';
  if jsonb_typeof(addr)<>'object' then raise exception 'INVALID_ADDRESS'; end if;
  select * into zone from delivery_zones where id=(addr->>'zone_id')::uuid and restaurant_id=p_restaurant and active for share;
  if not found then raise exception 'INVALID_ZONE'; end if;
  if length(trim(coalesce(addr->>'street',''))) not between 3 and 150 or length(trim(coalesce(addr->>'number',''))) not between 1 and 20
   or length(coalesce(addr->>'complement',''))>80 or length(coalesce(addr->>'reference',''))>150 then raise exception 'INVALID_ADDRESS'; end if;
 end if;
 if length(trim(p_payload->>'name')) not between 2 and 80 or coalesce(p_payload->>'phone','') !~ '^[0-9]{10,11}$' then raise exception 'INVALID_CUSTOMER'; end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
 -- Lock catalog rows in deterministic order to prevent concurrent price changes/deadlocks.
 perform p.id from products p where p.restaurant_id=p_restaurant and p.id in(select (v->>'product_id')::uuid from jsonb_array_elements(p_payload->'items') v) order by p.id for share;
 for item in select * from jsonb_array_elements(p_payload->'items') loop
  select * into product from products where id=(item->>'product_id')::uuid and restaurant_id=p_restaurant;
  if not found or not product.published or not product.available or product.archived then raise exception 'UNAVAILABLE'; end if;
  if not exists(select 1 from categories where id=product.category_id and restaurant_id=p_restaurant and visible) then raise exception 'UNAVAILABLE'; end if;
  if (item->>'quantity')::integer not between 1 and 20 or length(coalesce(item->>'note',''))>300 then raise exception 'INVALID_QUANTITY'; end if;
  if jsonb_typeof(coalesce(item->'option_ids','[]'))<>'array' or jsonb_typeof(coalesce(item->'removed_ingredients','[]'))<>'array' then raise exception 'OPTIONS_CHANGED'; end if;
  selected_ids:=array(select v::uuid from jsonb_array_elements_text(coalesce(item->'option_ids','[]')) v);
  removed:=array(select v from jsonb_array_elements_text(coalesce(item->'removed_ingredients','[]')) v);
  if cardinality(selected_ids)>30 or cardinality(selected_ids)<>(select count(distinct v) from unnest(selected_ids) v)
   or not valid_ingredient_list(removed) or not removed <@ product.removable_ingredients then raise exception 'OPTIONS_CHANGED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price_cents',o.price_cents) order by o.id),'[]'),product.price_cents+coalesce(sum(o.price_cents),0)
   into additions,unit_price from product_options o join product_option_links l on l.option_id=o.id and l.restaurant_id=o.restaurant_id
   where o.restaurant_id=p_restaurant and l.product_id=product.id and o.active and o.id=any(selected_ids);
  if jsonb_array_length(additions)<>cardinality(selected_ids) then raise exception 'OPTIONS_CHANGED'; end if;
  if unit_price is distinct from (item->>'expected_price')::integer then raise exception 'PRICE_CHANGED'; end if;
  prepared:=prepared||jsonb_build_array(jsonb_build_object('product_id',product.id,'product_name',product.name,'price',unit_price,'quantity',(item->>'quantity')::integer,'note',coalesce(item->>'note',''),'removed',to_jsonb(removed),'additions',additions));
  total:=total+unit_price*(item->>'quantity')::integer;
 end loop;
 if kind='entrega' then
  if total<rest.delivery_min_order_cents then raise exception 'BELOW_MINIMUM'; end if;
  fee:=zone.fee_cents;
  total:=total+fee;
 end if;
 if change_for is not null and (payment<>'dinheiro' or change_for<total) then raise exception 'INVALID_CHANGE'; end if;
 initial:=case when kind='mesa' then 'recebido' else 'aguardando_aceite' end;
 insert into orders(restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,idempotency_key,payload_hash,status,fulfillment,delivery_fee_cents,payment_method,change_for_cents)
 values(p_restaurant,guest.id,case when kind='mesa' then (p_payload->>'table_id')::uuid end,trim(p_payload->>'name'),p_payload->>'phone',total,p_key,fingerprint,initial,kind,fee,payment,change_for) returning * into created;
 if kind='entrega' then
  insert into order_addresses(order_id,restaurant_id,zone_id,zone_name,street,number,complement,reference)
  values(created.id,p_restaurant,zone.id,zone.name,trim(addr->>'street'),trim(addr->>'number'),trim(coalesce(addr->>'complement','')),trim(coalesce(addr->>'reference','')));
 end if;
 for item in select * from jsonb_array_elements(prepared) loop
  insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity,note,removed_ingredients,add_ons)
  values(p_restaurant,created.id,(item->>'product_id')::uuid,item->>'product_name',(item->>'price')::integer,(item->>'quantity')::integer,item->>'note',array(select v from jsonb_array_elements_text(item->'removed') v),item->'additions');
 end loop;
 insert into order_status_events(restaurant_id,order_id,status) values(p_restaurant,created.id,initial);
 insert into contacts(restaurant_id,name,phone,marketing_status) values(p_restaurant,trim(p_payload->>'name'),p_payload->>'phone',case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end)
 on conflict(restaurant_id,phone) do nothing returning id into contact_id;
 new_contact:=contact_id is not null;
 if new_contact then
  insert into marketing_consent_events(restaurant_id,contact_id,action,text_version,consent_text,source)
  values(p_restaurant,contact_id,case when (p_payload->>'marketing_consent')::boolean then 'authorized' else 'not_authorized' end,'1','Quero receber novidades e ofertas do '||rest.name||' no WhatsApp. Posso cancelar quando quiser.','checkout');
 else
  update contacts set last_seen_at=now() where restaurant_id=p_restaurant and phone=p_payload->>'phone';
 end if;
 return jsonb_build_object('id',created.id,'number',created.number,'total_cents',created.total_cents,'status',created.status);
end $$;
revoke all on function public.place_guest_order(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.place_guest_order(uuid,text,uuid,jsonb) to service_role;

create or replace function public.advance_order(p_restaurant uuid,p_order uuid,p_expected text,p_status text,p_reason text default null,p_estimate integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing orders; with_reason boolean;
begin
 if not is_member(p_restaurant) then raise exception 'FORBIDDEN'; end if;
 select * into existing from orders where id=p_order and restaurant_id=p_restaurant for update;
 if not found or existing.status<>p_expected then raise exception 'STALE_ORDER'; end if;
 with_reason:=length(trim(coalesce(p_reason,'')))>=3;
 if not (
  (existing.status='aguardando_aceite' and p_status='recebido' and p_estimate is not null)
  or (existing.status='aguardando_aceite' and p_status='recusado' and with_reason)
  or (existing.status='recebido' and p_status='em_preparo')
  or (existing.status='em_preparo' and p_status='pronto')
  or (existing.status='pronto' and p_status='entregue' and existing.fulfillment<>'entrega')
  or (existing.status='pronto' and p_status='saiu_para_entrega' and existing.fulfillment='entrega')
  or (existing.status='saiu_para_entrega' and p_status='entregue')
  or (existing.status in ('recebido','em_preparo','saiu_para_entrega') and p_status='cancelado' and with_reason)
 ) then raise exception 'INVALID_TRANSITION'; end if;
 update orders set status=p_status,
  cancellation_reason=case when p_status in ('cancelado','recusado') then p_reason else null end,
  estimate_minutes=coalesce(p_estimate,estimate_minutes)
 where id=p_order;
 insert into order_status_events(restaurant_id,order_id,status,actor_id,reason) values(p_restaurant,p_order,p_status,auth.uid(),p_reason);
 return jsonb_build_object('id',p_order,'status',p_status);
end $$;
revoke all on function public.advance_order(uuid,uuid,text,text,text,integer) from public,anon;
grant execute on function public.advance_order(uuid,uuid,text,text,text,integer) to authenticated;

create or replace function public.save_restaurant_settings(p_restaurant uuid,p_settings jsonb,p_tables integer) returns void
language plpgsql security definer set search_path=public as $$
declare slot jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_tables not between 1 and 100 or jsonb_typeof(p_settings->'opening_hours') <> 'array' then raise exception 'INVALID_SETTINGS'; end if;
 for slot in select * from jsonb_array_elements(p_settings->'opening_hours') loop
  if (slot->>'day')::int not between 0 and 6 or (slot->>'open')::time >= (slot->>'close')::time then raise exception 'INVALID_HOURS'; end if;
 end loop;
 update restaurants set name=p_settings->>'name',subtitle=p_settings->>'subtitle',phone=p_settings->>'phone',address=p_settings->>'address',privacy_email=p_settings->>'privacy_email',retention_days=(p_settings->>'retention_days')::int,accepting_orders=(p_settings->>'accepting_orders')::boolean,opening_hours=p_settings->'opening_hours',google_review_url=coalesce(p_settings->>'google_review_url',google_review_url),
  pickup_enabled=coalesce((p_settings->>'pickup_enabled')::boolean,pickup_enabled),
  delivery_enabled=coalesce((p_settings->>'delivery_enabled')::boolean,delivery_enabled),
  delivery_min_order_cents=coalesce((p_settings->>'delivery_min_order_cents')::integer,delivery_min_order_cents)
 where id=p_restaurant;
 insert into dining_tables(restaurant_id,number,active) select p_restaurant,n,true from generate_series(1,p_tables) n on conflict(restaurant_id,number) do update set active=true;
 update dining_tables set active=false where restaurant_id=p_restaurant and number>p_tables;
end $$;

create function public.save_delivery_zone(p_restaurant uuid,p_id uuid,p_name text,p_fee integer,p_estimate integer,p_active boolean,p_position integer) returns uuid
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if exists(select 1 from delivery_zones where id=p_id and restaurant_id<>p_restaurant) then raise exception 'FORBIDDEN'; end if;
 insert into delivery_zones(id,restaurant_id,name,fee_cents,estimate_minutes,active,position)
 values(p_id,p_restaurant,trim(p_name),p_fee,p_estimate,p_active,p_position)
 on conflict(id) do update set name=excluded.name,fee_cents=excluded.fee_cents,estimate_minutes=excluded.estimate_minutes,active=excluded.active,position=excluded.position;
 return p_id;
end $$;
revoke all on function public.save_delivery_zone(uuid,uuid,text,integer,integer,boolean,integer) from public,anon;
grant execute on function public.save_delivery_zone(uuid,uuid,text,integer,integer,boolean,integer) to authenticated;

alter table public.public_rate_limits drop constraint public_rate_limits_action_check;
alter table public.public_rate_limits add constraint public_rate_limits_action_check
  check (action in ('session','order','order_table','order_online','feedback','feedback_session'));
create or replace function public.consume_public_rate_limit(p_restaurant uuid, p_action text, p_subject text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare max_hits integer; period_seconds integer := 600; current_time_ timestamptz := clock_timestamp();
  starts timestamptz; ends timestamptz; used integer;
begin
  case p_action
    when 'session' then max_hits := 60;
    when 'order' then max_hits := 120;
    when 'order_table' then max_hits := 12;
    when 'order_online' then max_hits := 12;
    when 'feedback' then max_hits := 120;
    when 'feedback_session' then max_hits := 30;
    else raise exception 'INVALID_INPUT';
  end case;
  if p_subject is null or p_subject !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from restaurants where id=p_restaurant) then raise exception 'NOT_FOUND'; end if;
  starts := to_timestamp(floor(extract(epoch from current_time_)/period_seconds)*period_seconds);
  ends := starts + make_interval(secs => period_seconds);
  insert into public_rate_limits(restaurant_id,action,subject_hash,window_start,hits,expires_at)
  values(p_restaurant,p_action,p_subject,starts,1,ends)
  on conflict(restaurant_id,action,subject_hash,window_start) do update
    set hits=least(public_rate_limits.hits+1,max_hits+1)
  returning hits into used;
  -- Bounded opportunistic cleanup, including rejected requests. No unbounded cron required for pilot.
  delete from public_rate_limits where (restaurant_id,action,subject_hash,window_start) in (
    select restaurant_id,action,subject_hash,window_start from public_rate_limits
    where expires_at < current_time_ - interval '1 hour' order by expires_at limit 100
  );
  return jsonb_build_object('allowed',used<=max_hits,'retryAfter',greatest(1,ceil(extract(epoch from ends-current_time_))::integer));
end $$;
revoke all on function public.consume_public_rate_limit(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consume_public_rate_limit(uuid,text,text) to service_role;
```

Se o PGlite reportar outro nome para as restrições removidas (`orders_status_check`, `public_rate_limits_action_check`), conferir com `select conname from pg_constraint where conrelid='public.orders'::regclass` no próprio teste e ajustar o nome na migration — nunca usar `if exists` para mascarar.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:database`
Expected: `45 database checks passed…` (suíte existente inalterada) seguido de `12 online-order database checks passed.`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/011_online_orders.sql scripts/lib/test-db.mjs scripts/test-database.mjs scripts/test-online-orders.mjs package.json
git commit -m "Add online pickup and delivery orders to the database

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras de fluxo, totais, WhatsApp e alerta

**Files:**
- Create: `src/lib/order-flow.ts`
- Create: `src/lib/online-order.ts`
- Create: `src/lib/order-alerts.ts`
- Create: `scripts/test-online.mjs`
- Modify: `package.json` (script `test:online`)

**Interfaces:**
- Produces (`order-flow.ts`):
  - `type Fulfillment = "mesa" | "retirada" | "entrega"`
  - `type OrderStatus = "aguardando_aceite" | "recebido" | "em_preparo" | "pronto" | "saiu_para_entrega" | "entregue" | "recusado" | "cancelado"`
  - `type PaymentMethod = "dinheiro" | "cartao" | "pix"`
  - `paymentNames: Record<PaymentMethod, string>`
  - `statusLabel(status: OrderStatus, fulfillment: Fulfillment): string`
  - `customerSteps(fulfillment: Fulfillment): OrderStatus[]`
  - `nextAction(status: OrderStatus, fulfillment: Fulfillment): { status: OrderStatus; label: string } | null`
  - `canCancel(status: OrderStatus): boolean`
  - `fulfillmentLabel(order: { fulfillment: Fulfillment; table?: number | null; zone?: string | null }): string`
- Produces (`online-order.ts`):
  - `orderTotals(subtotal: number, fulfillment: Fulfillment, zone?: { fee_cents: number } | null): { subtotal: number; fee: number; total: number }`
  - `missingForMinimum(subtotal: number, minimum: number): number`
  - `isValidChange(changeFor: number | null, total: number, payment: PaymentMethod): boolean`
  - `whatsappConfirmationLink(order: WhatsAppOrder): string` with `type WhatsAppOrder = { number: number; customer_name: string; customer_phone: string; fulfillment: Fulfillment; total_cents: number; payment_method: PaymentMethod | null; change_for_cents: number | null; items: { quantity: number; product_name: string }[]; address?: { zone_name: string; street: string; number: string; complement: string; reference: string } | null; restaurantName: string }`
- Produces (`order-alerts.ts`): `ALERT_REPEAT_MS = 20000`; `pendingCount(orders: { status: string }[]): number`; `shouldPlayAlert(input: { pending: number; newOrderIds: string[]; lastPlayedAt: number | null; now: number; muted: boolean }): boolean`

- [ ] **Step 1: Testes que falham**

Criar `scripts/test-online.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const flow = load("src/lib/order-flow.ts");
const online = load("src/lib/online-order.ts");
const alerts = load("src/lib/order-alerts.ts");

test("each fulfillment has its own customer steps", () => {
  assert.deepEqual(flow.customerSteps("mesa"), ["recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.customerSteps("retirada"), ["aguardando_aceite", "recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.customerSteps("entrega"), ["aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega", "entregue"]);
});

test("next action follows the database transitions", () => {
  assert.equal(flow.nextAction("aguardando_aceite", "entrega").status, "recebido");
  assert.equal(flow.nextAction("pronto", "entrega").status, "saiu_para_entrega");
  assert.equal(flow.nextAction("pronto", "retirada").status, "entregue");
  assert.equal(flow.nextAction("pronto", "retirada").label, "Confirmar retirada");
  assert.equal(flow.nextAction("saiu_para_entrega", "entrega").status, "entregue");
  assert.equal(flow.nextAction("entregue", "mesa"), null);
  assert.equal(flow.canCancel("saiu_para_entrega"), true);
  assert.equal(flow.canCancel("pronto"), false);
  assert.equal(flow.canCancel("aguardando_aceite"), false);
});

test("labels speak the customer's language per fulfillment", () => {
  assert.equal(flow.statusLabel("entregue", "retirada"), "Retirado");
  assert.equal(flow.statusLabel("pronto", "retirada"), "Pronto para retirar");
  assert.equal(flow.statusLabel("aguardando_aceite", "entrega"), "Aguardando o restaurante aceitar");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "mesa", table: 4 }), "Mesa 04");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "entrega", zone: "Centro" }), "Entrega · Centro");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "retirada" }), "Retirada");
});

test("totals add the zone fee only for delivery", () => {
  assert.deepEqual(online.orderTotals(5000, "entrega", { fee_cents: 700 }), { subtotal: 5000, fee: 700, total: 5700 });
  assert.deepEqual(online.orderTotals(5000, "retirada", { fee_cents: 700 }), { subtotal: 5000, fee: 0, total: 5000 });
  assert.deepEqual(online.orderTotals(5000, "entrega", null), { subtotal: 5000, fee: 0, total: 5000 });
  assert.equal(online.missingForMinimum(2500, 3000), 500);
  assert.equal(online.missingForMinimum(3500, 3000), 0);
});

test("change is only for cash and never below the total", () => {
  assert.equal(online.isValidChange(null, 5700, "dinheiro"), true);
  assert.equal(online.isValidChange(10000, 5700, "dinheiro"), true);
  assert.equal(online.isValidChange(5000, 5700, "dinheiro"), false);
  assert.equal(online.isValidChange(10000, 5700, "pix"), false);
});

test("WhatsApp link targets the customer's Brazilian number with a readable summary", () => {
  const url = new URL(
    online.whatsappConfirmationLink({
      number: 42,
      customer_name: "Ana",
      customer_phone: "11988887777",
      fulfillment: "entrega",
      total_cents: 5700,
      payment_method: "dinheiro",
      change_for_cents: 10000,
      items: [{ quantity: 2, product_name: "Burger" }],
      address: { zone_name: "Centro", street: "Rua A", number: "10", complement: "", reference: "Portão azul" },
      restaurantName: "Casa X",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://wa.me/5511988887777");
  const text = url.searchParams.get("text");
  assert.match(text, /Casa X/);
  assert.match(text, /pedido #42/);
  assert.match(text, /2× Burger/);
  assert.match(text, /Rua A, 10 · Centro/);
  assert.match(text, /Dinheiro \(troco para R\$\s?100,00\)/);
  assert.match(text, /R\$\s?57,00/);
});

test("alert repeats while there are pending orders, unless muted", () => {
  assert.equal(alerts.pendingCount([{ status: "aguardando_aceite" }, { status: "recebido" }]), 1);
  const base = { pending: 1, newOrderIds: [], lastPlayedAt: 0, now: 25000, muted: false };
  assert.equal(alerts.shouldPlayAlert(base), true);
  assert.equal(alerts.shouldPlayAlert({ ...base, now: 10000 }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, pending: 0, newOrderIds: ["x"], now: 1 }), true);
  assert.equal(alerts.shouldPlayAlert({ ...base, pending: 0 }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, muted: true }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, lastPlayedAt: null, now: 1 }), true);
});
```

Adicionar em `package.json` → `scripts`: `"test:online": "node --test scripts/test-online.mjs",`

Run: `npm run test:online`
Expected: FAIL com `ENOENT` em `src/lib/order-flow.ts`.

- [ ] **Step 2: Implementar `src/lib/order-flow.ts`**

```ts
// Order lifecycle per fulfillment. Mirrors advance_order in migration 011.
export type Fulfillment = "mesa" | "retirada" | "entrega";
export type OrderStatus =
  | "aguardando_aceite"
  | "recebido"
  | "em_preparo"
  | "pronto"
  | "saiu_para_entrega"
  | "entregue"
  | "recusado"
  | "cancelado";
export type PaymentMethod = "dinheiro" | "cartao" | "pix";

export const paymentNames: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão na maquininha",
  pix: "Pix na hora",
};

const names: Record<OrderStatus, string> = {
  aguardando_aceite: "Aguardando o restaurante aceitar",
  recebido: "Recebido",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export function statusLabel(status: OrderStatus, fulfillment: Fulfillment) {
  if (fulfillment === "retirada" && status === "pronto")
    return "Pronto para retirar";
  if (fulfillment === "retirada" && status === "entregue") return "Retirado";
  return names[status];
}

export function customerSteps(fulfillment: Fulfillment): OrderStatus[] {
  if (fulfillment === "mesa")
    return ["recebido", "em_preparo", "pronto", "entregue"];
  if (fulfillment === "retirada")
    return ["aguardando_aceite", "recebido", "em_preparo", "pronto", "entregue"];
  return [
    "aguardando_aceite",
    "recebido",
    "em_preparo",
    "pronto",
    "saiu_para_entrega",
    "entregue",
  ];
}

export function nextAction(
  status: OrderStatus,
  fulfillment: Fulfillment,
): { status: OrderStatus; label: string } | null {
  if (status === "aguardando_aceite")
    return { status: "recebido", label: "Aceitar pedido" };
  if (status === "recebido")
    return { status: "em_preparo", label: "Iniciar preparo" };
  if (status === "em_preparo") return { status: "pronto", label: "Marcar pronto" };
  if (status === "pronto" && fulfillment === "entrega")
    return { status: "saiu_para_entrega", label: "Saiu para entrega" };
  if (status === "pronto")
    return {
      status: "entregue",
      label: fulfillment === "retirada" ? "Confirmar retirada" : "Confirmar entrega",
    };
  if (status === "saiu_para_entrega")
    return { status: "entregue", label: "Confirmar entrega" };
  return null;
}

export function canCancel(status: OrderStatus) {
  return ["recebido", "em_preparo", "saiu_para_entrega"].includes(status);
}

export function fulfillmentLabel(order: {
  fulfillment: Fulfillment;
  table?: number | null;
  zone?: string | null;
}) {
  if (order.fulfillment === "mesa")
    return `Mesa ${String(order.table ?? "").padStart(2, "0")}`;
  if (order.fulfillment === "retirada") return "Retirada";
  return order.zone ? `Entrega · ${order.zone}` : "Entrega";
}
```

- [ ] **Step 3: Implementar `src/lib/online-order.ts`**

```ts
import { paymentNames, type Fulfillment, type PaymentMethod } from "./order-flow";

export function orderTotals(
  subtotal: number,
  fulfillment: Fulfillment,
  zone?: { fee_cents: number } | null,
) {
  const fee = fulfillment === "entrega" && zone ? zone.fee_cents : 0;
  return { subtotal, fee, total: subtotal + fee };
}

export function missingForMinimum(subtotal: number, minimum: number) {
  return Math.max(0, minimum - subtotal);
}

export function isValidChange(
  changeFor: number | null,
  total: number,
  payment: PaymentMethod,
) {
  if (changeFor === null) return true;
  return payment === "dinheiro" && changeFor >= total;
}

export type WhatsAppOrder = {
  number: number;
  customer_name: string;
  customer_phone: string;
  fulfillment: Fulfillment;
  total_cents: number;
  payment_method: PaymentMethod | null;
  change_for_cents: number | null;
  items: { quantity: number; product_name: string }[];
  address?: {
    zone_name: string;
    street: string;
    number: string;
    complement: string;
    reference: string;
  } | null;
  restaurantName: string;
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Opens a chat started by the staff; nothing is sent automatically.
export function whatsappConfirmationLink(order: WhatsAppOrder) {
  const lines = [
    `Olá, ${order.customer_name}! Aqui é do ${order.restaurantName}.`,
    `Recebemos seu pedido #${order.number}:`,
    ...order.items.map((i) => `• ${i.quantity}× ${i.product_name}`),
  ];
  if (order.address) {
    const a = order.address;
    lines.push(
      `Entrega: ${a.street}, ${a.number} · ${a.zone_name}` +
        (a.complement ? ` (${a.complement})` : "") +
        (a.reference ? ` — ${a.reference}` : ""),
    );
  } else if (order.fulfillment === "retirada") lines.push("Retirada no balcão.");
  if (order.payment_method)
    lines.push(
      `Pagamento: ${paymentNames[order.payment_method]}` +
        (order.change_for_cents
          ? ` (troco para ${brl(order.change_for_cents)})`
          : ""),
    );
  lines.push(`Total: ${brl(order.total_cents)}`, "Podemos confirmar?");
  return `https://wa.me/55${order.customer_phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}
```

- [ ] **Step 4: Implementar `src/lib/order-alerts.ts`**

```ts
// Pure rule for the management alert: chime on new orders and keep chiming
// while any online order still waits for acceptance.
export const ALERT_REPEAT_MS = 20000;

export function pendingCount(orders: { status: string }[]) {
  return orders.filter((o) => o.status === "aguardando_aceite").length;
}

export function shouldPlayAlert(input: {
  pending: number;
  newOrderIds: string[];
  lastPlayedAt: number | null;
  now: number;
  muted: boolean;
}) {
  if (input.muted) return false;
  if (input.newOrderIds.length > 0) return true;
  if (input.pending === 0) return false;
  return (
    input.lastPlayedAt === null || input.now - input.lastPlayedAt >= ALERT_REPEAT_MS
  );
}
```

- [ ] **Step 5: Rodar**

Run: `npm run test:online && npm run typecheck && npm run lint`
Expected: 7 testes PASS; typecheck e lint limpos. (O separador do `toLocaleString` pode ser espaço não separável — por isso o teste usa `\s?`; se ainda assim falhar, ajustar o regex do teste, nunca o formato de moeda.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/order-flow.ts src/lib/online-order.ts src/lib/order-alerts.ts scripts/test-online.mjs package.json
git commit -m "Add pure order-flow, totals, WhatsApp and alert rules for online orders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API e tipos (pedido, catálogo, gestão)

**Files:**
- Modify: `src/lib/connected-types.ts`
- Modify: `src/lib/catalog.ts`
- Modify: `src/lib/observability/core.ts`, `src/lib/client-api.ts`
- Modify: `src/lib/rate-limit.ts`
- Modify: `src/app/api/restaurants/[id]/orders/route.ts`
- Modify: `src/app/api/restaurants/[id]/orders/[orderId]/route.ts`
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts`
- Modify: `src/app/api/restaurants/[id]/workspace/route.ts`
- Test: `scripts/test-foundation.mjs` (novos casos), `npm run typecheck`

**Interfaces:**
- Consumes: tipos de `src/lib/order-flow.ts` (Task 2); RPCs e tabelas da Task 1.
- Produces (`connected-types.ts`):
  - `RestaurantRow` ganha `pickup_enabled: boolean; delivery_enabled: boolean; delivery_min_order_cents: number`.
  - `type DeliveryZone = { id: string; name: string; fee_cents: number; estimate_minutes: number; active: boolean; position: number }`.
  - `type OrderAddress = { zone_name: string; street: string; number: string; complement: string; reference: string }`.
  - `RealOrder`: `table_id: string | null`; `status: OrderStatus`; `fulfillment: Fulfillment`; `delivery_fee_cents: number`; `payment_method: PaymentMethod | null`; `change_for_cents: number | null`; `order_addresses: OrderAddress | null`; `first_order?: boolean`.
  - `Catalog` e `Workspace` ganham `zones: DeliveryZone[]` (catálogo: só ativas).
- Produces (API): `POST /api/restaurants/[id]/orders` aceita `fulfillment` (padrão `"mesa"`); para mesa exige `table_id`; para retirada/entrega exige `payment_method`, aceita `change_for_cents`; entrega exige `address`. `PATCH …/orders/[orderId]` aceita os status novos. `POST …/catalog` ganha `{ action: "save_delivery_zone", id, name, fee_cents, estimate_minutes, active, position }`, e `settings` ganha `pickup_enabled`, `delivery_enabled`, `delivery_min_order_cents`.

- [ ] **Step 1: Teste do esquema do pedido (falha)**

A validação Zod do pedido sai da rota para um módulo testável. Acrescentar a `scripts/test-foundation.mjs`:

```js
const orderSchema = loader({ zod: require("zod") })("src/lib/order-payload.ts");

test("order payload: table orders unchanged, online orders need payment and address", () => {
  const item = { product_id: "40000000-0000-4000-8000-000000000001", quantity: 1, expected_price: 2500, note: "" };
  const base = { key: "50000000-0000-4000-8000-000000000001", name: "Ana", phone: "11988887777", marketing_consent: false, items: [item] };
  const table = { ...base, table_id: "60000000-0000-4000-8000-000000000001" };
  assert.equal(orderSchema.orderPayload.parse(table).fulfillment, "mesa");
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "mesa" }).success, false);
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "retirada" }).success, false);
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "retirada", payment_method: "pix" }).success, true);
  const address = { zone_id: "90000000-0000-4000-8000-000000000001", street: "Rua A", number: "10", complement: "", reference: "" };
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "entrega", payment_method: "dinheiro" }).success, false);
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "entrega", payment_method: "dinheiro", change_for_cents: 10000, address }).success, true);
  assert.equal(orderSchema.orderPayload.safeParse({ ...base, fulfillment: "entrega", payment_method: "pix", address, table_id: table.table_id }).success, false);
});
```

(`require` já existe no topo de `scripts/test-foundation.mjs`? Se não existir, acrescentar `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`.)

Run: `npm run test:foundation`
Expected: FAIL (`ENOENT` em `src/lib/order-payload.ts`).

- [ ] **Step 2: Criar `src/lib/order-payload.ts` e usar na rota**

```ts
import { z } from "zod";

const item = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  expected_price: z.number().int().positive(),
  note: z.string().max(300),
  removed_ingredients: z
    .array(z.string().min(1).max(80))
    .max(30)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
  option_ids: z
    .array(z.uuid())
    .max(30)
    .refine((v) => new Set(v).size === v.length)
    .optional(),
});
const common = {
  key: z.uuid(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^\d{10,11}$/),
  marketing_consent: z.boolean(),
  items: z.array(item).min(1).max(50),
};
const payment = z.enum(["dinheiro", "cartao", "pix"]);
const change = z.number().int().min(1).max(10000000).nullable().optional();
export const orderPayload = z.union([
  z
    .object({ ...common, fulfillment: z.literal("mesa").default("mesa"), table_id: z.uuid() })
    .strict(),
  z
    .object({
      ...common,
      fulfillment: z.literal("retirada"),
      payment_method: payment,
      change_for_cents: change,
    })
    .strict(),
  z
    .object({
      ...common,
      fulfillment: z.literal("entrega"),
      payment_method: payment,
      change_for_cents: change,
      address: z
        .object({
          zone_id: z.uuid(),
          street: z.string().trim().min(3).max(150),
          number: z.string().trim().min(1).max(20),
          complement: z.string().trim().max(80),
          reference: z.string().trim().max(150),
        })
        .strict(),
    })
    .strict(),
]);
export type OrderPayload = z.infer<typeof orderPayload>;
```

Em `src/app/api/restaurants/[id]/orders/route.ts`: remover a constante `schema` local, importar `import { orderPayload } from "@/lib/order-payload";`, trocar `schema.parse(...)` por `orderPayload.parse(...)` e os limites por:

```ts
    await enforcePublicLimit(request, id, "order");
    if (payload.fulfillment === "mesa")
      await enforcePublicLimit(request, id, "order_table", payload.table_id);
    else await enforcePublicLimit(request, id, "order_online", hash(token));
```

Em `src/lib/rate-limit.ts`, acrescentar `"order_online"` ao tipo `Action`.

Run: `npm run test:foundation && npm run typecheck`
Expected: PASS. Se o teste de mesa falhar porque o `default("mesa")` não aparece no `parse`, garantir que o primeiro ramo use `.default("mesa")` antes do `.strict()` como acima.

- [ ] **Step 3: Erros e mensagens**

Em `src/lib/observability/core.ts`: acrescentar a `errorCodes` os valores `"PICKUP_DISABLED"`, `"DELIVERY_DISABLED"`, `"INVALID_ZONE"`, `"INVALID_ADDRESS"`, `"BELOW_MINIMUM"`, `"INVALID_PAYMENT"`, `"INVALID_CHANGE"`, e incluí-los na lista que `errorStatus` mapeia para `400` (ao lado de `"CLOSED"`). Acrescentar em `scripts/test-observability.mjs` um caso: `assert.equal(core.errorStatus(core.errorCode(new Error("BELOW_MINIMUM"))), 400)` para cada código novo (laço).

Em `src/lib/client-api.ts`, no mapa de mensagens, acrescentar:

```ts
          PICKUP_DISABLED: "Este restaurante não está aceitando pedidos para retirada agora.",
          DELIVERY_DISABLED: "Este restaurante não está fazendo entregas agora.",
          INVALID_ZONE: "Escolha um bairro atendido pela entrega.",
          INVALID_ADDRESS: "Confira rua e número do endereço de entrega.",
          BELOW_MINIMUM: "O pedido ainda não atingiu o valor mínimo para entrega.",
          INVALID_PAYMENT: "Escolha como vai pagar na entrega ou retirada.",
          INVALID_CHANGE: "O troco precisa ser para um valor maior que o total, e só vale para dinheiro.",
```

Run: `npm run test:observability`
Expected: PASS.

- [ ] **Step 4: Tipos, catálogo e cache**

Em `src/lib/connected-types.ts`: importar `import type { Fulfillment, OrderStatus, PaymentMethod } from "./order-flow";` e aplicar as mudanças de **Interfaces** (campos novos em `RestaurantRow`, tipos `DeliveryZone` e `OrderAddress`, campos de `RealOrder`, `zones` em `Catalog` e `Workspace`).

Em `src/lib/catalog.ts`, dentro de `fetchCatalog`, acrescentar ao `Promise.all` a consulta:

```ts
      client
        .from("delivery_zones")
        .select("id,name,fee_cents,estimate_minutes,active,position")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("position"),
```

incluir o resultado na verificação de erro e no retorno como `zones: zones.data`, e mudar a chave de cache para `["catalog", "v2", slug]` (o comentário de "bump" já existe).

- [ ] **Step 5: Gestão — catálogo, pedido e workspace**

`src/app/api/restaurants/[id]/catalog/route.ts`:
- No ramo `settings` do `schema`, acrescentar `pickup_enabled: z.boolean()`, `delivery_enabled: z.boolean()`, `delivery_min_order_cents: z.number().int().min(0).max(1000000)`.
- Acrescentar ao `discriminatedUnion`:

```ts
  z.object({
    action: z.literal("save_delivery_zone"),
    id: z.uuid(),
    name: z.string().trim().min(2).max(80),
    fee_cents: z.number().int().min(0).max(100000),
    estimate_minutes: z.number().int().min(5).max(240),
    active: z.boolean(),
    position: z.number().int().min(0).max(10000),
  }),
```

- E o ramo no handler (antes de `revoke_marketing`):

```ts
    } else if (body.action === "save_delivery_zone") {
      const { error } = await supabase.rpc("save_delivery_zone", {
        p_restaurant: id,
        p_id: body.id,
        p_name: body.name,
        p_fee: body.fee_cents,
        p_estimate: body.estimate_minutes,
        p_active: body.active,
        p_position: body.position,
      });
      if (error) throw error;
```

(A invalidação do catálogo já cobre todas as ações exceto `revoke_marketing`/`moderate_feedback`, portanto inclui bairros e settings.)

`src/app/api/restaurants/[id]/orders/[orderId]/route.ts`:
- GET: no `select`, acrescentar `fulfillment,delivery_fee_cents,payment_method,change_for_cents,order_addresses(zone_name,street,number,complement,reference)`. A consulta usa `serviceClient()` filtrando pela sessão, então o cliente só lê o endereço do próprio pedido.
- PATCH: trocar o `z.enum` por:

```ts
        status: z.enum(["recebido", "em_preparo", "pronto", "saiu_para_entrega", "entregue", "recusado", "cancelado"]),
        expected_status: z.enum(["aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega"]),
```

`src/app/api/restaurants/[id]/workspace/route.ts`:
- No `select` de `orders`, acrescentar `order_addresses(zone_name,street,number,complement,reference)` (os campos novos de `orders` já vêm com `*`).
- Acrescentar consulta de zonas (todas, inclusive pausadas) ao `Promise.all`: `supabase.from("delivery_zones").select("*").eq("restaurant_id", id).order("position")`, verificada junto com as demais e devolvida como `zones`.
- "Cliente novo": depois de carregar `orders`, para cada pedido em `aguardando_aceite` calcular se existe pedido anterior do mesmo telefone:

```ts
    const pendingOnline = (orders.data || []).filter((o) => o.status === "aguardando_aceite");
    await Promise.all(
      pendingOnline.map(async (order) => {
        const { count, error } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", id)
          .eq("customer_phone", order.customer_phone)
          .neq("status", "recusado")
          .lt("created_at", order.created_at);
        if (error) throw new Error("DATABASE_ERROR");
        order.first_order = count === 0;
      }),
    );
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:foundation && npm run test:observability && npm run test:database`
Expected: tudo passa. Erros de tipo nos componentes que usam `RealOrder.status`/`table_id` (`connected-admin.tsx`, `connected-tracking.tsx`) são esperados se surgirem: corrigir somente o mínimo para compilar (ex.: `order.dining_tables?.number`), porque as Tasks 4 e 5 reescrevem essas telas.

- [ ] **Step 7: Commit**

```bash
git add src/lib/order-payload.ts src/lib/connected-types.ts src/lib/catalog.ts src/lib/observability/core.ts src/lib/client-api.ts src/lib/rate-limit.ts "src/app/api/restaurants/[id]/orders/route.ts" "src/app/api/restaurants/[id]/orders/[orderId]/route.ts" "src/app/api/restaurants/[id]/catalog/route.ts" "src/app/api/restaurants/[id]/workspace/route.ts" scripts/test-foundation.mjs scripts/test-observability.mjs
git commit -m "Accept pickup and delivery orders in the API and expose zones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Checkout e acompanhamento do cliente

**Files:**
- Create: `src/components/fulfillment-fields.tsx`
- Modify: `src/components/demo-provider.tsx` (tipo `Checkout`)
- Modify: `src/components/connected-menu-provider.tsx` (`checkout`)
- Modify: `src/components/menu-app.tsx` (estado `table`, linhas ~56–80; `Checkout`, linhas ~899–1010)
- Modify: `src/components/connected-tracking.tsx`
- Test: `tests/online-checkout.spec.ts`

**Interfaces:**
- Consumes: `orderTotals`, `missingForMinimum`, `isValidChange` (Task 2); `paymentNames`, `statusLabel`, `customerSteps`, `fulfillmentLabel` (Task 2); `Catalog.zones`, `RestaurantRow.pickup_enabled/delivery_enabled/delivery_min_order_cents` (Task 3).
- Produces: `Checkout` (em `demo-provider.tsx`) passa a ser:

```ts
export type Checkout = {
  name: string;
  phone: string;
  table: number;
  consent: boolean;
  key: string;
  online?: OnlineChoice;
};
export type OnlineChoice =
  | { fulfillment: "retirada"; payment: PaymentMethod; changeFor: number | null }
  | {
      fulfillment: "entrega";
      payment: PaymentMethod;
      changeFor: number | null;
      address: { zoneId: string; street: string; number: string; complement: string; reference: string };
    };
```

- Produces: contexto do cardápio (`DemoContext`) ganha campo opcional `online?: { pickup: boolean; delivery: boolean; minimum: number; zones: DeliveryZone[] }`, fornecido apenas pelo `ConnectedMenuProvider` a partir do catálogo.

- [ ] **Step 1: Teste de navegador que falha**

Criar `tests/online-checkout.spec.ts`. Como o cardápio conectado precisa de Supabase, o teste intercepta as rotas da API com `page.route` (o servidor renderiza o catálogo real, então use o restaurante de demonstração apenas para garantir que a demo **não** mostra modalidades):

```ts
import { test, expect } from "@playwright/test";

test("demo stays table-only: no pickup/delivery choice in checkout", async ({ page }) => {
  await page.goto("/r/demo");
  await page.getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Adicionar •/ }).click();
  await page.getByRole("button", { name: /Abrir sacola com/ }).click();
  await page.getByRole("button", { name: /Finalizar|Fechar pedido|Continuar/ }).click();
  await expect(page.getByLabel("Mesa")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Entrega" })).toHaveCount(0);
});
```

(O fluxo online completo é coberto pelo teste hospedado da Task 6, porque depende do catálogo real com bairros.)

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe" npx playwright test tests/online-checkout.spec.ts`
Expected: deve passar já agora (é teste de regressão da demo); se o botão de abrir o checkout tiver outro nome, ajustar o seletor lendo `menu-app.tsx` — não mudar a interface para caber no teste.

- [ ] **Step 2: Componente `fulfillment-fields.tsx`**

```tsx
"use client";
import { money } from "@/lib/utils";
import { missingForMinimum, orderTotals } from "@/lib/online-order";
import { paymentNames, type PaymentMethod } from "@/lib/order-flow";
import type { DeliveryZone } from "@/lib/connected-types";
import type { OnlineChoice } from "./demo-provider";

export type OnlineOptions = {
  pickup: boolean;
  delivery: boolean;
  minimum: number;
  zones: DeliveryZone[];
};
export type FulfillmentDraft = {
  fulfillment: "retirada" | "entrega";
  payment: PaymentMethod;
  changeFor: string;
  zoneId: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
};

export function initialDraft(options: OnlineOptions): FulfillmentDraft {
  return {
    fulfillment: options.pickup ? "retirada" : "entrega",
    payment: "pix",
    changeFor: "",
    zoneId: options.zones[0]?.id ?? "",
    street: "",
    number: "",
    complement: "",
    reference: "",
  };
}

// Converts the form draft into the checkout choice; reais → centavos.
export function draftToChoice(draft: FulfillmentDraft): OnlineChoice {
  const changeFor =
    draft.payment === "dinheiro" && draft.changeFor.trim()
      ? Math.round(Number(draft.changeFor.replace(",", ".")) * 100)
      : null;
  if (draft.fulfillment === "retirada")
    return { fulfillment: "retirada", payment: draft.payment, changeFor };
  return {
    fulfillment: "entrega",
    payment: draft.payment,
    changeFor,
    address: {
      zoneId: draft.zoneId,
      street: draft.street,
      number: draft.number,
      complement: draft.complement,
      reference: draft.reference,
    },
  };
}

export function FulfillmentFields({
  options,
  draft,
  onChange,
  subtotal,
}: {
  options: OnlineOptions;
  draft: FulfillmentDraft;
  onChange: (draft: FulfillmentDraft) => void;
  subtotal: number;
}) {
  const set = (patch: Partial<FulfillmentDraft>) => onChange({ ...draft, ...patch });
  const zone = options.zones.find((z) => z.id === draft.zoneId) ?? null;
  const totals = orderTotals(subtotal, draft.fulfillment, zone);
  const missing =
    draft.fulfillment === "entrega" ? missingForMinimum(subtotal, options.minimum) : 0;
  return (
    <div className="form-stack">
      <fieldset className="choice-group">
        <legend>Como você quer receber?</legend>
        {options.pickup && (
          <label className="checkbox-label">
            <input
              type="radio"
              name="fulfillment"
              checked={draft.fulfillment === "retirada"}
              onChange={() => set({ fulfillment: "retirada" })}
            />
            <span>Retirada</span>
          </label>
        )}
        {options.delivery && (
          <label className="checkbox-label">
            <input
              type="radio"
              name="fulfillment"
              checked={draft.fulfillment === "entrega"}
              onChange={() => set({ fulfillment: "entrega" })}
            />
            <span>Entrega</span>
          </label>
        )}
      </fieldset>
      {draft.fulfillment === "entrega" && (
        <>
          <label className="form-label">
            Bairro
            <select
              required
              value={draft.zoneId}
              onChange={(e) => set({ zoneId: e.target.value })}
            >
              {options.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {money(z.fee_cents)} · ~{z.estimate_minutes} min
                </option>
              ))}
            </select>
          </label>
          <div className="form-columns">
            <label className="form-label">
              Rua
              <input
                required
                minLength={3}
                maxLength={150}
                autoComplete="address-line1"
                value={draft.street}
                onChange={(e) => set({ street: e.target.value })}
              />
            </label>
            <label className="form-label">
              Número
              <input
                required
                maxLength={20}
                value={draft.number}
                onChange={(e) => set({ number: e.target.value })}
              />
            </label>
          </div>
          <label className="form-label">
            Complemento (opcional)
            <input
              maxLength={80}
              autoComplete="address-line2"
              value={draft.complement}
              onChange={(e) => set({ complement: e.target.value })}
            />
          </label>
          <label className="form-label">
            Ponto de referência (opcional)
            <input
              maxLength={150}
              value={draft.reference}
              onChange={(e) => set({ reference: e.target.value })}
            />
          </label>
        </>
      )}
      <fieldset className="choice-group">
        <legend>
          Pagamento na {draft.fulfillment === "entrega" ? "entrega" : "retirada"}
        </legend>
        {(Object.keys(paymentNames) as PaymentMethod[]).map((method) => (
          <label className="checkbox-label" key={method}>
            <input
              type="radio"
              name="payment"
              checked={draft.payment === method}
              onChange={() => set({ payment: method, changeFor: "" })}
            />
            <span>{paymentNames[method]}</span>
          </label>
        ))}
      </fieldset>
      {draft.payment === "dinheiro" && (
        <label className="form-label">
          Troco para quanto? (opcional)
          <input
            inputMode="decimal"
            placeholder="Ex.: 100"
            value={draft.changeFor}
            onChange={(e) => set({ changeFor: e.target.value })}
          />
        </label>
      )}
      <div className="checkout-summary">
        <div>
          <span>Subtotal</span>
          <strong>{money(totals.subtotal)}</strong>
        </div>
        {draft.fulfillment === "entrega" && (
          <div>
            <span>Taxa de entrega</span>
            <strong>{money(totals.fee)}</strong>
          </div>
        )}
        <div className="total-row">
          <span>Total</span>
          <strong>{money(totals.total)}</strong>
        </div>
      </div>
      {missing > 0 && (
        <p className="notice small" role="status">
          Faltam {money(missing)} para o pedido mínimo da entrega ({money(options.minimum)}).
        </p>
      )}
    </div>
  );
}
```

(Confirmar que `money` é exportado por `src/lib/utils.ts`; se estiver em outro módulo, importar de onde `menu-app.tsx` importa.)

- [ ] **Step 3: Tipos do checkout e envio**

Em `src/components/demo-provider.tsx`: substituir `export type Checkout = {...}` pelo bloco de **Interfaces**, com `import type { PaymentMethod } from "@/lib/order-flow";`, e acrescentar ao tipo `Context` o campo opcional `online?: import("./fulfillment-fields").OnlineOptions;`. O `DemoProvider` não fornece `online` (a demo ignora `data.online`).

Em `src/components/connected-menu-provider.tsx`:
- Fornecer `online` no valor do contexto:

```ts
      online:
        catalog.restaurant.pickup_enabled || catalog.restaurant.delivery_enabled
          ? {
              pickup: catalog.restaurant.pickup_enabled,
              delivery: catalog.restaurant.delivery_enabled && catalog.zones.length > 0,
              minimum: catalog.restaurant.delivery_min_order_cents,
              zones: catalog.zones,
            }
          : undefined,
```

- Em `checkout(data)`, montar o corpo por tipo (a mesa continua idêntica):

```ts
    const items = current.current.bag.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      expected_price: i.price,
      note: i.note,
      removed_ingredients: [...(i.removedIngredients || [])].sort(),
      option_ids: (i.addOns || []).map((o) => o.id).sort(),
    }));
    const customer = {
      name: data.name.trim(),
      phone: data.phone.replace(/\D/g, ""),
      marketing_consent: data.consent,
    };
    let body: Record<string, unknown>;
    if (!data.online) {
      const table = catalog.tables.find((t) => t.active && t.number === data.table);
      if (!table) throw new Error("Escolha uma mesa válida.");
      body = { table_id: table.id, ...customer, items };
    } else if (data.online.fulfillment === "retirada") {
      body = {
        fulfillment: "retirada",
        payment_method: data.online.payment,
        change_for_cents: data.online.changeFor,
        ...customer,
        items,
      };
    } else {
      const a = data.online.address;
      body = {
        fulfillment: "entrega",
        payment_method: data.online.payment,
        change_for_cents: data.online.changeFor,
        address: {
          zone_id: a.zoneId,
          street: a.street.trim(),
          number: a.number.trim(),
          complement: a.complement.trim(),
          reference: a.reference.trim(),
        },
        ...customer,
        items,
      };
    }
    await ensureGuestSession(catalog.restaurant.id);
```

(Manter o restante — fingerprint, chave pendente, envio e limpeza — sem alterações, usando o novo `body`.)

- [ ] **Step 4: Checkout no cardápio**

Em `src/components/menu-app.tsx`:
- Guardar se a URL trouxe mesa: ao lado de `const [table, setTable] = ...` acrescentar `const [hasTable, setHasTable] = useState(false);` e, no efeito que lê `mesa`, chamar `setHasTable(true)` quando o valor for válido.
- Passar `hasTable` para o checkout: `<Checkout table={table} hasTable={hasTable} />`.
- No componente `Checkout`:
  - Assinatura `function Checkout({ table, hasTable }: { table: number; hasTable: boolean })`.
  - `const { state, checkout, mode, slug, online } = useDemo();`
  - `const useOnline = !!online && !hasTable;`
  - `const [draft, setDraft] = useState(() => (online ? initialDraft(online) : null));`
  - Total exibido: subtotal da sacola (como hoje) quando `!useOnline`; quando `useOnline`, o resumo de `FulfillmentFields` mostra subtotal/taxa/total e o bloco atual "Total • pagamento no local" não é exibido.
  - No `onSubmit`, antes de chamar `checkout`: se `useOnline` e `draft` for entrega com `missingForMinimum(subtotal, online.minimum) > 0`, mostrar o erro "O pedido ainda não atingiu o valor mínimo para entrega." e não enviar; se o troco informado for inválido (`!isValidChange(...)` com o total de `orderTotals`), mostrar "O troco precisa ser para um valor maior que o total." e não enviar. Depois chamar `checkout({ name, phone, table: chosenTable, consent, key: key.current, online: useOnline && draft ? draftToChoice(draft) : undefined })`.
  - Renderizar `{useOnline && draft ? <FulfillmentFields options={online!} draft={draft} onChange={setDraft} subtotal={total} /> : <label className="form-label">Mesa …(select atual)…</label>}` no lugar do seletor de mesa (o seletor de mesa continua exatamente igual quando `!useOnline`).
  - Texto do botão: `"Enviar pedido"` permanece; a nota de privacidade ganha, quando `useOnline` e entrega, a frase "O endereço é usado apenas para entregar este pedido."

- [ ] **Step 5: Acompanhamento do cliente**

Em `src/components/connected-tracking.tsx`, trocar o uso de `statusNames`/`statusFlow` de `@/lib/types` por `statusLabel`, `customerSteps`, `fulfillmentLabel` e `paymentNames` de `@/lib/order-flow`:
- Cabeçalho: `{statusLabel(order.status, order.fulfillment)}` na pílula.
- Linha de contexto: `{fulfillmentLabel({ fulfillment: order.fulfillment, table: order.dining_tables?.number, zone: order.order_addresses?.zone_name })} · {data}`.
- Se `order.status` for `cancelado` ou `recusado`: `<div className="notice">{order.status === "recusado" ? "Recusado" : "Cancelado"}: {order.cancellation_reason}</div>`; senão a lista de etapas com `customerSteps(order.fulfillment)`, marcando concluídas as etapas com índice ≤ índice do status atual, e rótulo `statusLabel(step, order.fulfillment)`.
- Endereço (entrega): `{order.order_addresses && <p>Entregar em {street}, {number}{complement ? ` (${complement})` : ""} · {zone_name}</p>}`.
- Pagamento (online): `{order.payment_method && <p>Pagamento: {paymentNames[order.payment_method]}{order.change_for_cents ? ` · troco para ${money(order.change_for_cents)}` : ""}</p>}`.
- Resumo: quando `order.delivery_fee_cents > 0`, linha "Taxa de entrega" antes do total.
- A avaliação/convite do Google continua condicionada a `order.status === "entregue"`.

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:online`
Com o dev server em 3101 (`cardapio-melhorias`), Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe" npx playwright test tests/online-checkout.spec.ts tests/app.spec.ts tests/reels.spec.ts --reporter=line`
Expected: tudo passa (falha conhecida sob `next dev`: `tests/app.spec.ts:210`).

- [ ] **Step 7: Commit**

```bash
git add src/components/fulfillment-fields.tsx src/components/demo-provider.tsx src/components/connected-menu-provider.tsx src/components/menu-app.tsx src/components/connected-tracking.tsx tests/online-checkout.spec.ts
git commit -m "Let customers order for pickup or delivery and track it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Gestão — quadro de pedidos, bairros e alerta

**Files:**
- Create: `src/components/order-board.tsx`
- Create: `src/components/delivery-settings.tsx`
- Create: `src/components/use-order-alerts.ts`
- Modify: `src/components/connected-admin.tsx` (função `Orders` linhas ~343–527 removida; `change` ~121; página `configuracoes` ~307; toolbar de pedidos)
- Test: `scripts/test-online.mjs` (já cobre a regra do alerta), `npm run typecheck`

**Interfaces:**
- Consumes: `nextAction`, `canCancel`, `statusLabel`, `fulfillmentLabel`, `paymentNames`, `OrderStatus` (Task 2); `whatsappConfirmationLink` (Task 2); `pendingCount`, `shouldPlayAlert`, `ALERT_REPEAT_MS` (Task 2); `Workspace.zones`, `RealOrder.first_order`, `RealOrder.order_addresses` (Task 3).
- Produces: `OrderBoard({ orders, busy, change, restaurantName })` com `change: (order: RealOrder, status: OrderStatus, reason?: string, estimate?: number) => Promise<void>`; `DeliverySettings({ data, save, busy })`; `useOrderAlerts(orders: RealOrder[]): { enabled: boolean; muted: boolean; enable: () => Promise<void>; toggleMute: () => void }`.

- [ ] **Step 1: `order-board.tsx`**

Mover a função `Orders` de `connected-admin.tsx` para `src/components/order-board.tsx` como `export function OrderBoard`, com estas mudanças:
- Colunas abertas: `["aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega"]`, ocultando `aguardando_aceite` e `saiu_para_entrega` quando não houver pedidos nelas; histórico: `["entregue", "recusado", "cancelado"]`.
- Título da coluna: `statusLabel(column, "mesa")` exceto `aguardando_aceite` → "Aguardando aceite".
- Cabeçalho do cartão: `#{order.number}` e `fulfillmentLabel({ fulfillment: order.fulfillment, table: order.dining_tables?.number, zone: order.order_addresses?.zone_name })`; quando `order.first_order` → `<span className="status-pill">Cliente novo</span>`.
- Para pedidos online: telefone do cliente, forma de pagamento (`paymentNames`) e troco; para entrega, endereço completo (rua, número, complemento, referência).
- Ação principal: `const next = nextAction(order.status, order.fulfillment)`; botão com `next.label`; ao confirmar `aguardando_aceite → recebido`, o modal exige "Tempo estimado em minutos" (`required`, 1–180) e envia `estimate`.
- Ações secundárias:
  - Em `aguardando_aceite`: botão "Recusar" (modal com "Motivo da recusa", `required`, 3–300) que envia `status: "recusado"` e `reason`; link "Confirmar no WhatsApp" (`<a target="_blank" rel="noopener noreferrer" href={whatsappConfirmationLink({...order, items: order.order_items, address: order.order_addresses, restaurantName})}>`).
  - Quando `canCancel(order.status)`: botão "Cancelar pedido" (modal atual de motivo).
- O modal de estimativa opcional de `recebido → em_preparo` permanece como hoje.
- Total: `money(order.total_cents)`; quando `delivery_fee_cents > 0`, linha "Taxa {money(...)}".
- Imports necessários: `Button`, `Modal`, `OrderChoices`, `money`, `ShoppingBag` como no arquivo atual.

Em `connected-admin.tsx`: remover a função `Orders`, importar `OrderBoard`, trocar o tipo `Status` de `change` por `OrderStatus` e renderizar `<OrderBoard orders={data.orders} busy={busy} change={change} restaurantName={data.restaurant.name} />`.

- [ ] **Step 2: `use-order-alerts.ts`**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_REPEAT_MS, pendingCount, shouldPlayAlert } from "@/lib/order-alerts";
import type { RealOrder } from "@/lib/connected-types";

const MUTE_KEY = "gestao:alertas:mudo";

function chime(context: AudioContext) {
  const now = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.18, 1175]] as const) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    osc.connect(gain).connect(context.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.18);
  }
}

// Browsers block audio until a user gesture, so alerts start with "Ativar alertas".
export function useOrderAlerts(orders: RealOrder[]) {
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const lastPlayed = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const pending = pendingCount(orders);

  const enable = useCallback(async () => {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    if ("Notification" in window && Notification.permission === "default")
      await Notification.requestPermission();
    setEnabled(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => {
      try {
        localStorage.setItem(MUTE_KEY, value ? "0" : "1");
      } catch {}
      return !value;
    });
  }, []);

  const check = useCallback(() => {
    const ids = orders.map((o) => o.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // first load is not "new"
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    fresh.forEach((id) => seen.current!.add(id));
    const now = Date.now();
    if (
      enabled &&
      audio.current &&
      shouldPlayAlert({ pending, newOrderIds: fresh, lastPlayedAt: lastPlayed.current, now, muted })
    ) {
      chime(audio.current);
      lastPlayed.current = now;
      if (document.hidden && "Notification" in window && Notification.permission === "granted")
        new Notification(pending ? `${pending} pedido(s) aguardando aceite` : "Novo pedido");
    }
  }, [orders, pending, enabled, muted]);

  useEffect(() => {
    check();
    const timer = setInterval(check, ALERT_REPEAT_MS);
    return () => clearInterval(timer);
  }, [check]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) Novo pedido · /, "");
    document.title = pending ? `(${pending}) Novo pedido · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [pending]);

  return { enabled, muted, enable, toggleMute };
}
```

Em `connected-admin.tsx`, chamar `const alerts = useOrderAlerts(data?.orders ?? []);` no `ConnectedAdmin` e, na página de pedidos, antes do `OrderBoard`, mostrar:

```tsx
<div className="connected-toolbar">
  {!alerts.enabled ? (
    <Button variant="outline" onClick={() => void alerts.enable()}>Ativar alertas de pedido</Button>
  ) : (
    <Button variant="ghost" onClick={alerts.toggleMute}>
      {alerts.muted ? "Ligar som dos alertas" : "Silenciar alertas"}
    </Button>
  )}
</div>
```

- [ ] **Step 3: `delivery-settings.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import type { DeliveryZone, Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function DeliverySettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<DeliveryZone | null>(null);
  const zones = data.zones;
  async function saveZone(zone: DeliveryZone) {
    try {
      setError("");
      await save({
        action: "save_delivery_zone",
        id: zone.id,
        name: zone.name,
        fee_cents: zone.fee_cents,
        estimate_minutes: zone.estimate_minutes,
        active: zone.active,
        position: zone.position,
      });
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section className="admin-panel connected-panel form-stack">
      <h2>Bairros de entrega</h2>
      <p className="field-help">
        Liste os bairros atendidos com a taxa e o tempo estimado. O cliente escolhe o bairro e informa o endereço.
      </p>
      <ul className="connected-items">
        {zones.map((zone) => (
          <li key={zone.id}>
            <strong>{zone.name}</strong> · {money(zone.fee_cents)} · ~{zone.estimate_minutes} min
            {!zone.active && " · pausado"}{" "}
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(zone)}>Editar</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void saveZone({ ...zone, active: !zone.active })}>
              {zone.active ? "Pausar" : "Reativar"}
            </Button>
          </li>
        ))}
      </ul>
      {zones.length === 0 && <p>Nenhum bairro cadastrado. Sem bairros, a entrega não aparece para o cliente.</p>}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          setDraft({ id: crypto.randomUUID(), name: "", fee_cents: 0, estimate_minutes: 40, active: true, position: zones.length })
        }
      >
        Adicionar bairro
      </Button>
      {draft && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void saveZone({
              ...draft,
              name: String(form.get("name")).trim(),
              fee_cents: Math.round(Number(String(form.get("fee")).replace(",", ".")) * 100),
              estimate_minutes: Number(form.get("estimate")),
            });
          }}
        >
          <label className="form-label">
            Bairro
            <input name="name" required minLength={2} maxLength={80} defaultValue={draft.name} />
          </label>
          <div className="form-columns">
            <label className="form-label">
              Taxa (R$)
              <input name="fee" type="number" min="0" max="1000" step="0.01" required defaultValue={draft.fee_cents / 100} />
            </label>
            <label className="form-label">
              Tempo estimado (min)
              <input name="estimate" type="number" min={5} max={240} required defaultValue={draft.estimate_minutes} />
            </label>
          </div>
          <Button type="submit" disabled={busy}>Salvar bairro</Button>
        </form>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
```

Em `SettingsForm` (`connected-admin.tsx`): acrescentar, junto ao checkbox `accepting_orders`, dois checkboxes `pickup_enabled` ("Aceitar pedidos para retirada") e `delivery_enabled` ("Aceitar pedidos para entrega") com `defaultChecked` dos valores de `r`, e um campo "Pedido mínimo para entrega (R$)" (`name="delivery_min"`, `type="number"`, `min="0"`, `step="0.01"`, `defaultValue={r.delivery_min_order_cents / 100}`); no `save({ action: "settings", … })` incluir `pickup_enabled: form.has("pickup_enabled")`, `delivery_enabled: form.has("delivery_enabled")`, `delivery_min_order_cents: Math.round(Number(form.get("delivery_min") || 0) * 100)`. Na página `configuracoes`, renderizar `<DeliverySettings data={data} save={save} busy={busy} />` logo abaixo do `SettingsForm`.

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:online`
Com o dev server em 3101: `PLAYWRIGHT_BASE_URL=http://localhost:3101 PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe" npx playwright test tests/management-auth.spec.ts tests/accessibility.spec.ts --reporter=line`
Expected: mesmos resultados da linha de base (falha conhecida `management-auth.spec.ts:38`).

- [ ] **Step 5: Commit**

```bash
git add src/components/order-board.tsx src/components/delivery-settings.tsx src/components/use-order-alerts.ts src/components/connected-admin.tsx
git commit -m "Add order acceptance, delivery zones and new-order alerts to management

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Privacidade, documentação, teste hospedado e regressão

**Files:**
- Modify: `src/app/privacidade/page.tsx`, `src/app/r/[slug]/privacidade/page.tsx`
- Modify: `PRODUCT.md`, `docs/CONTEXTO-PARA-CLAUDE-CODE.md`, `docs/piloto.md`
- Create: `tests/online-orders-live.spec.ts`

- [ ] **Step 1: Privacidade**

Nas duas páginas de privacidade, acrescentar um parágrafo após o que trata de nome/WhatsApp:

```tsx
<p>
  Em pedidos para entrega, o endereço informado (rua, número, complemento,
  referência e bairro) é usado apenas para entregar o pedido e fica visível
  somente para a equipe do restaurante e para você, neste navegador.
</p>
```

- [ ] **Step 2: Documentação**

- `PRODUCT.md`, seção "Limites do MVP": remover "delivery" da lista de exclusões e acrescentar o parágrafo: "Pedidos para retirada e entrega (pagamento na entrega/retirada, taxa por bairro, aceite pelo restaurante) fazem parte do produto desde 24/10/2026; pagamento online, agendamento e integração com marketplaces continuam fora."
- `docs/CONTEXTO-PARA-CLAUDE-CODE.md`: acrescentar após o complemento de 23/10 um "Complemento de 24/10/2026 (branch `melhorias/g-pedidos-online`)" resumindo: migration 011; tipos `mesa/retirada/entrega`; `aguardando_aceite`/`recusado`/`saiu_para_entrega`; `delivery_zones` e `order_addresses`; `src/lib/order-flow.ts` espelha `advance_order`; alerta na gestão; a migration 011 **precisa ser aplicada no Supabase antes do deploy** desta branch.
- `docs/piloto.md`, "Verificação": acrescentar `npm run test:online`.

- [ ] **Step 3: Teste hospedado opt-in**

Criar `tests/online-orders-live.spec.ts` seguindo o padrão de `tests/foundation-live.spec.ts` (skip sem `RUN_CONNECTED_LIVE=1`; `loadEnvFile(".env.local")`; conta e restaurante temporários com `integration-<sufixo>`; limpeza no `finally` com `console.error` só de id e `error.code`):
1. Criar usuário, logar cliente owner, `onboard_restaurant`, inserir produto publicado de R$ 25 numa categoria visível.
2. Pelo owner client: `save_restaurant_settings` com `accepting_orders: true`, horários 00:00–23:59:59 em todos os dias, `pickup_enabled: true`, `delivery_enabled: true`, `delivery_min_order_cents: 3000`, 1 mesa; `save_delivery_zone` "Centro" R$ 7, 40 min.
3. Num contexto de navegador do cliente: abrir `/r/<slug>`, adicionar 2 unidades, abrir checkout, escolher **Entrega**, bairro Centro, rua/número, pagamento Dinheiro com troco 100, nome e WhatsApp; enviar; esperar URL `/r/<slug>/pedido/<id>` e o texto "Aguardando o restaurante aceitar".
4. Pelo service client: conferir `orders.total_cents = 5700`, `fulfillment = 'entrega'`, `order_addresses.zone_name = 'Centro'`.
5. Na gestão (login pela UI): página Pedidos mostra "Aguardando aceite" com "Cliente novo"; Aceitar com 30 min; avançar até "Saiu para entrega" e "Confirmar entrega".
6. No navegador do cliente: recarregar e ver "Entregue" e "Entregar em Rua …".

Rodar apenas com autorização do usuário **e** com a migration 011 aplicada no Supabase hospedado; sem isso, rodar sem a variável e confirmar que aparece como skipped.

- [ ] **Step 4: Regressão completa**

```bash
npm run lint
npm run typecheck
npm run test:foundation
npm run test:online
npm run test:photos
npm run test:observability
npm run test:database
npm run test:media
npm run build -- --webpack
```

Com `npm start -- --port 3101` em segundo plano: `PLAYWRIGHT_BASE_URL=http://localhost:3101 PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe" npx playwright test --reporter=line`
Expected: tudo passa; opt-in skipped; única falha permitida a pré-existente `management-auth.spec.ts:38`. Parar o servidor e confirmar a porta 3101 livre.

- [ ] **Step 5: Commit**

```bash
git add src/app/privacidade/page.tsx "src/app/r/[slug]/privacidade/page.tsx" PRODUCT.md docs/CONTEXTO-PARA-CLAUDE-CODE.md docs/piloto.md tests/online-orders-live.spec.ts
git commit -m "Document online orders, update privacy notes and add hosted end-to-end test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
