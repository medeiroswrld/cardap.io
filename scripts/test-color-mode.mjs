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
        assert.equal(r.scheme, m.isGestaoPath(path) ? r.mode : undefined);
        assert.equal(r.app, m.isGestaoPath(path) ? "gestao" : undefined);
      }
});

test("the head script survives blocked storage", () => {
  const r = runScript({ stored: null, prefersDark: true, path: "/gestao", storageThrows: true });
  assert.equal(r.mode, "dark");
  assert.equal(r.app, "gestao");
});
