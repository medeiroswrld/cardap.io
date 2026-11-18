import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loader } from "./lib/ts-loader.mjs";

const { contrastRatio } = loader()("src/lib/menu-theme.ts");
const css = fs.readFileSync("src/app/globals.css", "utf8").replace(/\r\n/g, "\n");

// The two shared token blocks (management + customer menu without its own theme).
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `token block not found: ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = block('html[data-app="gestao"],\nhtml[data-app="site"],\nhtml[data-app="menu"]:not([data-own-theme])');
const dark = { ...light, ...block('html[data-app="gestao"][data-mode="dark"],\nhtml[data-app="site"][data-mode="dark"],\nhtml[data-app="menu"][data-mode="dark"]:not([data-own-theme])') };
const root = css.match(/:root\s*\{[^}]*\}/g).join("\n");
const rootVar = (name) => root.match(new RegExp(`${name}:\s*([^;]+);`))?.[1].trim();

function resolve(tokens, name) {
  let value = tokens[name] ?? rootVar(name);
  for (let i = 0; i < 4 && value?.startsWith("var("); i++) {
    const ref = value.slice(4, -1).trim();
    value = tokens[ref] ?? rootVar(ref);
  }
  assert.match(value ?? "", /^#[0-9a-f]{6}$/i, `${name} must resolve to a hex color`);
  return value;
}

const pairs = [
  ["--text", "--background"], ["--text", "--surface"], ["--text", "--surface-2"],
  ["--muted", "--background"], ["--muted", "--surface"], ["--muted", "--surface-2"],
  ["--brand-text", "--background"], ["--brand-text", "--surface"],
  ["--brand-contrast", "--brand"],
  ["--success-text", "--success-bg"], ["--warning-text", "--warning-bg"], ["--danger-text", "--danger-bg"],
];
for (const [mode, tokens] of [["light", light], ["dark", dark]]) {
  for (const [fg, bg] of pairs) {
    test(`${mode}: ${fg} on ${bg} is at least 4.5`, () => {
      const ratio = contrastRatio(resolve(tokens, fg), resolve(tokens, bg));
      assert.ok(ratio >= 4.5, `${fg} on ${bg} = ${ratio.toFixed(2)}`);
    });
  }
}
test("dark: --green on --background and --surface is at least 4.5", () => {
  for (const bg of ["--background", "--surface"]) {
    const ratio = contrastRatio(resolve(dark, "--green"), resolve(dark, bg));
    assert.ok(ratio >= 4.5, `--green on ${bg} = ${ratio.toFixed(2)}`);
  }
});
