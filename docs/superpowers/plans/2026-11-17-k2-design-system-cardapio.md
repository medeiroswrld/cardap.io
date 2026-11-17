# K2 — Design system, fase 2 (acabamento do cardápio) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the customer menu (`/r/...`) the Fome Play finish in dark and light — same layout, order, texts and flows — with round photo category chips, rounded dish cards, a cart-style bag, a segmented Entrega/Retirada choice, restyled tracking cards and a moon/sun toggle; restaurants with their own theme keep their look.

**Architecture:** Phase 1 scoped design tokens to `html[data-app="gestao"]`. Phase 2 adds a second scope, `data-app="menu"` for `/r/...` paths, set by the same head script and `AppScope`. The tokens apply to `html[data-app="menu"]:not([data-own-theme])`; a restaurant with style keys in `menu_theme` gets `data-own-theme` (server-rendered inline script before paint + kept in sync by `useMenuTheme`), so its inline variables and today's defaults rule. Visual changes are CSS plus small markup additions; no logic, flow or copy changes.

**Tech Stack:** Next.js 16, React 19, TypeScript, plain CSS (`src/app/globals.css`), lucide-react, `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-k-design-system-design.md` (Fase 2). Clarification: the menu has no user-selectable "Mesa" mode (the table comes from the QR code), so the segmented control has Entrega and Retirada only.

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`. Do not push. Do not touch the hosted Supabase. Never use port 3000 (3101 is taken by another project; use 3102). No attribution lines in commit messages. Restore `next-env.d.ts`/`AGENTS.md`/`next.config.ts` with `git checkout --` if `next dev`/`next build` modify them. If `next dev`/`next build` stop once with a security-upgrade notice, retry; do not upgrade.
- **The user asked: "não mexer muito no cardápio e fugir da ideia".** Layout, order of sections, texts, flows and rules stay exactly as today. Only colors, font, corners, the category thumbnails, the bag line style, the fulfillment control and the toggle change.
- Restaurants with their own theme (any style key in `menu_theme`: mode, brand, background, surface, text, heading_font, body_font, radius) keep their colors, fonts and corners, and do not show the toggle.
- Reels (`immersive-menu.tsx`) do not change, except the toggle.
- The management area (phase 1) must look exactly as it does now.
- Menu paths: `/r/<slug>` and everything under it (`/r/<slug>/pedido/...`, `/r/<slug>/pedidos`, `/r/<slug>/privacidade`, `/r/demo...`).
- Token values for the menu are the same as gestão (light / dark): `--background #f6f5f3 / #161618`, `--surface #ffffff / #242427`, `--surface-2 #efece8 / #2e2e32`, `--soft #f1efec / #2a2a2e`, `--border #e7e3de / #38383d`, `--text #1d1d1f / #f4f4f5`, `--muted #6b6b70 / #a1a1aa`, `--brand #d32f2f`, `--brand-dark #b3261e`, `--brand-contrast #ffffff`, status tones as in gestão, `--radius 14px`, `--radius-card 20px`, font Poppins.
- Menu CSS may only rely on variables that exist in every situation (own theme, design system, no scope): `--background`, `--surface`, `--soft`, `--border`, `--text`, `--muted`, `--brand`, `--brand-dark`, `--brand-contrast`, `--radius`, `--font-sans`, `--font-heading`, plus the fallbacks Task 1 adds to `:root` (`--radius-card`, `--surface-2`, status tones).
- Performance: no regression on the menu. No `backdrop-filter`, no shadows on long lists, no new broad `:has()`. Category thumbnails use `loading="lazy"`, `decoding="async"`, fixed size.
- UI copy in Brazilian Portuguese, exactly as written in this plan.

## File Structure

- Modify `src/lib/color-mode.ts` (+ `scripts/test-color-mode.mjs`), `src/components/app-scope.tsx`, `src/components/use-menu-theme.ts`, `src/components/mode-toggle.tsx`, `src/lib/menu-theme.ts` (+ `scripts/test-menu-theme.mjs`).
- Create `src/components/own-theme-flag.tsx`, `src/lib/menu-look.ts`, `scripts/test-menu-look.mjs`.
- Modify `src/app/r/[slug]/page.tsx`, `src/app/r/[slug]/pedido/[id]/page.tsx`, `src/app/r/[slug]/pedidos/page.tsx`.
- Modify `src/components/menu-app.tsx`, `src/components/immersive-menu.tsx` (toggle only), `src/components/fulfillment-fields.tsx`, `src/components/connected-tracking.tsx`, `src/components/tracking.tsx`, `src/app/globals.css`, `package.json` (`test:online`).

---

### Task 1: Menu scope, own-theme flag, tokens and toggle

**Files:**
- Modify: `src/lib/color-mode.ts`, `scripts/test-color-mode.mjs`, `src/components/app-scope.tsx`, `src/components/use-menu-theme.ts`, `src/components/mode-toggle.tsx`, `src/lib/menu-theme.ts`, `scripts/test-menu-theme.mjs`, `src/app/globals.css`, the three `/r/[slug]` pages, `src/components/menu-app.tsx`, `src/components/immersive-menu.tsx`
- Create: `src/components/own-theme-flag.tsx`

**Interfaces:**
- Produces: `type AppScope = "gestao" | "menu"`; `appScope(pathname: string): AppScope | null`; `isGestaoPath` keeps working (`appScope(p) === "gestao"`); `hasOwnStyle(theme?: MenuTheme | null): boolean` in `menu-theme.ts`; `<OwnThemeFlag theme />` server component; `ModeToggle({ className?, compact? })`; CSS scope `html[data-app="menu"]:not([data-own-theme])`.

- [ ] **Step 1: Failing tests.** In `scripts/test-color-mode.mjs`:
  - Add a test "app scope by path": `appScope` returns `"gestao"` for `/gestao`, `/gestao/abc`, `/login`, `/redefinir-senha`, `/demo/gestao`, `/demo/gestao/pedidos`; `"menu"` for `/r/capiburguer`, `/r/demo`, `/r/demo/pedidos`, `/r/x/pedido/123`, `/r/x/privacidade`; `null` for `/`, `/gestaox`, `/r`, `/r/`, `/privacidade`.
  - Change the head-script agreement test so that, for every stored/prefersDark combination and paths `["/gestao/1", "/r/capiburguer", "/login", "/"]`: `r.app === (m.appScope(path) ?? undefined)` and `r.scheme === (m.appScope(path) ? r.mode : undefined)`.
  In `scripts/test-menu-theme.mjs` add: `hasOwnStyle({})`, `hasOwnStyle(null)`, `hasOwnStyle({ logo_url: "https://x" })` are `false`; `hasOwnStyle({ preset: "japones", mode: "dark", brand: "#d7263d" })` and `hasOwnStyle({ radius: "reto" })` are `true`. Run `node --test scripts/test-color-mode.mjs scripts/test-menu-theme.mjs` → FAIL.

- [ ] **Step 2: Implement the rule** in `src/lib/color-mode.ts`:

```ts
export type AppScope = "gestao" | "menu";
const GESTAO_PATH = /^\/(gestao|login|redefinir-senha|demo\/gestao)(\/|$)/;
const MENU_PATH = /^\/r\/[^/]+(\/|$)/;

export function appScope(pathname: string): AppScope | null {
  if (GESTAO_PATH.test(pathname)) return "gestao";
  if (MENU_PATH.test(pathname)) return "menu";
  return null;
}
export function isGestaoPath(pathname: string) {
  return appScope(pathname) === "gestao";
}
```

and update `MODE_SCRIPT` so it computes the scope with both regexes (embed `GESTAO_PATH.toString()` and `MENU_PATH.toString()` as today) and, when a scope matches, sets `d.dataset.app` to it and `d.style.colorScheme=m`. Keep `data-mode` on every page and the try/catch around storage.

In `src/lib/menu-theme.ts` add:

```ts
// True when the restaurant chose its own look (any style key), so the menu
// keeps its theme instead of the Fome Play design system.
export function hasOwnStyle(theme?: MenuTheme | null) {
  return Object.keys(themeVariables(theme)).length > 0;
}
```

- [ ] **Step 3: Scope sync.** `src/components/app-scope.tsx`: use `appScope(usePathname())`. On a scope: set `dataset.app` to it; set `style.colorScheme = dataset.mode` unless the scope is `"menu"` and `dataset.ownTheme` is set (the restaurant theme owns it). On no scope: if `dataset.app` was set, delete it and clear `colorScheme`; otherwise leave `colorScheme` alone. Keep `useLayoutEffect`.

  `src/components/use-menu-theme.ts`: when `variables` is non-empty, also set `root.dataset.ownTheme = "1"`; in the cleanup delete `root.dataset.ownTheme` and, instead of removing `color-scheme`, set `root.style.colorScheme = root.dataset.app ? (root.dataset.mode ?? "") : ""` (a scope that remains active keeps following the user's mode).

  Create `src/components/own-theme-flag.tsx` (server component, no `"use client"`):

```tsx
import { hasOwnStyle, type MenuTheme } from "@/lib/menu-theme";

// Runs before the menu paints, so a restaurant with its own theme never
// flashes the Fome Play colors. useMenuTheme keeps the flag in sync afterwards.
export function OwnThemeFlag({ theme }: { theme?: MenuTheme | null }) {
  const code = hasOwnStyle(theme)
    ? 'document.documentElement.dataset.ownTheme="1"'
    : "delete document.documentElement.dataset.ownTheme";
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
```

  Render `<OwnThemeFlag theme={catalog.restaurant.menu_theme} />` as the first child inside the connected branch of `src/app/r/[slug]/page.tsx` (wrap with a fragment) and at the top of what `src/app/r/[slug]/pedido/[id]/page.tsx` and `src/app/r/[slug]/pedidos/page.tsx` return (both already read `catalog.restaurant.menu_theme`). The demo branch needs nothing (no own theme).

- [ ] **Step 4: Tokens.** In `src/app/globals.css`:
  - Add to the existing `:root` block (values only used as fallbacks; nothing on screen changes because no current rule reads them outside gestão): `--radius-card: calc(var(--radius) + 6px); --surface-2: var(--soft); --success-bg: #dcfce7; --success-text: #166534; --warning-bg: #fef3c7; --warning-text: #92400e; --danger-bg: #fee2e2; --danger-text: #991b1b;`.
  - Extend the phase-1 token blocks: the light block selector becomes `html[data-app="gestao"], html[data-app="menu"]:not([data-own-theme])` and the dark block `html[data-app="gestao"][data-mode="dark"], html[data-app="menu"][data-mode="dark"]:not([data-own-theme])`. If those blocks contain gestão-only variables (e.g. `--sidebar`, `--brand-text`, `--card-shadow`), that's fine — they are unused by the menu. Do NOT extend any of the gestão component overrides (buttons, inputs, pills, panels) to the menu.
  - `html[data-app="menu"]:not([data-own-theme]) body { font-weight: 400; }` only if the menu text looks too light/heavy with Poppins at its current weights — check in Step 6.

- [ ] **Step 5: Toggle in the menu.** `ModeToggle` gets `compact?: boolean`: when true, the visible text span gets `className="sr-only"` (check `globals.css` for an existing visually-hidden class; if none, add `.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }`) and the button gets class `mode-toggle-compact` (CSS: `width: 42px; height: 42px; justify-content: center; padding: 0; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text);`).
  - Regular list (`menu-app.tsx`): in `.header-actions`, before the table pill, render `{!hasOwnStyle(state.settings.theme) && <ModeToggle compact />}`.
  - Reels (`immersive-menu.tsx`): read the component and find where top/corner controls live; add the same compact toggle (same condition — pass a boolean prop from `menu-app.tsx`, e.g. `showModeToggle`) positioned top-right over the reel without covering existing controls (check mobile 390×844 and desktop). Nothing else in reels changes.
  - Tracking pages (`connected-tracking.tsx`, `tracking.tsx`): render `{!hasOwnStyle(theme) && <ModeToggle compact className="tracking-mode-toggle" />}` aligned to the right of the back link (for the demo tracking page there is no theme → always shown).

- [ ] **Step 6: Verify and look.** `npm run test:online && npx tsc --noEmit && npm run lint && npm run build`. Then `npm run dev -- --port 3102` and Playwright screenshots (Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, 390×844 and 1280×900; mode via `page.addInitScript(() => localStorage.setItem("fp:mode", "dark"|"light"))`) of `/r/demo` (list and reels) and `/r/demo/pedidos`, saved to `C:\Users\medei\AppData\Local\Temp\design-k2\t1-*.png`. Also capture `/login` dark and compare with `C:\Users\medei\AppData\Local\Temp\design-k1\t3-login-dark.png` (gestão unchanged). For the own-theme case, temporarily give the demo settings a theme (find where the demo state's `settings.theme` is defined; e.g. `{ preset: "japones", mode: "dark", brand: "#d7263d", background: "#111111", surface: "#1c1c1c", text: "#f5f5f5", heading_font: "moderna", body_font: "inter", radius: "reto" }`), capture `t1-own-theme-*.png`, confirm there is no toggle and the theme colors/fonts show, then revert that temporary change. Fix unreadable spots in the menu caused by the new tokens (e.g. hard-coded light colors in menu CSS that now sit on a dark background) — replacing a literal with the matching variable is allowed; changing layout is not. Stop the server.

- [ ] **Step 7: Commit** `feat(design): Fome Play look in the menu (dark/light) with own-theme opt-out and toggle`.

---

### Task 2: Category chips with photo

**Files:**
- Create: `src/lib/menu-look.ts`, `scripts/test-menu-look.mjs`
- Modify: `src/components/menu-app.tsx` (`categoryButtons`, ~line 178), `src/app/globals.css` (`.category-button` ~549, `.mobile-categories` ~1174 and ~3255-3280), `package.json` (`test:online`: append ` scripts/test-menu-look.mjs`)

**Interfaces:**
- Produces: `categoryThumb(products: { categoryId: string; image: string; published: boolean }[], categoryId: string): string | null`.

- [ ] **Step 1: Failing test** `scripts/test-menu-look.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const l = loader()("src/lib/menu-look.ts");
const P = (categoryId, image, published = true) => ({ categoryId, image, published });

test("category thumb is the first published product with a real photo", () => {
  const products = [
    P("a", "/images/placeholder.svg"),
    P("a", "https://x/1.jpg", false),
    P("a", "https://x/2.jpg"),
    P("a", "https://x/3.jpg"),
    P("b", ""),
  ];
  assert.equal(l.categoryThumb(products, "a"), "https://x/2.jpg");
  assert.equal(l.categoryThumb(products, "b"), null);
  assert.equal(l.categoryThumb(products, "c"), null);
});
```

Run → FAIL.

- [ ] **Step 2: Implement** `src/lib/menu-look.ts`:

```ts
// Small presentation helpers for the customer menu (spec K, phase 2).
const PLACEHOLDER = "/images/placeholder.svg";

export function categoryThumb(
  products: { categoryId: string; image: string; published: boolean }[],
  categoryId: string,
): string | null {
  const hit = products.find((p) => p.published && p.categoryId === categoryId && p.image && p.image !== PLACEHOLDER);
  return hit ? hit.image : null;
}
```

- [ ] **Step 3: Markup.** In `categoryButtons`, replace the leading icon of each button (including "Para você") with a thumbnail wrapper, keeping the label and the trailing chevron exactly as they are:

```tsx
<span className="category-thumb" aria-hidden="true">
  {thumb ? <img src={thumb} alt="" width={56} height={56} loading="lazy" decoding="async" /> : <Icon size={21} />}
</span>
```

where `thumb = categoryThumb(state.products, c.id)` (compute once per render with a `useMemo` keyed on `state.products` and `categories`, a `Map` from category id to thumb). "Para você" always uses its `Utensils` icon (no photo).

- [ ] **Step 4: CSS.**
  - Base (desktop list, `.desktop-categories .category-button`): `.category-thumb { width: 40px; height: 40px; border-radius: 999px; overflow: hidden; display: grid; place-items: center; flex: none; background: var(--surface-2); color: var(--muted); } .category-thumb img { width: 100%; height: 100%; object-fit: cover; }`. Active button keeps today's active styling (brand fill); inside it, `.category-button.active .category-thumb { background: color-mix(in srgb, var(--brand-contrast) 18%, transparent); color: var(--brand-contrast); }`. Category buttons' radius becomes `var(--radius)`.
  - Mobile row (`.mobile-categories .category-button`, the existing horizontal strip): becomes a column chip: thumbnail `56px` circle on top, name below (font-size 12px, max 2 lines, centered, width 72px), chevron hidden (`display:none` only inside `.mobile-categories`). The active chip shows a `2px solid var(--brand)` ring on the thumbnail (outline with `outline-offset: 2px`) and the name in `var(--text)` with weight 600; no brand fill in the mobile strip. Keep the strip's current position, scrolling behaviour and height budget as close as possible (if the strip is a fixed bottom bar, make sure the page's bottom padding still clears it — measure).
  - No shadows on chips.

- [ ] **Step 5: Verify.** `npm run test:online && npx tsc --noEmit && npm run lint && npm run build`; screenshots of `/r/demo` list at 390×844 and 1280×900 in both modes into `C:\Users\medei\AppData\Local\Temp\design-k2\t2-*.png`; check the active chip, scrolling to the active chip (the `choose` function's `scrollIntoView` must still work) and that nothing overlaps the floating bag button. Commit `feat(design): round photo category chips in the menu`.

---

### Task 3: Dish cards, bag, fulfillment control and tracking

**Files:**
- Modify: `src/app/globals.css`, `src/components/fulfillment-fields.tsx`, `src/components/connected-tracking.tsx`, `src/components/tracking.tsx`
- (Markup in `menu-app.tsx` only if a class hook is missing; no text or order changes.)

**Interfaces:**
- Consumes: `statusTone` (`src/lib/order-flow.ts`), `.status-pill.tone-*` classes (phase 1), `--radius-card`, status tone variables (Task 1 `:root` fallbacks).

- [ ] **Step 1: Dish cards** (`.food-card`, `.food-visual`, `.food-bottom`, `.price-block`): card `border-radius: var(--radius-card)`, `background: var(--surface)`, border `1px solid var(--border)` (no shadow); the media inside gets rounded corners matching the card (`border-radius: calc(var(--radius-card) - 6px)` with the card's existing padding, or the top corners only if the media is edge-to-edge — keep whichever matches the current layout); price `strong` in `var(--text)` 600 at its current size + 2px; the "Adicionar" button keeps today's component and is already brand-filled (verify; if it is outline today, keep it outline — do not change the button variant). Do not change the card's grid, sizes of media, or the text.

- [ ] **Step 2: Bag in the Cart style** (`.bag-panel`, `.bag-heading`, `.bag-item`, `.quantity-control`, `.bag-summary`, `.total-row`):
  - Panel: `background: var(--surface)`, `border-radius: var(--radius-card)`, `border: 1px solid var(--border)`.
  - Heading: title left, count right as a small pill (`background: var(--surface-2); color: var(--muted); border-radius: 999px; padding: 3px 10px; font-size: 12px`).
  - Item rows: photo `48px` square with `border-radius: 12px`, rows separated by `1px solid var(--border)`; quantity control as a pill (`border-radius: 999px; background: var(--surface-2)`) with 28px round buttons.
  - Summary: Subtotal row in `var(--muted)`, `.total-row` bold with the total in `var(--text)` at 18px; "Revisar pedido" stays the full-width primary button (brand fill, `border-radius: var(--radius)`).
  - Upsell offers (`bag-offers`) keep position and content; only inherit colors/radius.

- [ ] **Step 3: Segmented Entrega/Retirada.** In `src/components/fulfillment-fields.tsx` give the first fieldset an extra class `segmented-choice` (keep `choice-group fulfillment-choice`, the `legend`, the radio inputs, names and handlers exactly). CSS scoped to `.fulfillment-choice.segmented-choice`: the labels sit side by side in a pill track (`display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 4px; background: var(--surface-2); border-radius: 999px;` on a wrapper — if a wrapper is needed, wrap only the two `<label>`s in `<div className="segmented-track">`); each label is a centered button-like target (min-height 44px, `border-radius: 999px`, `color: var(--muted)`, font-weight 600); the radio input is visually hidden but focusable (`position:absolute; opacity:0; width:1px; height:1px;`); the checked label (`label:has(input:checked)` is NOT allowed on a broad selector — it's fine here because it's scoped to `.segmented-choice .segmented-track > label`, a tiny subtree; alternatively add a `className` from React: `className={`checkbox-label${draft.fulfillment === "retirada" ? " is-checked" : ""}`}` — prefer the React class) gets `background: var(--brand); color: var(--brand-contrast)`; focus-visible ring on the label via `.segmented-track > label:focus-within { outline: 3px solid color-mix(in srgb, var(--brand) 50%, transparent); outline-offset: 2px; }`. When only one option exists, the single label fills the track. Leave the payment-method fieldset as it is.

- [ ] **Step 4: Tracking.** `connected-tracking.tsx` line ~113 and `tracking.tsx` line ~58: the status pill gets the tone class: `` className={`status-pill tone-${statusTone(order.status)}`} `` (keep any existing status class too in `tracking.tsx`: `` `status-pill ${o.status} tone-${statusTone(o.status)}` ``). CSS for menu-side tracking (`.connected-tracking .connected-order`, `.panel` inside `.connected-tracking`): `border-radius: var(--radius-card); background: var(--surface); border: 1px solid var(--border)`. On the menu, the shared `.status-pill` base is tiny (8px); add `.connected-tracking .status-pill, .tracking-page .status-pill { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; }` (check the real root class of `tracking.tsx`'s page and use it). The `.connected-steps` stepper keeps its structure; only use variables for its colors.

- [ ] **Step 5: Verify.** `npm run test:online && npx tsc --noEmit && npm run lint && npm run build`. Screenshots (390×844 and 1280×900, dark and light) into `C:\Users\medei\AppData\Local\Temp\design-k2\t3-*.png`: list with dish cards, bag with 2 items (desktop aside and mobile modal), checkout with Entrega/Retirada (use a demo or mocked catalog where both are enabled; if the demo has no online ordering, mock it like phase 1 did for the admin — temporary page or provider props — and remove it afterwards), `/r/demo/pedidos` tracking. Keyboard check: Tab reaches the segmented options and arrow keys switch them (native radio behaviour). Commit `feat(design): menu dish cards, cart-style bag, segmented fulfillment and tracking cards`.

---

### Task 4: Final verification

- [ ] **Step 1:** `npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build` — all green.
- [ ] **Step 2: Performance.** Measure the menu with the tap script `C:\Users\medei\AppData\Local\Temp\claude\28010cc6034f2195\e9d9be87-6f1a-4261-81f6-cb58a1f4b6d5\scratchpad\inp2.cjs` (Pixel 7 profile, CPU 4×; read it first and point it at the local production build `npm run build && npx next start -p 3102`) on the phase-2 branch and on commit `48b8c61` (before phase 2; use a temporary `git worktree add` in the scratchpad, never switch this checkout's branch). Switching to the list, opening the bag and adding an item must not be slower beyond noise (±10%).
- [ ] **Step 3:** Gestão unchanged: `/login` and the management shell screenshots match phase 1.
- [ ] **Step 4 (controller, after publication):** the owner opens `fomeplay.com.br/r/meu-test` and a restaurant with its own theme in both modes; no migration needed.
