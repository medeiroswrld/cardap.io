# C — Identidade visual (cardápio personalizável) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each restaurant owner customizes the public menu (logo, cover, light/dark colors, heading and body fonts, corner radius, 6 ready themes) with a live preview, without ever saving an unreadable combination.

**Architecture:** Migration 018 stores one validated `restaurants.menu_theme jsonb` (owner-only `save_menu_theme` RPC that checks keys, formats, own-bucket URLs and WCAG contrast). A pure `src/lib/menu-theme.ts` resolves the theme and produces CSS variables; a `useMenuTheme` hook writes them on `document.documentElement` while a customer screen is mounted (so modals rendered in portals inherit them) and removes them on unmount. Fonts ship as self-hosted `@fontsource` packages.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod 4, Supabase Postgres, PGlite DB tests, `node:test`, `@fontsource` font packages.

**Spec:** `docs/superpowers/specs/2026-11-16-c-identidade-visual-design.md`. Deviations (intentional): fonts via `@fontsource` packages (the project already self-hosts Manrope this way) instead of `next/font/google`; logo and cover reuse the existing `optimizePhoto` (max 1080 px, WebP keeps transparency) instead of 512/1600 px.

## Global Constraints

- Work only in `C:\Users\medei\Claude\mvp-web-melhorias`, branch `melhorias/piloto`. Never touch `C:\Users\medei\OneDrive\Desktop\work\mvp-web`.
- Never print or commit `.env*`, `.superpowers/` or `next-env.d.ts`. Do not push. Do not touch the hosted Supabase or run live tests. Never use port 3000. No attribution lines in commit messages.
- `menu_theme` keys allowed: `preset, mode, brand, background, surface, text, heading_font, body_font, radius, logo_url, cover_url`. Any other key → `INVALID_INPUT`.
- Colors: `^#[0-9a-f]{6}$` (lowercase). `preset` ∈ `brasa|pizzaria|japones|cafeteria|acai|noite|personalizado`; `mode` ∈ `light|dark`; `heading_font` ∈ `padrao|moderna|elegante|forte|rustica|divertida`; `body_font` ∈ `manrope|inter|nunito|lora`; `radius` ∈ `reto|suave|redondo`.
- `logo_url` / `cover_url` must match `^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/restaurant-media/<restaurant_id>/[A-Za-z0-9._-]+$`.
- Contrast: text × background ≥ 4.5 and text × surface ≥ 4.5 (WCAG relative luminance). Missing colors use the brasa defaults (`#fff8f2` background, `#ffffff` surface, `#251c1a` text). Violation → `LOW_CONTRAST`.
- An empty theme (`{}`) must render exactly like today. The management screens keep the Amply look.
- UI copy in Brazilian Portuguese, exactly as written in this plan.

## Presets (exact values)

| id | label | mode | brand | background | surface | text | heading_font | body_font | radius |
|---|---|---|---|---|---|---|---|---|---|
| brasa | Brasa | light | #a63232 | #fff8f2 | #ffffff | #251c1a | padrao | manrope | suave |
| pizzaria | Pizzaria | light | #c0392b | #fdf6e3 | #ffffff | #2b1d14 | rustica | nunito | suave |
| japones | Japonês | dark | #d7263d | #111111 | #1c1c1c | #f5f5f5 | moderna | inter | reto |
| cafeteria | Cafeteria | light | #6f4e37 | #f6efe6 | #fffaf3 | #2e221a | elegante | lora | suave |
| acai | Açaí | light | #6a1b9a | #f7f0fb | #ffffff | #241430 | divertida | nunito | redondo |
| noite | Noite | dark | #e0a43a | #14110f | #201b18 | #f4ede4 | forte | inter | suave |

## File Structure

- Create `supabase/migrations/018_menu_theme.sql`; modify `scripts/lib/test-db.mjs`; create `scripts/test-menu-theme-db.mjs`; modify `package.json` (`test:database`).
- Create `src/lib/menu-theme.ts`, `scripts/test-menu-theme.mjs`; modify `package.json` (`test:online`).
- Create `src/components/use-menu-theme.ts`; modify `src/lib/types.ts`, `src/lib/connected-types.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/brand.tsx`, `src/components/menu-app.tsx`, `src/components/immersive-menu.tsx`, `src/components/connected-tracking.tsx`, `src/app/r/[slug]/pedidos/page.tsx`, `src/app/r/[slug]/pedido/[id]/page.tsx`, `package.json` (font deps).
- Create `src/components/menu-theme-settings.tsx`; modify `src/app/api/restaurants/[id]/catalog/route.ts`, `src/components/connected-admin.tsx`, `src/components/results-report.tsx`.

---

### Task 1: Migration 018 and database checks

**Files:**
- Create: `supabase/migrations/018_menu_theme.sql`
- Modify: `scripts/lib/test-db.mjs` (add `"018_menu_theme.sql",` after `"017_results_report.sql",`)
- Create: `scripts/test-menu-theme-db.mjs`
- Modify: `package.json` — append ` && node scripts/test-menu-theme-db.mjs` to `test:database`

**Interfaces:**
- Produces (SQL): `restaurants.menu_theme jsonb not null default '{}'`; `hex_luminance(text) returns numeric` (immutable); `contrast_ratio(text,text) returns numeric` (immutable); `save_menu_theme(p_restaurant uuid, p_theme jsonb) returns void` (owner only; errors `FORBIDDEN`, `INVALID_INPUT`, `LOW_CONTRAST`).

- [ ] **Step 1: Write the failing DB checks**

Create `scripts/test-menu-theme-db.mjs`:

```js
import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "14000000-0000-4000-8000-0000000000a1",
  b = "14000000-0000-4000-8000-0000000000b1",
  ownerA = "24000000-0000-4000-8000-0000000000a1",
  ownerB = "24000000-0000-4000-8000-0000000000b1",
  staffA = "24000000-0000-4000-8000-0000000000a2";
const base = "https://abcdefgh.supabase.co/storage/v1/object/public/restaurant-media";
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
const save = (theme, restaurant = a) =>
  db.query("select save_menu_theme($1,$2)", [restaurant, JSON.stringify(theme)]);

await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders) values($1,'Casa A','theme-a',true),($2,'Casa B','theme-b',true)",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);

await ok("contrast ratio follows WCAG", async () => {
  await root();
  const { rows } = await db.query("select round(contrast_ratio('#000000','#ffffff'),2) as bw, round(contrast_ratio('#ffffff','#ffffff'),2) as ww");
  assert.equal(Number(rows[0].bw), 21);
  assert.equal(Number(rows[0].ww), 1);
});

await ok("menus start with an empty theme readable by anyone", async () => {
  await anon();
  const { rows } = await db.query("select menu_theme from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0].menu_theme, {});
});

await ok("only the owner saves the theme", async () => {
  await login(staffA);
  await rejects(() => save({ brand: "#123456" }), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => save({ brand: "#123456" }), "FORBIDDEN");
});

await ok("a full dark theme with own images is saved", async () => {
  await login(ownerA);
  const theme = {
    preset: "noite", mode: "dark", brand: "#e0a43a", background: "#14110f", surface: "#201b18", text: "#f4ede4",
    heading_font: "forte", body_font: "inter", radius: "suave",
    logo_url: `${base}/${a}/logo-1.webp`, cover_url: `${base}/${a}/capa.jpeg`,
  };
  await save(theme);
  await root();
  const { rows } = await db.query("select menu_theme from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0].menu_theme, theme);
});

await ok("invalid values and unknown keys are refused", async () => {
  await login(ownerA);
  await rejects(() => save({ brand: "red" }), "INVALID_INPUT");
  await rejects(() => save({ brand: "#ABCDEF" }), "INVALID_INPUT");
  await rejects(() => save({ heading_font: "comic" }), "INVALID_INPUT");
  await rejects(() => save({ radius: "quadrado" }), "INVALID_INPUT");
  await rejects(() => save({ banana: "x" }), "INVALID_INPUT");
  await rejects(() => save({ brand: 123 }), "INVALID_INPUT");
  await rejects(() => db.query("select save_menu_theme($1,'[]'::jsonb)", [a]), "INVALID_INPUT");
});

await ok("images must come from this restaurant's folder in the media bucket", async () => {
  await login(ownerA);
  await rejects(() => save({ logo_url: `${base}/${b}/logo.webp` }), "INVALID_INPUT");
  await rejects(() => save({ logo_url: "https://evil.example.com/logo.webp" }), "INVALID_INPUT");
  await rejects(() => save({ cover_url: `${base}/${a}/../x.webp` }), "INVALID_INPUT");
});

await ok("unreadable combinations are refused", async () => {
  await login(ownerA);
  await rejects(() => save({ text: "#eeeeee" }), "LOW_CONTRAST");
  await rejects(() => save({ mode: "dark", background: "#111111", surface: "#1c1c1c", text: "#333333" }), "LOW_CONTRAST");
});

await ok("an empty object resets to the default look", async () => {
  await login(ownerA);
  await save({});
  await root();
  const { rows } = await db.query("select menu_theme from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0].menu_theme, {});
});

await db.close();
console.log(`${count} menu theme database checks passed.`);
```

Append ` && node scripts/test-menu-theme-db.mjs` to `test:database` in `package.json`.

- [ ] **Step 2: Run to verify it fails**

Run: `node scripts/test-menu-theme-db.mjs` → Expected: FAIL (`function contrast_ratio(...) does not exist`).

- [ ] **Step 3: Write the migration**

Add `"018_menu_theme.sql",` to `MIGRATIONS` in `scripts/lib/test-db.mjs`. Create `supabase/migrations/018_menu_theme.sql`:

```sql
-- C: per-restaurant menu appearance. One validated JSON object; '{}' = current look.
alter table public.restaurants add column menu_theme jsonb not null default '{}'::jsonb;

create function public.hex_luminance(p_hex text) returns numeric
language sql immutable set search_path=public as $$
 select 0.2126*c[1]+0.7152*c[2]+0.0722*c[3] from (
  select array(
   select case when v<=0.03928 then v/12.92 else power((v+0.055)/1.055,2.4) end
   from (select (('x'||substr(p_hex,i,2))::bit(8)::int)/255.0 as v from unnest(array[2,4,6]) as i) s
  ) as c
 ) t
$$;

create function public.contrast_ratio(p_a text,p_b text) returns numeric
language sql immutable set search_path=public as $$
 select (greatest(hex_luminance(p_a),hex_luminance(p_b))+0.05)/(least(hex_luminance(p_a),hex_luminance(p_b))+0.05)
$$;

create function public.save_menu_theme(p_restaurant uuid,p_theme jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare k text; v jsonb; url_prefix text; bg text; surf text; txt text;
begin
 if not is_member(p_restaurant,true) then raise exception 'FORBIDDEN'; end if;
 if p_theme is null or jsonb_typeof(p_theme)<>'object' then raise exception 'INVALID_INPUT'; end if;
 url_prefix:='^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/restaurant-media/'||p_restaurant::text||'/[A-Za-z0-9._-]+$';
 for k,v in select * from jsonb_each(p_theme) loop
  if jsonb_typeof(v)<>'string' then raise exception 'INVALID_INPUT'; end if;
  if k in ('brand','background','surface','text') then
   if (v#>>'{}') !~ '^#[0-9a-f]{6}$' then raise exception 'INVALID_INPUT'; end if;
  elsif k='preset' then
   if (v#>>'{}') not in ('brasa','pizzaria','japones','cafeteria','acai','noite','personalizado') then raise exception 'INVALID_INPUT'; end if;
  elsif k='mode' then
   if (v#>>'{}') not in ('light','dark') then raise exception 'INVALID_INPUT'; end if;
  elsif k='heading_font' then
   if (v#>>'{}') not in ('padrao','moderna','elegante','forte','rustica','divertida') then raise exception 'INVALID_INPUT'; end if;
  elsif k='body_font' then
   if (v#>>'{}') not in ('manrope','inter','nunito','lora') then raise exception 'INVALID_INPUT'; end if;
  elsif k='radius' then
   if (v#>>'{}') not in ('reto','suave','redondo') then raise exception 'INVALID_INPUT'; end if;
  elsif k in ('logo_url','cover_url') then
   if (v#>>'{}') !~ url_prefix or (v#>>'{}') like '%..%' then raise exception 'INVALID_INPUT'; end if;
  else
   raise exception 'INVALID_INPUT';
  end if;
 end loop;
 bg:=coalesce(p_theme->>'background','#fff8f2');
 surf:=coalesce(p_theme->>'surface','#ffffff');
 txt:=coalesce(p_theme->>'text','#251c1a');
 if contrast_ratio(txt,bg)<4.5 or contrast_ratio(txt,surf)<4.5 then raise exception 'LOW_CONTRAST'; end if;
 update restaurants set menu_theme=p_theme where id=p_restaurant;
end $$;
revoke all on function public.save_menu_theme(uuid,jsonb) from public,anon;
grant execute on function public.save_menu_theme(uuid,jsonb) to authenticated;
```

Also register `LOW_CONTRAST` as a known client error: in `src/lib/client-api.ts` add to `apiErrorMessages`:

```ts
  LOW_CONTRAST: "Essas cores deixam o texto difícil de ler. Escolha cores com mais contraste.",
```

and in `src/lib/observability/core.ts` add `"LOW_CONTRAST"` next to `"INVALID_INPUT"` in the same lists where `INVALID_INPUT` appears (so it maps to a 400 and is passed through). Run `npm run test:observability` to confirm nothing else breaks.

- [ ] **Step 4: Run the checks**

Run: `node scripts/test-menu-theme-db.mjs` → Expected: `8 menu theme database checks passed.` Then `npm run test:database` and `npm run test:observability` → all pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_menu_theme.sql scripts/lib/test-db.mjs scripts/test-menu-theme-db.mjs package.json src/lib/client-api.ts src/lib/observability/core.ts
git commit -m "feat(theme): migration 018 with validated per-restaurant menu theme"
```

---

### Task 2: Theme library

**Files:**
- Create: `src/lib/menu-theme.ts`
- Create: `scripts/test-menu-theme.mjs`
- Modify: `package.json` — append ` scripts/test-menu-theme.mjs` to `test:online`

**Interfaces:**
- Produces:
  - `type PresetId = "brasa" | "pizzaria" | "japones" | "cafeteria" | "acai" | "noite"`
  - `type MenuTheme` (all keys optional, per Global Constraints)
  - `type ResolvedTheme` (all of `mode, brand, background, surface, text, heading_font, body_font, radius` required; `logo_url?`, `cover_url?`)
  - `PRESETS: Record<PresetId, { label: string } & Omit<ResolvedTheme, "logo_url" | "cover_url">>`
  - `HEADING_FONTS: Record<HeadingFont, { label: string; family: string }>`, `BODY_FONTS: Record<BodyFont, { label: string; family: string }>`
  - `resolveTheme(theme?: MenuTheme | null): ResolvedTheme`
  - `contrastRatio(a: string, b: string): number`
  - `isReadable(theme?: MenuTheme | null): boolean`
  - `mix(a: string, b: string, weight: number): string` — `weight` of `a`, result lowercase hex
  - `themeVariables(theme?: MenuTheme | null): Record<string, string>` — empty object for an empty/undefined theme

- [ ] **Step 1: Write the failing tests**

Create `scripts/test-menu-theme.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const t = loader()("src/lib/menu-theme.ts");

test("contrast ratio follows WCAG", () => {
  assert.equal(Math.round(t.contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(t.contrastRatio("#ffffff", "#ffffff"), 1);
});

test("every preset is readable", () => {
  for (const [id, preset] of Object.entries(t.PRESETS)) assert.equal(t.isReadable(preset), true, id);
  assert.equal(t.isReadable({ text: "#eeeeee" }), false);
});

test("resolveTheme fills missing keys with the brasa look", () => {
  const r = t.resolveTheme({ brand: "#123456" });
  assert.equal(r.brand, "#123456");
  assert.equal(r.background, "#fff8f2");
  assert.equal(r.heading_font, "padrao");
  assert.equal(r.radius, "suave");
});

test("mix blends two colors", () => {
  assert.equal(t.mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(t.mix("#ff0000", "#0000ff", 1), "#ff0000");
});

test("an empty theme changes nothing", () => {
  assert.deepEqual(t.themeVariables({}), {});
  assert.deepEqual(t.themeVariables(undefined), {});
});

test("theme variables cover colors, contrast, fonts and corners", () => {
  const v = t.themeVariables(t.PRESETS.noite);
  assert.equal(v["--brand"], "#e0a43a");
  assert.equal(v["--background"], "#14110f");
  assert.equal(v["--surface"], "#201b18");
  assert.equal(v["--text"], "#f4ede4");
  assert.equal(v["--brand-contrast"], "#111111");
  assert.equal(v["--radius"], "14px");
  assert.equal(v["--font-heading"], '"Bebas Neue", sans-serif');
  assert.equal(v["--font-sans"], '"Inter Variable", sans-serif');
  assert.match(v["--muted"], /^#[0-9a-f]{6}$/);
  assert.match(v["--border"], /^#[0-9a-f]{6}$/);
  assert.match(v["--soft"], /^#[0-9a-f]{6}$/);
  assert.match(v["--brand-dark"], /^#[0-9a-f]{6}$/);
  assert.equal(t.themeVariables(t.PRESETS.japones)["--brand-contrast"], "#ffffff");
  assert.equal(t.themeVariables({ radius: "reto" })["--radius"], "4px");
  assert.equal(t.themeVariables({ radius: "redondo" })["--radius"], "24px");
});
```

Append ` scripts/test-menu-theme.mjs` to `test:online`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/test-menu-theme.mjs` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/menu-theme.ts`:

```ts
// Per-restaurant menu appearance (migration 018). Pure: the hook in
// components/use-menu-theme.ts applies the variables to the page.
export type PresetId = "brasa" | "pizzaria" | "japones" | "cafeteria" | "acai" | "noite";
export type HeadingFont = "padrao" | "moderna" | "elegante" | "forte" | "rustica" | "divertida";
export type BodyFont = "manrope" | "inter" | "nunito" | "lora";
export type Radius = "reto" | "suave" | "redondo";
export type ResolvedTheme = {
  mode: "light" | "dark";
  brand: string;
  background: string;
  surface: string;
  text: string;
  heading_font: HeadingFont;
  body_font: BodyFont;
  radius: Radius;
  logo_url?: string;
  cover_url?: string;
};
export type MenuTheme = Partial<ResolvedTheme> & { preset?: PresetId | "personalizado" };

type Preset = { label: string } & Omit<ResolvedTheme, "logo_url" | "cover_url">;
export const PRESETS: Record<PresetId, Preset> = {
  brasa: { label: "Brasa", mode: "light", brand: "#a63232", background: "#fff8f2", surface: "#ffffff", text: "#251c1a", heading_font: "padrao", body_font: "manrope", radius: "suave" },
  pizzaria: { label: "Pizzaria", mode: "light", brand: "#c0392b", background: "#fdf6e3", surface: "#ffffff", text: "#2b1d14", heading_font: "rustica", body_font: "nunito", radius: "suave" },
  japones: { label: "Japonês", mode: "dark", brand: "#d7263d", background: "#111111", surface: "#1c1c1c", text: "#f5f5f5", heading_font: "moderna", body_font: "inter", radius: "reto" },
  cafeteria: { label: "Cafeteria", mode: "light", brand: "#6f4e37", background: "#f6efe6", surface: "#fffaf3", text: "#2e221a", heading_font: "elegante", body_font: "lora", radius: "suave" },
  acai: { label: "Açaí", mode: "light", brand: "#6a1b9a", background: "#f7f0fb", surface: "#ffffff", text: "#241430", heading_font: "divertida", body_font: "nunito", radius: "redondo" },
  noite: { label: "Noite", mode: "dark", brand: "#e0a43a", background: "#14110f", surface: "#201b18", text: "#f4ede4", heading_font: "forte", body_font: "inter", radius: "suave" },
};

export const HEADING_FONTS: Record<HeadingFont, { label: string; family: string }> = {
  padrao: { label: "Padrão", family: '"Manrope Variable", sans-serif' },
  moderna: { label: "Moderna", family: '"Montserrat", sans-serif' },
  elegante: { label: "Elegante", family: '"Playfair Display", serif' },
  forte: { label: "Forte", family: '"Bebas Neue", sans-serif' },
  rustica: { label: "Rústica", family: '"Alfa Slab One", serif' },
  divertida: { label: "Divertida", family: '"Baloo 2", sans-serif' },
};
export const BODY_FONTS: Record<BodyFont, { label: string; family: string }> = {
  manrope: { label: "Manrope (padrão)", family: '"Manrope Variable", sans-serif' },
  inter: { label: "Inter", family: '"Inter Variable", sans-serif' },
  nunito: { label: "Nunito", family: '"Nunito Variable", sans-serif' },
  lora: { label: "Lora", family: '"Lora Variable", serif' },
};
const RADIUS: Record<Radius, string> = { reto: "4px", suave: "14px", redondo: "24px" };

export function resolveTheme(theme?: MenuTheme | null): ResolvedTheme {
  const { label: _label, ...base } = PRESETS.brasa;
  void _label;
  const clean = Object.fromEntries(
    Object.entries(theme ?? {}).filter(([key, value]) => key !== "preset" && value !== undefined && value !== ""),
  );
  return { ...base, ...clean } as ResolvedTheme;
}

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function isReadable(theme?: MenuTheme | null) {
  const r = resolveTheme(theme);
  return contrastRatio(r.text, r.background) >= 4.5 && contrastRatio(r.text, r.surface) >= 4.5;
}
export function mix(a: string, b: string, weight: number) {
  const [ca, cb] = [channels(a), channels(b)];
  return (
    "#" +
    ca
      .map((v, i) => Math.round(v * weight + cb[i] * (1 - weight)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function themeVariables(theme?: MenuTheme | null): Record<string, string> {
  if (!theme || Object.keys(theme).length === 0) return {};
  const r = resolveTheme(theme);
  return {
    "--brand": r.brand,
    "--brand-dark": mix(r.brand, "#000000", 0.85),
    "--brand-contrast": contrastRatio(r.brand, "#ffffff") >= contrastRatio(r.brand, "#111111") ? "#ffffff" : "#111111",
    "--background": r.background,
    "--surface": r.surface,
    "--text": r.text,
    "--muted": mix(r.text, r.background, 0.68),
    "--border": mix(r.text, r.background, 0.14),
    "--soft": mix(r.text, r.surface, 0.06),
    "--radius": RADIUS[r.radius],
    "--font-sans": BODY_FONTS[r.body_font].family,
    "--font-heading": HEADING_FONTS[r.heading_font].family,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:online && npx tsc --noEmit` → Expected: all pass (previous 46 + 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu-theme.ts scripts/test-menu-theme.mjs package.json
git commit -m "feat(theme): presets, contrast check and CSS variables for the menu theme"
```

---

### Task 3: Apply the theme to customer screens

**Files:**
- Modify: `package.json` (dependencies), `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/components/use-menu-theme.ts`
- Modify: `src/lib/types.ts` (`Settings`), `src/lib/connected-types.ts` (`RestaurantRow`, `catalogState`)
- Modify: `src/components/brand.tsx`, `src/components/menu-app.tsx`, `src/components/immersive-menu.tsx`, `src/components/connected-tracking.tsx`, `src/app/r/[slug]/pedidos/page.tsx`, `src/app/r/[slug]/pedido/[id]/page.tsx`

**Interfaces:**
- Consumes: `MenuTheme`, `themeVariables`, `resolveTheme` (Task 2).
- Produces: `useMenuTheme(theme?: MenuTheme | null): void`; `RestaurantRow.menu_theme?: MenuTheme`; `Settings.theme?: MenuTheme`; `ConnectedTracking` gains prop `theme?: MenuTheme`.

- [ ] **Step 1: Fonts**

Run: `npm install @fontsource/montserrat @fontsource/playfair-display @fontsource/bebas-neue @fontsource/alfa-slab-one @fontsource/baloo-2 @fontsource-variable/inter @fontsource-variable/nunito @fontsource-variable/lora`
(use exact versions npm resolves; commit `package.json` and `package-lock.json`).

In `src/app/layout.tsx`, after `import "@fontsource-variable/manrope";` add:

```ts
// Menu theme fonts (only the @font-face rules load here; files download on first use).
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/alfa-slab-one/400.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "@fontsource-variable/lora";
```

In `src/app/globals.css`, in the `:root` block add `--brand-contrast: #fff;` and `--font-heading: var(--font-sans);`, and append:

```css
h1,
h2,
h3,
.brand-name {
  font-family: var(--font-heading);
}
.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: contain;
}
.menu-intro.has-cover {
  position: relative;
  padding: 24px;
  border-radius: var(--radius);
  color: #fff;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.menu-intro.has-cover::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0.35));
}
.menu-intro.has-cover > * {
  position: relative;
}
.menu-intro.has-cover h1,
.menu-intro.has-cover h1 span,
.menu-intro.has-cover p,
.menu-intro.has-cover .open-label {
  color: #fff;
}
.immersive-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.9);
}
```

- [ ] **Step 2: Hook**

Create `src/components/use-menu-theme.ts`:

```ts
"use client";
import { useEffect } from "react";
import { resolveTheme, themeVariables, type MenuTheme } from "@/lib/menu-theme";

// Writes the restaurant's variables on <html> while a customer screen is open,
// so modals rendered in portals inherit them. Removed on unmount.
export function useMenuTheme(theme?: MenuTheme | null) {
  const key = JSON.stringify(theme ?? {});
  useEffect(() => {
    const parsed = JSON.parse(key) as MenuTheme;
    const variables = themeVariables(parsed);
    const root = document.documentElement;
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    if (Object.keys(variables).length) root.dataset.menuMode = resolveTheme(parsed).mode;
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name);
      delete root.dataset.menuMode;
    };
  }, [key]);
}
```

- [ ] **Step 3: Data**

- `src/lib/connected-types.ts`: import `type MenuTheme` from `./menu-theme`; in `RestaurantRow` add `menu_theme?: MenuTheme;`; in `catalogState` settings add `theme: catalog.restaurant.menu_theme ?? {},`.
- `src/lib/types.ts`: import `type { MenuTheme } from "./menu-theme";` and add `theme?: MenuTheme;` to `Settings`.

- [ ] **Step 4: Screens**

- `src/components/menu-app.tsx`: `import { useMenuTheme } from "./use-menu-theme";`; at the top of `MenuApp` (after `useDemo()`), call `useMenuTheme(state.settings.theme);`. In the `menu-intro` div, apply the cover:

```tsx
        {view === "list" && (
          <div
            className={`menu-intro${state.settings.theme?.cover_url ? " has-cover" : ""}`}
            style={
              state.settings.theme?.cover_url
                ? { backgroundImage: `url("${state.settings.theme.cover_url}")` }
                : undefined
            }
          >
```

(keep the existing children unchanged).

- `src/components/brand.tsx`: read `const logo = context?.state.settings.theme?.logo_url;` and render, in place of the `<span className="brand-icon">…</span>`:

```tsx
      {logo ? (
        <img className="brand-logo" src={logo} alt="" />
      ) : (
        <span className="brand-icon">
          <Flame size={27} strokeWidth={1.8} />
        </span>
      )}
```

- `src/components/immersive-menu.tsx`: add prop `logoUrl?: string`; in the `immersive-header`, before its first child, render `{logoUrl && <img className="immersive-logo" src={logoUrl} alt="" />}`. In `menu-app.tsx` pass `logoUrl={state.settings.theme?.logo_url}` to `<ImmersiveMenu />`.

- `src/components/connected-tracking.tsx`: add prop `theme?: MenuTheme` (import type from `@/lib/menu-theme`) and call `useMenuTheme(theme);` at the top of the component.
- `src/app/r/[slug]/pedidos/page.tsx` and `src/app/r/[slug]/pedido/[id]/page.tsx`: pass `theme={catalog.restaurant.menu_theme}` to `<ConnectedTracking ... />` (read the second file first; if it does not load the catalog, load it the same way the first file does).

If lint flags `<img>` (`@next/next/no-img-element`), follow the existing pattern for plain `<img>` in `menu-app.tsx` (the bag item image).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online && npm run build` → all pass. Then `git checkout -- next-env.d.ts` if touched.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/app/layout.tsx src/app/globals.css src/components/use-menu-theme.ts src/lib/types.ts src/lib/connected-types.ts src/components/brand.tsx src/components/menu-app.tsx src/components/immersive-menu.tsx src/components/connected-tracking.tsx "src/app/r/[slug]/pedidos/page.tsx" "src/app/r/[slug]/pedido/[id]/page.tsx"
git commit -m "feat(theme): apply the restaurant theme, fonts, logo and cover on customer screens"
```

---

### Task 4: Dark-mode readability pass on customer CSS

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: CSS variables from Task 2/3 (`--background`, `--surface`, `--text`, `--muted`, `--border`, `--soft`, `--brand`, `--brand-dark`, `--brand-contrast`, `--radius`).

Goal: with the "noite" or "japones" theme, every customer screen (list menu, product detail modal, bag, checkout, tracking, closed notice, video strip, bag offers, Pix payment) stays readable. Management (`.connected-*`, `.admin-*`, `.kanban*`, `.order-card`) and the reels video overlay (`.immersive-*`, which sits on dark video) are out of scope.

- [ ] **Step 1: Find literal colors in customer rules**

Run: `grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba\?(" src/app/globals.css` and list the hits whose selectors belong to customer screens: `.customer-*`, `.menu-*`, `.product-*`, `.feed-*`, `.category-*`, `.mobile-categories`, `.desktop-categories`, `.bag-*`, `.checkout-*`, `.fulfillment-*`, `.choice-*`, `.modal*` / dialog content, `.notice`, `.closed-notice`, `.video-strip*` (except the dark overlay of `.video-strip-name`), `.pix-payment`, `.connected-tracking`, `.connected-order`, `.connected-steps`, `.status-pill`, `.house-note`, `.news-link`, `.restaurant-info`, `.table-pill`, `.price-block`, `.empty-state`, `.bag-empty`, `.toast`, `.button`/`.button-*` (shared).

- [ ] **Step 2: Replace them with variables**

Mapping (apply only inside the rules found in Step 1):

| literal (or close variant) | replace with |
|---|---|
| `#fff`, `#ffffff`, `white` used as a background | `var(--surface)` |
| `#fff8f2`, `#fffaf6`, `#fdf8f3` and other near-white page backgrounds | `var(--background)` |
| `#f5eee7`, `#f6f1ea` and other soft beige fills | `var(--soft)` |
| `#251c1a`, `#1f1714` and other near-black text | `var(--text)` |
| `#6f605b` and other grey/brown secondary text | `var(--muted)` |
| `#e9ded6` and other light borders | `var(--border)` |
| `#a63232` | `var(--brand)` |
| `#852626` | `var(--brand-dark)` |
| `color: #fff` on a brand-colored button/badge | `color: var(--brand-contrast)` |

Keep literal colors that sit on photos or videos (gradients/overlays such as `rgba(0,0,0,…)`), the status greens/reds with semantic meaning, and anything already using a variable. Do not change management selectors.

- [ ] **Step 3: Verify visually**

Run `npx tsc --noEmit && npm run lint && npm run build`. Start the dev server on port 3101 (`npm run dev -- --port 3101`, never 3000) and open `http://localhost:3101/r/demo` (demo menu, default theme): it must look the same as before this task. Then, in the browser devtools console on that page, run:

```js
const v = {"--brand":"#e0a43a","--brand-dark":"#be8b31","--brand-contrast":"#111111","--background":"#14110f","--surface":"#201b18","--text":"#f4ede4","--muted":"#b3aca5","--border":"#3a3532","--soft":"#2c2724"};
for (const [k, x] of Object.entries(v)) document.documentElement.style.setProperty(k, x);
```

Switch to the list view, open a product, the bag and the checkout: all text must be legible on dark backgrounds (no dark-on-dark, no white boxes). Take screenshots of list, product modal and bag into `C:\Users\medei\AppData\Local\Temp\theme-check\` and mention them in the report. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(theme): customer screens use theme variables so dark themes stay readable"
```

---

### Task 5: Owner settings, route and PDF logo

**Files:**
- Create: `src/components/menu-theme-settings.tsx`
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts`
- Modify: `src/components/connected-admin.tsx`
- Modify: `src/components/results-report.tsx`

**Interfaces:**
- Consumes: `save_menu_theme` RPC (Task 1); `PRESETS`, `HEADING_FONTS`, `BODY_FONTS`, `themeVariables`, `isReadable`, `resolveTheme`, `MenuTheme`, `PresetId` (Task 2); `optimizePhoto` from `@/lib/photo-optimizer`; `browserClient` from `@/lib/supabase/browser`; `RestaurantRow.menu_theme` (Task 3).
- Produces: catalog POST action `{ action: "menu_theme", theme: Record<string, string> }`; component `MenuThemeSettings({ data, save, busy })`; `ResultsReportPanel` gains prop `logoUrl?: string`.

- [ ] **Step 1: Route**

In `src/app/api/restaurants/[id]/catalog/route.ts`, add to the discriminated union:

```ts
  z.object({
    action: z.literal("menu_theme"),
    theme: z.record(z.string(), z.string().max(400)).refine((t) => Object.keys(t).length <= 12),
  }),
```

and before the `crm_settings` branch:

```ts
    } else if (body.action === "menu_theme") {
      const { error } = await supabase.rpc("save_menu_theme", {
        p_restaurant: id,
        p_theme: body.theme,
      });
      if (error) throw error;
```

(The catalog invalidation at the end already runs for this action.)

- [ ] **Step 2: Settings component**

Create `src/components/menu-theme-settings.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { browserClient } from "@/lib/supabase/browser";
import { optimizePhoto } from "@/lib/photo-optimizer";
import type { Workspace } from "@/lib/connected-types";
import {
  BODY_FONTS,
  HEADING_FONTS,
  PRESETS,
  isReadable,
  resolveTheme,
  themeVariables,
  type MenuTheme,
  type PresetId,
} from "@/lib/menu-theme";

type Save = (body: unknown) => Promise<void>;
const COLOR_FIELDS = [
  ["brand", "Cor principal"],
  ["background", "Fundo"],
  ["surface", "Cartões"],
  ["text", "Texto"],
] as const;

export function MenuThemeSettings({ data, save, busy }: { data: Workspace; save: Save; busy: boolean }) {
  const [theme, setTheme] = useState<MenuTheme>(data.restaurant.menu_theme ?? {});
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<"" | "logo_url" | "cover_url">("");
  const resolved = resolveTheme(theme);
  const readable = isReadable(theme);
  const set = (patch: MenuTheme) => setTheme((t) => ({ ...t, ...patch }));
  const setColor = (patch: MenuTheme) => setTheme((t) => ({ ...t, ...patch, preset: "personalizado" }));

  async function upload(field: "logo_url" | "cover_url", file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(field);
    try {
      const photo = await optimizePhoto(file);
      const client = browserClient();
      const path = `${data.restaurant.id}/${crypto.randomUUID()}.${photo.type.split("/")[1]}`;
      const { error: uploadError } = await client.storage
        .from("restaurant-media")
        .upload(path, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
      set({ [field]: client.storage.from("restaurant-media").getPublicUrl(path).data.publicUrl });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading("");
    }
  }

  async function submit(next: MenuTheme) {
    try {
      setError("");
      const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => typeof v === "string" && v !== ""));
      await save({ action: "menu_theme", theme: clean });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const without = (keys: (keyof MenuTheme)[]) =>
    setTheme((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !keys.includes(k as keyof MenuTheme))) as MenuTheme);

  return (
    <section className="admin-panel connected-panel form-stack menu-theme-settings">
      <h2>Aparência do cardápio</h2>
      <p className="field-help">
        Deixe o cardápio com a cara da sua marca. A gestão continua com o visual padrão.
      </p>

      <fieldset className="choice-group">
        <legend>Temas prontos</legend>
        <div className="theme-presets">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => {
            const p = PRESETS[id];
            return (
              <button
                key={id}
                type="button"
                className={`theme-preset${theme.preset === id ? " active" : ""}`}
                style={{ background: p.background, color: p.text, borderColor: p.brand }}
                onClick={() => {
                  const { label: _label, ...values } = p;
                  void _label;
                  setTheme((t) => ({ logo_url: t.logo_url, cover_url: t.cover_url, ...values, preset: id }));
                }}
              >
                <span style={{ background: p.brand }} />
                {p.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="form-columns">
        <label className="form-label">
          Logo
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => void upload("logo_url", e.target.files?.[0])} />
        </label>
        <label className="form-label">
          Imagem de capa
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!uploading} onChange={(e) => void upload("cover_url", e.target.files?.[0])} />
        </label>
      </div>
      {uploading && <p role="status">Enviando imagem…</p>}
      <div className="connected-toolbar">
        {theme.logo_url && <Button type="button" variant="ghost" onClick={() => without(["logo_url"])}>Remover logo</Button>}
        {theme.cover_url && <Button type="button" variant="ghost" onClick={() => without(["cover_url"])}>Remover capa</Button>}
      </div>

      <fieldset className="choice-group">
        <legend>Tema</legend>
        <label className="checkbox-label">
          <input type="radio" name="mode" checked={resolved.mode === "light"} onChange={() => setColor({ mode: "light" })} /> Claro
        </label>
        <label className="checkbox-label">
          <input type="radio" name="mode" checked={resolved.mode === "dark"} onChange={() => setColor({ mode: "dark" })} /> Escuro
        </label>
      </fieldset>

      <div className="form-columns">
        {COLOR_FIELDS.map(([field, label]) => (
          <label key={field} className="form-label">
            {label}
            <input type="color" value={resolved[field]} onChange={(e) => setColor({ [field]: e.target.value.toLowerCase() })} />
          </label>
        ))}
      </div>

      <div className="form-columns">
        <label className="form-label">
          Fonte dos títulos
          <select value={resolved.heading_font} onChange={(e) => set({ heading_font: e.target.value as MenuTheme["heading_font"] })}>
            {Object.entries(HEADING_FONTS).map(([id, f]) => (
              <option key={id} value={id} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Fonte do texto
          <select value={resolved.body_font} onChange={(e) => set({ body_font: e.target.value as MenuTheme["body_font"] })}>
            {Object.entries(BODY_FONTS).map(([id, f]) => (
              <option key={id} value={id} style={{ fontFamily: f.family }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Cantos
          <select value={resolved.radius} onChange={(e) => set({ radius: e.target.value as MenuTheme["radius"] })}>
            <option value="reto">Retos</option>
            <option value="suave">Suaves</option>
            <option value="redondo">Bem arredondados</option>
          </select>
        </label>
      </div>

      <div className="theme-preview" style={{ ...themeVariables({ ...theme, mode: resolved.mode }), background: "var(--background)", color: "var(--text)" }}>
        {theme.logo_url && <img className="brand-logo" src={theme.logo_url} alt="" />}
        <h3>Prévia do cardápio</h3>
        <div className="theme-preview-card">
          <strong>X-Burguer da casa</strong>
          <p>Pão brioche, blend 160 g, queijo e molho especial.</p>
          <span className="theme-preview-price">R$ 29,90</span>
          <span className="theme-preview-button">Adicionar</span>
        </div>
      </div>

      {!readable && (
        <p role="alert" className="form-error">
          O texto ficaria difícil de ler com essas cores. Ajuste o texto, o fundo ou os cartões.
        </p>
      )}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="connected-toolbar">
        <Button type="button" disabled={busy || !!uploading || !readable} onClick={() => void submit(theme)}>
          Salvar aparência
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !!uploading}
          onClick={() => {
            setTheme({});
            void submit({});
          }}
        >
          Voltar ao padrão
        </Button>
      </div>
    </section>
  );
}
```

Append to `src/app/globals.css`:

```css
.theme-presets {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.theme-preset {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 2px solid transparent;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
}
.theme-preset span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}
.theme-preset.active {
  outline: 3px solid #251c1a;
  outline-offset: 2px;
}
.theme-preview {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: var(--radius);
  font-family: var(--font-sans);
}
.theme-preview h3 {
  margin: 0;
  font-family: var(--font-heading);
}
.theme-preview-card {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.theme-preview-card p {
  margin: 0;
  color: var(--muted);
}
.theme-preview-price {
  font-weight: 800;
}
.theme-preview-button {
  justify-self: start;
  padding: 8px 14px;
  border-radius: var(--radius);
  background: var(--brand);
  color: var(--brand-contrast);
  font-weight: 700;
}
```

Note: the preview's `themeVariables(...)` returns an object of CSS custom properties; TypeScript may need the cast `as React.CSSProperties` on the `style` object — add it if `tsc` complains.

- [ ] **Step 3: Wire into settings and PDF**

In `src/components/connected-admin.tsx`: `import { MenuThemeSettings } from "./menu-theme-settings";` and render `<MenuThemeSettings data={data} save={save} busy={busy} />` in the `configuracoes` fragment right after `<SettingsForm ... />`. Pass `logoUrl={data.restaurant.menu_theme?.logo_url}` to `<ResultsReportPanel ... />`.

In `src/components/results-report.tsx`: add the optional prop `logoUrl?: string` and, inside `<header className="results-header">`, render `{logoUrl && <img className="brand-logo" src={logoUrl} alt="" />}` before the restaurant name.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run test:online && npm run build` → all pass. `git checkout -- next-env.d.ts` if touched.

- [ ] **Step 5: Commit**

```bash
git add src/components/menu-theme-settings.tsx "src/app/api/restaurants/[id]/catalog/route.ts" src/components/connected-admin.tsx src/components/results-report.tsx src/app/globals.css
git commit -m "feat(theme): owner appearance settings with presets, uploads and live preview"
```

---

### Task 6: Final verification

- [ ] **Step 1:** Run one by one: `npx tsc --noEmit`, `npm run lint`, `npm run test:database`, `npm run test:online`, `npm run test:foundation`, `npm run test:crm`, `npm run test:observability`, `npm run build`. Expected: all green.
- [ ] **Step 2 (controller, after publication):** apply a preset on the test restaurant and check list, reels, product modal, bag, checkout and tracking in the browser.
- [ ] **Step 3 (publication notes, do not run):** apply `supabase/migrations/018_menu_theme.sql` before pushing to `main` (the settings screen calls `save_menu_theme`; the menu reads `menu_theme` with `?? {}`, so it keeps working without it).
