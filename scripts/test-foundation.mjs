import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

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
  assert.equal(warnings[0][1].errorCode, "DATABASE_ERROR");
});

test("catalog invalidation swallows unexpected throws and logs the warning", async () => {
  const { mod, calls, warnings } = cacheModule();
  const throwing = fakeSupabase(null);
  throwing.single = async () => {
    throw new Error("boom");
  };
  await assert.doesNotReject(mod.invalidateCatalog(throwing, "id"));
  assert.deepEqual(calls, []);
  assert.equal(warnings[0][0], "dependency.failed");
  assert.equal(warnings[0][1].errorCode, "DATABASE_ERROR");
});

test("catalog slug validation matches the public route rule", () => {
  const { mod } = cacheModule();
  assert.equal(mod.isCatalogSlug("casa-x1"), true);
  for (const bad of ["", "Casa", "a b", "a/b", "x".repeat(81)])
    assert.equal(mod.isCatalogSlug(bad), false);
});

const meta = loader()("src/lib/restaurant-metadata.ts");

test("restaurant metadata uses its name and first product photo", () => {
  const result = meta.restaurantMetadata({
    restaurant: { name: "Casa X", slug: "casa-x" },
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
  assert.deepEqual(result.alternates, { canonical: "/r/casa-x" });
  assert.deepEqual(result.robots, { index: true, follow: true });
});

test("restaurant without photos gets a text-only card", () => {
  const result = meta.restaurantMetadata({ restaurant: { name: "Casa Y", slug: "casa-y" }, products: [] });
  assert.equal(result.openGraph.images, undefined);
  assert.equal(result.twitter.card, "summary");
  assert.deepEqual(meta.DEMO_METADATA.robots, { index: false, follow: false });
});
