# Subprojeto A — Fundação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o cardápio seguro (cabeçalhos HTTP), rápido (cache do catálogo, fotos em WebP) e compartilhável (metadados por restaurante), com a demo isolada das rotas reais.

**Architecture:** Funções puras e testáveis em `src/lib/` (`security-headers.ts`, `restaurant-metadata.ts`, `catalog-cache.ts`, `photo-optimizer.ts`) ligadas aos pontos de entrada existentes (`next.config.ts`, páginas `/r/[slug]`, rotas de mutação, gestão conectada). Cache com `unstable_cache` + `revalidateTag(tag, { expire: 0 })`, porque o projeto não usa `cacheComponents`. Nenhuma migration.

**Tech Stack:** Next.js 16.4 (App Router, webpack no build), React 19.3, TypeScript 6, Supabase JS 2, Zod 4, Playwright 1.64, `node:test` com transpilação TS em memória (padrão de `scripts/test-observability.mjs`), FFmpeg local em `.tools/ffmpeg`.

Spec: `docs/superpowers/specs/2026-10-23-a-fundacao-design.md`.

## Global Constraints

- Trabalhar somente em `C:\Users\medei\Claude\mvp-web-melhorias` (branch `melhorias/a-fundacao`). Nunca editar, fazer checkout ou rodar servidor em `C:\Users\medei\OneDrive\Desktop\work\mvp-web` (o Codex trabalha lá no `main`).
- Servidor local de teste sempre na porta **3101** com `NEXT_PUBLIC_APP_URL=http://localhost:3101`; Playwright sempre com `PLAYWRIGHT_BASE_URL=http://localhost:3101` (sem isso o `playwright.config.ts` reaproveita qualquer servidor na 3000, que pode ser o do Codex).
- Build sempre `npm run build -- --webpack` (Turbopack falha neste Windows).
- Nenhuma alteração em `supabase/migrations/` ou em contratos Zod existentes.
- Nada de `console.*` em `src/` (ESLint bloqueia); logs só via `logger` de `src/lib/observability/logger.ts`, com eventos/operações/códigos da lista fechada em `src/lib/observability/core.ts`.
- Não imprimir nem commitar segredos. `.env.local` é copiado localmente e é ignorado pelo Git.
- Testes `RUN_CONNECTED_LIVE=1` e o script de fotos com `--apply` tocam serviços reais: executar somente após autorização explícita do usuário no chat.
- Antes de usar uma API do Next, conferir o guia em `C:\Users\medei\OneDrive\Desktop\work\mvp-web\node_modules\next\dist\docs\` (ou a cópia em `node_modules/next/dist/docs/` do worktree após o `npm ci`), conforme `AGENTS.md`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/lib/security-headers.ts` | Criar | Montar CSP e demais cabeçalhos (função pura) |
| `next.config.ts` | Modificar | Aplicar `securityHeaders()` em todas as rotas |
| `src/components/brand.tsx` | Modificar | Funcionar sem `DemoContext` (marca da plataforma) |
| `src/app/layout.tsx` | Modificar | Remover `DemoProvider` global; metadados neutros + `metadataBase` |
| `src/app/r/[slug]/page.tsx` | Modificar | Demo com provider próprio; `generateMetadata` |
| `src/app/r/[slug]/pedido/[id]/page.tsx` | Modificar | Demo com provider próprio |
| `src/app/r/demo/pedidos/page.tsx` | Modificar | Demo com provider próprio |
| `src/app/demo/gestao/[[...section]]/page.tsx` | Modificar | Demo com provider próprio |
| `src/lib/restaurant-metadata.ts` | Criar | Metadados por restaurante (função pura) |
| `src/lib/catalog-cache.ts` | Criar | Tag do catálogo e invalidação |
| `src/lib/catalog.ts` | Modificar | `readCatalog` cacheado |
| `src/app/api/restaurants/[id]/catalog/route.ts` | Modificar | Invalidar após mutações públicas |
| `src/app/api/onboarding/route.ts` | Modificar | Invalidar slug recém-criado |
| `src/lib/sync-video.ts` | Modificar | Invalidar quando vídeo fica pronto |
| `src/lib/photo-optimizer.ts` | Criar | Redimensionar/converter foto no navegador |
| `src/components/connected-admin.tsx` | Modificar | Otimizar foto antes do upload |
| `src/components/media-picker.tsx` | Modificar | Aceitar foto até 15 MB no modo conectado |
| `scripts/optimize-existing-photos.mjs` | Criar | Conversão única das fotos já publicadas |
| `scripts/test-foundation.mjs` | Criar | Testes unitários (headers, metadados, cache) |
| `scripts/test-photos.mjs` | Criar | Testes de foto (navegador + FFmpeg) |
| `tests/foundation.spec.ts` | Criar | Playwright: cabeçalhos, CSP sem violações, metadados, marca no login |
| `tests/foundation-live.spec.ts` | Criar | Playwright opt-in: og:image, cache e invalidação reais |
| `package.json` | Modificar | Scripts `test:foundation`, `test:photos` |
| `docs/checklist-fundacao.md` | Criar | Passos manuais do usuário |
| `docs/CONTEXTO-PARA-CLAUDE-CODE.md`, `docs/piloto.md` | Modificar | Registrar o que mudou |

---

### Task 0: Preparar o worktree

**Files:** nenhum versionado.

- [ ] **Step 1: Instalar dependências**

Run (em `C:\Users\medei\Claude\mvp-web-melhorias`): `npm ci`
Expected: termina sem erro; cria `node_modules/`.

- [ ] **Step 2: Copiar o ambiente local e o FFmpeg**

```bash
cp /c/Users/medei/OneDrive/Desktop/work/mvp-web/.env.local .env.local
mkdir -p .tools && cp -r /c/Users/medei/OneDrive/Desktop/work/mvp-web/.tools/ffmpeg .tools/ffmpeg
git status --short
```

Expected: `git status` não lista `.env.local` nem `.tools/` (ambos ignorados).

- [ ] **Step 3: Linha de base**

Run: `npm run lint && npm run typecheck && npm run test:observability`
Expected: tudo passa. Se algo falhar já no estado inicial, registrar e avisar antes de continuar.

---

### Task 1: Cabeçalhos de segurança

**Files:**
- Create: `src/lib/security-headers.ts`
- Create: `scripts/test-foundation.mjs`
- Modify: `next.config.ts`
- Modify: `package.json` (script `test:foundation`)
- Create: `tests/foundation.spec.ts`

**Interfaces:**
- Produces: `type SecurityHeaderOptions = { supabaseUrl?: string; legacyStream: boolean; dev: boolean; https: boolean }`; `contentSecurityPolicy(o: SecurityHeaderOptions): string`; `securityHeaders(o: SecurityHeaderOptions): { key: string; value: string }[]`.
- Produces: `scripts/test-foundation.mjs` com a função `loader(overrides)` reutilizada pelas tasks 3 e 4 (novos `test(...)` são acrescentados ao mesmo arquivo).

- [ ] **Step 1: Escrever o teste unitário que falha**

Criar `scripts/test-foundation.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Compile just the modules under test in memory; never load .env or call a service.
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {};
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith("."))
        return load(path.resolve(path.dirname(file), specifier + ".ts"));
      return require(specifier);
    };
    new Function("require", "module", "exports", source)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load;
}

const security = loader()("src/lib/security-headers.ts");
const base = {
  supabaseUrl: "https://abc.supabase.co",
  legacyStream: false,
  dev: false,
  https: true,
};
const header = (list, key) => list.find((h) => h.key === key)?.value;

test("CSP allows only this site and the configured Supabase project", () => {
  const csp = security.contentSecurityPolicy(base);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co wss:\/\/abc\.supabase\.co/);
  assert.match(csp, /media-src 'self' blob: https:\/\/abc\.supabase\.co/);
  assert.match(csp, /img-src 'self' data: blob: https:\/\/abc\.supabase\.co/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /cloudflarestream/);
});

test("development adds eval and HMR websockets; legacy stream adds Cloudflare", () => {
  const csp = security.contentSecurityPolicy({ ...base, dev: true, legacyStream: true });
  assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(csp, /connect-src [^;]* ws:/);
  assert.match(csp, /media-src [^;]*https:\/\/\*\.cloudflarestream\.com/);
});

test("invalid or missing Supabase URL never produces a wildcard origin", () => {
  for (const supabaseUrl of [undefined, "not a url"]) {
    const csp = security.contentSecurityPolicy({ ...base, supabaseUrl });
    assert.match(csp, /connect-src 'self';/);
    assert.doesNotMatch(csp, /\*(?!\.cloudflarestream)/);
  }
});

test("HSTS only for HTTPS production builds", () => {
  assert.ok(header(security.securityHeaders(base), "Strict-Transport-Security"));
  assert.equal(header(security.securityHeaders({ ...base, https: false }), "Strict-Transport-Security"), undefined);
  assert.equal(header(security.securityHeaders({ ...base, dev: true }), "Strict-Transport-Security"), undefined);
  const list = security.securityHeaders(base);
  assert.equal(header(list, "X-Frame-Options"), "DENY");
  assert.equal(header(list, "X-Content-Type-Options"), "nosniff");
  assert.equal(header(list, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(header(list, "Permissions-Policy"), "camera=(), microphone=(), geolocation=(), payment=()");
});
```

Adicionar em `package.json` → `scripts`: `"test:foundation": "node --test scripts/test-foundation.mjs",`

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:foundation`
Expected: FAIL com `ENOENT` em `src/lib/security-headers.ts`.

- [ ] **Step 3: Implementar**

Criar `src/lib/security-headers.ts`:

```ts
// Pure builder for the HTTP security headers applied in next.config.ts.
// Keep it free of server-only imports: the config loads it at build time.
// Any third-party script or pixel (e.g. Meta Pixel, GA4) must be allowed here
// explicitly, in the narrowest directive it needs.
export type SecurityHeaderOptions = {
  supabaseUrl?: string;
  legacyStream: boolean;
  dev: boolean;
  https: boolean;
};

// Legacy Cloudflare Stream playback, only when its credentials are configured.
const STREAM_HOSTS = [
  "https://*.cloudflarestream.com",
  "https://videodelivery.net",
];

function supabaseOrigins(url?: string) {
  if (!url) return { http: [] as string[], ws: [] as string[] };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      return { http: [], ws: [] };
    const ws = parsed.protocol === "https:" ? "wss:" : "ws:";
    return { http: [parsed.origin], ws: [`${ws}//${parsed.host}`] };
  } catch {
    return { http: [], ws: [] };
  }
}

export function contentSecurityPolicy(o: SecurityHeaderOptions) {
  const supabase = supabaseOrigins(o.supabaseUrl);
  const stream = o.legacyStream ? STREAM_HOSTS : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // App Router inline bootstrap scripts need 'unsafe-inline' without nonces;
    // nonces would force dynamic rendering of every page.
    "script-src": ["'self'", "'unsafe-inline'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...supabase.http, ...stream],
    "media-src": ["'self'", "blob:", ...supabase.http, ...stream],
    "connect-src": [
      "'self'",
      ...supabase.http,
      ...supabase.ws,
      ...stream,
      ...(o.dev ? ["ws:"] : []),
    ],
    "font-src": ["'self'", "data:"],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(o: SecurityHeaderOptions) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(o) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
  ];
  if (o.https && !o.dev)
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  return headers;
}
```

Substituir `next.config.ts` por:

```ts
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          legacyStream: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
          dev: process.env.NODE_ENV !== "production",
          https: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
        }),
      },
    ];
  },
};
export default config;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:foundation`
Expected: 4 testes PASS.

- [ ] **Step 5: Teste Playwright de cabeçalhos e CSP**

Criar `tests/foundation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("cabeçalhos de segurança no cardápio e na API", async ({ request }) => {
  for (const path of ["/r/demo", "/api/catalog/INVALIDO"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  }
});

test("demo funciona sem violações de CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto("/r/demo");
  await expect(page.getByRole("region", { name: "Cardápio em reels" })).toBeVisible();
  await page.getByRole("button", { name: "Ver detalhes de Smash da casa", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visualizar lista" }).click();
  await expect(page.locator(".product-list")).toBeVisible();
  expect(violations).toEqual([]);
});
```

Iniciar o servidor em segundo plano (porta 3101):

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3101 npm run dev -- --port 3101
```

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/foundation.spec.ts`
Expected: 2 PASS. Se aparecer violação, ajustar a diretiva específica em `security-headers.ts`, acrescentar o caso em `scripts/test-foundation.mjs` e repetir.

- [ ] **Step 6: Regressão do cardápio com CSP**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/reels.spec.ts tests/app.spec.ts tests/accessibility.spec.ts tests/video-observation.spec.ts tests/media-upload.spec.ts`
Expected: mesmos resultados da linha de base (testes da gestão demo que exigem `PLAYWRIGHT_ADMIN_STORAGE_STATE` aparecem como skipped).

- [ ] **Step 7: Commit**

```bash
git add src/lib/security-headers.ts next.config.ts scripts/test-foundation.mjs tests/foundation.spec.ts package.json
git commit -m "Add security headers with a Supabase-scoped content security policy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Demo isolada e marca da plataforma

**Files:**
- Modify: `src/components/brand.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/r/[slug]/page.tsx`
- Modify: `src/app/r/[slug]/pedido/[id]/page.tsx`
- Modify: `src/app/r/demo/pedidos/page.tsx`
- Modify: `src/app/demo/gestao/[[...section]]/page.tsx`
- Test: `tests/foundation.spec.ts`

**Interfaces:**
- Consumes: `DemoContext`, `DemoProvider` de `src/components/demo-provider.tsx` (sem mudanças).
- Produces: `Brand` e `DemoBanner` funcionam fora de qualquer provider.

- [ ] **Step 1: Teste que falha**

Acrescentar a `tests/foundation.spec.ts`:

```ts
test("login mostra a marca da plataforma e metadados neutros", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle("Cardap.io");
  await expect(page.getByRole("link", { name: "Cardap.io — início" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("demo continua com dados e banner próprios", async ({ page }) => {
  await page.goto("/r/demo");
  await expect(page.getByText("Modo demonstração")).toBeVisible();
  await page.goto("/r/demo/pedidos");
  await expect(page.getByText("Modo demonstração")).toBeVisible();
});
```

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/foundation.spec.ts -g "login mostra"`
Expected: FAIL (título atual é "Brasa • Seu próximo favorito").

- [ ] **Step 2: Conferir consumidores do contexto demo**

Run: `grep -rn "MenuApp\|TrackingPage\|AdminApp\|LoginForm" src/app`
Expected: apenas as páginas listadas em **Files** e `src/app/login/page.tsx`. Se surgir outra página que renderiza `MenuApp`, `TrackingPage` ou `AdminApp` sem `ConnectedMenuProvider`, envolvê-la em `DemoProvider` como no Step 4.

- [ ] **Step 3: `Brand` e `DemoBanner` tolerantes à ausência de provider**

Substituir `src/components/brand.tsx` por:

```tsx
"use client";
import { Flame } from "lucide-react";
import Link from "next/link";
import { useContext } from "react";
import { DemoContext } from "./demo-provider";
export function Brand({ compact = false }: { compact?: boolean }) {
  // Outside a menu (e.g. login) there is no restaurant: show the platform.
  const context = useContext(DemoContext);
  const name = context?.state.settings.name ?? "Cardap.io";
  return (
    <Link
      href={context ? `/r/${context.slug}` : "/"}
      className="brand"
      aria-label={`${name} — início`}
    >
      <span className="brand-icon">
        <Flame size={27} strokeWidth={1.8} />
      </span>
      <span>
        <span className="brand-name">
          {name.toLocaleLowerCase("pt-BR")}
          {context && <span className="brand-period">.</span>}
        </span>
        {!compact && (
          <small>
            {context?.state.settings.subtitle ??
              "Cardápio digital com pedidos na mesa"}
          </small>
        )}
      </span>
    </Link>
  );
}
export function DemoBanner() {
  const mode = useContext(DemoContext)?.mode;
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner">
      <span className="demo-dot" />
      Modo demonstração
      <span className="demo-banner-extra">
        {" "}
        • Explore à vontade. Nenhum pedido será enviado a um restaurante.
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Provider só nas rotas de demonstração**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: "Cardap.io",
  description: "Cardápio digital com pedidos feitos direto da mesa.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/r/[slug]/page.tsx` — trocar a linha da demo e o import:

```tsx
import { DemoProvider } from "@/components/demo-provider";
// ...
  if (slug === "demo")
    return (
      <DemoProvider>
        <MenuApp />
      </DemoProvider>
    );
```

`src/app/r/[slug]/pedido/[id]/page.tsx`:

```tsx
import { DemoProvider } from "@/components/demo-provider";
// ...
  if (slug === "demo")
    return (
      <DemoProvider>
        <TrackingPage id={id} />
      </DemoProvider>
    );
```

`src/app/r/demo/pedidos/page.tsx`:

```tsx
import { TrackingPage } from "@/components/tracking";
import { DemoProvider } from "@/components/demo-provider";
export default function Page() {
  return (
    <DemoProvider>
      <TrackingPage />
    </DemoProvider>
  );
}
```

`src/app/demo/gestao/[[...section]]/page.tsx` — última linha:

```tsx
import { DemoProvider } from "@/components/demo-provider";
// ...
  return (
    <DemoProvider>
      <AdminApp section={section?.[0] ?? "visao-geral"} />
    </DemoProvider>
  );
```

- [ ] **Step 5: Rodar**

Run: `npm run typecheck && PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/foundation.spec.ts tests/app.spec.ts tests/reels.spec.ts tests/management-auth.spec.ts tests/demo-metrics.spec.ts`
Expected: novos testes PASS; demais com o mesmo resultado da linha de base.

- [ ] **Step 6: Commit**

```bash
git add src/components/brand.tsx src/app/layout.tsx "src/app/r/[slug]/page.tsx" "src/app/r/[slug]/pedido/[id]/page.tsx" src/app/r/demo/pedidos/page.tsx "src/app/demo/gestao/[[...section]]/page.tsx" tests/foundation.spec.ts
git commit -m "Scope the demo provider to demo routes and show platform branding elsewhere

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Cache do catálogo com invalidação

**Files:**
- Create: `src/lib/catalog-cache.ts`
- Modify: `src/lib/catalog.ts`
- Modify: `src/app/api/restaurants/[id]/catalog/route.ts`
- Modify: `src/app/api/onboarding/route.ts`
- Modify: `src/lib/sync-video.ts`
- Test: `scripts/test-foundation.mjs`

**Interfaces:**
- Produces: `catalogTag(slug: string): string` → `"catalog:<slug>"`; `invalidateCatalogSlug(slug: string): void`; `invalidateCatalog(supabase: SupabaseClient, restaurantId: string): Promise<void>` (nunca lança).
- `readCatalog(slug)` mantém assinatura `Promise<Catalog | null>`.

- [ ] **Step 1: Teste que falha**

Acrescentar a `scripts/test-foundation.mjs`:

```js
function fakeSupabase(result) {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    single: async () => result,
  };
  return chain;
}
function cacheModule() {
  const calls = [];
  const warnings = [];
  const load = loader({
    "next/cache": { revalidateTag: (...args) => calls.push(args) },
    "./observability/logger": { logger: { warn: (...a) => warnings.push(a) } },
  });
  return { mod: load("src/lib/catalog-cache.ts"), calls, warnings };
}

test("catalog invalidation expires the restaurant slug tag immediately", async () => {
  const { mod, calls } = cacheModule();
  assert.equal(mod.catalogTag("casa-x"), "catalog:casa-x");
  await mod.invalidateCatalog(fakeSupabase({ data: { slug: "casa-x" }, error: null }), "id");
  assert.deepEqual(calls, [["catalog:casa-x", { expire: 0 }]]);
});

test("catalog invalidation never fails the mutation that already succeeded", async () => {
  const { mod, calls, warnings } = cacheModule();
  await mod.invalidateCatalog(fakeSupabase({ data: null, error: { code: "X" } }), "id");
  assert.deepEqual(calls, []);
  assert.equal(warnings[0][0], "dependency.failed");
  assert.equal(warnings[0][1].operation, "supabase.catalog");
});
```

Run: `npm run test:foundation`
Expected: os 2 novos FAIL com `ENOENT` em `catalog-cache.ts`.

- [ ] **Step 2: Implementar `catalog-cache.ts`**

```ts
import "server-only";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./observability/logger";

// Public menus are cached for a short time; owners' changes expire the tag
// immediately so the next customer refresh reads fresh prices/availability.
export function catalogTag(slug: string) {
  return `catalog:${slug}`;
}

export function invalidateCatalogSlug(slug: string) {
  revalidateTag(catalogTag(slug), { expire: 0 });
}

export async function invalidateCatalog(
  supabase: SupabaseClient,
  restaurantId: string,
) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("slug")
    .eq("id", restaurantId)
    .single();
  if (error || !data?.slug) {
    // The write already succeeded; the 60 s cache window bounds staleness.
    logger.warn("dependency.failed", {
      operation: "supabase.catalog",
      errorCode: "DATABASE_ERROR",
    });
    return;
  }
  invalidateCatalogSlug(data.slug);
}
```

Run: `npm run test:foundation`
Expected: PASS. Se `logger.warn` não aceitar `errorCode: "DATABASE_ERROR"` (conferir `errorCodes` em `src/lib/observability/core.ts`), usar o código equivalente já usado em `src/lib/catalog.ts`.

- [ ] **Step 3: `readCatalog` cacheado**

Em `src/lib/catalog.ts`:
1. Renomear a função atual `export async function readCatalog(slug: string)` para `async function fetchCatalog(slug: string)` e remover dela a primeira linha `if (!isConfigured()) throw new Error("INTEGRATION_UNAVAILABLE");`.
2. Acrescentar imports e a nova `readCatalog`:

```ts
import { unstable_cache } from "next/cache";
import { catalogTag } from "./catalog-cache";
// ...
// Short shared cache for the public menu; invalidated by owner mutations.
export function readCatalog(slug: string): Promise<Catalog | null> {
  if (!isConfigured()) throw new Error("INTEGRATION_UNAVAILABLE");
  return unstable_cache(() => fetchCatalog(slug), ["catalog", slug], {
    revalidate: 60,
    tags: [catalogTag(slug)],
  })();
}
```

Nota: `readCatalog` continua lançando de forma síncrona quando não configurado; os chamadores já usam `await` dentro de `try` ou deixam o erro chegar ao Next, então o comportamento não muda. Erros lançados por `fetchCatalog` não são cacheados.

- [ ] **Step 4: Invalidar nas mutações**

`src/app/api/restaurants/[id]/catalog/route.ts` — importar `import { invalidateCatalog } from "@/lib/catalog-cache";` e, imediatamente antes de `return Response.json({ ok: true }, { headers: noStore });`, acrescentar:

```ts
    // Marketing revocations and comment moderation are not part of the public catalog.
    if (body.action !== "revoke_marketing" && body.action !== "moderate_feedback")
      await invalidateCatalog(supabase, id);
```

`src/app/api/onboarding/route.ts` — importar `import { invalidateCatalogSlug } from "@/lib/catalog-cache";` e, após `if (error) throw error;`:

```ts
    // A visit before creation may have cached "not found" for this slug.
    invalidateCatalogSlug(body.slug);
```

`src/lib/sync-video.ts` — importar `import { invalidateCatalog } from "./catalog-cache";`. Nos dois ramos, depois de gravar `changes` com sucesso e antes de `return changes;`, acrescentar:

```ts
    if (changes.state === "ready")
      await invalidateCatalog(serviceClient(), restaurantId);
```

(no ramo Storage usar o `service` já criado: `await invalidateCatalog(service, restaurantId);`).

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:foundation`
Expected: tudo passa.

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/app.spec.ts tests/reels.spec.ts`
Expected: mesmo resultado da linha de base (a demo não usa o catálogo do Supabase).

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog-cache.ts src/lib/catalog.ts "src/app/api/restaurants/[id]/catalog/route.ts" src/app/api/onboarding/route.ts src/lib/sync-video.ts scripts/test-foundation.mjs
git commit -m "Cache the public catalog for 60 seconds and expire it on owner changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Metadados por restaurante

**Files:**
- Create: `src/lib/restaurant-metadata.ts`
- Modify: `src/app/r/[slug]/page.tsx`
- Test: `scripts/test-foundation.mjs`, `tests/foundation.spec.ts`

**Interfaces:**
- Consumes: `readCatalog(slug)` (Task 3); tipo `Catalog` de `src/lib/connected-types.ts` (`restaurant.name`, `products[].photo_url`).
- Produces: `restaurantMetadata(catalog: Pick<Catalog, "restaurant" | "products">): Metadata`; `DEMO_METADATA: Metadata`.

- [ ] **Step 1: Teste unitário que falha**

Acrescentar a `scripts/test-foundation.mjs`:

```js
const meta = loader()("src/lib/restaurant-metadata.ts");

test("restaurant metadata uses its name and first product photo", () => {
  const result = meta.restaurantMetadata({
    restaurant: { name: "Casa X" },
    products: [
      { photo_url: null },
      { photo_url: "https://abc.supabase.co/storage/v1/object/public/restaurant-media/r/1.webp" },
      { photo_url: "https://abc.supabase.co/other.webp" },
    ],
  });
  assert.equal(result.title, "Casa X · Cardápio");
  assert.equal(result.description, "Veja o cardápio de Casa X, escolha e peça direto da mesa.");
  assert.deepEqual(result.openGraph.images, [
    { url: "https://abc.supabase.co/storage/v1/object/public/restaurant-media/r/1.webp" },
  ]);
  assert.equal(result.twitter.card, "summary_large_image");
  assert.deepEqual(result.robots, { index: true, follow: true });
});

test("restaurant without photos gets a text-only card", () => {
  const result = meta.restaurantMetadata({ restaurant: { name: "Casa Y" }, products: [] });
  assert.equal(result.openGraph.images, undefined);
  assert.equal(result.twitter.card, "summary");
  assert.deepEqual(meta.DEMO_METADATA.robots, { index: false, follow: false });
});
```

Run: `npm run test:foundation`
Expected: FAIL com `ENOENT` em `restaurant-metadata.ts`.

- [ ] **Step 2: Implementar**

`src/lib/restaurant-metadata.ts`:

```ts
import type { Metadata } from "next";
import type { Catalog } from "./connected-types";

// Link previews (WhatsApp, Instagram, Google) show the restaurant, not the platform.
export function restaurantMetadata(
  catalog: Pick<Catalog, "restaurant" | "products">,
): Metadata {
  const name = catalog.restaurant.name;
  const title = `${name} · Cardápio`;
  const description = `Veja o cardápio de ${name}, escolha e peça direto da mesa.`;
  const photo = catalog.products.find((p) => p.photo_url)?.photo_url;
  const images = photo ? [{ url: photo }] : undefined;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "website", locale: "pt_BR", images },
    twitter: {
      card: photo ? "summary_large_image" : "summary",
      title,
      description,
      images: photo ? [photo] : undefined,
    },
  };
}

export const DEMO_METADATA: Metadata = {
  title: "Demonstração · Cardap.io",
  robots: { index: false, follow: false },
};
```

Run: `npm run test:foundation`
Expected: PASS. Se o TypeScript reclamar de `Pick<Catalog, ...>` nos objetos de teste, não importa (o teste roda JS); rodar `npm run typecheck` para o código de produção.

- [ ] **Step 3: `generateMetadata` na página**

Em `src/app/r/[slug]/page.tsx`, acrescentar:

```tsx
import type { Metadata } from "next";
import { DEMO_METADATA, restaurantMetadata } from "@/lib/restaurant-metadata";
// ...
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "demo") return DEMO_METADATA;
  try {
    const catalog = await readCatalog(slug);
    return catalog ? restaurantMetadata(catalog) : {};
  } catch {
    // The page itself reports the failure; metadata falls back to the root defaults.
    return {};
  }
}
```

- [ ] **Step 4: Playwright**

Acrescentar a `tests/foundation.spec.ts`:

```ts
test("demo não é indexada e tem título próprio", async ({ page }) => {
  await page.goto("/r/demo");
  await expect(page).toHaveTitle("Demonstração · Cardap.io");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
```

Run: `npm run typecheck && PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/foundation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/restaurant-metadata.ts "src/app/r/[slug]/page.tsx" scripts/test-foundation.mjs tests/foundation.spec.ts
git commit -m "Give each public menu its own title, description and link preview image

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Otimização de fotos no upload

**Files:**
- Create: `src/lib/photo-optimizer.ts`
- Create: `scripts/test-photos.mjs`
- Modify: `src/components/connected-admin.tsx` (bloco de upload, ~linhas 650–653, e imports ~linha 36)
- Modify: `src/components/media-picker.tsx` (~linhas 96–104 e 121–123)
- Modify: `package.json` (script `test:photos`)

**Interfaces:**
- Produces: `PHOTO_MAX_SIDE = 1080`; `PHOTO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024`; `PHOTO_SELECT_MAX_MB = 15`; `optimizePhoto(file: File): Promise<File>`.

- [ ] **Step 1: Teste de navegador que falha**

Criar `scripts/test-photos.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import ts from "typescript";

function compiled(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test("large photos become ≤1080 px WebP; small efficient photos stay untouched", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async (code) => {
      const exports = {};
      new Function("exports", code)(exports);
      async function make(width, height, type, quality) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#b3261e");
        gradient.addColorStop(1, "#f7c948");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = `hsl(${i % 360} 70% 50%)`;
          ctx.fillRect((i * 37) % width, (i * 53) % height, 40, 40);
        }
        const blob = await new Promise((r) => canvas.toBlob(r, type, quality));
        return new File([blob], "original", { type });
      }
      const big = await make(3000, 2000, "image/png");
      const optimized = await exports.optimizePhoto(big);
      const bitmap = await createImageBitmap(optimized);
      const small = await make(300, 200, "image/webp", 0.5);
      const kept = await exports.optimizePhoto(small);
      return {
        bigBytes: big.size,
        type: optimized.type,
        bytes: optimized.size,
        width: bitmap.width,
        height: bitmap.height,
        keptSame: kept === small,
      };
    }, compiled("src/lib/photo-optimizer.ts"));
    assert.equal(result.type, "image/webp");
    assert.equal(result.width, 1080);
    assert.equal(result.height, 720);
    assert.ok(result.bytes < result.bigBytes);
    assert.ok(result.bytes <= 5 * 1024 * 1024);
    assert.equal(result.keptSame, true);
  } finally {
    await browser.close();
  }
});
```

Adicionar em `package.json` → `scripts`: `"test:photos": "node --test scripts/test-photos.mjs",`

Run: `npm run test:photos`
Expected: FAIL com `ENOENT` em `src/lib/photo-optimizer.ts`.

- [ ] **Step 2: Implementar `photo-optimizer.ts`**

```ts
// Runs only in the browser for a locally selected photo, before upload.
// Customers at the table are often on weak mobile data: keep menu photos light.
export const PHOTO_MAX_SIDE = 1080;
export const PHOTO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_SELECT_MAX_MB = 15;

function encode(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.82),
  );
}

export async function optimizePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Não foi possível ler a foto. Escolha outro arquivo JPG, PNG ou WebP.",
    );
  }
  try {
    const scale = Math.min(
      1,
      PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Não foi possível preparar a foto neste navegador.");
    // Transparent PNGs would turn black in the JPEG fallback.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await encode(canvas, "image/webp");
    // Browsers without WebP encoding silently return PNG; use JPEG instead.
    if (!blob || blob.type !== "image/webp")
      blob = await encode(canvas, "image/jpeg");
    if (!blob) throw new Error("Não foi possível preparar a foto.");
    const alreadyFine =
      scale === 1 &&
      blob.size >= file.size &&
      file.size <= PHOTO_UPLOAD_MAX_BYTES;
    if (alreadyFine) return file;
    if (blob.size > PHOTO_UPLOAD_MAX_BYTES)
      throw new Error("A foto continua grande demais. Escolha outra imagem.");
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `foto.${extension}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
```

Run: `npm run test:photos`
Expected: PASS.

- [ ] **Step 3: Ligar no cadastro de produto**

`src/components/connected-admin.tsx` — junto ao import de `createVideoCover` (~linha 36):

```tsx
import { optimizePhoto } from "@/lib/photo-optimizer";
```

Substituir (~linhas 651–653):

```tsx
                const photoFile = file?.type.startsWith("video/")
                  ? await createVideoCover(file)
                  : file;
```

por:

```tsx
                const photoFile = file
                  ? file.type.startsWith("video/")
                    ? await createVideoCover(file)
                    : await optimizePhoto(file)
                  : file;
```

(O `path` já deriva a extensão de `photoFile.type`, então `.webp` sai correto; erros de `optimizePhoto` chegam ao `catch` existente, que mostra a mensagem.)

`src/components/media-picker.tsx` — importar `import { PHOTO_SELECT_MAX_MB } from "@/lib/photo-optimizer";`, trocar `: 5;` (no cálculo de `max`) por `: PHOTO_SELECT_MAX_MB;` e o texto de ajuda por:

```tsx
        Fotos JPG, PNG ou WebP até {demo ? 1 : PHOTO_SELECT_MAX_MB} MB
        {demo ? "" : ", otimizadas automaticamente"}. Vídeos MP4 (H.264) ou
        WebM até 45 segundos e 20 MB.
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm run test:photos`
Expected: PASS.

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/media-upload.spec.ts`
Expected: mesmo resultado da linha de base. Se algum teste afirmar o texto antigo "até 5 MB", atualizar a expectativa para o novo texto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photo-optimizer.ts scripts/test-photos.mjs src/components/connected-admin.tsx src/components/media-picker.tsx package.json
git commit -m "Resize menu photos to 1080 px WebP in the browser before upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Script de conversão das fotos existentes

**Files:**
- Create: `scripts/optimize-existing-photos.mjs`
- Modify: `scripts/test-photos.mjs`

**Interfaces:**
- Consumes: `runFfmpeg(args)` de `scripts/prepare-pilot-media.mjs`.
- Produces: `planPhotoConversions(rows: {id, restaurant_id, photo_url}[], supabaseUrl: string)` → linhas cujo `photo_url` está no bucket público `restaurant-media` deste projeto e não termina em `.webp`; `convertToWebp(input: string, output: string): Promise<void>`.

- [ ] **Step 1: Testes que falham**

Acrescentar a `scripts/test-photos.mjs`:

```js
import { mkdtempSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { runFfmpeg } from "./prepare-pilot-media.mjs";
import { planPhotoConversions, convertToWebp } from "./optimize-existing-photos.mjs";

test("plans only this project's non-WebP menu photos", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public/restaurant-media/";
  const rows = [
    { id: "1", restaurant_id: "r", photo_url: base + "r/a.jpg" },
    { id: "2", restaurant_id: "r", photo_url: base + "r/b.webp" },
    { id: "3", restaurant_id: "r", photo_url: "https://elsewhere.com/x.jpg" },
    { id: "4", restaurant_id: "r", photo_url: null },
    { id: "5", restaurant_id: "r", photo_url: base + "r/c.PNG" },
  ];
  assert.deepEqual(
    planPhotoConversions(rows, "https://abc.supabase.co").map((r) => r.id),
    ["1", "5"],
  );
});

test("FFmpeg converts a large image into a smaller WebP", async () => {
  const root = path.resolve(".tools");
  const dir = mkdtempSync(path.join(root, "photo-test-"));
  try {
    const input = path.join(dir, "in.png");
    const output = path.join(dir, "out.webp");
    await runFfmpeg(["-n", "-f", "lavfi", "-i", "testsrc2=size=3000x2000", "-frames:v", "1", input]);
    await convertToWebp(input, output);
    const bytes = readFileSync(output);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(statSync(output).size < statSync(input).size);
  } finally {
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error("Unsafe cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Run: `npm run test:photos`
Expected: FAIL (módulo `optimize-existing-photos.mjs` inexistente).

- [ ] **Step 2: Implementar o script**

`scripts/optimize-existing-photos.mjs`:

```js
// One-off conversion of already published menu photos to ≤1080 px WebP.
// Default is a dry run. `--apply` writes to production: run it only after the
// user explicitly approves. Never overwrites or deletes the original file.
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { runFfmpeg } from "./prepare-pilot-media.mjs";

const BUCKET = "restaurant-media";

export function planPhotoConversions(rows, supabaseUrl) {
  const prefix = `${new URL(supabaseUrl).origin}/storage/v1/object/public/${BUCKET}/`;
  return rows.filter(
    (row) =>
      typeof row.photo_url === "string" &&
      row.photo_url.startsWith(prefix) &&
      !row.photo_url.toLowerCase().endsWith(".webp"),
  );
}

export function convertToWebp(input, output) {
  return runFfmpeg([
    "-n",
    "-i",
    input,
    "-vf",
    "scale='min(1080,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "82",
    output,
  ]);
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await service
    .from("products")
    .select("id,restaurant_id,photo_url")
    .eq("archived", false)
    .not("photo_url", "is", null);
  if (error) throw new Error("Não foi possível listar os produtos.");
  const plan = planPhotoConversions(data, url);
  process.stdout.write(`${plan.length} foto(s) para converter${apply ? "" : " (simulação)"}\n`);
  const root = path.resolve(".tools");
  const dir = mkdtempSync(path.join(root, "photo-backfill-"));
  try {
    for (const row of plan) {
      const response = await fetch(row.photo_url);
      if (!response.ok) {
        process.stdout.write(`- produto ${row.id}: download falhou, ignorado\n`);
        continue;
      }
      const input = path.join(dir, `${row.id}-in`);
      const output = path.join(dir, `${row.id}.webp`);
      writeFileSync(input, Buffer.from(await response.arrayBuffer()));
      await convertToWebp(input, output);
      const before = statSync(input).size;
      const after = statSync(output).size;
      if (after >= before) {
        process.stdout.write(`- produto ${row.id}: já otimizada, ignorada\n`);
        continue;
      }
      process.stdout.write(`- produto ${row.id}: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB\n`);
      if (!apply) continue;
      const target = `${row.restaurant_id}/${randomUUID()}.webp`;
      const upload = await service.storage
        .from(BUCKET)
        .upload(target, readFileSync(output), { contentType: "image/webp", upsert: false });
      if (upload.error) throw new Error(`Envio falhou no produto ${row.id}.`);
      const publicUrl = service.storage.from(BUCKET).getPublicUrl(target).data.publicUrl;
      // Only replace if the owner has not changed the photo meanwhile.
      const update = await service
        .from("products")
        .update({ photo_url: publicUrl })
        .eq("id", row.id)
        .eq("photo_url", row.photo_url);
      if (update.error) throw new Error(`Atualização falhou no produto ${row.id}.`);
    }
  } finally {
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error("Unsafe cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
```

Acrescentar em `package.json` → `scripts`: `"optimize:photos": "node scripts/optimize-existing-photos.mjs",`

- [ ] **Step 3: Verificar**

Run: `npm run test:photos`
Expected: 3 testes PASS. Se o teste de FFmpeg falhar por falta de `libwebp` no binário, parar e informar (alternativa: converter com o navegador usando `optimizePhoto`).

Run (somente leitura, lista o que faria): `npm run optimize:photos`
Expected: imprime "N foto(s) para converter (simulação)" e uma linha por produto. **Não** rodar `--apply` sem autorização do usuário.

- [ ] **Step 4: Commit**

```bash
git add scripts/optimize-existing-photos.mjs scripts/test-photos.mjs package.json
git commit -m "Add a dry-run-by-default script to convert existing menu photos to WebP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Teste integrado opt-in (cache, invalidação e prévia do link)

**Files:**
- Create: `tests/foundation-live.spec.ts`

**Interfaces:**
- Consumes: `/api/catalog/[slug]`, `POST /api/restaurants/[id]/catalog` (`save_product`), metadados da Task 4.

- [ ] **Step 1: Escrever o teste**

```ts
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
test.skip(
  process.env.RUN_CONNECTED_LIVE !== "1",
  "Explicit opt-in: creates and removes isolated hosted test data.",
);
test.use({ trace: "off", actionTimeout: 30000 });

test("Supabase real: cache do cardápio, invalidação e prévia do link", async ({ page, baseURL }) => {
  test.setTimeout(240000);
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const suffix = randomUUID().slice(0, 8);
  const slug = `integration-${suffix}`;
  const email = `integration-${suffix}@example.test`;
  const password = randomUUID() + "Aa1!";
  let userId: string | undefined;
  let tenant: string | undefined;
  try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Could not create test account");
    userId = created.data.user.id;
    const owner = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const session = await owner.auth.signInWithPassword({ email, password });
    if (session.error) throw session.error;
    const onboard = await owner.rpc("onboard_restaurant", { p_name: "Casa Teste", p_slug: slug });
    if (onboard.error) throw onboard.error;
    tenant = onboard.data as string;
    const { data: category } = await owner
      .from("categories").select("id").eq("restaurant_id", tenant).limit(1).single();
    const product = {
      id: randomUUID(),
      category_id: category!.id,
      name: "Prato teste",
      description: "",
      ingredients: "",
      removable_ingredients: [],
      allergens: "",
      price_cents: 2500,
      photo_url: `${url}/storage/v1/object/public/restaurant-media/${tenant}/teste.webp`,
      published: true,
      available: true,
      position: 0,
    };
    const insert = await owner.from("products").insert({ ...product, restaurant_id: tenant });
    if (insert.error) throw insert.error;

    await page.goto(`/r/${slug}`);
    await expect(page).toHaveTitle("Casa Teste · Cardápio");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", product.photo_url);

    const price = async () =>
      (await (await page.request.get(`/api/catalog/${slug}`)).json()).products[0].price_cents;
    expect(await price()).toBe(2500);
    // Direct DB write bypasses invalidation: the cached catalog must still answer.
    await owner.from("products").update({ price_cents: 2600 }).eq("id", product.id);
    expect(await price()).toBe(2500);

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no restaurante" }).click();
    await expect(page).toHaveURL(/\/gestao\/[a-f0-9-]+$/, { timeout: 30000 });
    const save = await page.request.post(`/api/restaurants/${tenant}/catalog`, {
      headers: { origin: baseURL! },
      data: { action: "save_product", product: { ...product, price_cents: 2700 } },
    });
    expect(save.status()).toBe(200);
    expect(await price()).toBe(2700);
  } finally {
    if (tenant) await service.from("restaurants").delete().eq("id", tenant);
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
```

- [ ] **Step 2: Rodar contra build de produção (somente com autorização do usuário)**

Perguntar ao usuário antes. Com o "sim", parar o `next dev` da porta 3101 e:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3101 npm run build -- --webpack
NEXT_PUBLIC_APP_URL=http://localhost:3101 npm start -- --port 3101
```

(em segundo plano) e então:

Run: `RUN_CONNECTED_LIVE=1 PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test tests/foundation-live.spec.ts`
Expected: PASS. Sem autorização: rodar sem `RUN_CONNECTED_LIVE` e confirmar que aparece como skipped.

- [ ] **Step 3: Commit**

```bash
git add tests/foundation-live.spec.ts
git commit -m "Add opt-in hosted test for catalog caching, invalidation and link previews

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Checklist manual, documentação e regressão completa

**Files:**
- Create: `docs/checklist-fundacao.md`
- Modify: `docs/CONTEXTO-PARA-CLAUDE-CODE.md` (parágrafo de complemento no topo)
- Modify: `docs/piloto.md` (seção "Verificação")

- [ ] **Step 1: Criar `docs/checklist-fundacao.md`**

```markdown
# Checklist manual da fundação

Passos que dependem das contas do responsável. Nenhum deles é feito pelo código.

## 1. Trocar credenciais expostas
1. Supabase → Project Settings → API: gerar nova `service_role` (e nova `anon`, se a antiga também foi exposta).
2. Vercel → projeto `cardap-io` → Settings → Environment Variables (Production): atualizar `SUPABASE_SERVICE_ROLE_KEY` (e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) como Secret.
3. Atualizar `.env.local` nas máquinas de desenvolvimento.
4. Redeploy e conferir login, pedido e upload.
5. Só então revogar as chaves antigas. Fazer o mesmo com o token do Cloudflare, se existir.

## 2. Domínio próprio
1. Comprar o domínio (ex.: Registro.br para `.com.br`).
2. Vercel → Settings → Domains → adicionar e configurar o DNS indicado.
3. Atualizar `NEXT_PUBLIC_APP_URL=https://<domínio>` em Production e fazer redeploy (a variável entra no build).
4. Supabase → Authentication → URL Configuration: Site URL = domínio novo; acrescentar `https://<domínio>/auth/confirm` aos redirects.
5. Gerar e imprimir QR das mesas somente depois disso.

## 3. E-mail (SMTP)
1. Criar conta no Resend, adicionar o domínio e publicar os registros DNS (SPF/DKIM).
2. Supabase → Authentication → SMTP Settings: host/porta/usuário/senha do Resend, remetente `nao-responda@<domínio>`.
3. Testar cadastro e "esqueci a senha" com um e-mail real.

## 4. Plano da Vercel
O plano Hobby é restrito a uso não comercial. Com restaurantes pagantes, migrar o projeto para o plano Pro.

## 5. Fotos já publicadas
`npm run optimize:photos` lista as fotos que seriam convertidas. `npm run optimize:photos -- --apply` converte de verdade (não apaga originais). As métricas dessas fotos passam a contar como nova versão a partir da troca.
```

- [ ] **Step 2: Atualizar documentação existente**

Em `docs/CONTEXTO-PARA-CLAUDE-CODE.md`, logo após o parágrafo "Complemento de 22/10/2026", acrescentar:

```markdown
Complemento de 23/10/2026 (branch `melhorias/a-fundacao`): cabeçalhos de segurança/CSP em `src/lib/security-headers.ts` (terceiros como Pixel/GA4 precisam ser liberados ali); `DemoProvider` restrito às rotas de demonstração; metadados e prévia de link por restaurante; catálogo público cacheado por 60 s com invalidação nas mutações do dono (`src/lib/catalog-cache.ts`); fotos novas convertidas para WebP ≤1080 px no navegador; script `npm run optimize:photos` para as antigas. Passos manuais em `docs/checklist-fundacao.md`.
```

Em `docs/piloto.md`, na lista de comandos de "Verificação", acrescentar as linhas `npm run test:foundation` e `npm run test:photos`.

- [ ] **Step 3: Regressão completa**

Run:

```bash
npm run lint
npm run typecheck
npm run test:foundation
npm run test:photos
npm run test:observability
npm run test:database
npm run test:media
NEXT_PUBLIC_APP_URL=http://localhost:3101 npm run build -- --webpack
```

Com `NEXT_PUBLIC_APP_URL=http://localhost:3101 npm start -- --port 3101` em segundo plano:

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test`
Expected: tudo passa; testes opt-in aparecem como skipped. Registrar números exatos de pass/skip/fail para o relatório.

- [ ] **Step 4: Commit**

```bash
git add docs/checklist-fundacao.md docs/CONTEXTO-PARA-CLAUDE-CODE.md docs/piloto.md
git commit -m "Document foundation changes and the owner's manual checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Parar servidores**

Encerrar os processos `next dev`/`next start` da porta 3101 iniciados nesta execução.
