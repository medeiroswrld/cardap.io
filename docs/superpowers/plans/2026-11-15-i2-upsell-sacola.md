# I2 — Upsell na sacola · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bag offers "Transformar em combo por +R$ X?" for items whose product has an option marked "Oferecer na sacola", shows up to 3 owner-chosen suggestions ("Que tal adicionar?"), and once per visit shows an "Antes de fechar…" step when the customer goes to checkout with offers still pending.

**Architecture:** Migration 015 adds `product_options.offer_in_bag` and `restaurants.bag_suggestions` (≤ 3 ids) plus two owner-only RPCs. A pure `src/lib/bag-upsell.ts` decides which offers to show and how a combo changes a bag item. The bag UI (`menu-app.tsx` `Bag`) renders a new `BagOffers` block and swaps to the "Antes de fechar…" step inline (no nested dialog). Prices stay validated by the server as today.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase (Postgres RLS + SECURITY DEFINER RPCs), PGlite DB tests, `node:test` unit tests.

**Spec:** `docs/superpowers/specs/2026-11-14-i-pix-upsell-design.md` (part I2). Deviation (deploy safety): instead of redefining `save_product_option` and `save_restaurant_settings`, the plan adds two separate RPCs (`set_option_offer_in_bag`, `save_bag_suggestions`); the existing functions keep their signatures.

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`. Do not push. Do not touch the hosted Supabase or run live tests. Never use port 3000.
- UI copy in Brazilian Portuguese, exactly as written in this plan.
- At most one combo offer per bag item: the first option by name (pt-BR collation) among the product's active options with `offer_in_bag` that the item does not already have.
- At most 3 suggestions; a suggestion never shows a product already in the bag, unavailable, unpublished, or in a hidden category.
- The "Antes de fechar…" step shows at most once per page load (visit), only when there is at least one offer.
- Prices remain validated on the server (`PRICE_CHANGED` / `OPTIONS_CHANGED`); nothing new is sent in the order payload.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

- Create `supabase/migrations/015_bag_upsell.sql`; modify `scripts/lib/test-db.mjs` (register 015).
- Create `scripts/test-upsell-db.mjs`; modify `package.json` (`test:database`).
- Create `src/lib/bag-upsell.ts`, `scripts/test-bag-upsell.mjs`; modify `package.json` (`test:online`).
- Modify types: `src/lib/product-options.ts` (`AddOn`), `src/lib/types.ts` (`Settings`), `src/lib/connected-types.ts` (`OptionRow`, `RestaurantRow`, `catalogState`).
- Modify `src/app/api/restaurants/[id]/catalog/route.ts` (save_option flag + `bag_suggestions` action).
- Modify `src/components/product-options-admin.tsx`; create `src/components/bag-suggestions-settings.tsx`; modify `src/components/connected-admin.tsx`.
- Create `src/components/bag-offers.tsx`; modify `src/components/menu-app.tsx` (`Bag`); modify `src/app/globals.css`.

---

### Task 1: Migration 015 and database checks

**Files:**
- Create: `supabase/migrations/015_bag_upsell.sql`
- Modify: `scripts/lib/test-db.mjs`
- Create: `scripts/test-upsell-db.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces (SQL): `product_options.offer_in_bag boolean not null default false`; `restaurants.bag_suggestions uuid[] not null default '{}'` (check `cardinality <= 3`); `set_option_offer_in_bag(p_restaurant uuid, p_option uuid, p_offer boolean) returns void` (owner only; `NOT_FOUND` if the option is not in that restaurant); `save_bag_suggestions(p_restaurant uuid, p_products uuid[]) returns void` (owner only; `INVALID_PRODUCTS` when null, more than 3, duplicated, from another restaurant, or archived).

- [ ] **Step 1: Write the failing DB checks**

Create `scripts/test-upsell-db.mjs`:

```js
import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "11000000-0000-4000-8000-0000000000a1",
  b = "11000000-0000-4000-8000-0000000000b1",
  ownerA = "21000000-0000-4000-8000-0000000000a1",
  ownerB = "21000000-0000-4000-8000-0000000000b1",
  staffA = "21000000-0000-4000-8000-0000000000a2",
  cat = "31000000-0000-4000-8000-0000000000a1",
  catB = "31000000-0000-4000-8000-0000000000b1",
  p1 = "41000000-0000-4000-8000-000000000001",
  p2 = "41000000-0000-4000-8000-000000000002",
  p3 = "41000000-0000-4000-8000-000000000003",
  p4 = "41000000-0000-4000-8000-000000000004",
  pB = "41000000-0000-4000-8000-0000000000b1",
  combo = "a1000000-0000-4000-8000-000000000001",
  paused = "a1000000-0000-4000-8000-000000000002";

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
async function rejects(fn, code) {
  await assert.rejects(fn, (error) => String(error.message).includes(code));
}

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders) values($1,'Casa A','upsell-a',true),($2,'Casa B','upsell-b',true)",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches'),($3,$4,'Outros')", [cat, a, catB, b]);
await db.query(
  `insert into products(id,restaurant_id,category_id,name,price_cents,published) values
   ($1,$5,$6,'Burger',2500,true),($2,$5,$6,'Batata',1200,true),($3,$5,$6,'Refri',700,true),($4,$5,$6,'Velho',900,true),
   ($7,$8,$9,'Outro',1000,true)`,
  [p1, p2, p3, p4, a, cat, pB, b, catB],
);
await db.query(
  "insert into product_options(id,restaurant_id,name,price_cents,active) values($1,$3,'Combo batata + refri',790,true),($2,$3,'Antigo',100,false)",
  [combo, paused, a],
);

await ok("options start without bag offer and only the owner turns it on", async () => {
  await root();
  assert.equal((await db.query("select offer_in_bag from product_options where id=$1", [combo])).rows[0].offer_in_bag, false);
  await login(staffA);
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]), "FORBIDDEN");
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [b, combo]), "NOT_FOUND");
  await login(ownerA);
  await db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]);
  await db.query("select set_option_offer_in_bag($1,$2,true)", [a, paused]);
  await root();
  assert.equal((await db.query("select offer_in_bag from product_options where id=$1", [combo])).rows[0].offer_in_bag, true);
});

await ok("anon sees the bag offer flag only on active options", async () => {
  await anon();
  const { rows } = await db.query("select id,offer_in_bag from product_options where restaurant_id=$1 order by name", [a]);
  assert.deepEqual(rows, [{ id: combo, offer_in_bag: true }]);
});

await ok("owner saves up to 3 own products as bag suggestions", async () => {
  await login(staffA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2]]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p1, p2, p3, p4]]), "INVALID_PRODUCTS");
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2, p2]]), "INVALID_PRODUCTS");
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2, pB]]), "INVALID_PRODUCTS");
  await db.query("select save_bag_suggestions($1,$2)", [a, [p2, p3]]);
  await anon();
  const { rows } = await db.query("select bag_suggestions from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0].bag_suggestions, [p2, p3]);
});

await ok("archived products cannot be suggested and an empty list clears", async () => {
  await root();
  await db.query("update products set archived=true where id=$1", [p4]);
  await login(ownerA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p4]]), "INVALID_PRODUCTS");
  await db.query("select save_bag_suggestions($1,$2)", [a, []]);
  await root();
  assert.deepEqual((await db.query("select bag_suggestions from restaurants where id=$1", [a])).rows[0].bag_suggestions, []);
});

await db.close();
console.log(`${count} upsell database checks passed.`);
```

In `package.json`, change `test:database` to append ` && node scripts/test-upsell-db.mjs` at the end.

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-upsell-db.mjs`
Expected: FAIL — `column "offer_in_bag" does not exist`. (If the fixture inserts fail on a NOT NULL column instead, copy the extra columns from the `insert into restaurants` in `scripts/test-online-orders.mjs` and say so in the report.)

- [ ] **Step 3: Register and write the migration**

In `scripts/lib/test-db.mjs`, after `"014_pix_manual.sql",` add `"015_bag_upsell.sql",`.

Create `supabase/migrations/015_bag_upsell.sql`:

```sql
-- I2: upsell in the bag. Options can be offered as "combo" in the bag and the
-- owner picks up to 3 products to suggest. Prices stay validated by place_guest_order.
alter table public.product_options add column offer_in_bag boolean not null default false;
alter table public.restaurants add column bag_suggestions uuid[] not null default '{}'
  check (cardinality(bag_suggestions) <= 3);

create function public.set_option_offer_in_bag(p_restaurant uuid,p_option uuid,p_offer boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 update product_options set offer_in_bag=coalesce(p_offer,false) where id=p_option and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.set_option_offer_in_bag(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_option_offer_in_bag(uuid,uuid,boolean) to authenticated;

create function public.save_bag_suggestions(p_restaurant uuid,p_products uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_products is null or cardinality(p_products)>3
  or cardinality(p_products)<>(select count(distinct v) from unnest(p_products) v)
  or exists(select 1 from unnest(p_products) v where not exists(
   select 1 from products p where p.id=v and p.restaurant_id=p_restaurant and not p.archived))
 then raise exception 'INVALID_PRODUCTS'; end if;
 update restaurants set bag_suggestions=p_products where id=p_restaurant;
end $$;
revoke all on function public.save_bag_suggestions(uuid,uuid[]) from public,anon;
grant execute on function public.save_bag_suggestions(uuid,uuid[]) to authenticated;
```

- [ ] **Step 4: Run the checks**

Run: `node scripts/test-upsell-db.mjs` → Expected: `4 upsell database checks passed.`
Run: `npm run test:database` → Expected: 45, 21, 11 and 4 checks passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/015_bag_upsell.sql scripts/lib/test-db.mjs scripts/test-upsell-db.mjs package.json
git commit -m "feat(upsell): migration 015 with bag offer flag and bag suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Upsell rules library

**Files:**
- Create: `src/lib/bag-upsell.ts`
- Create: `scripts/test-bag-upsell.mjs`
- Modify: `package.json` (`test:online`)
- Modify: `src/lib/product-options.ts` (`AddOn` gains `offer_in_bag?: boolean`)

**Interfaces:**
- Consumes: `choicePrice`, `sameBagChoice`, `AddOn` from `src/lib/product-options.ts`; `BagItem`, `Product`, `Category` from `src/lib/types.ts`.
- Produces:
  - `type ComboOffer = { index: number; productName: string; option: AddOn }`
  - `comboOffers(bag: BagItem[], products: Product[]): ComboOffer[]`
  - `applyCombo(bag: BagItem[], index: number, product: Product, option: AddOn): BagItem[]`
  - `bagSuggestions(bag: BagItem[], products: Product[], categories: Category[], ids?: string[]): Product[]`
  - `suggestionItem(product: Product): BagItem`

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-bag-upsell.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const up = loader()("src/lib/bag-upsell.ts");

const combo = { id: "c", name: "Combo batata + refri", price_cents: 790, offer_in_bag: true };
const cheese = { id: "q", name: "Queijo", price_cents: 300 };
const burger = { id: "b", name: "Burger", price: 2500, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [combo, cheese] };
const fries = { id: "f", name: "Batata", price: 1200, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [] };
const soda = { id: "s", name: "Refri", price: 700, categoryId: "k", available: false, published: true, removableIngredients: [], addOns: [] };
const cake = { id: "d", name: "Bolo", price: 900, categoryId: "hidden", available: true, published: true, removableIngredients: [], addOns: [] };
const pie = { id: "p", name: "Torta", price: 800, categoryId: "k", available: true, published: true, removableIngredients: [], addOns: [] };
const categories = [{ id: "k", visible: true }, { id: "hidden", visible: false }];
const item = (over = {}) => ({ productId: "b", quantity: 1, note: "", price: 2500, removedIngredients: [], addOns: [], ...over });

test("offers the combo once per item that does not have it", () => {
  const offers = up.comboOffers([item(), item({ addOns: [combo], price: 3290 })], [burger]);
  assert.deepEqual(offers.map((o) => [o.index, o.productName, o.option.id]), [[0, "Burger", "c"]]);
  assert.deepEqual(up.comboOffers([item({ productId: "gone" })], [burger]), []);
});

test("picks the first offered option by name", () => {
  const early = { id: "a", name: "Batata grande", price_cents: 500, offer_in_bag: true };
  const offers = up.comboOffers([item()], [{ ...burger, addOns: [combo, early] }]);
  assert.equal(offers[0].option.id, "a");
});

test("accepting the combo adds the option and recalculates the price", () => {
  const bag = up.applyCombo([item({ quantity: 2 })], 0, burger, combo);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].price, 3290);
  assert.equal(bag[0].quantity, 2);
  assert.deepEqual(bag[0].addOns.map((o) => o.id), ["c"]);
});

test("accepting the combo merges with an identical combo item", () => {
  const bag = up.applyCombo([item(), item({ addOns: [combo], price: 3290, quantity: 2 })], 0, burger, combo);
  assert.equal(bag.length, 1);
  assert.equal(bag[0].quantity, 3);
  assert.equal(bag[0].price, 3290);
});

test("suggestions skip bag items, unavailable, hidden and unknown products, max 3", () => {
  const products = [burger, fries, soda, cake, pie];
  assert.deepEqual(
    up.bagSuggestions([item()], products, categories, ["b", "f", "s", "d", "x", "p"]).map((p) => p.id),
    ["f", "p"],
  );
  assert.deepEqual(up.bagSuggestions([], products, categories, ["f", "p", "b", "x"]).map((p) => p.id), ["f", "p", "b"]);
  assert.deepEqual(up.bagSuggestions([], products, categories), []);
});

test("a suggestion enters the bag with the default choice", () => {
  assert.deepEqual(up.suggestionItem(fries), { productId: "f", quantity: 1, note: "", price: 1200, removedIngredients: [], addOns: [] });
});
```

In `package.json`, append ` scripts/test-bag-upsell.mjs` to the `test:online` command (after `scripts/test-pix.mjs`).

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/test-bag-upsell.mjs` → Expected: FAIL (cannot find `src/lib/bag-upsell.ts`).

- [ ] **Step 3: Implement**

In `src/lib/product-options.ts` change the type to:

```ts
export type AddOn = { id: string; name: string; price_cents: number; offer_in_bag?: boolean };
```

Create `src/lib/bag-upsell.ts`:

```ts
// Which upsell offers the bag shows. Prices are recalculated here only for
// display; the server validates them again when the order is placed.
import type { BagItem, Category, Product } from "./types";
import { choicePrice, sameBagChoice, type AddOn } from "./product-options";

export type ComboOffer = { index: number; productName: string; option: AddOn };

export function comboOffers(bag: BagItem[], products: Product[]): ComboOffer[] {
  const offers: ComboOffer[] = [];
  bag.forEach((item, index) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return;
    const chosen = new Set((item.addOns || []).map((o) => o.id));
    const option = (product.addOns || [])
      .filter((o) => o.offer_in_bag && !chosen.has(o.id))
      .sort((x, y) => x.name.localeCompare(y.name, "pt-BR"))[0];
    if (option) offers.push({ index, productName: product.name, option });
  });
  return offers;
}

export function applyCombo(bag: BagItem[], index: number, product: Product, option: AddOn): BagItem[] {
  const item = bag[index];
  if (!item) return bag;
  const next: BagItem = { ...item, addOns: [...(item.addOns || []), option] };
  next.price = choicePrice(product, next);
  const others = bag.filter((_, i) => i !== index);
  const same = others.findIndex((b) => sameBagChoice(b, next));
  if (same >= 0)
    return others.map((b, i) =>
      i === same ? { ...b, quantity: Math.min(20, b.quantity + next.quantity) } : b,
    );
  return bag.map((b, i) => (i === index ? next : b));
}

export function bagSuggestions(
  bag: BagItem[],
  products: Product[],
  categories: Category[],
  ids: string[] = [],
): Product[] {
  const inBag = new Set(bag.map((b) => b.productId));
  const visible = new Set(categories.filter((c) => c.visible).map((c) => c.id));
  return ids
    .map((id) => products.find((p) => p.id === id))
    .filter(
      (p): p is Product =>
        !!p && !inBag.has(p.id) && p.available && p.published && visible.has(p.categoryId),
    )
    .slice(0, 3);
}

export function suggestionItem(product: Product): BagItem {
  return { productId: product.id, quantity: 1, note: "", price: product.price, removedIngredients: [], addOns: [] };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:online && npx tsc --noEmit` → Expected: all pass (29 + 6 = 35), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bag-upsell.ts src/lib/product-options.ts scripts/test-bag-upsell.mjs package.json
git commit -m "feat(upsell): rules for combo offers and bag suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Owner settings — combo flag and suggestions

**Files:**
- Modify: `src/lib/connected-types.ts` (`OptionRow`, `RestaurantRow`, `catalogState`)
- Modify: `src/lib/types.ts` (`Settings`)
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts`
- Modify: `src/components/product-options-admin.tsx`
- Create: `src/components/bag-suggestions-settings.tsx`
- Modify: `src/components/connected-admin.tsx`

**Interfaces:**
- Consumes: RPCs `set_option_offer_in_bag`, `save_bag_suggestions` (Task 1).
- Produces: `OptionRow.offer_in_bag: boolean`; `RestaurantRow.bag_suggestions: string[]`; `Settings.bagSuggestions?: string[]` (filled by `catalogState`); catalog POST `save_option` accepts `offer_in_bag?: boolean`; new action `{ action: "bag_suggestions", product_ids: string[] }`; component `BagSuggestionsSettings({ data, save, busy })`.

- [ ] **Step 1: Types and catalog mapping**

- `src/lib/connected-types.ts`: in `RestaurantRow` add `bag_suggestions: string[];`; in `OptionRow` add `offer_in_bag: boolean;`; in `catalogState`'s `settings` object add `bagSuggestions: catalog.restaurant.bag_suggestions ?? [],`.
- `src/lib/types.ts`: in `Settings` add `bagSuggestions?: string[];`.

- [ ] **Step 2: Catalog route**

In `src/app/api/restaurants/[id]/catalog/route.ts`:
- in the `save_option` zod member add `offer_in_bag: z.boolean().optional(),`;
- add a new union member:

```ts
  z.object({
    action: z.literal("bag_suggestions"),
    product_ids: z
      .array(z.uuid())
      .max(3)
      .refine((v) => new Set(v).size === v.length),
  }),
```

- in the `save_option` branch, after `if (error) throw error;` add:

```ts
      if (body.offer_in_bag !== undefined) {
        const flag = await supabase.rpc("set_option_offer_in_bag", {
          p_restaurant: id,
          p_option: body.id,
          p_offer: body.offer_in_bag,
        });
        if (flag.error) throw flag.error;
      }
```

- before the `crm_settings` branch add:

```ts
    } else if (body.action === "bag_suggestions") {
      const { error } = await supabase.rpc("save_bag_suggestions", {
        p_restaurant: id,
        p_products: body.product_ids,
      });
      if (error) throw error;
```

Both actions keep the catalog invalidation (the public menu must update).

- [ ] **Step 3: Options admin — "Oferecer na sacola"**

In `src/components/product-options-admin.tsx`:
- the new-option default object gains `offer_in_bag: false,`;
- the `save({ action: "save_option", ... })` body gains `offer_in_bag: edit.offer_in_bag,`;
- right after the "Ativo no cardápio" checkbox label add:

```tsx
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={edit.offer_in_bag}
                onChange={(e) => setEdit({ ...edit, offer_in_bag: e.target.checked })}
              />
              Oferecer na sacola
            </label>
            <p className="field-help">
              Na sacola, quem pediu um desses produtos sem este opcional vê
              &quot;Transformar em combo por +{money(edit.price_cents)}?&quot;. Ideal para combos.
            </p>
```

- in the option card, change the status line to append the flag:

```tsx
                  {option.active ? "Ativo" : "Pausado"} ·{" "}
                  {option.price_cents ? money(option.price_cents) : "Grátis"}{" "}
                  por unidade
                  {option.offer_in_bag ? " · oferecido na sacola" : ""}
```

- [ ] **Step 4: Suggestions settings component**

Create `src/components/bag-suggestions-settings.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import type { Workspace } from "@/lib/connected-types";

type Save = (body: unknown) => Promise<void>;

export function BagSuggestionsSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [selected, setSelected] = useState<string[]>(data.restaurant.bag_suggestions ?? []);
  const [error, setError] = useState("");
  const products = data.products.filter((p) => p.published);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((v) => v !== id) : current.length < 3 ? [...current, id] : current,
    );
  return (
    <section className="admin-panel connected-panel form-stack">
      <h2>Sugestões na sacola</h2>
      <p className="field-help">
        Escolha até 3 produtos para aparecer na sacola como &quot;Que tal adicionar?&quot;.
        Batata, bebida e sobremesa costumam funcionar bem.
      </p>
      <fieldset className="choice-group">
        <legend>{selected.length} de 3 escolhidos</legend>
        {products.map((p) => (
          <label key={p.id} className="choice-row">
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={!selected.includes(p.id) && selected.length >= 3}
              onChange={() => toggle(p.id)}
            />
            {p.name} · {money(p.price_cents)}
          </label>
        ))}
      </fieldset>
      <Button
        disabled={busy}
        onClick={async () => {
          try {
            setError("");
            await save({ action: "bag_suggestions", product_ids: selected });
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Salvar sugestões
      </Button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
```

In `src/components/connected-admin.tsx`, import it and render `<BagSuggestionsSettings data={data} save={save} busy={busy} />` in the `configuracoes` fragment right after `<PixSettings ... />`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online`
Expected: no errors; tests pass. If another place constructs `OptionRow`/`RestaurantRow` literals and fails typecheck, add the new field there (`offer_in_bag: false` / `bag_suggestions: []`) and mention it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connected-types.ts src/lib/types.ts "src/app/api/restaurants/[id]/catalog/route.ts" src/components/product-options-admin.tsx src/components/bag-suggestions-settings.tsx src/components/connected-admin.tsx
git commit -m "feat(upsell): owner marks combo options and picks bag suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bag shows the offers and the "Antes de fechar…" step

**Files:**
- Create: `src/components/bag-offers.tsx`
- Modify: `src/components/menu-app.tsx` (`Bag` component, ~line 663)
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `comboOffers`, `applyCombo`, `bagSuggestions`, `suggestionItem` (Task 2); `useDemo()` from `./demo-provider` exposes `state`, `update`, `add`, `notify`; `state.settings.bagSuggestions` (Task 3).
- Produces: `useBagOffers()` hook and `BagOffers({ offers })` component.

- [ ] **Step 1: Component**

Create `src/components/bag-offers.tsx`:

```tsx
"use client";
import { Plus } from "lucide-react";
import { useDemo } from "./demo-provider";
import { Button } from "./ui/button";
import { money } from "@/lib/utils";
import { applyCombo, bagSuggestions, comboOffers, suggestionItem } from "@/lib/bag-upsell";
import type { Product } from "@/lib/types";

export function useBagOffers() {
  const { state, update, add, notify } = useDemo();
  const combos = comboOffers(state.bag, state.products);
  const suggestions = bagSuggestions(state.bag, state.products, state.categories, state.settings.bagSuggestions);
  const acceptCombo = (index: number, optionId: string) => {
    try {
      update((s) => {
        const item = s.bag[index];
        const product = s.products.find((p) => p.id === item?.productId);
        const option = product?.addOns?.find((o) => o.id === optionId);
        if (!item || !product || !option) return s;
        return { ...s, bag: applyCombo(s.bag, index, product, option) };
      });
    } catch (err) {
      notify((err as Error).message || "Não foi possível atualizar a sacola. Tente novamente.");
    }
  };
  const addSuggestion = (product: Product) => {
    try {
      add(suggestionItem(product));
    } catch (err) {
      notify((err as Error).message || "Não foi possível adicionar. Tente novamente.");
    }
  };
  return { combos, suggestions, acceptCombo, addSuggestion, hasOffers: combos.length + suggestions.length > 0 };
}

export function BagOffers({ offers }: { offers: ReturnType<typeof useBagOffers> }) {
  if (!offers.hasOffers) return null;
  return (
    <section className="bag-offers" aria-label="Sugestões para o seu pedido">
      {offers.combos.map((offer) => (
        <div className="bag-offer" key={`${offer.index}-${offer.option.id}`}>
          <div>
            <strong>{offer.option.name}</strong>
            <span>
              Transformar {offer.productName} em combo por +{money(offer.option.price_cents)}?
            </span>
          </div>
          <Button variant="outline" onClick={() => offers.acceptCombo(offer.index, offer.option.id)}>
            Adicionar
          </Button>
        </div>
      ))}
      {offers.suggestions.length > 0 && (
        <div className="bag-suggestions">
          <h3>Que tal adicionar?</h3>
          {offers.suggestions.map((p) => (
            <div className="bag-suggestion" key={p.id}>
              <img src={p.image || "/images/burger.jpg"} alt="" />
              <span>
                {p.name}
                <small>{money(p.price)}</small>
              </span>
              <button
                type="button"
                className="bag-suggestion-add"
                aria-label={`Adicionar ${p.name}`}
                onClick={() => offers.addSuggestion(p)}
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

If lint errors on `<img>` (`@next/next/no-img-element`), follow the pattern already used by the `bag-item` image in `menu-app.tsx` (it uses a plain `<img>`; copy any eslint-disable comment it has, otherwise none is needed).

- [ ] **Step 2: Wire into `Bag`**

In `src/components/menu-app.tsx`:
- add `import { BagOffers, useBagOffers } from "./bag-offers";`
- above `export function Bag(`, add:

```ts
// The "Antes de fechar…" step shows at most once per page load (visit).
let upsellPromptShown = false;
```

- inside `Bag`, after the `change` function, add:

```ts
  const offers = useBagOffers();
  const [prompting, setPrompting] = useState(false);
  const finish = () => {
    if (!upsellPromptShown && offers.hasOffers) {
      upsellPromptShown = true;
      setPrompting(true);
      return;
    }
    setPrompting(false);
    onCheckout();
  };
```

- wrap the existing `{!count ? (...empty...) : (<div className="bag-items">...</div>)}` so that, when `prompting && count`, it renders instead:

```tsx
      {prompting && count > 0 ? (
        <div className="bag-prompt">
          <h3>Antes de fechar…</h3>
          <BagOffers offers={offers} />
          <Button className="full-width" onClick={finish}>
            {offers.hasOffers ? "Não, obrigado, finalizar" : "Finalizar pedido"}
          </Button>
          <button type="button" className="button button-ghost" onClick={() => setPrompting(false)}>
            Voltar para a sacola
          </button>
        </div>
      ) : (
        <>
          {/* existing empty-state / bag-items ternary, unchanged */}
          {count > 0 && <BagOffers offers={offers} />}
        </>
      )}
```

- change the summary button `onClick={onCheckout}` to `onClick={finish}`.

- [ ] **Step 3: Styles**

Append to `src/app/globals.css`:

```css
.bag-offers {
  display: grid;
  gap: 10px;
  margin: 12px 0;
}
.bag-offer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--surface-2, #f6f1ea);
}
.bag-offer > div {
  display: grid;
  gap: 2px;
}
.bag-offer span {
  font-size: 0.9rem;
}
.bag-suggestions {
  display: grid;
  gap: 8px;
}
.bag-suggestions h3 {
  margin: 4px 0;
  font-size: 1rem;
}
.bag-suggestion {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 10px;
}
.bag-suggestion img {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
}
.bag-suggestion span {
  display: grid;
}
.bag-suggestion-add {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid currentColor;
  background: transparent;
  cursor: pointer;
}
.bag-prompt {
  display: grid;
  gap: 12px;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/bag-offers.tsx src/components/menu-app.tsx src/app/globals.css
git commit -m "feat(upsell): bag offers combos and suggestions, with a last offer before checkout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full local suite**

Run one by one: `npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build`. Expected: all green.

- [ ] **Step 2: Visual check (controller)**

The controller checks the bag in the browser after publication (the demo menu has no combo flags or suggestions, so a local visual check needs the hosted data).

- [ ] **Step 3: Publication notes (do not run)**

Report to the controller: apply `supabase/migrations/015_bag_upsell.sql` in the Supabase SQL editor **before** pushing to `main` (saving an option sends `offer_in_bag`, which needs the new RPC); then the owner marks the combo option in Opcionais and picks suggestions in Configurações.
