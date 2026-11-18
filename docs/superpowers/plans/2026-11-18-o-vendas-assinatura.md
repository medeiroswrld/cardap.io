# O — Página de vendas, assinatura (Asaas) e planos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-service sales: a sales page at `/`, `/assinar` signup that creates the account and an Asaas charge + subscription, a webhook that activates the plan, plan-based feature locks (client and server), overdue blocking, and a "Plano e pagamento" tab.

**Architecture:** Migration 021 adds `restaurant_billing` (owner-read), `billing_events` (service only) and helper SQL functions. A typed Asaas HTTP client (`src/lib/asaas.ts`) is used only server-side with `ASAAS_API_KEY`. Pure plan logic lives in `src/lib/plans.ts` (prices, features, effective plan/status), shared by server gating (`requirePlan`) and UI locks.

**Tech Stack:** Supabase (Postgres, Auth admin), Next.js 16 route handlers and pages, React 19, Zod 4, Asaas REST API v3, Resend (already configured as Supabase SMTP; for the notify e-mail use the Resend HTTP API with `RESEND_API_KEY` if present, else skip silently and log).

**Spec:** `docs/superpowers/specs/2026-11-18-o-vendas-assinatura-design.md` (binding for copy, prices and behaviour).

## Global Constraints
- Work in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never print or commit `.env*`, `.superpowers/`, `next-env.d.ts`. No push. Never touch the hosted Supabase or call the real Asaas production API. Never port 3000 (use 3102). No attribution lines in commits. Retry once if next dev/build stops on a security notice.
- Prices (cents): Essencial mensal 14900, anual 149000; Profissional mensal 24900, anual 249000; Fundador (Profissional mensal only) 17900; Implantação 29700; Agência 59700 (display only). Founder slots: 10.
- Asaas: base URL `https://api-sandbox.asaas.com/v3` when `ASAAS_ENV=sandbox`, `https://api.asaas.com/v3` when `production`; auth header `access_token: <ASAAS_API_KEY>`; webhook auth header `asaas-access-token` must equal `ASAAS_WEBHOOK_TOKEN` (constant-time compare). Read the official docs (https://docs.asaas.com) via WebFetch to confirm endpoint fields before coding the client; if anything differs from this plan, follow the docs and report it.
- Env vars (never hardcode): `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_NOTIFY_EMAIL`, `NEXT_PUBLIC_SALES_WHATSAPP`, optional `RESEND_API_KEY`. Missing Asaas config → `/assinar` shows "Assinaturas indisponíveis no momento. Fale com a gente." with the WhatsApp link; nothing crashes.
- Pro features (key → pages/actions): `crm` (contatos, avaliacoes, crm routes, campaigns), `coupons` (cupons, coupon routes/actions, coupon in orders), `winback` (reconquistar, lapsed-customers), `origin` (origem, origin routes/actions — origin capture in orders keeps working but report locked), `results` (resultados, metricas, results route), `finance` (caixa, mes, contas, finance routes/actions, payment fees), `upsell` (bag suggestions, offer_in_bag actions; public menu hides upsell offers for Essencial), `theme_full` (theme keys beyond logo_url, cover_url, brand).
- Server gating error: `PLAN_REQUIRED` (HTTP 403) with message "Disponível no plano Profissional.".
- Billing state blocks: `pendente`, `bloqueado` (atrasado > 7 days), `cancelado` → gestão only shows Plano e pagamento; guest orders return `CLOSED`.
- UI copy pt-BR exactly as in the spec; design system K tokens; páginas curtas e visuais.

---

### Task 1: Migration 021 + DB tests
**Files:** `supabase/migrations/021_billing.sql`, `scripts/test-billing-db.mjs`, `scripts/lib/test-db.mjs` (append), `package.json` (`test:database`).

```sql
-- O: subscription billing (Asaas) and plan state per restaurant.
create table public.restaurant_billing (
 restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
 plan text not null check (plan in ('essencial','profissional','agencia')),
 cycle text not null default 'mensal' check (cycle in ('mensal','anual')),
 status text not null check (status in ('pendente','ativo','atrasado','cancelado','cortesia')),
 founder boolean not null default false,
 price_cents integer not null default 0 check (price_cents >= 0),
 asaas_customer_id text,
 asaas_subscription_id text,
 setup_payment_id text,
 current_period_end date,
 overdue_since date,
 pending_plan text check (pending_plan in ('essencial','profissional')),
 pending_cycle text check (pending_cycle in ('mensal','anual')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.restaurant_billing enable row level security;
revoke all on public.restaurant_billing from anon, authenticated;
grant select on public.restaurant_billing to authenticated;
create policy owner_read on public.restaurant_billing for select to authenticated using (is_member(restaurant_id, true));

create table public.billing_events (
 id text primary key,
 restaurant_id uuid references public.restaurants(id) on delete set null,
 type text not null,
 payload jsonb not null,
 received_at timestamptz not null default now()
);
alter table public.billing_events enable row level security;
revoke all on public.billing_events from anon, authenticated;

insert into public.restaurant_billing(restaurant_id,plan,status) select id,'profissional','cortesia' from public.restaurants
 on conflict (restaurant_id) do nothing;

-- Effective status: atrasado for more than 7 days counts as bloqueado; no row = pendente.
create function public.restaurant_billing_state(p_restaurant uuid) returns text
language sql stable security definer set search_path=public as $$
 select coalesce((select case when b.status='atrasado' and b.overdue_since is not null and b.overdue_since < (now() at time zone r.timezone)::date - 7 then 'bloqueado' else b.status end
  from restaurant_billing b join restaurants r on r.id=b.restaurant_id where b.restaurant_id=p_restaurant),'pendente')
$$;
-- Effective plan for feature gating: essencial unless an active-ish profissional/agencia.
create function public.restaurant_plan(p_restaurant uuid) returns text
language sql stable security definer set search_path=public as $$
 select case when restaurant_billing_state(p_restaurant) in ('ativo','atrasado','cortesia')
   and (select plan from restaurant_billing where restaurant_id=p_restaurant) in ('profissional','agencia') then 'profissional' else 'essencial' end
$$;
create function public.founder_slots_left() returns integer
language sql stable security definer set search_path=public as $$
 select greatest(0,10-(select count(*) from restaurant_billing where founder and status in ('pendente','ativo','atrasado')))::int
$$;
revoke all on function public.restaurant_billing_state(uuid) from public;
revoke all on function public.restaurant_plan(uuid) from public;
grant execute on function public.restaurant_billing_state(uuid) to authenticated, service_role;
grant execute on function public.restaurant_plan(uuid) to anon, authenticated, service_role;
revoke all on function public.founder_slots_left() from public;
grant execute on function public.founder_slots_left() to anon, authenticated, service_role;
```
- `restaurant_billing_state` exposes only a status string; it is granted to authenticated (members) — acceptable. `restaurant_plan` is granted to anon because the public menu must know whether to show upsell and accept coupons (returns only 'essencial'/'profissional').
- Also make new restaurants default to no billing row (they come through `/assinar`, which inserts it via service role). Old onboarding path: `/gestao` with no membership must redirect to `/assinar` (Task 4).
- [ ] Tests: cortesia rows for existing restaurants; state transitions incl. 7-day boundary in the restaurant timezone; plan mapping for every status; founder slots count; staff/anon/owner read permissions on both tables; anon cannot read billing_events. `npm run test:database` green. Commit `feat(db): billing state and plans (021)`.

### Task 2: Plans lib, Asaas client, API and server gating
**Files:** create `src/lib/plans.ts`, `src/lib/asaas.ts`, `src/lib/cpf-cnpj.ts`, `src/lib/billing-server.ts` (server-only helpers: `requirePlan`, `billingState`), `scripts/test-plans.mjs` (+ `test:online`); routes `src/app/api/billing/subscribe/route.ts` (POST, public, rate-limited), `src/app/api/billing/asaas/route.ts` (POST webhook), `src/app/api/restaurants/[id]/billing/route.ts` (owner GET state + invoices; POST actions `change_plan`, `cancel`, `retry_payment`), `src/app/api/billing/founders/route.ts` (GET slots). Modify all pro routes/actions to call `requirePlan(id, feature)`; orders route returns `CLOSED` when the billing state blocks; coupon preview route returns `COUPON_INVALID` and orders route drops `coupon_code` for Essencial; catalog/workspace exposes `plan` and `billing_state` for the owner UI; observability allowlist + tests; `apiErrorMessages` (`PLAN_REQUIRED`, `EMAIL_IN_USE` "Este e-mail já tem conta. Entre para continuar.", `INVALID_DOCUMENT` "CPF ou CNPJ inválido.", `BILLING_UNAVAILABLE` "Assinaturas indisponíveis no momento. Fale com a gente.").
- `plans.ts`: `PLAN_PRICES`, `SETUP_FEE_CENTS`, `FOUNDER_PRICE_CENTS`, `FEATURES` map (feature → minimum plan), `pagePlan(page: PageKey)`, `allows(plan, feature)`, `priceFor(plan, cycle, founder)`, `firstChargeCents(plan, cycle, founder)` (= setup + price), `stateBlocks(state)`, `webhookStatus(event)` mapping (spec table), `slugFromName(name)`.
- `asaas.ts`: `createCustomer`, `createPayment` (one-off: customer, billingType "UNDEFINED", value (reais, 2 decimals from cents), dueDate, description, externalReference), `createSubscription` (customer, billingType "UNDEFINED", value, nextDueDate, cycle "MONTHLY"|"YEARLY", description, externalReference), `updateSubscription` (value/cycle), `cancelSubscription`, `listPayments(customer|subscription)`; returns typed results incl. `invoiceUrl`; throws `BILLING_UNAVAILABLE` on network/5xx; never logs the API key or document numbers. Unit-test with a mocked `fetch`.
- Subscribe flow per spec (create auth user with the admin API + `email_confirm: true`, sign the user in on the server client so cookies are set, call the existing `onboard_restaurant` RPC as the user with a unique slug, insert billing row with service role, call Asaas, store ids, respond `{ redirect: invoiceUrl }`). If Asaas fails after the account exists, respond `{ redirect: "/gestao" }` (gestão shows the retry). Founder only for Profissional mensal when `founder_slots_left() > 0` (checked at creation).
- Webhook per spec; idempotent insert into `billing_events` first (conflict → 200 no-op); restaurant from `externalReference` (payment or subscription); `current_period_end` = due date + 1 month/year; notify e-mail on first activation.
- `change_plan`: upgrade (essencial→profissional or mensal→anual) applies now in DB and updates the Asaas subscription value/cycle; downgrade stores `pending_plan/pending_cycle`, updates Asaas value for the next charge, and the webhook applies pending on the next confirmed payment; founder flag cleared on any change. `cancel`: cancel Asaas subscription, keep status until `current_period_end` (a daily check isn't needed: state function treats `cancelado` only when set; set `status='cancelado'` immediately but `restaurant_billing_state` returns `ativo` until `current_period_end` — implement that rule in SQL in Task 1 if needed, or keep it simple: cancel sets a `cancel_at` date column; adjust 021 accordingly and test it). `retry_payment`: creates a new one-off payment for the first charge when status is `pendente` and returns its invoiceUrl.
- [ ] Verify `tsc`, `lint`, `test:online`, `test:observability`, `test:database`, `build`. Commit `feat(billing): plans, Asaas client, subscribe, webhook and server gating`.

### Task 3: Sales page and /assinar
**Files:** `src/app/page.tsx` (replace redirect), `src/components/sales/*`, `src/app/assinar/page.tsx`, `src/components/subscribe-form.tsx`, `src/app/sitemap.ts`/`robots.ts` (create or update), CSS.
- Before building, invoke the skills `ecc:frontend-design-direction` then use its guidance; keep the page short and visual per spec; design system K (tokens under a new `data-app="site"` scope or reuse gestão tokens; dark/light via the existing mode script — add `/`, `/assinar` to a "site" scope in `src/lib/color-mode.ts` with tests).
- Calculator pure function in `plans.ts` (`ifoodSavings(monthlyCents, percent)`) with tests.
- `/assinar` form per spec with client validation (CPF/CNPJ checksum, e-mail, phone 10–11 digits, password ≥ 8, terms checkbox), summary box with `firstChargeCents`, submit → `/api/billing/subscribe` → `location.href = redirect`.
- Logged-in visitors: "Entrar" becomes "Ir para a gestão".
- Screenshots (390×844 and 1280×900, dark and light) of `/` and `/assinar` → `C:\Users\medei\AppData\Local\Temp\design-o\`. Run `ecc:seo` checks on `/` (title, description, OG, sitemap). Commit `feat(site): sales page and subscription form`.

### Task 4: Gestão — locks, billing tab, blocking
**Files:** `src/lib/admin-sections.ts` (+ test: pages carry their feature), `src/components/connected-admin.tsx`, new `src/components/plan-lock.tsx`, `src/components/billing-settings.tsx`, `src/components/billing-gate.tsx`, `src/app/gestao/page.tsx` (no membership → redirect `/assinar`), `src/components/menu-theme-settings.tsx` (Essencial: only logo, capa, cor principal; rest locked), bag upsell settings locked, menu side hides upsell for Essencial (via `restaurant_plan` in the catalog payload).
- Sidebar/tabs: locked pages show a lock icon; opening shows `PlanLock` card: title of the page, one-line benefit, "Liberar no Profissional" → Configurações › Plano e pagamento.
- New Configurações tab "Plano e pagamento" (page key `plano`, owner only) per spec (plan, situação pill, próxima cobrança, fundador, faturas list with links, trocar plano with confirmation texts, cancelar with confirmation).
- Billing gate: states `pendente`/`bloqueado`/`cancelado` → only Plano e pagamento (with "Pagar agora" / "Tentar gerar o pagamento de novo"); `atrasado` → banner with link. Staff in a blocked restaurant see "A assinatura deste restaurante está pendente. Avise o responsável."
- Screenshots → `C:\Users\medei\AppData\Local\Temp\design-o\gestao-*.png`. Commit `feat(gestao): plan locks, billing tab and blocking`.

### Task 5: Final verification
- [ ] All suites green; whole-feature review; sandbox end-to-end checklist for the owner (create sandbox key, set env vars in Vercel Preview, subscribe, pay with sandbox Pix/card, see activation, overdue simulation); migration 021 handed over before publishing.
