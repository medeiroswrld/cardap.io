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
  const ch = await db.query("select round(contrast_ratio('#ff0000','#ffffff'),2) as r, round(contrast_ratio('#0000ff','#ffffff'),2) as b");
  assert.equal(Number(ch.rows[0].r), 4);
  assert.equal(Number(ch.rows[0].b), 8.59);
});

await ok("helper functions are not callable by anon", async () => {
  await anon();
  await rejects(() => db.query("select hex_luminance('#ffffff')"), "permission denied");
  await rejects(() => db.query("select contrast_ratio('#ffffff','#000000')"), "permission denied");
  await rejects(() => db.query("select valid_menu_theme($1,'{}'::jsonb)", [a]), "permission denied");
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

await ok("direct table updates cannot bypass theme validation", async () => {
  await login(ownerA);
  await rejects(() => db.query("update restaurants set menu_theme='{\"heading_font\":\"comic\"}' where id=$1", [a]), "restaurants_menu_theme_check");
  await rejects(() => db.query("update restaurants set menu_theme=$2 where id=$1", [a, JSON.stringify({ logo_url: "https://evil.example.com/x.webp" })]), "restaurants_menu_theme_check");
  await rejects(() => db.query("update restaurants set menu_theme=$2 where id=$1", [a, JSON.stringify({ text: "#eeeeee" })]), "restaurants_menu_theme_check");
  await db.query("update restaurants set menu_theme=$2 where id=$1", [a, JSON.stringify({ brand: "#123456" })]);
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
