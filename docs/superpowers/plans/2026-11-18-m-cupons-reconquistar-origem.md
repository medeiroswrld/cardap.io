# M — Cupons, Reconquistar e Origem · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coupons applied server-side to guest orders, a "Reconquistar" list of lapsed authorized customers with a ready WhatsApp message + coupon link, and order origin tracking with links/QR and a monthly report.

**Architecture:** Migration 019 adds `coupons`, `order_origins`, three `orders` columns and SECURITY DEFINER functions; `place_guest_order` is redefined to validate and apply the coupon and store the origin. A pure `src/lib/coupons.ts` mirrors the discount math for the menu preview. API routes follow the existing catalog-action pattern. UI: menu checkout field + URL capture; gestão tabs "Cupons", "Reconquistar" (section Clientes) and "Origem" (section Relatórios) plugged into `src/lib/admin-sections.ts`.

**Tech Stack:** Supabase Postgres (PL/pgSQL), PGlite tests, Next.js 16 route handlers, React 19, Zod 4, `qrcode`.

**Spec:** `docs/superpowers/specs/2026-11-18-m-cupons-reconquistar-origem-design.md` (binding for copy, limits and behaviour).

## Global Constraints
- Work in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never print or commit `.env*`, `.superpowers/`, `next-env.d.ts`. No push. Never touch the hosted Supabase. Never port 3000 (3101 is another project; use 3102). No attribution lines in commits. If next dev/build stop once on a security notice, retry.
- Money in integer cents everywhere. Discount = on item subtotal (excl. delivery fee); `percent` → `floor(subtotal * value / 100)`; `fixed` → `least(value, subtotal)`; total = subtotal − discount + fee.
- Coupon code: `^[A-Z0-9]{3,20}$` after `upper(trim())`. Percent 1–90; fixed 1–50000 cents; min order 0–100000 cents; `valid_until` inclusive in restaurant timezone.
- Built-in origins: `mesa` (derived from fulfillment, never from the URL), `ifood` ("Embalagem do iFood"), `instagram` ("Instagram"); custom origins: name 2–40 chars, slug `^[a-z0-9-]{2,30}$`, max 20 per restaurant; label for unknown slugs "Origem apagada"; null = "Direto".
- Only owners manage coupons/origins and see Reconquistar/Origem. Reconquistar lists only `marketing_status = 'authorized'`.
- Customer-facing errors (pt-BR, exact): `COUPON_INVALID` "Cupom não encontrado.", `COUPON_EXPIRED` "Este cupom expirou.", `COUPON_MIN_ORDER` "Este cupom vale para pedidos a partir de R$ X." (X = min formatted with `money`).
- Customer menu layout/flows otherwise unchanged; gestão design tokens as in phase K.

---

### Task 1: Migration 019 + DB tests

**Files:** Create `supabase/migrations/019_coupons_origins.sql`, `scripts/test-coupons-db.mjs`. Modify `scripts/lib/test-db.mjs` (append `"019_coupons_origins.sql"` to `MIGRATIONS`), `package.json` (`test:database`: append ` && node scripts/test-coupons-db.mjs`).

**Interfaces (produces):** tables `coupons`, `order_origins`; `orders.coupon_code text`, `orders.discount_cents int`, `orders.origin text`; functions below; `place_guest_order` payload keys `coupon_code` (string|null), `expected_discount_cents` (int, required when coupon_code), `origin` (string|null).

- [ ] **Step 1: Schema.**

```sql
-- M: coupons, lapsed customers and order origin.
create table public.coupons (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
 kind text not null check (kind in ('percent','fixed')),
 value integer not null check ((kind='percent' and value between 1 and 90) or (kind='fixed' and value between 1 and 50000)),
 min_order_cents integer not null default 0 check (min_order_cents between 0 and 100000),
 valid_until date,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique (restaurant_id, code)
);
alter table public.coupons enable row level security;
create policy member_read on public.coupons for select to authenticated using (is_member(restaurant_id));

create table public.order_origins (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 slug text not null check (slug ~ '^[a-z0-9-]{2,30}$' and slug not in ('mesa','ifood','instagram')),
 name text not null check (length(trim(name)) between 2 and 40),
 created_at timestamptz not null default now(),
 unique (restaurant_id, slug)
);
alter table public.order_origins enable row level security;
create policy member_read on public.order_origins for select to authenticated using (is_member(restaurant_id));

alter table public.orders add column coupon_code text,
 add column discount_cents integer not null default 0 check (discount_cents >= 0),
 add column origin text check (origin is null or origin ~ '^[a-z0-9-]{2,30}$');
```

- [ ] **Step 2: Coupon helpers and owner functions.**

```sql
-- Shared rule: returns the discount in cents or raises COUPON_*.
create function public.coupon_discount(p_restaurant uuid,p_code text,p_subtotal integer) returns integer
language plpgsql stable security definer set search_path=public as $$
declare c coupons; tz text;
begin
 select * into c from coupons where restaurant_id=p_restaurant and code=upper(trim(coalesce(p_code,''))) and active;
 if not found then raise exception 'COUPON_INVALID'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 if c.valid_until is not null and (now() at time zone tz)::date > c.valid_until then raise exception 'COUPON_EXPIRED'; end if;
 if p_subtotal < c.min_order_cents then raise exception 'COUPON_MIN_ORDER'; end if;
 return case when c.kind='percent' then floor(p_subtotal*c.value/100.0)::int else least(c.value,p_subtotal) end;
end $$;
revoke all on function public.coupon_discount(uuid,text,integer) from public,anon,authenticated;

-- Public preview for the menu (no subtotal check here; the menu checks the minimum itself and the order revalidates).
create function public.check_coupon(p_restaurant uuid,p_code text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c coupons; tz text;
begin
 select * into c from coupons where restaurant_id=p_restaurant and code=upper(trim(coalesce(p_code,''))) and active;
 if not found then raise exception 'COUPON_INVALID'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 if c.valid_until is not null and (now() at time zone tz)::date > c.valid_until then raise exception 'COUPON_EXPIRED'; end if;
 return jsonb_build_object('code',c.code,'kind',c.kind,'value',c.value,'min_order_cents',c.min_order_cents);
end $$;
revoke all on function public.check_coupon(uuid,text) from public;
grant execute on function public.check_coupon(uuid,text) to anon,authenticated,service_role;

create function public.save_coupon(p_restaurant uuid,p_id uuid,p_coupon jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare existing coupons; new_code text:=upper(trim(coalesce(p_coupon->>'code',''))); saved uuid;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_id is not null then
  select * into existing from coupons where id=p_id and restaurant_id=p_restaurant for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if existing.code<>new_code and exists(select 1 from orders where restaurant_id=p_restaurant and coupon_code=existing.code) then raise exception 'COUPON_USED'; end if;
 end if;
 if exists(select 1 from coupons where restaurant_id=p_restaurant and code=new_code and id is distinct from p_id) then raise exception 'COUPON_DUPLICATE'; end if;
 insert into coupons(id,restaurant_id,code,kind,value,min_order_cents,valid_until,active)
 values(coalesce(p_id,gen_random_uuid()),p_restaurant,new_code,p_coupon->>'kind',(p_coupon->>'value')::int,coalesce((p_coupon->>'min_order_cents')::int,0),nullif(p_coupon->>'valid_until','')::date,coalesce((p_coupon->>'active')::boolean,true))
 on conflict(id) do update set code=excluded.code,kind=excluded.kind,value=excluded.value,min_order_cents=excluded.min_order_cents,valid_until=excluded.valid_until,active=excluded.active
 returning id into saved;
 return saved;
exception when check_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then raise exception 'INVALID_INPUT';
end $$;
revoke all on function public.save_coupon(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_coupon(uuid,uuid,jsonb) to authenticated;

create function public.delete_coupon(p_restaurant uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c coupons;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 select * into c from coupons where id=p_id and restaurant_id=p_restaurant for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if exists(select 1 from orders where restaurant_id=p_restaurant and coupon_code=c.code) then raise exception 'COUPON_USED'; end if;
 delete from coupons where id=p_id;
end $$;
revoke all on function public.delete_coupon(uuid,uuid) from public,anon;
grant execute on function public.delete_coupon(uuid,uuid) to authenticated;

create function public.coupon_stats(p_restaurant uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 return coalesce((select jsonb_object_agg(coupon_code,jsonb_build_object('uses',n,'discount_cents',d))
  from (select coupon_code,count(*)::int n,sum(discount_cents)::bigint d from orders
        where restaurant_id=p_restaurant and coupon_code is not null and status not in ('recusado','cancelado') group by coupon_code) s),'{}'::jsonb);
end $$;
revoke all on function public.coupon_stats(uuid) from public,anon;
grant execute on function public.coupon_stats(uuid) to authenticated;
```

(If `orders` has no `on conflict(id)` path issue because `id` is the PK — fine. `save_coupon` must not allow changing `restaurant_id`.)

- [ ] **Step 3: Origins, lapsed customers and report.**

```sql
create function public.save_origin(p_restaurant uuid,p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare base text; candidate text; n int:=1; created order_origins;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 40 then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from order_origins where restaurant_id=p_restaurant)>=20 then raise exception 'LIMIT_REACHED'; end if;
 base:=left(trim(both '-' from regexp_replace(lower(translate(trim(p_name),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn')),'[^a-z0-9]+','-','g')),26);
 if length(base)<2 then base:='origem'; end if;
 candidate:=base;
 while candidate in ('mesa','ifood','instagram') or exists(select 1 from order_origins where restaurant_id=p_restaurant and slug=candidate) loop
  n:=n+1; candidate:=base||'-'||n;
 end loop;
 insert into order_origins(restaurant_id,slug,name) values(p_restaurant,candidate,trim(p_name)) returning * into created;
 return jsonb_build_object('id',created.id,'slug',created.slug,'name',created.name);
end $$;
revoke all on function public.save_origin(uuid,text) from public,anon;
grant execute on function public.save_origin(uuid,text) to authenticated;

create function public.delete_origin(p_restaurant uuid,p_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 delete from order_origins where id=p_id and restaurant_id=p_restaurant;
 if not found then raise exception 'NOT_FOUND'; end if;
end $$;
revoke all on function public.delete_origin(uuid,uuid) from public,anon;
grant execute on function public.delete_origin(uuid,uuid) to authenticated;

create function public.lapsed_customers(p_restaurant uuid,p_days integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_days not in (30,60,90) or p_offset is null or p_offset<0 then raise exception 'INVALID_INPUT'; end if;
 return jsonb_build_object(
  'total',(select count(*) from crm_rows(p_restaurant) where marketing_status='authorized' and last_order_at < now()-make_interval(days=>p_days)),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'phone',x.phone,'last_order_at',x.last_order_at,'orders_count',x.orders_count,'spent_cents',x.spent_cents) order by x.last_order_at asc,x.id)
   from (select * from crm_rows(p_restaurant) where marketing_status='authorized' and last_order_at < now()-make_interval(days=>p_days)
         order by last_order_at asc,id offset p_offset limit 50) x),'[]'::jsonb));
end $$;
revoke all on function public.lapsed_customers(uuid,integer,integer) from public,anon;
grant execute on function public.lapsed_customers(uuid,integer,integer) to authenticated;

create function public.origin_report(p_restaurant uuid,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare tz text; m_start timestamptz; m_end timestamptz;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_month is null then raise exception 'INVALID_INPUT'; end if;
 select timezone into tz from restaurants where id=p_restaurant;
 m_start:=date_trunc('month',p_month)::date::timestamp at time zone tz;
 m_end:=(date_trunc('month',p_month)::date+interval '1 month')::timestamp at time zone tz;
 return coalesce((select jsonb_agg(jsonb_build_object('origin',k,'orders',n,'total_cents',t) order by t desc,k)
  from (select case when fulfillment='mesa' then 'mesa' else coalesce(origin,'direto') end k,count(*)::int n,sum(total_cents)::bigint t
        from orders where restaurant_id=p_restaurant and status='entregue' and created_at>=m_start and created_at<m_end group by 1) s),'[]'::jsonb);
end $$;
revoke all on function public.origin_report(uuid,date) from public,anon;
grant execute on function public.origin_report(uuid,date) to authenticated;
```

- [ ] **Step 4: Redefine `place_guest_order`.** Copy the full definition from `supabase/migrations/014_pix_manual.sql` (lines ~45-142, the latest one; 015–018 don't redefine it — verify with grep) into 019 as `create or replace function`, with exactly these changes:
  - `declare`: add `discount integer:=0; coupon text; origin_slug text;`.
  - After the items loop and **before** the `if kind='entrega'` minimum/fee block: 
    ```sql
     coupon:=nullif(upper(trim(coalesce(p_payload->>'coupon_code',''))),'');
     if coupon is not null then
      discount:=coupon_discount(p_restaurant,coupon,total);
      if discount is distinct from (p_payload->>'expected_discount_cents')::integer then raise exception 'PRICE_CHANGED'; end if;
     end if;
    ```
    Keep the delivery minimum check on the item subtotal (`total` before discount, as today), then `total:=total-discount;` and add the fee as today (`total:=total+fee`). Make sure `change_for` validation uses the final total (it already runs after).
  - Origin: `origin_slug:=nullif(p_payload->>'origin','');` and set it to null unless `kind<>'mesa' and (origin_slug in ('ifood','instagram') or exists(select 1 from order_origins where restaurant_id=p_restaurant and slug=origin_slug))`.
  - The `insert into orders` gets `coupon_code,discount_cents,origin` with `coupon,discount,origin_slug`.
  - The return object adds `'discount_cents',created.discount_cents`.
  - Keep grants exactly as in 014.
- [ ] **Step 5: Tests** `scripts/test-coupons-db.mjs` — follow `scripts/test-upsell-db.mjs`/`test-online-orders.mjs` for setup (owner, staff, guest session, catalog, `place_guest_order` calls via service role). Cover: percent and fixed discount totals (incl. fixed > subtotal → discount = subtotal), delivery fee not discounted and minimum still on subtotal, `COUPON_INVALID` (unknown and paused), `COUPON_EXPIRED` (valid_until yesterday in restaurant tz), `COUPON_MIN_ORDER`, `PRICE_CHANGED` when expected_discount differs, idempotent replay returns same order, origin: valid built-in, valid custom, unknown → null, mesa ignores URL origin; `save_coupon` duplicate → `COUPON_DUPLICATE`, rename used coupon → `COUPON_USED`, delete used → `COUPON_USED`; staff/anon can't call owner functions (FORBIDDEN or permission denied); `check_coupon` callable by anon; `lapsed_customers` only authorized and ≥ N days, `INVALID_INPUT` for 45; `origin_report` groups mesa/direto/custom for delivered orders in the month; `save_origin` slug generation ("Panfleto Centro" → `panfleto-centro`, duplicate → `-2`, "Instagram" → `instagram-2`) and 21st origin → `LIMIT_REACHED`.
- [ ] **Step 6:** `npm run test:database` all green. Commit `feat(db): coupons, origins, lapsed customers (019)`.

### Task 2: API + shared lib

**Files:** Create `src/lib/coupons.ts`, `src/lib/origins.ts`, `scripts/test-coupons.mjs` (append to `test:online`). Modify the catalog/orders API routes and error map.

**Interfaces (produces):**
- `src/lib/coupons.ts`: `type CouponPreview = { code: string; kind: "percent" | "fixed"; value: number; min_order_cents: number }`; `discountFor(c: CouponPreview, subtotal: number): number` (same math as SQL); `normalizeCode(s: string): string` (upper+trim); `couponError(code: string, min?: number): string` (pt-BR texts from Global Constraints); `couponLink(slug: string, code: string): string`; `winBackMessage(template: string, vars: { nome: string; restaurante: string; link: string }): string` (first name only; replaces `{nome}`, `{restaurante}`, `{link}`); `whatsappUrl(phone: string, text: string): string` (`https://wa.me/55${digits}?text=${encodeURIComponent(text)}`).
- `src/lib/origins.ts`: `BUILTIN_ORIGINS = [{ slug: "ifood", name: "Embalagem do iFood" }, { slug: "instagram", name: "Instagram" }]`; `originLabel(slug: string | null, custom: { slug: string; name: string }[]): string` ("Mesa" for `mesa`, "Direto" for null/`direto`, built-in names, custom names, else "Origem apagada"); `originLink(restaurantSlug: string, originSlug: string): string`.
- API: a public `GET /api/restaurants/[id]/coupon?code=` (or a catalog action, following existing public patterns) → `CouponPreview` or `{ error }` mapped via the error map; owner catalog actions `save_coupon`, `delete_coupon`, `save_origin`, `delete_origin`; owner `GET` endpoints for `coupon_stats`, `lapsed_customers?days=&offset=` and `origin_report?month=` (follow the `/results` route pattern incl. observability route allowlist in `src/lib/observability/core.ts` and its count test). `place_guest_order` call passes `coupon_code`, `expected_discount_cents`, `origin` through the existing Zod order schema (extend it). Workspace data (`connected-types.ts` loader) includes `coupons` and `origins` rows for owners and the new order columns.
- Error map entries: `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_MIN_ORDER` (the API returns the code; the client formats min-order text with the coupon's min), `COUPON_DUPLICATE` "Já existe um cupom com esse código.", `COUPON_USED` "Este cupom já foi usado em pedidos. Você pode pausá-lo.", `LIMIT_REACHED` "Limite de 20 origens atingido.".
- [ ] Tests for every pure function (incl. discount parity examples: 10% of 4590 → 459; fixed 500 on 300 → 300; message first-name; wa.me digits; labels). `npm run test:online`, `tsc`, `lint`, `test:observability`. Commit `feat(api): coupons, origins and lapsed customers endpoints`.

### Task 3: Menu — coupon and origin

**Files:** `src/components/menu-app.tsx` (checkout), `src/components/connected-menu-provider.tsx` (order submit), `src/components/connected-tracking.tsx`, order ticket (`src/lib/order-ticket.ts` or equivalent), gestão order card (`order-board.tsx`).

- [ ] On load of `/r/<slug>`: read `?cupom=` and `?origem=` from the URL into sessionStorage keys `fp:cupom:<slug>` / `fp:origem:<slug>` (try/catch), then remove them from the URL with `history.replaceState` (keep other params like `mesa`).
- [ ] Checkout (online and table): a "Cupom" field + "Aplicar" button below the items summary (pre-filled and auto-applied from sessionStorage); calls the public coupon endpoint; on success shows the line "Desconto (CODE)" with `−money(discount)` in the summary and a "Remover" link; total uses `discountFor`; when the subtotal changes below the minimum, show the min-order message and don't send the coupon. Order submit sends `coupon_code`, `expected_discount_cents`, `origin` (from sessionStorage). On `COUPON_*`/`PRICE_CHANGED` errors, show the message and refresh the coupon preview. Demo mode (`/r/demo`): coupon field hidden.
- [ ] Show the discount line on the tracking page, the printed ticket and the gestão order card when `discount_cents > 0`.
- [ ] Verify with dev server + Playwright: a mocked catalog or the local PGlite isn't available in the browser — use the demo-provider mock approach used before (temporary, reverted) to exercise the field UI; logic is covered by DB/unit tests. Screenshots `C:\Users\medei\AppData\Local\Temp\design-m\menu-*.png` (dark/light, mobile). Commit `feat(menu): coupon field and origin capture`.

### Task 4: Gestão tabs

**Files:** `src/lib/admin-sections.ts` (+ its test), `src/components/connected-admin.tsx`, new `src/components/coupons-admin.tsx`, `src/components/win-back-panel.tsx`, `src/components/origins-panel.tsx`, `src/app/globals.css`.

- [ ] Sections: Clientes = `contatos`, `avaliacoes`, `cupons`, `reconquistar`; Relatórios = `resultados`, `metricas`, `origem`. Tab labels "Cupons", "Reconquistar", "Origem". Owner only. Update the section test.
- [ ] **Cupons:** list (code, "10%"/"R$ 5,00", min, validity "até dd/mm" or "Sem validade", status pill Ativo/Pausado, "Usado N vezes · R$ X de desconto"), "Novo cupom" modal (fields per spec; kind as segmented %/R$), edit, pause/activate, delete (confirm; shows API error), "Copiar link" (copies `couponLink`).
- [ ] **Reconquistar:** pills 30/60/90; coupon select (active, not expired, + "Sem cupom"); editable message (default text from spec) ; table/list with name, phone, last order date, orders, spent, button "Chamar no WhatsApp" (`<a target="_blank" rel="noopener" href={whatsappUrl(...)}>`); pagination "Carregar mais"; empty state "Ninguém sumido há N dias. Bom sinal!".
- [ ] **Origem:** month selector (reuse `monthOptions` from results-report); list of origins (Mesa — "automática"; iFood; Instagram; custom) each with link (copy button) and "Baixar QR" (PNG via `qrcode` `toDataURL`, download `origem-<slug>.png`) except Mesa; "Nova origem" input + button; delete custom (confirm); report table origin label, pedidos, total — with "Direto" row; empty "Ainda sem pedidos entregues neste mês.".
- [ ] Verify (tsc, lint, test:online, build) + screenshots with the mocked-workspace temp page (`C:\Users\medei\AppData\Local\Temp\design-k1\t3admin.cjs`) → `C:\Users\medei\AppData\Local\Temp\design-m\gestao-*.png` dark/light. Commit `feat(gestao): coupons, win-back and origin tabs`.

### Task 5: Final verification
- [ ] All suites (`tsc`, `lint`, `test:database`, `test:online`, `test:foundation`, `test:crm`, `test:observability`, `build`) green; final whole-branch review; migration 019 handed to the user to run in Supabase before publishing.
