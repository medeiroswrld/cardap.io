# K1 — Design system, fase 1 (base + gestão) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the management area (gestão, login, password reset, demo gestão) the new Fome Play look — dark/light modes with a moon/sun toggle, red active pills, rounded charcoal cards, Poppins — and turn "Visão geral" into a dashboard, without touching the customer menu.

**Architecture:** An inline head script sets `data-mode` (stored choice or system preference) and `data-app="gestao"` (by path) on `<html>` before first paint. Design tokens are CSS variables scoped to `html[data-app="gestao"]` (light) and `html[data-app="gestao"][data-mode="dark"]`, reusing the variable names the existing CSS already reads, so the customer menu (no `data-app`) keeps today's look. A pure `src/lib/color-mode.ts` holds the mode rule; `ModeToggle` flips it. The dashboard is a new `AdminOverview` component fed by data the page already loads plus the existing owner-only `/results` route.

**Tech Stack:** Next.js 16, React 19, TypeScript, plain CSS (`src/app/globals.css`), `@fontsource/poppins`, lucide-react icons, `node:test`, Playwright for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-17-k-design-system-design.md` (Fase 1 only). Deviation (intentional, keeps the menu untouched in phase 1): tokens and Poppins are scoped to `html[data-app="gestao"]` instead of the whole site; phase 2 extends them to the menu.

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`. Do not push. Do not touch the hosted Supabase. Never use port 3000. No attribution lines in commit messages. Restore `next-env.d.ts`/`AGENTS.md` if `next dev`/`next build` modify them.
- **Do not change the customer menu** (`/r/...`, `menu-app.tsx`, `immersive-menu.tsx`, menu CSS) in this phase. Pages under `/r/` must render exactly as today.
- Gestão paths: `/gestao`, `/gestao/...`, `/login`, `/redefinir-senha`, `/demo/gestao`, `/demo/gestao/...`.
- Mode: stored `localStorage["fp:mode"]` (`"dark"`/`"light"`) wins; otherwise `prefers-color-scheme`.
- Tokens (light / dark): `--background #f6f5f3 / #161618`, `--sidebar #ffffff / #1f1f22`, `--surface #ffffff / #242427`, `--surface-2 #efece8 / #2e2e32`, `--soft #f1efec / #2a2a2e`, `--border #e7e3de / #38383d`, `--text #1d1d1f / #f4f4f5`, `--muted #6b6b70 / #a1a1aa`, `--brand #d32f2f`, `--brand-dark #b3261e`, `--brand-contrast #ffffff`, `--success-bg #dcfce7 / #14532d`, `--success-text #166534 / #bbf7d0`, `--warning-bg #fef3c7 / #78350f`, `--warning-text #92400e / #fde68a`, `--danger-bg #fee2e2 / #7f1d1d`, `--danger-text #991b1b / #fecaca`, `--radius 14px`, `--radius-card 20px`, `--card-shadow 0 1px 2px rgba(0,0,0,.06) / none`.
- Font in gestão: Poppins (400/500/600/700) for `--font-sans` and `--font-heading`.
- No `backdrop-filter`, no new `:has()` on broad selectors, no shadows on long lists.
- UI copy in Brazilian Portuguese, exactly as written in this plan.

## File Structure

- Create `src/lib/color-mode.ts` (rule + head script string), `src/components/mode-toggle.tsx`, `scripts/test-color-mode.mjs`.
- Modify `src/app/layout.tsx` (head script, Poppins import, `suppressHydrationWarning`), `package.json` (`@fontsource/poppins`, `test:online`).
- Modify `src/app/globals.css` (tokens, shell, components restyle — management selectors only).
- Modify `src/components/connected-admin.tsx` (toggle in sidebar, status pills, overview), `src/components/login-form.tsx` (toggle), `src/lib/order-flow.ts` (`statusTone`).
- Create `src/lib/overview.ts`, `scripts/test-overview.mjs`, `src/components/admin-overview.tsx`.

---

### Task 1: Color mode rule, head script and toggle

**Files:**
- Create: `src/lib/color-mode.ts`, `src/components/mode-toggle.tsx`, `scripts/test-color-mode.mjs`
- Modify: `src/app/layout.tsx`, `package.json` (`test:online`: append ` scripts/test-color-mode.mjs`)

**Interfaces:**
- Produces: `type ColorMode = "dark" | "light"`; `resolveMode(stored: string | null, prefersDark: boolean): ColorMode`; `isGestaoPath(pathname: string): boolean`; `MODE_STORAGE_KEY = "fp:mode"`; `MODE_SCRIPT: string` (self-contained IIFE); component `ModeToggle({ className?: string })`.

- [ ] **Step 1: Failing tests**

Create `scripts/test-color-mode.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loader } from "./lib/ts-loader.mjs";

const m = loader()("src/lib/color-mode.ts");

test("stored choice wins over the system preference", () => {
  assert.equal(m.resolveMode("dark", false), "dark");
  assert.equal(m.resolveMode("light", true), "light");
  assert.equal(m.resolveMode(null, true), "dark");
  assert.equal(m.resolveMode(null, false), "light");
  assert.equal(m.resolveMode("blue", true), "dark");
});

test("gestão paths are recognized", () => {
  for (const p of ["/gestao", "/gestao/abc", "/login", "/redefinir-senha", "/demo/gestao", "/demo/gestao/pedidos"])
    assert.equal(m.isGestaoPath(p), true, p);
  for (const p of ["/", "/r/capiburguer", "/r/demo", "/gestaox", "/privacidade"])
    assert.equal(m.isGestaoPath(p), false, p);
});

function runScript({ stored, prefersDark, path, storageThrows = false }) {
  const dataset = {};
  const ctx = {
    document: { documentElement: { dataset, style: {} } },
    location: { pathname: path },
    localStorage: { getItem: () => { if (storageThrows) throw new Error("blocked"); return stored; } },
    matchMedia: () => ({ matches: prefersDark }),
  };
  vm.runInNewContext(m.MODE_SCRIPT, ctx);
  return { mode: dataset.mode, app: dataset.app, scheme: ctx.document.documentElement.style.colorScheme };
}

test("the head script agrees with resolveMode and isGestaoPath", () => {
  for (const stored of ["dark", "light", null, "x"])
    for (const prefersDark of [true, false])
      for (const path of ["/gestao/1", "/r/capiburguer", "/login"]) {
        const r = runScript({ stored, prefersDark, path });
        assert.equal(r.mode, m.resolveMode(stored, prefersDark));
        assert.equal(r.scheme, r.mode);
        assert.equal(r.app, m.isGestaoPath(path) ? "gestao" : undefined);
      }
});

test("the head script survives blocked storage", () => {
  const r = runScript({ stored: null, prefersDark: true, path: "/gestao", storageThrows: true });
  assert.equal(r.mode, "dark");
  assert.equal(r.app, "gestao");
});
```

Append ` scripts/test-color-mode.mjs` to `test:online`. Run `node --test scripts/test-color-mode.mjs` → FAIL (module not found).

- [ ] **Step 2: Implement `src/lib/color-mode.ts`**

```ts
// Dark/light mode for the Fome Play design system (spec K).
export type ColorMode = "dark" | "light";
export const MODE_STORAGE_KEY = "fp:mode";
const GESTAO_PATH = /^\/(gestao|login|redefinir-senha|demo\/gestao)(\/|$)/;

export function resolveMode(stored: string | null, prefersDark: boolean): ColorMode {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

export function isGestaoPath(pathname: string) {
  return GESTAO_PATH.test(pathname);
}

// Runs inline in <head> before first paint (no flash). Must mirror the two
// functions above; scripts/test-color-mode.mjs checks that they agree.
export const MODE_SCRIPT = `(function(){try{var d=document.documentElement,s=null;try{s=localStorage.getItem(${JSON.stringify(
  MODE_STORAGE_KEY,
)})}catch(e){}var m=s==="dark"||s==="light"?s:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.mode=m;d.style.colorScheme=m;if(${GESTAO_PATH.toString()}.test(location.pathname))d.dataset.app="gestao"}catch(e){}})();`;
```

- [ ] **Step 3: Toggle component** — create `src/components/mode-toggle.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { MODE_STORAGE_KEY, type ColorMode } from "@/lib/color-mode";

function currentMode(): ColorMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.mode === "dark" ? "dark" : "light";
}

export function ModeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ColorMode>(currentMode);
  const next: ColorMode = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={`mode-toggle ${className}`.trim()}
      aria-label={next === "dark" ? "Ativar modo noturno" : "Ativar modo claro"}
      onClick={() => {
        const root = document.documentElement;
        root.dataset.mode = next;
        root.style.colorScheme = next;
        try {
          localStorage.setItem(MODE_STORAGE_KEY, next);
        } catch {}
        setMode(next);
      }}
    >
      {next === "dark" ? <Moon size={17} /> : <Sun size={17} />}
      <span>{next === "dark" ? "Modo noturno" : "Modo claro"}</span>
    </button>
  );
}
```

(`useState(currentMode)` may differ between server and client render: wrap the label in `suppressHydrationWarning` on the `<button>` if React warns; the icon/label must reflect the real mode after hydration — if needed, re-read in a `useEffect(() => setMode(currentMode()), [])`, which is acceptable here.)

- [ ] **Step 4: Layout** — in `src/app/layout.tsx`:

```tsx
import { MODE_SCRIPT } from "@/lib/color-mode";
...
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
```

- [ ] **Step 5: Verify and commit**

Run `npm run test:online && npx tsc --noEmit && npm run lint`. Commit `feat(design): dark/light mode rule, head script and toggle`.

---

### Task 2: Tokens, font and management shell

**Files:**
- Modify: `package.json` (dependency), `src/app/layout.tsx`, `src/app/globals.css`, `src/components/connected-admin.tsx`, `src/components/login-form.tsx`

**Interfaces:**
- Consumes: `ModeToggle` (Task 1); `html[data-app="gestao"]` and `data-mode` set by the head script.
- Produces: the token block every later task relies on; classes `.mode-toggle`, `.status-pill.tone-success|tone-warning|tone-danger|tone-neutral`.

- [ ] **Step 1: Font** — `npm install @fontsource/poppins`; in `src/app/layout.tsx` add `import "@fontsource/poppins/400.css"; import "@fontsource/poppins/500.css"; import "@fontsource/poppins/600.css"; import "@fontsource/poppins/700.css";` (files only download where the font is used).

- [ ] **Step 2: Tokens** — append to `src/app/globals.css`:

```css
/* Spec K — Fome Play design system (management area only in phase 1). */
html[data-app="gestao"] {
  --background: #f6f5f3;
  --sidebar: #ffffff;
  --surface: #ffffff;
  --surface-2: #efece8;
  --soft: #f1efec;
  --border: #e7e3de;
  --text: #1d1d1f;
  --muted: #6b6b70;
  --brand: #d32f2f;
  --brand-dark: #b3261e;
  --brand-contrast: #ffffff;
  --success-bg: #dcfce7;
  --success-text: #166534;
  --warning-bg: #fef3c7;
  --warning-text: #92400e;
  --danger-bg: #fee2e2;
  --danger-text: #991b1b;
  --radius: 14px;
  --radius-card: 20px;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  --font-sans: "Poppins", sans-serif;
  --font-heading: "Poppins", sans-serif;
}
html[data-app="gestao"][data-mode="dark"] {
  --background: #161618;
  --sidebar: #1f1f22;
  --surface: #242427;
  --surface-2: #2e2e32;
  --soft: #2a2a2e;
  --border: #38383d;
  --text: #f4f4f5;
  --muted: #a1a1aa;
  --success-bg: #14532d;
  --success-text: #bbf7d0;
  --warning-bg: #78350f;
  --warning-text: #fde68a;
  --danger-bg: #7f1d1d;
  --danger-text: #fecaca;
  --card-shadow: none;
}
html[data-app="gestao"] body {
  font-weight: 400;
}
.mode-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: var(--radius);
  color: var(--muted);
  background: transparent;
  border: 0;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.mode-toggle:hover {
  background: var(--surface-2);
  color: var(--text);
}
.status-pill.tone-success { background: var(--success-bg); color: var(--success-text); }
.status-pill.tone-warning { background: var(--warning-bg); color: var(--warning-text); }
.status-pill.tone-danger { background: var(--danger-bg); color: var(--danger-text); }
.status-pill.tone-neutral { background: var(--surface-2); color: var(--muted); }
```

- [ ] **Step 3: Shell** — in `src/app/globals.css`, change only these management rules (keep the rest of each rule):
  - `.connected-sidebar`: `background: var(--sidebar);` (was `#fffdfb`).
  - `.connected-sidebar nav button, .connected-sidebar-foot > a, .connected-sidebar-foot > button`: `border-radius: var(--radius); font-weight: 500; color: var(--muted);`
  - `.connected-sidebar nav button.active`: `background: var(--brand); color: var(--brand-contrast);`
  - `.connected-sidebar nav button:hover`: `background: var(--surface-2); color: var(--text);` and add `.connected-sidebar nav button.active:hover { background: var(--brand-dark); color: var(--brand-contrast); }`
  - `.connected-top`: `background: var(--background);` (was `#fffdfb`).
  - `.admin-panel` (management card): `background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--card-shadow);` and, only in dark, `html[data-mode="dark"][data-app="gestao"] .admin-panel { border-color: transparent; }`.
  - `.connected-content h1, .connected-content h2, .page-heading h1`: `letter-spacing: 0; font-weight: 600;` (Poppins does not need negative tracking).

  In `src/components/connected-admin.tsx`, inside `.connected-sidebar-foot` add `<ModeToggle />` (import from `./mode-toggle`) as the first child. In `src/components/login-form.tsx` render `<ModeToggle className="login-mode-toggle" />` at the top of the form panel (read the file first; place it where it doesn't push the form down on mobile) and add CSS `.login-mode-toggle { position: absolute; top: 16px; right: 16px; }` (make the panel `position: relative` if needed).

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm run lint && npm run test:online && npm run build`; then visually: `npm run dev -- --port 3101` and Playwright screenshots of `http://localhost:3101/login` and `http://localhost:3101/demo/gestao` in both modes (set `localStorage["fp:mode"]` via `page.addInitScript`), plus `http://localhost:3101/r/demo` to confirm the menu is unchanged (compare with a screenshot taken before the change — take it first). Save to `C:\Users\medei\AppData\Local\Temp\design-k1\`. Stop the server.

- [ ] **Step 5: Commit** `feat(design): design tokens, Poppins and management shell in dark and light`.

---

### Task 3: Management components and status pills

**Files:**
- Modify: `src/app/globals.css` (management selectors only), `src/lib/order-flow.ts`, `src/components/order-board.tsx`, `scripts/test-online.mjs`

**Interfaces:**
- Produces: `statusTone(status: OrderStatus): "success" | "warning" | "danger" | "neutral"` in `src/lib/order-flow.ts`.

- [ ] **Step 1: Failing test** — append to `scripts/test-online.mjs`:

```js
test("status tones follow the design system", () => {
  assert.equal(flow.statusTone("entregue"), "success");
  for (const s of ["aguardando_pagamento", "aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega"])
    assert.equal(flow.statusTone(s), "warning", s);
  assert.equal(flow.statusTone("cancelado"), "danger");
  assert.equal(flow.statusTone("recusado"), "danger");
});
```

- [ ] **Step 2: Implement** in `src/lib/order-flow.ts`:

```ts
export function statusTone(status: OrderStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "entregue") return "success";
  if (status === "cancelado" || status === "recusado") return "danger";
  return "warning";
}
```

In `src/components/order-board.tsx`, give each order card a status pill: next to the order number add `<span className={\`status-pill tone-${statusTone(order.status)}\`}>{statusLabel(order.status, order.fulfillment)}</span>` (import `statusTone`).

- [ ] **Step 3: Restyle pass** — in `src/app/globals.css`, for management selectors only (`.connected-*`, `.admin-*`, `.kanban*`, `.order-card*`, `.page-heading*`, `.crm-*`/customers, `.option-card`, `.options-list`, `.theme-*`, `.results-*`, `.login-*`, `.feedback-admin*`, settings forms, admin tables, admin modals content when opened from gestão), replace literal colors with the tokens using this mapping:

| literal | token |
|---|---|
| white / `#fff` / `#fffdfb` / `#fffaf6` backgrounds | `var(--surface)` |
| beige page fills (`#fff8f2`, `#f6f1ea`…) | `var(--background)` |
| soft fills (`#f5eee7`, `#f5e5df`, `#f9eeea`…) | `var(--surface-2)` |
| near-black text | `var(--text)` |
| grey/brown secondary text | `var(--muted)` |
| light borders | `var(--border)` |
| `#a63232` / `#852626` | `var(--brand)` / `var(--brand-dark)` |
| green/orange/red status fills | the matching `--success-*`/`--warning-*`/`--danger-*` |

Inputs/selects/textareas in management (`.form-label input`, `select`, `textarea` inside `.connected-content` and `.login-page`): `background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);`. Kanban columns: `background: var(--soft); border-radius: var(--radius-card);`; order cards `var(--surface)`. Tables inside `.connected-content`: header cells `color: var(--muted); font-size: 12px; font-weight: 500;`, rows separated by `1px solid var(--border)`, no zebra.

Shared rules also used by the customer menu (e.g. `.button`, `.notice`, `.status-pill`, `.form-label`, dialog content) must not change for `/r/` pages: when a shared rule needs different gestão values, add an override scoped with `html[data-app="gestao"] ...` instead of editing the shared rule.

- [ ] **Step 4: Verify** — `npm run test:online && npx tsc --noEmit && npm run lint && npm run build`; screenshots as in Task 2 Step 4 (login, demo gestão pages Pedidos/Produtos/Configurações in both modes, `/r/demo` unchanged) into `C:\Users\medei\AppData\Local\Temp\design-k1\`; look at them and fix unreadable spots.

- [ ] **Step 5: Commit** `feat(design): management cards, forms, tables and status pills in the new design`.

---

### Task 4: "Visão geral" dashboard

**Files:**
- Create: `src/lib/overview.ts`, `scripts/test-overview.mjs`, `src/components/admin-overview.tsx`
- Modify: `src/components/connected-admin.tsx` (resumo page), `src/app/globals.css`, `package.json` (`test:online`: append ` scripts/test-overview.mjs`)

**Interfaces:**
- Consumes: `statusTone`, `statusLabel`, `fulfillmentLabel` (`src/lib/order-flow.ts`); `monthOptions`, `ResultsReport` (`src/lib/results-report.ts`); `requestJson` (`src/lib/client-api.ts`); `money` (`src/lib/utils.ts`); `Workspace`, `RealOrder` (`src/lib/connected-types.ts`).
- Produces: `recentOrders<T extends { created_at: string }>(orders: T[], n: number): T[]`; `matchesQuery(text: string, query: string): boolean`; component `AdminOverview({ data, owner, onOpenOrders })`.

- [ ] **Step 1: Failing tests** — create `scripts/test-overview.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const o = loader()("src/lib/overview.ts");

test("recent orders are newest first and limited", () => {
  const list = [
    { id: "a", created_at: "2026-11-17T10:00:00Z" },
    { id: "b", created_at: "2026-11-17T12:00:00Z" },
    { id: "c", created_at: "2026-11-16T09:00:00Z" },
  ];
  assert.deepEqual(o.recentOrders(list, 2).map((x) => x.id), ["b", "a"]);
  assert.equal(list[0].id, "a");
});

test("search ignores case and accents", () => {
  assert.equal(o.matchesQuery("Pão de Açúcar", "acucar"), true);
  assert.equal(o.matchesQuery("Capibacon", "BACON"), true);
  assert.equal(o.matchesQuery("Capibacon", "pizza"), false);
  assert.equal(o.matchesQuery("qualquer", ""), true);
});
```

Append ` scripts/test-overview.mjs` to `test:online`; run → FAIL.

- [ ] **Step 2: Implement `src/lib/overview.ts`**

```ts
// Helpers for the management dashboard ("Visão geral").
export function recentOrders<T extends { created_at: string }>(orders: T[], n: number): T[] {
  return [...orders].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, n);
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function matchesQuery(text: string, query: string) {
  return fold(text).includes(fold(query.trim()));
}
```

- [ ] **Step 3: Component** — create `src/components/admin-overview.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { requestJson } from "@/lib/client-api";
import { money } from "@/lib/utils";
import { fulfillmentLabel, statusLabel, statusTone } from "@/lib/order-flow";
import { monthOptions, type ResultsReport } from "@/lib/results-report";
import { matchesQuery, recentOrders } from "@/lib/overview";
import type { Workspace } from "@/lib/connected-types";
import { Button } from "./ui/button";

export function AdminOverview({
  data,
  owner,
  onOpenOrders,
}: {
  data: Workspace;
  owner: boolean;
  onOpenOrders: () => void;
}) {
  const [query, setQuery] = useState("");
  const [top, setTop] = useState<ResultsReport["top_quantity"]>([]);
  useEffect(() => {
    if (!owner) return;
    const month = monthOptions(new Date(), data.restaurant.timezone)[0].value;
    requestJson<ResultsReport>(`/api/restaurants/${data.restaurant.id}/results?month=${month}`)
      .then((r) => setTop(r.top_quantity))
      .catch(() => setTop([]));
  }, [owner, data.restaurant.id, data.restaurant.timezone]);

  const open = data.orders.filter((o) => ["recebido", "em_preparo", "pronto", "saiu_para_entrega"].includes(o.status)).length;
  const delivered = data.orders.filter((o) => o.status === "entregue");
  const recent = useMemo(
    () =>
      recentOrders(data.orders, 8).filter((o) =>
        matchesQuery(
          `#${o.number} ${o.customer_name ?? ""} ${o.order_items.map((i) => i.product_name).join(" ")}`,
          query,
        ),
      ),
    [data.orders, query],
  );
  const latest = recentOrders(data.orders, 1)[0];
  const dishes = top
    .map((d) => ({ ...d, product: data.products.find((p) => p.id === d.product_id) }))
    .filter((d) => matchesQuery(d.name, query))
    .slice(0, 6);

  return (
    <div className="overview">
      <div className="overview-main">
        <label className="overview-search">
          <Search size={17} />
          <input
            type="search"
            placeholder="Buscar pedido, cliente ou prato"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar pedido, cliente ou prato"
          />
        </label>
        <div className="connected-stats">
          <div className="admin-panel connected-stat"><span>Pedidos em aberto</span><strong>{open}</strong></div>
          <div className="admin-panel connected-stat"><span>Pedidos entregues</span><strong>{delivered.length}</strong></div>
          <div className="admin-panel connected-stat"><span>Total entregue</span><strong>{money(delivered.reduce((s, o) => s + o.total_cents, 0))}</strong></div>
        </div>
        {owner && (
          <section>
            <h2 className="overview-title">Pratos mais pedidos</h2>
            <p className="field-help">Neste mês, só pedidos entregues.</p>
            {dishes.length ? (
              <div className="overview-dishes">
                {dishes.map((d) => (
                  <article key={d.product_id} className="admin-panel overview-dish">
                    {d.product?.photo_url ? <img src={d.product.photo_url} alt="" /> : <div className="overview-dish-placeholder" />}
                    <strong>{d.name}</strong>
                    <span>{d.product ? money(d.product.price_cents) : ""}</span>
                    <small>{d.quantity} vendidos</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="field-help">Ainda sem pedidos entregues neste mês.</p>
            )}
          </section>
        )}
        <section className="admin-panel overview-table-panel">
          <h2 className="overview-title">Últimos pedidos</h2>
          {recent.length ? (
            <table className="overview-table">
              <thead>
                <tr><th>Pedido</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.number}</td>
                    <td>{o.customer_name || "—"}</td>
                    <td>{fulfillmentLabel({ fulfillment: o.fulfillment, table: o.dining_tables?.number, zone: o.order_addresses?.zone_name })}</td>
                    <td>{money(o.total_cents)}</td>
                    <td><span className={`status-pill tone-${statusTone(o.status)}`}>{statusLabel(o.status, o.fulfillment)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="field-help">{query ? "Nenhum pedido encontrado." : "Os pedidos aparecem aqui assim que chegarem."}</p>
          )}
        </section>
      </div>
      <aside className="admin-panel overview-latest">
        <h2 className="overview-title">Pedido mais recente</h2>
        {latest ? (
          <>
            <p><strong>#{latest.number}</strong> · {fulfillmentLabel({ fulfillment: latest.fulfillment, table: latest.dining_tables?.number, zone: latest.order_addresses?.zone_name })}</p>
            {latest.order_addresses && (
              <p className="field-help">{latest.order_addresses.street}, {latest.order_addresses.number} · {latest.order_addresses.zone_name}</p>
            )}
            <ul className="overview-items">
              {latest.order_items.map((i) => (
                <li key={i.id}><span>{i.quantity}× {i.product_name}</span><span>{money(i.quantity * i.unit_price_cents)}</span></li>
              ))}
            </ul>
            <div className="overview-total"><span>Total</span><strong>{money(latest.total_cents)}</strong></div>
            <span className={`status-pill tone-${statusTone(latest.status)}`}>{statusLabel(latest.status, latest.fulfillment)}</span>
          </>
        ) : (
          <p className="field-help">Nenhum pedido ainda.</p>
        )}
        <Button onClick={onOpenOrders}>Ver pedidos</Button>
      </aside>
    </div>
  );
}
```

(Use a plain `<img>` like other admin images; if lint flags it, follow the existing pattern in the codebase.)

- [ ] **Step 4: Wire it** — in `src/components/connected-admin.tsx`, replace the whole `{page === "resumo" && (<> ... </>)}` block with:

```tsx
              {page === "resumo" && (
                <>
                  <AdminOverview data={data} owner={owner} onOpenOrders={() => setPage("pedidos")} />
                  {owner &&
                    (!data.products.length || !data.tables.length || !data.restaurant.opening_hours.length) && (
                      <div className="notice">
                        Para começar, cadastre produtos e configure as mesas e os horários de atendimento.
                      </div>
                    )}
                </>
              )}
```

and import `AdminOverview`. Remove the now-unused `Stat` component only if nothing else uses it.

- [ ] **Step 5: Styles** — append to `src/app/globals.css`:

```css
.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 22px;
  align-items: start;
}
.overview-main {
  display: grid;
  gap: 22px;
  min-width: 0;
}
.overview-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  box-shadow: var(--card-shadow);
}
.overview-search input {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  outline: none;
}
.overview-title {
  margin: 0 0 4px;
  font-size: 17px;
}
.overview-dishes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.overview-dish {
  display: grid;
  gap: 4px;
  padding: 12px;
  text-align: center;
}
.overview-dish img,
.overview-dish-placeholder {
  width: 84px;
  height: 84px;
  margin: 0 auto 6px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface-2);
}
.overview-dish span,
.overview-dish small {
  color: var(--muted);
}
.overview-table-panel {
  padding: 22px;
  overflow-x: auto;
}
.overview-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;
}
.overview-table th {
  text-align: left;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 10px;
}
.overview-table td {
  padding: 10px;
  border-top: 1px solid var(--border);
}
.overview-latest {
  display: grid;
  gap: 12px;
  padding: 22px;
  position: sticky;
  top: 20px;
}
.overview-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.overview-items li,
.overview-total {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.overview-total {
  border-top: 1px dashed var(--border);
  padding-top: 10px;
  font-size: 16px;
}
@media (max-width: 980px) {
  .overview {
    grid-template-columns: minmax(0, 1fr);
  }
  .overview-latest {
    position: static;
  }
}
```

- [ ] **Step 6: Verify** — `npm run test:online && npx tsc --noEmit && npm run lint && npm run build`. The connected dashboard needs a login, so check rendering through the demo is not possible; instead confirm types/build and, if feasible, take a screenshot of `/demo/gestao` to confirm nothing regressed. Commit `feat(design): Visão geral as a dashboard with top dishes, latest orders and the latest order`.

---

### Task 5: Final verification

- [ ] **Step 1:** `npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build` — all green.
- [ ] **Step 2:** Menu unchanged: Playwright screenshot of `/r/demo` before vs after the whole phase (pixel-similar).
- [ ] **Step 3 (controller, after publication):** the owner opens `fomeplay.com.br/gestao` logged in and checks both modes; no migration needed.
