import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "12000000-0000-4000-8000-0000000000a1",
  b = "12000000-0000-4000-8000-0000000000b1",
  ownerA = "22000000-0000-4000-8000-0000000000a1",
  ownerB = "22000000-0000-4000-8000-0000000000b1",
  staffA = "22000000-0000-4000-8000-0000000000a2";
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
await db.query("insert into auth.users values($1),($2),($3)", [ownerA, ownerB, staffA]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders) values($1,'Casa A','view-a',true),($2,'Casa B','view-b',true)",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);

await ok("new menus open in reels and anon can read the choice", async () => {
  await anon();
  const { rows } = await db.query("select menu_start_view from restaurants where id=$1", [a]);
  assert.equal(rows[0].menu_start_view, "reels");
});

await ok("only the owner switches the menu to the list", async () => {
  await login(staffA);
  await rejects(() => db.query("select set_menu_start_view($1,'lista')", [a]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select set_menu_start_view($1,'lista')", [a]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select set_menu_start_view($1,'grade')", [a]), "INVALID_INPUT");
  await db.query("select set_menu_start_view($1,'lista')", [a]);
  await root();
  const { rows } = await db.query("select menu_start_view from restaurants where id=$1", [a]);
  assert.equal(rows[0].menu_start_view, "lista");
});

await db.close();
console.log(`${count} menu view database checks passed.`);
