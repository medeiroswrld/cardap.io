# I1 — Pix manual pelo cardápio · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Online orders paid by Pix wait in "Aguardando pagamento" with a QR Code (exact amount) and a WhatsApp receipt button for the customer, and only reach the kitchen when the restaurant clicks "Pix recebido".

**Architecture:** Migration 014 adds the `aguardando_pagamento` status, a members-only `restaurant_pix` table, and redefines `place_guest_order` / `advance_order`. A pure `src/lib/pix.ts` builds the static BR Code. The guest tracking route returns the code only while the order waits for payment; the management board gets a new column and a "Pix recebido" action.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase (Postgres RLS + SECURITY DEFINER RPCs), PGlite DB tests, `node:test` unit tests, `qrcode` 1.5.4 (already a dependency).

**Spec:** `docs/superpowers/specs/2026-11-14-i-pix-upsell-design.md` (part I1).

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`.
- Do not run `RUN_CONNECTED_LIVE` tests or write to the hosted Supabase. Do not push.
- Never use port 3000 (local dev server is 3101).
- UI copy in Brazilian Portuguese, exactly as written in this plan.
- Pix key 1–77 chars; merchant name 1–25; merchant city 1–15 (accents removed only inside the generated code).
- `restaurant_pix` is readable only by restaurant members; the public catalog only learns a boolean.
- The Pix code is built from `orders.total_cents` on the server, never from client input.
- `aguardando_pagamento` does not join the 20 s alert repetition; auto-print keeps printing on `recebido`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- Create `supabase/migrations/014_pix_manual.sql` — status, `restaurant_pix`, RPCs, redefined `place_guest_order` and `advance_order`.
- Modify `scripts/lib/test-db.mjs` — register 014.
- Modify `scripts/test-online-orders.mjs` — DB checks for Pix.
- Create `src/lib/pix.ts` — BR Code payload, CRC16, receipt WhatsApp link.
- Create `scripts/test-pix.mjs` — unit tests for `pix.ts`; register in `test:online`.
- Modify `src/lib/order-flow.ts`, `src/lib/order-board.ts`, `scripts/test-online.mjs` — new status in flow, board, labels.
- Modify `src/app/api/restaurants/[id]/orders/[orderId]/route.ts` — PATCH accepts the new expected status; GET returns `pix_code`, `pix_whatsapp`, `restaurant_name`.
- Modify `src/lib/connected-types.ts` — types (`RealOrder` extras, `Workspace.pix`, `Catalog.pixOnline`).
- Modify `src/app/api/restaurants/[id]/workspace/route.ts` — owner reads `restaurant_pix`; first-order badge for the new status.
- Modify `src/app/api/restaurants/[id]/catalog/route.ts` — `save_pix` action.
- Create `src/components/pix-settings.tsx`; modify `src/components/connected-admin.tsx` — owner form.
- Modify `src/lib/catalog.ts`, `src/lib/fulfillment-draft.ts`, `src/components/connected-menu-provider.tsx`, `src/components/fulfillment-fields.tsx` — checkout label.
- Create `src/components/pix-payment.tsx`; modify `src/components/connected-tracking.tsx` — customer QR screen.
- Modify `src/components/order-board.tsx` — waiting time on the card.

---

### Task 1: Migration 014 and database checks

**Files:**
- Create: `supabase/migrations/014_pix_manual.sql`
- Modify: `scripts/lib/test-db.mjs` (MIGRATIONS list)
- Test: `scripts/test-online-orders.mjs` (append before `await db.close();`)

**Interfaces:**
- Produces (SQL): status `aguardando_pagamento`; table `restaurant_pix(restaurant_id uuid pk, pix_key text, merchant_name text, merchant_city text, updated_at timestamptz)`; `save_restaurant_pix(p_restaurant uuid, p_key text, p_name text, p_city text) returns void` (owner only; empty key deletes; empty name/city with a key raises `INVALID_INPUT`); `restaurant_pix_enabled(p_restaurant uuid) returns boolean` (anon may execute); `advance_order` accepts `aguardando_pagamento → recebido` and `aguardando_pagamento → cancelado` (with reason).

- [ ] **Step 1: Write the failing DB checks**

In `scripts/test-online-orders.mjs`, replace the final `await db.close();` with:

```js
await ok("only the owner saves the Pix key and only members read it", async () => {
  await login(ownerB);
  await rejects(() => db.query("select save_restaurant_pix($1,'chave@casa.com','Casa A','Curitiba')", [a]), "FORBIDDEN");
  await login(staffA);
  await rejects(() => db.query("select save_restaurant_pix($1,'chave@casa.com','Casa A','Curitiba')", [a]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select save_restaurant_pix($1,'chave@casa.com','','Curitiba')", [a]), "INVALID_INPUT");
  await db.query("select save_restaurant_pix($1,'  chave@casa.com ','Casa A','Curitiba')", [a]);
  await login(staffA);
  const own = await db.query("select pix_key,merchant_name,merchant_city from restaurant_pix where restaurant_id=$1", [a]);
  assert.deepEqual(own.rows[0], { pix_key: "chave@casa.com", merchant_name: "Casa A", merchant_city: "Curitiba" });
  await login(ownerB);
  assert.equal((await db.query("select * from restaurant_pix")).rows.length, 0);
  await anon();
  await rejects(() => db.query("select * from restaurant_pix"), "permission denied");
  const enabled = await db.query("select restaurant_pix_enabled($1) as on", [a]);
  assert.equal(enabled.rows[0].on, true);
});

let pixDeliveryId;
await ok("Pix online order waits for payment even with auto-accept", async () => {
  await root();
  await db.query("update restaurants set auto_accept_orders=true where id=$1", [a]);
  const r = await place(await guest(), delivery({ payment_method: "pix", change_for_cents: null }));
  pixDeliveryId = r.id;
  assert.equal(r.status, "aguardando_pagamento");
  const { rows } = await db.query("select estimate_minutes from orders where id=$1", [r.id]);
  assert.equal(rows[0].estimate_minutes, null);
  const events = await db.query("select status from order_status_events where order_id=$1", [r.id]);
  assert.deepEqual(events.rows.map((e) => e.status), ["aguardando_pagamento"]);
  const cash = await place(await guest(), { ...base, fulfillment: "retirada", payment_method: "dinheiro", items: items(1) });
  assert.equal(cash.status, "recebido");
});

await ok("Pix recebido moves to recebido with the zone estimate; other jumps are refused", async () => {
  await rejects(() => advance(staffA, pixDeliveryId, "aguardando_pagamento", "em_preparo"), "INVALID_TRANSITION");
  const r = await advance(staffA, pixDeliveryId, "aguardando_pagamento", "recebido");
  assert.equal(r.status, "recebido");
  await root();
  const { rows } = await db.query("select estimate_minutes from orders where id=$1", [pixDeliveryId]);
  assert.equal(rows[0].estimate_minutes, 40);
});

await ok("unpaid Pix order is cancelled only with a reason", async () => {
  const r = await place(await guest(), { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) });
  assert.equal(r.status, "aguardando_pagamento");
  await rejects(() => advance(staffA, r.id, "aguardando_pagamento", "cancelado", "x"), "INVALID_TRANSITION");
  const done = await advance(staffA, r.id, "aguardando_pagamento", "cancelado", "Cliente não pagou");
  assert.equal(done.status, "cancelado");
});

await ok("removing the Pix key turns Pix back into pay-on-delivery", async () => {
  await login(ownerA);
  await db.query("select save_restaurant_pix($1,'','','')", [a]);
  await anon();
  assert.equal((await db.query("select restaurant_pix_enabled($1) as on", [a])).rows[0].on, false);
  const r = await place(await guest(), { ...base, fulfillment: "retirada", payment_method: "pix", items: items(1) });
  assert.equal(r.status, "recebido");
});

await db.close();
```

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-online-orders.mjs`
Expected: FAIL at "only the owner saves the Pix key…" with an error mentioning `save_restaurant_pix` does not exist.

- [ ] **Step 3: Register the migration**

In `scripts/lib/test-db.mjs`, after `"013_auto_accept.sql",` add `"014_pix_manual.sql",`.

- [ ] **Step 4: Write the static part of the migration**

Create `supabase/migrations/014_pix_manual.sql`:

```sql
-- I1: manual Pix from the menu. Online orders paid by Pix wait for the
-- restaurant to confirm the payment before reaching the kitchen.
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('aguardando_pagamento','aguardando_aceite','recebido','em_preparo','pronto','saiu_para_entrega','entregue','recusado','cancelado'));

-- The key is not in "restaurants" because that table is public.
create table public.restaurant_pix (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  pix_key text not null check (length(pix_key) between 1 and 77),
  merchant_name text not null check (length(merchant_name) between 1 and 25),
  merchant_city text not null check (length(merchant_city) between 1 and 15),
  updated_at timestamptz not null default now()
);
alter table public.restaurant_pix enable row level security;
revoke all on public.restaurant_pix from anon, authenticated;
grant select on public.restaurant_pix to authenticated;
create policy member_read on public.restaurant_pix for select to authenticated using (is_member(restaurant_id));

create function public.save_restaurant_pix(p_restaurant uuid,p_key text,p_name text,p_city text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if length(trim(coalesce(p_key,'')))=0 then
  delete from restaurant_pix where restaurant_id=p_restaurant;
  return;
 end if;
 if length(trim(coalesce(p_name,'')))=0 or length(trim(coalesce(p_city,'')))=0 then raise exception 'INVALID_INPUT'; end if;
 insert into restaurant_pix(restaurant_id,pix_key,merchant_name,merchant_city,updated_at)
 values(p_restaurant,trim(p_key),trim(p_name),trim(p_city),now())
 on conflict(restaurant_id) do update set pix_key=excluded.pix_key,merchant_name=excluded.merchant_name,
  merchant_city=excluded.merchant_city,updated_at=now();
end $$;
revoke all on function public.save_restaurant_pix(uuid,text,text,text) from public,anon;
grant execute on function public.save_restaurant_pix(uuid,text,text,text) to authenticated;

create function public.restaurant_pix_enabled(p_restaurant uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from restaurant_pix where restaurant_id=p_restaurant)
$$;
revoke all on function public.restaurant_pix_enabled(uuid) from public;
grant execute on function public.restaurant_pix_enabled(uuid) to anon,authenticated,service_role;
```

- [ ] **Step 5: Append the redefined functions with a script**

`place_guest_order` comes from 013 (latest version) and `advance_order` from 011 (latest version). Run from the repo root:

```bash
python - <<'EOF'
import re
src13 = open('supabase/migrations/013_auto_accept.sql', encoding='utf-8').read()
src11 = open('supabase/migrations/011_online_orders.sql', encoding='utf-8').read()
def block(text, start, end):
    i = text.index(start); j = text.index(end, i); j = text.index('\n', j) + 1
    return text[i:j]
place = block(src13, 'create or replace function public.place_guest_order', 'grant execute on function public.place_guest_order')
adv = block(src11, 'create or replace function public.advance_order', 'grant execute on function public.advance_order')
old = "initial:=case when kind='mesa' or rest.auto_accept_orders then 'recebido' else 'aguardando_aceite' end;"
assert place.count(old) == 1
place = place.replace(old, """initial:=case
  when kind<>'mesa' and payment='pix' and exists(select 1 from restaurant_pix where restaurant_id=p_restaurant) then 'aguardando_pagamento'
  when kind='mesa' or rest.auto_accept_orders then 'recebido'
  else 'aguardando_aceite' end;""")
old1 = "  (existing.status='aguardando_aceite' and p_status='recebido' and p_estimate is not null)"
old2 = "  or (existing.status in ('recebido','em_preparo','saiu_para_entrega') and p_status='cancelado' and with_reason)"
old3 = "  estimate_minutes=coalesce(p_estimate,estimate_minutes)"
for o in (old1, old2, old3): assert adv.count(o) == 1, o
adv = adv.replace(old1, "  (existing.status='aguardando_pagamento' and p_status='recebido')\n  or (existing.status='aguardando_aceite' and p_status='recebido' and p_estimate is not null)")
adv = adv.replace(old2, "  or (existing.status in ('aguardando_pagamento','recebido','em_preparo','saiu_para_entrega') and p_status='cancelado' and with_reason)")
adv = adv.replace(old3, """  estimate_minutes=coalesce(p_estimate,
   case when existing.status='aguardando_pagamento' and existing.fulfillment='entrega' then
    (select least(z.estimate_minutes,180) from order_addresses a join delivery_zones z on z.id=a.zone_id and z.restaurant_id=a.restaurant_id where a.order_id=p_order)
   end,
   estimate_minutes)""")
with open('supabase/migrations/014_pix_manual.sql', 'a', encoding='utf-8', newline='\n') as f:
    f.write('\n' + place + '\n' + adv)
EOF
```

Expected: no output; `grep -c "aguardando_pagamento" supabase/migrations/014_pix_manual.sql` prints at least `5`.

- [ ] **Step 6: Run the DB checks**

Run: `node scripts/test-online-orders.mjs`
Expected: all PASS, last line `21 online-order database checks passed.`

Then run the whole DB suite: `npm run test:database`
Expected: `45 database checks passed…`, `21 online-order…`, `10 CRM…`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/014_pix_manual.sql scripts/lib/test-db.mjs scripts/test-online-orders.mjs
git commit -m "feat(pix): migration 014 with payment-pending status and members-only Pix key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pix BR Code library

**Files:**
- Create: `src/lib/pix.ts`
- Create: `scripts/test-pix.mjs`
- Modify: `package.json` (`test:online` script)

**Interfaces:**
- Produces:
  - `crc16(payload: string): string` — 4 uppercase hex chars, CRC16-CCITT (poly 0x1021, init 0xFFFF) over UTF-8 bytes.
  - `pixText(text: string, max: number): string` — removes accents and characters outside `A-Za-z0-9 .-`, trims, cuts to `max`.
  - `orderTxid(number: number): string` — `"PED" + number`.
  - `pixPayload(input: { key: string; name: string; city: string; amountCents?: number; txid: string }): string`.
  - `pixReceiptLink(input: { phone: string; number: number; totalCents: number; restaurantName: string }): string | null` — `https://wa.me/55<digits>?text=...`, or `null` when the phone does not have 10–11 digits (12–13 when it already starts with `55`).

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-pix.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const pix = loader()("src/lib/pix.ts");

test("matches the Banco Central reference payload", () => {
  assert.equal(
    pix.pixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA", txid: "***" }),
    "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  );
});

test("adds the exact amount and the order txid", () => {
  const code = pix.pixPayload({ key: "chave@casa.com", name: "Capi Burguer", city: "Curitiba", amountCents: 6300, txid: pix.orderTxid(42) });
  assert.ok(code.includes("540563.00"));
  assert.ok(code.includes("0505PED42"));
  assert.equal(code.slice(-4), pix.crc16(code.slice(0, -4)));
});

test("removes accents and cuts name and city to the limits", () => {
  assert.equal(pix.pixText("  São José dos Pinhais ", 15), "Sao Jose dos Pi");
  assert.equal(pix.pixText("Pão & Cia Lanchonete Ltda ME", 25), "Pao  Cia Lanchonete Ltda");
  const code = pix.pixPayload({ key: "k", name: "Açaí", city: "Maringá", amountCents: 100, txid: "PED1" });
  assert.ok(code.includes("5904Acai6007Maringa"));
});

test("receipt link opens WhatsApp with the order and amount", () => {
  const link = pix.pixReceiptLink({ phone: "(41) 99131-4989", number: 42, totalCents: 6300, restaurantName: "Capi Burguer" });
  assert.ok(link.startsWith("https://wa.me/5541991314989?text="));
  const text = decodeURIComponent(link.split("text=")[1]);
  assert.match(text, /Pedido #42 no Capi Burguer/);
  assert.match(text, /R\$\s63,00/);
  assert.equal(pix.pixReceiptLink({ phone: "5541991314989", number: 1, totalCents: 1, restaurantName: "x" }).startsWith("https://wa.me/5541991314989"), true);
  assert.equal(pix.pixReceiptLink({ phone: "123", number: 1, totalCents: 1, restaurantName: "x" }), null);
});
```

In `package.json`, change `test:online` to:

```json
"test:online": "node --test scripts/test-online.mjs scripts/test-order-ticket.mjs scripts/test-pix.mjs",
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/test-pix.mjs`
Expected: FAIL — cannot find `src/lib/pix.ts`.

- [ ] **Step 3: Implement `src/lib/pix.ts`**

```ts
// Static Pix "BR Code" (EMV QR) with a fixed amount, per the Banco Central
// manual. No bank or gateway involved: the restaurant confirms the receipt.

function field(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Bank apps reject accents in the merchant name and city.
export function pixText(text: string, max: number) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

export function orderTxid(number: number) {
  return `PED${number}`;
}

export function pixPayload(input: {
  key: string;
  name: string;
  city: string;
  amountCents?: number;
  txid: string;
}) {
  const account = field("00", "br.gov.bcb.pix") + field("01", input.key.trim());
  let payload =
    field("00", "01") + field("26", account) + field("52", "0000") + field("53", "986");
  if (input.amountCents !== undefined)
    payload += field("54", (input.amountCents / 100).toFixed(2));
  payload +=
    field("58", "BR") +
    field("59", pixText(input.name, 25)) +
    field("60", pixText(input.city, 15)) +
    field("62", field("05", input.txid)) +
    "6304";
  return payload + crc16(payload);
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function pixReceiptLink(input: {
  phone: string;
  number: number;
  totalCents: number;
  restaurantName: string;
}) {
  let digits = input.phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  else if (!(digits.startsWith("55") && (digits.length === 12 || digits.length === 13)))
    return null;
  const text = `Olá! Pedido #${input.number} no ${input.restaurantName}. Segue o comprovante do Pix de ${brl(input.totalCents)}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
```

Note on the second `pixText` assertion: `"Pão & Cia Lanchonete Ltda ME"` → accents removed → `"Pao & Cia Lanchonete Ltda ME"` → `&` removed leaves a double space → `"Pao  Cia Lanchonete Ltda ME"` → cut to 25 → `"Pao  Cia Lanchonete Ltda "` → final trim → `"Pao  Cia Lanchonete Ltda"`.

- [ ] **Step 4: Run tests**

Run: `npm run test:online`
Expected: all pass (previous 18 + 4 new = 22).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pix.ts scripts/test-pix.mjs package.json
git commit -m "feat(pix): static BR Code payload and WhatsApp receipt link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Order flow, board columns and PATCH route

**Files:**
- Modify: `src/lib/order-flow.ts`
- Modify: `src/lib/order-board.ts`
- Modify: `src/app/api/restaurants/[id]/orders/[orderId]/route.ts` (PATCH `expected_status` enum)
- Test: `scripts/test-online.mjs`

**Interfaces:**
- Produces:
  - `OrderStatus` gains `"aguardando_pagamento"`; `statusLabel("aguardando_pagamento", any)` → `"Aguardando pagamento"`.
  - `customerSteps(fulfillment: Fulfillment, paysFirst = false): OrderStatus[]` — online flows start with `"aguardando_pagamento"` when `paysFirst`.
  - `nextAction("aguardando_pagamento", f)` → `{ status: "recebido", label: "Pix recebido" }`.
  - `canCancel("aguardando_pagamento")` → `true`.
  - `paymentLabel(method: PaymentMethod, pixOnline: boolean): string` — `"Pix agora, pelo cardápio"` for `pix` when `pixOnline`, else `paymentNames[method]`.
  - `paysFirst(order: { order_status_events: { status: string }[] }): boolean` — true when the history has `aguardando_pagamento`.
  - `boardColumns` puts `"aguardando_pagamento"` first, hidden while empty.
  - `minutesWaiting(createdAt: string, now: number): number` in `order-board.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/test-online.mjs`:

```js
test("Pix paid in advance has its own first step and action", () => {
  assert.deepEqual(flow.customerSteps("entrega", true), ["aguardando_pagamento", "recebido", "em_preparo", "pronto", "saiu_para_entrega", "entregue"]);
  assert.deepEqual(flow.customerSteps("retirada", true), ["aguardando_pagamento", "recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.customerSteps("mesa", true), ["recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.nextAction("aguardando_pagamento", "entrega"), { status: "recebido", label: "Pix recebido" });
  assert.equal(flow.canCancel("aguardando_pagamento"), true);
  assert.equal(flow.statusLabel("aguardando_pagamento", "retirada"), "Aguardando pagamento");
  assert.equal(flow.paymentLabel("pix", true), "Pix agora, pelo cardápio");
  assert.equal(flow.paymentLabel("pix", false), "Pix na hora");
  assert.equal(flow.paysFirst({ order_status_events: [{ status: "aguardando_pagamento" }, { status: "recebido" }] }), true);
  assert.equal(flow.paysFirst({ order_status_events: [{ status: "recebido" }] }), false);
});

test("board shows the payment column first and only when it has orders", () => {
  assert.deepEqual(board.boardColumns([], false), ["recebido", "em_preparo", "pronto"]);
  assert.deepEqual(board.boardColumns([{ status: "aguardando_pagamento" }], false), ["aguardando_pagamento", "recebido", "em_preparo", "pronto"]);
  assert.equal(board.columnTitle("aguardando_pagamento"), "Aguardando pagamento");
  assert.equal(board.modalKind("aguardando_pagamento", "recebido"), "confirm");
  assert.equal(board.minutesWaiting("2026-11-14T20:00:00.000Z", Date.parse("2026-11-14T20:07:40.000Z")), 7);
  assert.equal(board.minutesWaiting("2026-11-14T20:00:00.000Z", Date.parse("2026-11-14T19:59:00.000Z")), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/test-online.mjs`
Expected: FAIL — `flow.paymentLabel is not a function` (and the board test fails).

- [ ] **Step 3: Update `src/lib/order-flow.ts`**

Change the header comment to `// Order lifecycle per fulfillment. Mirrors advance_order in migration 014.` and apply:

```ts
export type OrderStatus =
  | "aguardando_pagamento"
  | "aguardando_aceite"
  | "recebido"
  | "em_preparo"
  | "pronto"
  | "saiu_para_entrega"
  | "entregue"
  | "recusado"
  | "cancelado";
```

In `names`, add as the first entry: `aguardando_pagamento: "Aguardando pagamento",`.

Replace `customerSteps` with:

```ts
// paysFirst: the order was created waiting for an advance Pix payment.
export function customerSteps(fulfillment: Fulfillment, paysFirst = false): OrderStatus[] {
  if (fulfillment === "mesa")
    return ["recebido", "em_preparo", "pronto", "entregue"];
  const first: OrderStatus = paysFirst ? "aguardando_pagamento" : "aguardando_aceite";
  if (fulfillment === "retirada")
    return [first, "recebido", "em_preparo", "pronto", "entregue"];
  return [first, "recebido", "em_preparo", "pronto", "saiu_para_entrega", "entregue"];
}

export function paysFirst(order: { order_status_events: { status: string }[] }) {
  return order.order_status_events.some((e) => e.status === "aguardando_pagamento");
}

export function paymentLabel(method: PaymentMethod, pixOnline: boolean) {
  return method === "pix" && pixOnline ? "Pix agora, pelo cardápio" : paymentNames[method];
}
```

In `nextAction`, add as the first line of the body:

```ts
  if (status === "aguardando_pagamento")
    return { status: "recebido", label: "Pix recebido" };
```

Replace `canCancel` with:

```ts
export function canCancel(status: OrderStatus) {
  return ["aguardando_pagamento", "recebido", "em_preparo", "saiu_para_entrega"].includes(status);
}
```

- [ ] **Step 4: Update `src/lib/order-board.ts`**

```ts
const OPEN: OrderStatus[] = [
  "aguardando_pagamento",
  "aguardando_aceite",
  "recebido",
  "em_preparo",
  "pronto",
  "saiu_para_entrega",
];
```

Replace `boardColumns` with:

```ts
// Columns that only exist for online orders are hidden while empty.
const ONLINE_ONLY: OrderStatus[] = ["aguardando_pagamento", "aguardando_aceite", "saiu_para_entrega"];
export function boardColumns(orders: { status: string }[], history: boolean) {
  if (history) return HISTORY;
  return OPEN.filter(
    (column) => !ONLINE_ONLY.includes(column) || orders.some((o) => o.status === column),
  );
}
```

Append:

```ts
export function minutesWaiting(createdAt: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
}
```

- [ ] **Step 5: Update the PATCH route**

In `src/app/api/restaurants/[id]/orders/[orderId]/route.ts`, in `expected_status: z.enum([...])` add `"aguardando_pagamento",` as the first value.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm run test:online && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/order-flow.ts src/lib/order-board.ts "src/app/api/restaurants/[id]/orders/[orderId]/route.ts" scripts/test-online.mjs
git commit -m "feat(pix): payment-pending status in order flow, board and PATCH route

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Owner Pix settings

**Files:**
- Modify: `src/lib/connected-types.ts` (`Workspace`)
- Modify: `src/app/api/restaurants/[id]/workspace/route.ts`
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts`
- Create: `src/components/pix-settings.tsx`
- Modify: `src/components/connected-admin.tsx` (configuracoes page)

**Interfaces:**
- Consumes: RPC `save_restaurant_pix` (Task 1).
- Produces: `Workspace.pix: { pix_key: string; merchant_name: string; merchant_city: string } | null`; catalog POST action `{ action: "save_pix", pix_key: string, merchant_name: string, merchant_city: string }`; component `PixSettings({ data, save, busy })`.

- [ ] **Step 1: Types**

In `src/lib/connected-types.ts`, inside `export type Workspace = {`, after `role: "owner" | "operations";` add:

```ts
  pix: { pix_key: string; merchant_name: string; merchant_city: string } | null;
```

- [ ] **Step 2: Workspace route**

In `src/app/api/restaurants/[id]/workspace/route.ts`:

Change the first-order filter to also cover the new status:

```ts
    const pendingOnline = (orders.data || []).filter(
      (o) =>
        o.status === "aguardando_pagamento" ||
        o.status === "aguardando_aceite" ||
        (o.status === "recebido" && o.fulfillment !== "mesa"),
    );
```

Next to `let feedback: unknown[] = [];` add `let pix: unknown = null;`. Inside `if (role === "owner") {` (the block with `Promise.all([m, photos, reviews])`), add a fourth query and read it:

```ts
      const [m, photos, reviews, pixRow] = await Promise.all([
        // ...the three existing queries unchanged...
        supabase
          .from("restaurant_pix")
          .select("pix_key,merchant_name,merchant_city")
          .eq("restaurant_id", id)
          .maybeSingle(),
      ]);
      if (m.error || photos.error || reviews.error || pixRow.error)
        throw new Error("DATABASE_ERROR");
      pix = pixRow.data;
```

In the response object, after `feedback,` add `pix,`.

- [ ] **Step 3: Catalog route action**

In `src/app/api/restaurants/[id]/catalog/route.ts`, inside `z.discriminatedUnion("action", [` add:

```ts
  z.object({
    action: z.literal("save_pix"),
    pix_key: z.string().trim().max(77),
    merchant_name: z.string().trim().max(25),
    merchant_city: z.string().trim().max(15),
  }),
```

In `handlePOST`, before the `} else if (body.action === "crm_settings") {` branch add:

```ts
    } else if (body.action === "save_pix") {
      const { error } = await supabase.rpc("save_restaurant_pix", {
        p_restaurant: id,
        p_key: body.pix_key,
        p_name: body.merchant_name,
        p_city: body.merchant_city,
      });
      if (error) throw error;
```

Leave the catalog invalidation as is (the public menu must learn that Pix turned on/off).

- [ ] **Step 4: Component**

Create `src/components/pix-settings.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function PixSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  const pix = data.pix;
  async function submit(values: { pix_key: string; merchant_name: string; merchant_city: string }) {
    try {
      setError("");
      await save({ action: "save_pix", ...values });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <form
      key={pix?.pix_key ?? "sem-pix"}
      className="admin-panel connected-panel form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void submit({
          pix_key: String(form.get("pix_key")).trim(),
          merchant_name: String(form.get("merchant_name")).trim(),
          merchant_city: String(form.get("merchant_city")).trim(),
        });
      }}
    >
      <h2>Pix pelo cardápio</h2>
      <p className="field-help">
        Com a chave cadastrada, quem escolhe Pix na retirada ou entrega paga na hora pelo QR Code.
        O pedido fica em &quot;Aguardando pagamento&quot; até a equipe clicar em &quot;Pix recebido&quot;.
        O cliente envia o comprovante para o telefone do restaurante no WhatsApp.
      </p>
      <label className="form-label">
        Chave Pix
        <input name="pix_key" required maxLength={77} defaultValue={pix?.pix_key ?? ""} />
      </label>
      <div className="form-columns">
        <label className="form-label">
          Nome do recebedor
          <input name="merchant_name" required maxLength={25} defaultValue={pix?.merchant_name ?? data.restaurant.name.slice(0, 25)} />
        </label>
        <label className="form-label">
          Cidade
          <input name="merchant_city" required maxLength={15} defaultValue={pix?.merchant_city ?? ""} />
        </label>
      </div>
      {!data.restaurant.phone && (
        <p className="notice">Cadastre o telefone do restaurante para o cliente enviar o comprovante no WhatsApp.</p>
      )}
      <div className="connected-toolbar">
        <Button type="submit" disabled={busy}>Salvar Pix</Button>
        {pix && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void submit({ pix_key: "", merchant_name: "", merchant_city: "" })}
          >
            Desligar Pix pelo cardápio
          </Button>
        )}
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Show it on the settings page**

In `src/components/connected-admin.tsx`, add `import { PixSettings } from "./pix-settings";` next to the `DeliverySettings` import, and in the `page === "configuracoes"` fragment, after `<DeliverySettings data={data} save={save} busy={busy} />` add:

```tsx
                  <PixSettings data={data} save={save} busy={busy} />
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/connected-types.ts "src/app/api/restaurants/[id]/workspace/route.ts" "src/app/api/restaurants/[id]/catalog/route.ts" src/components/pix-settings.tsx src/components/connected-admin.tsx
git commit -m "feat(pix): owner settings for the Pix key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Checkout shows "Pix agora, pelo cardápio"

**Files:**
- Modify: `src/lib/connected-types.ts` (`Catalog`)
- Modify: `src/lib/catalog.ts`
- Modify: `src/lib/fulfillment-draft.ts`
- Modify: `src/components/connected-menu-provider.tsx`
- Modify: `src/components/fulfillment-fields.tsx`
- Test: `scripts/test-online.mjs`

**Interfaces:**
- Consumes: RPC `restaurant_pix_enabled` (Task 1); `paymentLabel` (Task 3).
- Produces: `Catalog.pixOnline: boolean`; `OnlineOptions.pixOnline?: boolean`; `onlineOptions(restaurant, zones, pixOnline = false)`.

- [ ] **Step 1: Failing test**

Append to `scripts/test-online.mjs` (the file loads modules inside each test, like the existing `const draftLib = load(...)` lines):

```js
test("online options carry the advance Pix flag", () => {
  const draft = load("src/lib/fulfillment-draft.ts");
  const r = { pickup_enabled: true, delivery_enabled: false, delivery_min_order_cents: 0 };
  assert.equal(draft.onlineOptions(r, []).pixOnline, false);
  assert.equal(draft.onlineOptions(r, [], true).pixOnline, true);
});
```

Run: `node --test scripts/test-online.mjs` → Expected: FAIL (`pixOnline` undefined).

- [ ] **Step 2: Implement**

`src/lib/fulfillment-draft.ts`: add `pixOnline?: boolean;` to `OnlineOptions`, change the signature to

```ts
export function onlineOptions(
  restaurant: {
    pickup_enabled: boolean;
    delivery_enabled: boolean;
    delivery_min_order_cents: number;
  },
  zones: DeliveryZone[],
  pixOnline = false,
): OnlineOptions | undefined {
```

and add `pixOnline,` to the returned object.

`src/lib/connected-types.ts`: in `export type Catalog = {` add `pixOnline: boolean;`.

`src/lib/catalog.ts`: add an eighth entry to the `Promise.all` destructuring, `pixEnabled`, with

```ts
      client.rpc("restaurant_pix_enabled", { p_restaurant: restaurant.id }),
```

include `pixEnabled` in the `.some((r) => r.error)` list, add `pixOnline: pixEnabled.data === true,` to the returned object, and bump the cache key to `["catalog", "v3", slug]` (comment already says to bump on shape change).

`src/components/connected-menu-provider.tsx`: `online: onlineOptions(catalog.restaurant, catalog.zones, catalog.pixOnline),`.

`src/components/fulfillment-fields.tsx`: import `paymentLabel` from `@/lib/order-flow`; in the payment radio list replace `<span>{paymentNames[method]}</span>` with `<span>{paymentLabel(method, !!options.pixOnline)}</span>`; right after the payment fieldset (before the `draft.payment === "dinheiro"` block) add:

```tsx
      {draft.payment === "pix" && options.pixOnline && (
        <p className="field-help">
          Você paga pelo Pix na próxima tela. O pedido vai para a cozinha assim que o restaurante confirmar o pagamento.
        </p>
      )}
```

Remove `paymentNames` from the import only if it is no longer used in the file.

- [ ] **Step 3: Verify**

Run: `npm run test:online && npx tsc --noEmit && npm run lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/connected-types.ts src/lib/catalog.ts src/lib/fulfillment-draft.ts src/components/connected-menu-provider.tsx src/components/fulfillment-fields.tsx scripts/test-online.mjs
git commit -m "feat(pix): checkout offers Pix paid in advance when the restaurant has a key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Customer payment screen

**Files:**
- Modify: `src/app/api/restaurants/[id]/orders/[orderId]/route.ts` (GET)
- Modify: `src/lib/connected-types.ts` (`RealOrder`)
- Create: `src/components/pix-payment.tsx`
- Modify: `src/components/connected-tracking.tsx`

**Interfaces:**
- Consumes: `pixPayload`, `orderTxid`, `pixReceiptLink` (Task 2); `customerSteps`, `paysFirst`, `paymentLabel` (Task 3).
- Produces: GET response fields `pix_code: string | null`, `pix_whatsapp: string | null` (full wa.me link), `restaurant_name: string`, present only while `status === "aguardando_pagamento"`.

- [ ] **Step 1: Types**

In `RealOrder` (`src/lib/connected-types.ts`) add:

```ts
  pix_code?: string | null;
  pix_whatsapp?: string | null;
  restaurant_name?: string;
```

- [ ] **Step 2: GET route**

In `src/app/api/restaurants/[id]/orders/[orderId]/route.ts`, add `import { orderTxid, pixPayload, pixReceiptLink } from "@/lib/pix";`. After the existing `restaurantError` handling and before the `return Response.json({...})`, add:

```ts
    let payment: { pix_code: string | null; pix_whatsapp: string | null; restaurant_name: string } | null = null;
    if (data.status === "aguardando_pagamento") {
      const [pixRow, rest] = await Promise.all([
        client.from("restaurant_pix").select("pix_key,merchant_name,merchant_city").eq("restaurant_id", id).maybeSingle(),
        client.from("restaurants").select("name,phone").eq("id", id).single(),
      ]);
      if (pixRow.error) logFailure(pixRow.error, "supabase.orders");
      if (rest.error) logFailure(rest.error, "supabase.orders");
      const name = rest.data?.name ?? "";
      payment = {
        restaurant_name: name,
        // Amount comes from the order saved by the server, never from the client.
        pix_code: pixRow.data
          ? pixPayload({
              key: pixRow.data.pix_key,
              name: pixRow.data.merchant_name,
              city: pixRow.data.merchant_city,
              amountCents: data.total_cents,
              txid: orderTxid(data.number),
            })
          : null,
        pix_whatsapp: rest.data?.phone
          ? pixReceiptLink({ phone: rest.data.phone, number: data.number, totalCents: data.total_cents, restaurantName: name })
          : null,
      };
    }
```

and spread it into the response: `...(payment ?? {}),` right after `...withOrderAddress(data),`.

- [ ] **Step 3: Component**

Create `src/components/pix-payment.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { money } from "@/lib/utils";
import type { RealOrder } from "@/lib/connected-types";

export function PixPayment({ order }: { order: RealOrder }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const code = order.pix_code;
  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [code]);
  return (
    <section className="pix-payment" aria-label="Pagamento por Pix">
      <h3>Pague {money(order.total_cents)} no Pix</h3>
      <p>Seu pedido vai para a cozinha assim que o restaurante confirmar o pagamento.</p>
      {code ? (
        <>
          {qr && <img src={qr} alt="QR Code do Pix" width={240} height={240} />}
          <label className="form-label">
            Pix copia e cola
            <textarea readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(code)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? "Código copiado" : "Copiar código Pix"}
          </button>
        </>
      ) : (
        <p className="notice">O Pix pelo cardápio foi desligado. Fale com o restaurante para pagar.</p>
      )}
      {order.pix_whatsapp ? (
        <a className="button" href={order.pix_whatsapp} target="_blank" rel="noopener noreferrer">
          Enviar comprovante no WhatsApp
        </a>
      ) : (
        <p>Depois de pagar, envie o comprovante para o restaurante.</p>
      )}
    </section>
  );
}
```

Add to the end of `src/app/globals.css`:

```css
.pix-payment {
  display: grid;
  gap: 12px;
  justify-items: center;
  text-align: center;
  padding: 16px;
  border-radius: 16px;
  background: var(--surface-2, #f6f1ea);
}
.pix-payment textarea {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  word-break: break-all;
}
```

- [ ] **Step 4: Tracking screen**

In `src/components/connected-tracking.tsx`:
- import `PixPayment` from `./pix-payment`; add `paymentLabel` and `paysFirst` to the `@/lib/order-flow` import (drop `paymentNames` if unused afterwards).
- change `customerSteps(order.fulfillment)` to `customerSteps(order.fulfillment, paysFirst(order))`.
- change `Pagamento: {paymentNames[order.payment_method]}` to `Pagamento: {paymentLabel(order.payment_method, paysFirst(order))}`.
- right after the `</ol>` / cancelled-notice block, add:

```tsx
          {order.status === "aguardando_pagamento" && <PixPayment order={order} />}
          {order.status !== "aguardando_pagamento" && paysFirst(order) &&
            !["cancelado", "recusado"].includes(order.status) && (
              <p className="notice">Pagamento confirmado pelo restaurante.</p>
            )}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online`
Expected: no errors; tests pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/restaurants/[id]/orders/[orderId]/route.ts" src/lib/connected-types.ts src/components/pix-payment.tsx src/components/connected-tracking.tsx src/app/globals.css
git commit -m "feat(pix): customer screen with QR Code, copy-paste code and WhatsApp receipt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Board card shows the waiting time; auto-print waits for payment

**Files:**
- Modify: `src/components/order-board.tsx`
- Modify: `src/components/use-order-printing.ts`

**Interfaces:**
- Consumes: `minutesWaiting` (Task 3). The "Pix recebido" button and "Cancelar pedido" already come from `nextAction`/`canCancel`.

- [ ] **Step 1: Implement**

In `src/components/order-board.tsx`, import `minutesWaiting` from `@/lib/order-board` (same import line as `boardColumns`). Inside the card, right after the `<p>{order.customer_name} · {time}</p>` paragraph, add:

```tsx
                      {order.status === "aguardando_pagamento" && (
                        <p className="status-pill">
                          Pix de {money(order.total_cents)} · esperando há{" "}
                          {minutesWaiting(order.created_at, Date.now())} min
                        </p>
                      )}
```

In `src/components/use-order-printing.ts`, the first-load seed marks every order that is not pending as already printed. Orders waiting for payment must stay unprinted so they print when the team confirms the Pix. Replace

```ts
      printed.current = new Set(orders.filter((o) => o.status !== "aguardando_aceite").map((o) => o.id));
```

with

```ts
      // Pending orders stay unprinted: they print when they reach "recebido".
      const pending = ["aguardando_aceite", "aguardando_pagamento"];
      printed.current = new Set(orders.filter((o) => !pending.includes(o.status)).map((o) => o.id));
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/order-board.tsx src/components/use-order-printing.ts
git commit -m "feat(pix): board card shows how long the Pix is pending; print after payment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full local suite**

Run, one by one:
`npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build`.
Expected: all green.

- [ ] **Step 2: Publication notes (do not run)**

Report to the controller: apply `supabase/migrations/014_pix_manual.sql` in the Supabase SQL editor, then push to `main`; then the owner fills "Pix pelo cardápio" in Configurações. The hosted live test is out of scope for this plan (needs explicit user authorization).
