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

test("a logo-only theme changes nothing", () => {
  assert.deepEqual(t.themeVariables({ logo_url: "https://x.supabase.co/a.webp", preset: "brasa" }), {});
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

test("unknown or malformed values fall back to the brasa defaults", () => {
  let v;
  assert.doesNotThrow(() => {
    v = t.themeVariables({ heading_font: "comic", brand: "red", radius: "x", body_font: "zzz", mode: "neon" });
  });
  const d = t.themeVariables(t.PRESETS.brasa);
  assert.equal(v["--brand"], d["--brand"]);
  assert.equal(v["--font-heading"], d["--font-heading"]);
  assert.equal(v["--font-sans"], d["--font-sans"]);
  assert.equal(v["--radius"], d["--radius"]);
  assert.equal(t.resolveTheme({ mode: "neon", background: "#FFF" }).mode, "light");
});

test("modeFor derives light or dark from the background", () => {
  assert.equal(t.modeFor("#14110f"), "dark");
  assert.equal(t.modeFor("#fff8f2"), "light");
});
