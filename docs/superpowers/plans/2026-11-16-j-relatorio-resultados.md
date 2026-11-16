# J — Relatório de resultados mensal · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Resultados" tab for the restaurant owner showing the month's delivered orders, money saved vs iFood, new/returning/reactivated customers, top dishes and top-selling videos, printable as PDF.

**Architecture:** Migration 017 adds `restaurants.ifood_fee_percent`, an owner-only `set_ifood_fee` RPC and a single owner-only `results_report(p_restaurant, p_month)` RPC that computes every number in SQL (the workspace only loads the last 200 orders). A pure `src/lib/results-report.ts` holds types and text helpers; an owner-only GET route calls the RPC; a client component renders it with print styles.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase Postgres (SECURITY DEFINER RPCs), PGlite DB tests, `node:test` unit tests.

**Spec:** `docs/superpowers/specs/2026-11-16-j-relatorio-resultados-design.md`.

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`. Do not push. Do not touch the hosted Supabase or run live tests. Never use port 3000.
- Only orders with `status = 'entregue'` count. The month is computed in `restaurants.timezone`, from 00:00 of day 1 to 00:00 of day 1 of the next month, by `orders.created_at`.
- iFood savings base = `total_cents` of `retirada` + `entrega` orders (delivery fee included). Saved = base × `ifood_fee_percent` ÷ 100, rounded to cents. Table (`mesa`) orders never count.
- `ifood_fee_percent`: numeric 0–60, default 27.
- Customers are identified by `customer_phone`; empty phone is ignored. New = no delivered order before the month. Returning = had a delivered order before the month. Reactivated = returning whose last delivered order before the month is ≥ 30 days before their first order in the month.
- Top lists: 5 items max.
- Only the owner (`is_member(p, true)`) sees the tab and can call the RPCs; others get `FORBIDDEN`.
- UI copy in Brazilian Portuguese, exactly as written in this plan.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- Create `supabase/migrations/017_results_report.sql`; modify `scripts/lib/test-db.mjs`.
- Create `scripts/test-results-db.mjs`; modify `package.json` (`test:database`).
- Create `src/lib/results-report.ts`, `scripts/test-results-report.mjs`; modify `package.json` (`test:online`).
- Create `src/app/api/restaurants/[id]/results/route.ts`.
- Modify `src/app/api/restaurants/[id]/catalog/route.ts`, `src/lib/connected-types.ts`, `src/components/connected-admin.tsx` (settings field + tab).
- Create `src/components/results-report.tsx`; modify `src/app/globals.css`.

---

### Task 1: Migration 017 and database checks

**Files:**
- Create: `supabase/migrations/017_results_report.sql`
- Modify: `scripts/lib/test-db.mjs` (add `"017_results_report.sql",` after `"016_menu_start_view.sql",`)
- Create: `scripts/test-results-db.mjs`
- Modify: `package.json` — append ` && node scripts/test-results-db.mjs` to `test:database`

**Interfaces:**
- Produces (SQL): `restaurants.ifood_fee_percent numeric(5,2) not null default 27`; `set_ifood_fee(p_restaurant uuid, p_percent numeric) returns void`; `results_report(p_restaurant uuid, p_month date) returns jsonb` with exactly this shape:

```json
{"month":"2026-11-01","timezone":"America/Sao_Paulo","fee_percent":27,
 "orders":{"count":6,"revenue_cents":16500,"average_cents":2750,
           "by_fulfillment":{"mesa":{"count":3,"revenue_cents":4500},"retirada":{"count":1,"revenue_cents":5000},"entrega":{"count":2,"revenue_cents":7000}}},
 "previous":{"count":2,"revenue_cents":9500},
 "ifood":{"base_cents":12000,"saved_cents":3240},
 "customers":{"total":4,"new":2,"returning":2,"reactivated":1},
 "top_quantity":[{"product_id":"…","name":"Refri","quantity":4,"revenue_cents":4500}],
 "top_revenue":[{"product_id":"…","name":"Burger","quantity":3,"revenue_cents":7500}],
 "top_videos":[{"product_id":"…","name":"Burger","adds":1,"qualified_views":2}]}
```

- [ ] **Step 1: Write the failing DB checks**

Create `scripts/test-results-db.mjs`:

```js
import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "13000000-0000-4000-8000-0000000000a1",
  b = "13000000-0000-4000-8000-0000000000b1",
  ownerA = "23000000-0000-4000-8000-0000000000a1",
  ownerB = "23000000-0000-4000-8000-0000000000b1",
  staffA = "23000000-0000-4000-8000-0000000000a2",
  cat = "33000000-0000-4000-8000-0000000000a1",
  burger = "43000000-0000-4000-8000-000000000001",
  fries = "43000000-0000-4000-8000-000000000002",
  soda = "43000000-0000-4000-8000-000000000003",
  table = "63000000-0000-4000-8000-0000000000a1",
  media = "73000000-0000-4000-8000-0000000000a1";
const names = { [burger]: "Burger", [fries]: "Batata", [soda]: "Refri" };

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
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders,timezone) values($1,'Casa A','res-a',true,'America/Sao_Paulo'),($2,'Casa B','res-b',true,'America/Sao_Paulo')",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches')", [cat, a]);
for (const [id, name, price] of [[burger, "Burger", 2500], [fries, "Batata", 1250], [soda, "Refri", 1000]])
  await db.query("insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,$4,$5,true)", [id, a, cat, name, price]);
await db.query("insert into dining_tables(id,restaurant_id,number) values($1,$2,1)", [table, a]);

let sessions = 0;
async function guest() {
  sessions++;
  const { rows } = await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 day') returning id",
    [a, String(sessions).padStart(64, "0")],
  );
  return rows[0].id;
}
async function order({ phone, total, kind, at, status = "entregue", items = [], session }) {
  const id = crypto.randomUUID();
  await db.query(
    `insert into orders(id,restaurant_id,guest_session_id,table_id,customer_name,customer_phone,total_cents,status,
      idempotency_key,payload_hash,fulfillment,payment_method,delivery_fee_cents,created_at)
     values($1,$2,$3,$4,'Cliente',$5,$6,$7,$8,'x',$9,$10,$11,$12)`,
    [id, a, session ?? (await guest()), kind === "mesa" ? table : null, phone, total, status, crypto.randomUUID(), kind,
      kind === "mesa" ? null : "pix", kind === "entrega" ? 500 : 0, at],
  );
  for (const [product, quantity, price] of items)
    await db.query(
      "insert into order_items(restaurant_id,order_id,product_id,product_name,unit_price_cents,quantity) values($1,$2,$3,$4,$5,$6)",
      [a, id, product, names[product], price, quantity],
    );
  return id;
}

// November 2026 in São Paulo (UTC-3).
await order({ phone: "11911110001", total: 4000, kind: "retirada", at: "2026-09-20T15:00:00Z" });
await order({ phone: "11911110001", total: 5000, kind: "retirada", at: "2026-11-05T15:00:00Z", items: [[burger, 2, 2500]] });
await order({ phone: "11911110002", total: 2500, kind: "retirada", at: "2026-10-28T15:00:00Z" });
await order({ phone: "11911110002", total: 3000, kind: "entrega", at: "2026-11-03T15:00:00Z", items: [[fries, 2, 1250]] });
await order({ phone: "11911110003", total: 2000, kind: "mesa", at: "2026-11-10T15:00:00Z", items: [[soda, 2, 1000]] });
await order({ phone: "11911110003", total: 1000, kind: "mesa", at: "2026-11-20T15:00:00Z", items: [[soda, 1, 1000]] });
await order({ phone: "11911110004", total: 9000, kind: "retirada", at: "2026-11-12T15:00:00Z", status: "cancelado", items: [[burger, 5, 1800]] });
// 23:30 on Nov 30 in São Paulo is already December in UTC: counts in November.
await order({ phone: "11911110005", total: 4000, kind: "entrega", at: "2026-12-01T02:30:00Z", items: [[burger, 1, 2500], [fries, 1, 1500]] });
// 23:00 on Oct 31 in São Paulo is November in UTC: counts in October.
await order({ phone: "11911110006", total: 7000, kind: "retirada", at: "2026-11-01T02:00:00Z" });
await order({ phone: "", total: 1500, kind: "mesa", at: "2026-11-15T15:00:00Z", items: [[soda, 1, 1500]] });

// Videos: two viewers of the burger video in November, one added it to the bag; one viewer in October.
await db.query(
  "insert into product_media(id,restaurant_id,product_id,kind,state) values($1,$2,$3,'video','ready')",
  [media, a, burger],
);
const { rows: mediaRows } = await db.query("select version from product_media where id=$1", [media]);
const g1 = await guest(), g2 = await guest(), g3 = await guest();
for (const [g, at] of [[g1, "2026-11-05T15:00:00Z"], [g2, "2026-11-06T15:00:00Z"], [g3, "2026-10-20T15:00:00Z"]])
  await db.query(
    "insert into video_view_sessions(restaurant_id,guest_session_id,product_id,media_id,media_version,watched_seconds,coverage,qualified,created_at) values($1,$2,$3,$4,$5,10,0.9,true,$6)",
    [a, g, burger, media, mediaRows[0].version, at],
  );
await db.query(
  "insert into cart_add_events(id,restaurant_id,guest_session_id,product_id,created_at) values($1,$2,$3,$4,$5)",
  [crypto.randomUUID(), a, g1, burger, "2026-11-05T15:05:00Z"],
);

await ok("only the owner reads the report", async () => {
  await login(staffA);
  await rejects(() => db.query("select results_report($1,'2026-11-15')", [a]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select results_report($1,'2026-11-15')", [a]), "FORBIDDEN");
});

let report;
await ok("orders count only delivered ones, by month in the restaurant timezone", async () => {
  await login(ownerA);
  report = (await db.query("select results_report($1,'2026-11-15') as r", [a])).rows[0].r;
  assert.equal(report.month, "2026-11-01");
  assert.equal(report.timezone, "America/Sao_Paulo");
  assert.deepEqual(report.orders, {
    count: 6,
    revenue_cents: 16500,
    average_cents: 2750,
    by_fulfillment: {
      mesa: { count: 3, revenue_cents: 4500 },
      retirada: { count: 1, revenue_cents: 5000 },
      entrega: { count: 2, revenue_cents: 7000 },
    },
  });
  assert.deepEqual(report.previous, { count: 2, revenue_cents: 9500 });
});

await ok("iFood savings use pickup and delivery totals with the default 27%", async () => {
  assert.equal(Number(report.fee_percent), 27);
  assert.deepEqual(report.ifood, { base_cents: 12000, saved_cents: 3240 });
});

await ok("customers are new, returning and reactivated by phone; empty phone is ignored", async () => {
  assert.deepEqual(report.customers, { total: 4, new: 2, returning: 2, reactivated: 1 });
});

await ok("top dishes by quantity and by revenue ignore cancelled orders", async () => {
  assert.deepEqual(report.top_quantity.map((p) => [p.name, p.quantity, p.revenue_cents]), [
    ["Refri", 4, 4500],
    ["Burger", 3, 7500],
    ["Batata", 3, 4000],
  ]);
  assert.deepEqual(report.top_revenue.map((p) => p.name), ["Burger", "Refri", "Batata"]);
});

await ok("top videos count bag adds by viewers within the month", async () => {
  assert.deepEqual(report.top_videos.map((v) => [v.name, v.adds, v.qualified_views]), [["Burger", 1, 2]]);
});

await ok("owner changes the iFood fee within 0 to 60 percent", async () => {
  await login(staffA);
  await rejects(() => db.query("select set_ifood_fee($1,12)", [a]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select set_ifood_fee($1,61)", [a]), "INVALID_INPUT");
  await rejects(() => db.query("select set_ifood_fee($1,-1)", [a]), "INVALID_INPUT");
  await db.query("select set_ifood_fee($1,12)", [a]);
  const r = (await db.query("select results_report($1,'2026-11-01') as r", [a])).rows[0].r;
  assert.deepEqual(r.ifood, { base_cents: 12000, saved_cents: 1440 });
});

await ok("an empty month returns zeros and empty lists", async () => {
  const r = (await db.query("select results_report($1,'2026-01-10') as r", [a])).rows[0].r;
  assert.equal(r.orders.count, 0);
  assert.equal(r.orders.average_cents, 0);
  assert.deepEqual(r.customers, { total: 0, new: 0, returning: 0, reactivated: 0 });
  assert.deepEqual(r.top_quantity, []);
  assert.deepEqual(r.top_videos, []);
});

await db.close();
console.log(`${count} results report database checks passed.`);
```

In `package.json`, append ` && node scripts/test-results-db.mjs` to `test:database`.

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-results-db.mjs`
Expected: FAIL — `function results_report(...) does not exist` (or the `insert into restaurants(... timezone)` succeeds and the first check fails). If a fixture insert fails on a constraint (for example `orders_change`, `orders_fulfillment_fee`), fix the fixture to satisfy migrations 001/011, never the migration, and note it in the report.

- [ ] **Step 3: Write the migration**

Add `"017_results_report.sql",` to `MIGRATIONS` in `scripts/lib/test-db.mjs` after `"016_menu_start_view.sql",`. Create `supabase/migrations/017_results_report.sql`:

```sql
-- J: monthly results report. Everything is computed here because the management
-- workspace only loads the last 200 orders.
alter table public.restaurants add column ifood_fee_percent numeric(5,2) not null default 27
  check (ifood_fee_percent between 0 and 60);

create function public.set_ifood_fee(p_restaurant uuid,p_percent numeric) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_percent is null or p_percent<0 or p_percent>60 then raise exception 'INVALID_INPUT'; end if;
 update restaurants set ifood_fee_percent=p_percent where id=p_restaurant;
end $$;
revoke all on function public.set_ifood_fee(uuid,numeric) from public,anon;
grant execute on function public.set_ifood_fee(uuid,numeric) to authenticated;

create function public.results_report(p_restaurant uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tz text; fee numeric; month_day date; m_start timestamptz; m_end timestamptz; prev_start timestamptz; result jsonb;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_month is null then raise exception 'INVALID_INPUT'; end if;
 select timezone,ifood_fee_percent into tz,fee from restaurants where id=p_restaurant;
 month_day:=date_trunc('month',p_month)::date;
 m_start:=month_day::timestamp at time zone tz;
 m_end:=(month_day+interval '1 month')::timestamp at time zone tz;
 prev_start:=(month_day-interval '1 month')::timestamp at time zone tz;
 with delivered as (
   select o.* from orders o where o.restaurant_id=p_restaurant and o.status='entregue'
 ), cur as (
   select * from delivered where created_at>=m_start and created_at<m_end
 ), prev as (
   select * from delivered where created_at>=prev_start and created_at<m_start
 ), phones as (
   select customer_phone as phone,min(created_at) as first_in_month from cur where customer_phone<>'' group by customer_phone
 ), history as (
   select p.phone,p.first_in_month,
     (select max(d.created_at) from delivered d where d.customer_phone=p.phone and d.created_at<m_start) as last_before
   from phones p
 ), items as (
   select i.product_id,i.product_name,i.quantity,i.unit_price_cents,o.created_at
   from order_items i join cur o on o.id=i.order_id and o.restaurant_id=i.restaurant_id
 ), dishes as (
   select product_id,(array_agg(product_name order by created_at desc))[1] as name,
     sum(quantity)::bigint as quantity,sum(quantity*unit_price_cents)::bigint as revenue_cents
   from items group by product_id
 ), viewers as (
   select distinct v.product_id,v.guest_session_id from video_view_sessions v
   where v.restaurant_id=p_restaurant and v.qualified and v.created_at>=m_start and v.created_at<m_end
 ), videos as (
   select v.product_id,count(*) as qualified_views,
     count(*) filter (where exists(select 1 from cart_add_events c where c.restaurant_id=p_restaurant
       and c.product_id=v.product_id and c.guest_session_id=v.guest_session_id
       and c.created_at>=m_start and c.created_at<m_end)) as adds
   from viewers v group by v.product_id
 )
 select jsonb_build_object(
  'month',to_char(month_day,'YYYY-MM-DD'),
  'timezone',tz,
  'fee_percent',fee,
  'orders',jsonb_build_object(
    'count',(select count(*) from cur),
    'revenue_cents',(select coalesce(sum(total_cents),0) from cur),
    'average_cents',(select coalesce(round(avg(total_cents)),0) from cur),
    'by_fulfillment',jsonb_build_object(
      'mesa',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='mesa'),
      'retirada',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='retirada'),
      'entrega',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from cur where fulfillment='entrega'))),
  'previous',(select jsonb_build_object('count',count(*),'revenue_cents',coalesce(sum(total_cents),0)) from prev),
  'ifood',(select jsonb_build_object('base_cents',coalesce(sum(total_cents),0),
     'saved_cents',round(coalesce(sum(total_cents),0)*fee/100)) from cur where fulfillment in ('retirada','entrega')),
  'customers',(select jsonb_build_object('total',count(*),
     'new',count(*) filter (where last_before is null),
     'returning',count(*) filter (where last_before is not null),
     'reactivated',count(*) filter (where last_before is not null and first_in_month-last_before>=interval '30 days')) from history),
  'top_quantity',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'quantity',quantity,'revenue_cents',revenue_cents)
     order by quantity desc,revenue_cents desc,name) from (select * from dishes order by quantity desc,revenue_cents desc,name limit 5) t),'[]'::jsonb),
  'top_revenue',coalesce((select jsonb_agg(jsonb_build_object('product_id',product_id,'name',name,'quantity',quantity,'revenue_cents',revenue_cents)
     order by revenue_cents desc,quantity desc,name) from (select * from dishes order by revenue_cents desc,quantity desc,name limit 5) t),'[]'::jsonb),
  'top_videos',coalesce((select jsonb_agg(jsonb_build_object('product_id',t.product_id,'name',coalesce(p.name,'Produto removido'),
     'adds',t.adds,'qualified_views',t.qualified_views) order by t.adds desc,t.qualified_views desc,p.name)
     from (select * from videos order by adds desc,qualified_views desc limit 5) t
     left join products p on p.id=t.product_id and p.restaurant_id=p_restaurant),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.results_report(uuid,date) from public,anon;
grant execute on function public.results_report(uuid,date) to authenticated;
```

- [ ] **Step 4: Run the checks**

Run: `node scripts/test-results-db.mjs` → Expected: `8 results report database checks passed.`
If a number differs, debug the SQL against the fixture (the expected values in Step 1 are derived from the fixture and the Global Constraints); do not change expected values unless the fixture itself is wrong, and explain in the report.
Run: `npm run test:database` → all files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/017_results_report.sql scripts/lib/test-db.mjs scripts/test-results-db.mjs package.json
git commit -m "feat(results): migration 017 with iFood fee and the monthly results report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Report types and text helpers

**Files:**
- Create: `src/lib/results-report.ts`
- Create: `scripts/test-results-report.mjs`
- Modify: `package.json` — append ` scripts/test-results-report.mjs` to `test:online`

**Interfaces:**
- Produces:
  - `type ResultsReport` (the JSON shape from Task 1; numbers as `number`, `fee_percent` as `number | string`).
  - `monthOptions(now: Date, timeZone: string): { value: string; label: string }[]` — 13 entries, newest first; `value` is `"YYYY-MM"`; label is `"novembro de 2026"` with `" (até hoje)"` appended to the first (current) entry.
  - `isValidMonth(value: string, now: Date, timeZone: string): boolean` — true only for values in `monthOptions`.
  - `variation(current: number, previous: number): string` — `"—"` when previous is 0, otherwise rounded percent with sign: `"+18%"`, `"-5%"`, `"0%"`.
  - `savingsText(baseCents: number, feePercent: number | string, savedCents: number): string` — `"R$ 4.600,00 × 27% = R$ 1.242,00 que ficaram com você"` (fee shown without trailing zeros: `27`, `12,5`).

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-results-report.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const r = loader()("src/lib/results-report.ts");
// 2026-12-01T02:30Z is still November 30 in São Paulo.
const now = new Date("2026-12-01T02:30:00Z");

test("month options use the restaurant timezone, newest first", () => {
  const options = r.monthOptions(now, "America/Sao_Paulo");
  assert.equal(options.length, 13);
  assert.deepEqual(options[0], { value: "2026-11", label: "novembro de 2026 (até hoje)" });
  assert.deepEqual(options[1], { value: "2026-10", label: "outubro de 2026" });
  assert.deepEqual(options[12], { value: "2025-11", label: "novembro de 2025" });
});

test("only listed months are valid", () => {
  assert.equal(r.isValidMonth("2026-11", now, "America/Sao_Paulo"), true);
  assert.equal(r.isValidMonth("2026-12", now, "America/Sao_Paulo"), false);
  assert.equal(r.isValidMonth("2025-10", now, "America/Sao_Paulo"), false);
  assert.equal(r.isValidMonth("2026-1", now, "America/Sao_Paulo"), false);
});

test("variation against the previous month", () => {
  assert.equal(r.variation(118, 100), "+18%");
  assert.equal(r.variation(95, 100), "-5%");
  assert.equal(r.variation(100, 100), "0%");
  assert.equal(r.variation(50, 0), "—");
});

test("savings text shows the formula", () => {
  assert.equal(r.savingsText(460000, 27, 124200).replace(/\u00a0/g, " "), "R$ 4.600,00 × 27% = R$ 1.242,00 que ficaram com você");
  assert.equal(r.savingsText(10000, "12.50", 1250).replace(/\u00a0/g, " "), "R$ 100,00 × 12,5% = R$ 12,50 que ficaram com você");
});
```

Append ` scripts/test-results-report.mjs` to the `test:online` script.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/test-results-report.mjs` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/results-report.ts`:

```ts
// Types and text helpers for the monthly results report (migration 017).
export type ResultsCount = { count: number; revenue_cents: number };
export type ResultsDish = { product_id: string; name: string; quantity: number; revenue_cents: number };
export type ResultsVideo = { product_id: string; name: string; adds: number; qualified_views: number };
export type ResultsReport = {
  month: string;
  timezone: string;
  fee_percent: number | string;
  orders: ResultsCount & {
    average_cents: number;
    by_fulfillment: { mesa: ResultsCount; retirada: ResultsCount; entrega: ResultsCount };
  };
  previous: ResultsCount;
  ifood: { base_cents: number; saved_cents: number };
  customers: { total: number; new: number; returning: number; reactivated: number };
  top_quantity: ResultsDish[];
  top_revenue: ResultsDish[];
  top_videos: ResultsVideo[];
};

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function currentMonth(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export function monthOptions(now: Date, timeZone: string) {
  const { year, month } = currentMonth(now, timeZone);
  return Array.from({ length: 13 }, (_, i) => {
    const total = year * 12 + (month - 1) - i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return {
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTHS[m - 1]} de ${y}${i === 0 ? " (até hoje)" : ""}`,
    };
  });
}

export function isValidMonth(value: string, now: Date, timeZone: string) {
  return monthOptions(now, timeZone).some((o) => o.value === value);
}

export function variation(current: number, previous: number) {
  if (!previous) return "—";
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function savingsText(baseCents: number, feePercent: number | string, savedCents: number) {
  const fee = Number(feePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${brl(baseCents)} × ${fee}% = ${brl(savedCents)} que ficaram com você`;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:online && npx tsc --noEmit` → Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/results-report.ts scripts/test-results-report.mjs package.json
git commit -m "feat(results): report types, month options and savings text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Results route and iFood fee setting

**Files:**
- Create: `src/app/api/restaurants/[id]/results/route.ts`
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts` (settings action)
- Modify: `src/lib/connected-types.ts` (`RestaurantRow`)
- Modify: `src/components/connected-admin.tsx` (`SettingsForm`)

**Interfaces:**
- Consumes: `results_report`, `set_ifood_fee` (Task 1); `isValidMonth` (Task 2); `requireMember` from `@/lib/supabase/server`; `apiError`, `noStore` from `@/lib/server-security`; `withRequestLogging` from `@/lib/observability/logger`.
- Produces: `GET /api/restaurants/[id]/results?month=YYYY-MM` → the `ResultsReport` JSON; `RestaurantRow.ifood_fee_percent?: number | string`; settings body accepts `ifood_fee_percent?: number`.

- [ ] **Step 1: Route**

Create `src/app/api/restaurants/[id]/results/route.ts`:

```ts
import { withRequestLogging } from "@/lib/observability/logger";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { apiError, noStore } from "@/lib/server-security";
import { isValidMonth } from "@/lib/results-report";

async function handleGET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const { supabase } = await requireMember(id, true);
    const month = new URL(request.url).searchParams.get("month") ?? "";
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("timezone")
      .eq("id", id)
      .single();
    if (restaurantError) throw restaurantError;
    if (!isValidMonth(month, new Date(), restaurant.timezone)) throw new Error("INVALID_INPUT");
    const { data, error } = await supabase.rpc("results_report", {
      p_restaurant: id,
      p_month: `${month}-01`,
    });
    if (error) throw error;
    return Response.json(data, { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export const GET = withRequestLogging("/api/restaurants/[id]/results", handleGET);
```

- [ ] **Step 2: Settings field**

In `src/app/api/restaurants/[id]/catalog/route.ts`:
- in the `settings` zod member add `ifood_fee_percent: z.number().min(0).max(60).optional(),` (next to `menu_start_view`);
- in the settings branch, destructure it out of `values` like `menu_start_view` (`const { action: _, tables, menu_start_view, ifood_fee_percent, ...values } = body;`) and after the `menu_start_view` block add:

```ts
      if (ifood_fee_percent !== undefined) {
        const fee = await supabase.rpc("set_ifood_fee", {
          p_restaurant: id,
          p_percent: ifood_fee_percent,
        });
        if (fee.error) throw fee.error;
      }
```

In `src/lib/connected-types.ts` `RestaurantRow` add `ifood_fee_percent?: number | string;`.

In `src/components/connected-admin.tsx` `SettingsForm`:
- in the `save({ action: "settings", ... })` body add `ifood_fee_percent: Number(String(form.get("ifood_fee_percent") || "27").replace(",", ".")),`;
- right after the "Pedido mínimo para entrega (R$)" label add:

```tsx
      <label className="form-label">
        Taxa que você paga no iFood (%)
        <input
          name="ifood_fee_percent"
          type="number"
          min="0"
          max="60"
          step="0.5"
          defaultValue={Number(r.ifood_fee_percent ?? 27)}
        />
      </label>
      <p className="field-help">
        Usada no relatório de resultados para calcular quanto você deixou de pagar ao iFood
        nos pedidos de retirada e entrega feitos pelo cardápio.
      </p>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online` → Expected: no errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/restaurants/[id]/results/route.ts" "src/app/api/restaurants/[id]/catalog/route.ts" src/lib/connected-types.ts src/components/connected-admin.tsx
git commit -m "feat(results): owner route for the report and iFood fee setting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: "Resultados" tab with PDF

**Files:**
- Create: `src/components/results-report.tsx`
- Modify: `src/components/connected-admin.tsx` (pages list + render)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `ResultsReport`, `monthOptions`, `variation`, `savingsText` (Task 2); route from Task 3; `requestJson` from `@/lib/client-api` (GET when no body); `money` from `@/lib/utils`; `Button` from `./ui/button`.
- Produces: `ResultsReportPanel({ restaurantId, restaurantName, timezone })`.

- [ ] **Step 1: Component**

Create `src/components/results-report.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { monthOptions, savingsText, variation, type ResultsReport } from "@/lib/results-report";
import { Button } from "./ui/button";

export function ResultsReportPanel({
  restaurantId,
  restaurantName,
  timezone,
}: {
  restaurantId: string;
  restaurantName: string;
  timezone: string;
}) {
  const [options] = useState(() => monthOptions(new Date(), timezone));
  const [month, setMonth] = useState(options[0].value);
  const [report, setReport] = useState<ResultsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await requestJson<ResultsReport>(`/api/restaurants/${restaurantId}/results?month=${month}`));
    } catch {
      setError("Não foi possível carregar o relatório. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, month]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const label = options.find((o) => o.value === month)?.label ?? month;
  return (
    <section className="results-report">
      <div className="connected-toolbar results-toolbar">
        <label className="form-label inline-label">
          Mês
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" disabled={!report} onClick={() => window.print()}>
          <Printer size={17} /> Baixar PDF
        </Button>
      </div>
      {loading && <p role="status">Carregando relatório…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}{" "}
          <button type="button" className="button button-ghost" onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      )}
      {report && !loading && (
        <div className="results-print">
          <header className="results-header">
            <strong>{restaurantName}</strong>
            <span>Relatório de resultados · {label}</span>
            <small>Cardap.io · Amply</small>
          </header>
          <div className="results-grid">
            <article className="admin-panel results-card">
              <h3>Pedidos pelo cardápio</h3>
              <p className="results-big">{report.orders.count}</p>
              <p>
                {money(report.orders.revenue_cents)} · ticket médio {money(report.orders.average_cents)}
              </p>
              <p className="field-help">
                Mesa {report.orders.by_fulfillment.mesa.count} · Retirada {report.orders.by_fulfillment.retirada.count} ·
                Entrega {report.orders.by_fulfillment.entrega.count}
              </p>
              <p className="field-help">
                Faturamento vs. mês anterior: {variation(report.orders.revenue_cents, report.previous.revenue_cents)}
              </p>
            </article>
            <article className="admin-panel results-card results-highlight">
              <h3>Economia com o iFood</h3>
              <p className="results-big">{money(report.ifood.saved_cents)}</p>
              <p>{savingsText(report.ifood.base_cents, report.fee_percent, report.ifood.saved_cents)}</p>
              <p className="field-help">Conta só pedidos de retirada e entrega; pedidos na mesa não entram.</p>
            </article>
            <article className="admin-panel results-card">
              <h3>Clientes</h3>
              <p className="results-big">{report.customers.total}</p>
              <p>
                {report.customers.new} novos · {report.customers.returning} voltaram ·{" "}
                {report.customers.reactivated} reativados
              </p>
              <p className="field-help">Reativados: voltaram depois de 30 dias ou mais sem pedir.</p>
            </article>
          </div>
          <div className="results-grid">
            <article className="admin-panel results-card">
              <h3>Pratos mais pedidos</h3>
              {report.top_quantity.length ? (
                <ol>
                  {report.top_quantity.map((d) => (
                    <li key={d.product_id}>
                      {d.name} · {d.quantity} un.
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Sem pedidos entregues neste mês.</p>
              )}
            </article>
            <article className="admin-panel results-card">
              <h3>Pratos que mais faturaram</h3>
              {report.top_revenue.length ? (
                <ol>
                  {report.top_revenue.map((d) => (
                    <li key={d.product_id}>
                      {d.name} · {money(d.revenue_cents)}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Sem pedidos entregues neste mês.</p>
              )}
            </article>
            <article className="admin-panel results-card">
              <h3>Vídeos que mais venderam</h3>
              {report.top_videos.length ? (
                <ol>
                  {report.top_videos.map((v) => (
                    <li key={v.product_id}>
                      {v.name} · {v.adds} {v.adds === 1 ? "pessoa colocou" : "pessoas colocaram"} na sacola ·{" "}
                      {v.qualified_views} viram o vídeo
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="field-help">Ainda sem vídeos assistidos neste mês.</p>
              )}
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Tab**

In `src/components/connected-admin.tsx`:
- import `Trophy` from `lucide-react` (add to the existing lucide import list) and `import { ResultsReportPanel } from "./results-report";`;
- in `pages`, add `["resultados", "Resultados", Trophy],` right after the `["metricas", ...]` entry;
- next to `{owner && page === "metricas" && <Metrics data={data} />}` add:

```tsx
              {owner && page === "resultados" && (
                <ResultsReportPanel
                  restaurantId={id}
                  restaurantName={data.restaurant.name}
                  timezone={data.restaurant.timezone}
                />
              )}
```

(The `allowed` filter already hides non-`pedidos`/`resumo` pages from operations staff.)

- [ ] **Step 3: Styles**

Append to `src/app/globals.css`:

```css
.results-report {
  display: grid;
  gap: 16px;
}
.results-header {
  display: none;
}
.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}
.results-card h3 {
  margin: 0 0 6px;
  font-size: 1rem;
}
.results-card ol {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}
.results-big {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  color: var(--brand);
}
.results-highlight {
  border: 2px solid var(--brand);
}
@media print {
  @page {
    size: A4 portrait;
    margin: 14mm;
  }
  body * {
    visibility: hidden;
  }
  .results-print,
  .results-print * {
    visibility: visible;
  }
  .results-print {
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
  }
  .results-header {
    display: grid;
    gap: 2px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #000;
  }
  .results-header strong {
    font-size: 20px;
  }
  .results-grid {
    grid-template-columns: repeat(3, 1fr);
    break-inside: avoid;
  }
  .results-card {
    break-inside: avoid;
    box-shadow: none;
    border: 1px solid #ccc;
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online && npm run build` → Expected: all pass. Run `git checkout -- next-env.d.ts` if the build touched it.

- [ ] **Step 5: Commit**

```bash
git add src/components/results-report.tsx src/components/connected-admin.tsx src/app/globals.css
git commit -m "feat(results): Resultados tab with month picker and printable PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification

- [ ] **Step 1:** Run one by one: `npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build`. Expected: all green.
- [ ] **Step 2 (controller, after publication):** open the Resultados tab on the test restaurant in the browser and print to PDF to check the layout.
- [ ] **Step 3 (publication notes, do not run):** apply `supabase/migrations/017_results_report.sql` before pushing to `main` (the settings form sends `ifood_fee_percent`, which needs `set_ifood_fee`).
