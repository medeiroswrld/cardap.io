# L — Barra lateral em seções · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the 11 management pages into 6 sidebar sections with in-page pill tabs, without changing any page content.

**Architecture:** A pure module maps page keys to sections. `ConnectedAdmin` keeps its `page` state; the sidebar renders sections (active = section of `page`), and a tab bar under the page heading switches pages inside the active section. A `lastTab` map remembers the last page used per section.

**Tech Stack:** Next.js 16, React 19, TypeScript, lucide-react, plain CSS, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-18-l-sidebar-sections-design.md`.

## Global Constraints
- Work in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never print or commit `.env*`, `.superpowers/`, `next-env.d.ts`. No push. No hosted Supabase. Never port 3000 (3101 is another project; use 3102). No attribution lines in commits. If `next dev`/`next build` stop once on a security notice, retry.
- Page content, copy, routes and the sidebar footer stay as they are. The customer menu is untouched. No migration.
- Non-owners still see only `resumo` and `pedidos`.
- UI copy exactly: section names "Visão geral", "Pedidos", "Cardápio", "Clientes", "Relatórios", "Configurações"; tab names are today's page labels ("Produtos", "Opcionais", "Categorias", "QR das mesas", "Clientes", "Avaliações", "Resultados", "Métricas").
- Tokens: active tab `background: var(--brand); color: var(--brand-contrast)`; idle `background: var(--surface-2); color: var(--text)`; pill radius 999px. No new broad `:has()`, no `backdrop-filter`.

### Task 1: Sections module, sidebar and tabs

**Files:**
- Create: `src/lib/admin-sections.ts`, `scripts/test-admin-sections.mjs`
- Modify: `src/components/connected-admin.tsx` (pages list ~line 61, sidebar ~192-204, heading ~247-259), `src/app/globals.css`, `package.json` (`test:online`: append ` scripts/test-admin-sections.mjs`)

**Interfaces:**
- Produces: `PageKey`, `SectionKey`, `SECTIONS`, `sectionOf(page)`, `pageAllowed(page, isOwner)`, `visibleSections(isOwner)`.

- [ ] **Step 1: Failing test** `scripts/test-admin-sections.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const s = loader()("src/lib/admin-sections.ts");
const ALL = ["resumo", "pedidos", "produtos", "opcionais", "categorias", "qr", "contatos", "avaliacoes", "resultados", "metricas", "configuracoes"];

test("every page belongs to exactly one section", () => {
  for (const page of ALL) {
    assert.equal(s.SECTIONS.filter((x) => x.pages.includes(page)).length, 1, page);
  }
  assert.equal(s.SECTIONS.flatMap((x) => x.pages).length, ALL.length);
  assert.deepEqual(s.SECTIONS.map((x) => x.label), ["Visão geral", "Pedidos", "Cardápio", "Clientes", "Relatórios", "Configurações"]);
});

test("section of a page", () => {
  assert.equal(s.sectionOf("qr"), "cardapio");
  assert.equal(s.sectionOf("avaliacoes"), "clientes");
  assert.equal(s.sectionOf("metricas"), "relatorios");
  assert.equal(s.sectionOf("pedidos"), "pedidos");
});

test("staff only see overview and orders", () => {
  assert.deepEqual(s.visibleSections(false).map((x) => x.key), ["resumo", "pedidos"]);
  assert.equal(s.visibleSections(true).length, 6);
  assert.equal(s.pageAllowed("produtos", false), false);
  assert.equal(s.pageAllowed("pedidos", false), true);
});
```

Append to `test:online`; run → FAIL.

- [ ] **Step 2: Implement** `src/lib/admin-sections.ts`:

```ts
// Management sidebar: 6 sections; related pages are tabs inside a section (spec L).
export type PageKey =
  | "resumo" | "pedidos" | "produtos" | "opcionais" | "categorias" | "qr"
  | "contatos" | "avaliacoes" | "resultados" | "metricas" | "configuracoes";
export type SectionKey = "resumo" | "pedidos" | "cardapio" | "clientes" | "relatorios" | "configuracoes";
export type Section = { key: SectionKey; label: string; pages: PageKey[] };

export const SECTIONS: Section[] = [
  { key: "resumo", label: "Visão geral", pages: ["resumo"] },
  { key: "pedidos", label: "Pedidos", pages: ["pedidos"] },
  { key: "cardapio", label: "Cardápio", pages: ["produtos", "opcionais", "categorias", "qr"] },
  { key: "clientes", label: "Clientes", pages: ["contatos", "avaliacoes"] },
  { key: "relatorios", label: "Relatórios", pages: ["resultados", "metricas"] },
  { key: "configuracoes", label: "Configurações", pages: ["configuracoes"] },
];

const STAFF_PAGES: PageKey[] = ["resumo", "pedidos"];

export function sectionOf(page: PageKey): SectionKey {
  return SECTIONS.find((s) => s.pages.includes(page))!.key;
}
export function pageAllowed(page: PageKey, isOwner: boolean) {
  return isOwner || STAFF_PAGES.includes(page);
}
export function visibleSections(isOwner: boolean): Section[] {
  return SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => pageAllowed(p, isOwner)) })).filter((s) => s.pages.length > 0);
}
```

- [ ] **Step 3: Wire the UI** in `connected-admin.tsx`:
  - Keep the `pages` array (labels + icons per page; it's still used for the heading title). Type `page` state as `PageKey` (fix any `setPage` string calls to satisfy the type).
  - Section icons: `resumo` LayoutDashboard, `pedidos` ShoppingBag, `cardapio` Utensils, `clientes` Users, `relatorios` BarChart3, `configuracoes` Settings (a small `const SECTION_ICONS: Record<SectionKey, LucideIcon>` in the component file).
  - State `const [lastTab, setLastTab] = useState<Partial<Record<SectionKey, PageKey>>>({})`; a `go(page)` helper that sets `page` and records `lastTab[sectionOf(page)] = page`. Use `go` for tab clicks and section clicks.
  - Sidebar: map `visibleSections(owner)`; each button `className={sectionOf(page) === s.key ? "active" : ""}`, `aria-current={... ? "page" : undefined}`, onClick → `go(lastTab[s.key] && s.pages.includes(lastTab[s.key]!) ? lastTab[s.key]! : s.pages[0])`.
  - Replace `allowed` usage with `pageAllowed(page, owner)` wherever the code decided visibility (keep existing per-page `owner &&` guards in the content as they are).
  - Tabs: right after `.page-heading`, when the active section has more than one visible page, render:

```tsx
<div className="section-tabs" role="tablist" aria-label={section.label}>
  {section.pages.map((p) => (
    <button key={p} type="button" role="tab" aria-selected={p === page} tabIndex={p === page ? 0 : -1}
      className={p === page ? "active" : ""} onClick={() => go(p)} onKeyDown={onTabKey}>
      {pages.find((x) => x[0] === p)?.[1]}
    </button>
  ))}
</div>
```

  where `onTabKey` moves to the previous/next tab on ArrowLeft/ArrowRight (wrap around), calling `go` and focusing the new tab (`event.currentTarget.parentElement?.querySelectorAll('[role=tab]')`).
- [ ] **Step 4: CSS** (append to `globals.css`): `.section-tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: -6px 0 22px; padding-bottom: 2px; } .section-tabs::-webkit-scrollbar { display: none; } .section-tabs button { flex: none; border: 0; border-radius: 999px; padding: 9px 16px; font: inherit; font-size: 13px; font-weight: 600; background: var(--surface-2); color: var(--text); cursor: pointer; } .section-tabs button.active { background: var(--brand); color: var(--brand-contrast); } .section-tabs button:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 50%, transparent); outline-offset: 2px; }`. Check the mobile sidebar (max-width 700px rules for `.connected-sidebar nav`) still lays out 6 items well.
- [ ] **Step 5: Verify** `npx tsc --noEmit && npm run lint && npm run test:online && npm run build`. Screenshots with the mocked-workspace temporary page (see `C:\Users\medei\AppData\Local\Temp\design-k1\t3admin.cjs`/`t3shot.cjs`; remove the temp page and `.next/dev/types` afterwards) on `npm run dev -- --port 3102`: Cardápio (Produtos tab) and Relatórios at 1280×800 dark and light, Cardápio at 390×844 dark, and a staff (non-owner) view → `C:\Users\medei\AppData\Local\Temp\design-l\*.png`. Click-check: section → last tab memory, "Ver pedidos" on Visão geral still opens Pedidos, arrow keys move tabs. Stop the server; restore `next-env.d.ts`/`AGENTS.md`/`next.config.ts` if modified.
- [ ] **Step 6: Commit** `feat(gestao): sidebar in 6 sections with tabs`.
