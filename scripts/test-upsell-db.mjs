import assert from "node:assert/strict";
import { createTestDatabase } from "./lib/test-db.mjs";

const db = await createTestDatabase();
let count = 0;
const a = "11000000-0000-4000-8000-0000000000a1",
  b = "11000000-0000-4000-8000-0000000000b1",
  ownerA = "21000000-0000-4000-8000-0000000000a1",
  ownerB = "21000000-0000-4000-8000-0000000000b1",
  staffA = "21000000-0000-4000-8000-0000000000a2",
  cat = "31000000-0000-4000-8000-0000000000a1",
  catB = "31000000-0000-4000-8000-0000000000b1",
  p1 = "41000000-0000-4000-8000-000000000001",
  p2 = "41000000-0000-4000-8000-000000000002",
  p3 = "41000000-0000-4000-8000-000000000003",
  p4 = "41000000-0000-4000-8000-000000000004",
  pB = "41000000-0000-4000-8000-0000000000b1",
  combo = "a1000000-0000-4000-8000-000000000001",
  paused = "a1000000-0000-4000-8000-000000000002";

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
  "insert into restaurants(id,name,slug,accepting_orders) values($1,'Casa A','upsell-a',true),($2,'Casa B','upsell-b',true)",
  [a, b],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staffA],
);
await db.query("insert into categories(id,restaurant_id,name) values($1,$2,'Lanches'),($3,$4,'Outros')", [cat, a, catB, b]);
await db.query(
  `insert into products(id,restaurant_id,category_id,name,price_cents,published) values
   ($1,$5,$6,'Burger',2500,true),($2,$5,$6,'Batata',1200,true),($3,$5,$6,'Refri',700,true),($4,$5,$6,'Velho',900,true),
   ($7,$8,$9,'Outro',1000,true)`,
  [p1, p2, p3, p4, a, cat, pB, b, catB],
);
await db.query(
  "insert into product_options(id,restaurant_id,name,price_cents,active) values($1,$3,'Combo batata + refri',790,true),($2,$3,'Antigo',100,false)",
  [combo, paused, a],
);

await ok("options start without bag offer and only the owner turns it on", async () => {
  await root();
  assert.equal((await db.query("select offer_in_bag from product_options where id=$1", [combo])).rows[0].offer_in_bag, false);
  await login(staffA);
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]), "FORBIDDEN");
  await login(ownerB);
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]), "FORBIDDEN");
  await rejects(() => db.query("select set_option_offer_in_bag($1,$2,true)", [b, combo]), "NOT_FOUND");
  await login(ownerA);
  await db.query("select set_option_offer_in_bag($1,$2,true)", [a, combo]);
  await db.query("select set_option_offer_in_bag($1,$2,true)", [a, paused]);
  await root();
  assert.equal((await db.query("select offer_in_bag from product_options where id=$1", [combo])).rows[0].offer_in_bag, true);
});

await ok("anon sees the bag offer flag only on active options", async () => {
  await anon();
  const { rows } = await db.query("select id,offer_in_bag from product_options where restaurant_id=$1 order by name", [a]);
  assert.deepEqual(rows, [{ id: combo, offer_in_bag: true }]);
});

await ok("owner saves up to 3 own products as bag suggestions", async () => {
  await login(staffA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2]]), "FORBIDDEN");
  await login(ownerA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p1, p2, p3, p4]]), "INVALID_PRODUCTS");
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2, p2]]), "INVALID_PRODUCTS");
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p2, pB]]), "INVALID_PRODUCTS");
  await db.query("select save_bag_suggestions($1,$2)", [a, [p2, p3]]);
  await anon();
  const { rows } = await db.query("select bag_suggestions from restaurants where id=$1", [a]);
  assert.deepEqual(rows[0].bag_suggestions, [p2, p3]);
});

await ok("archived products cannot be suggested and an empty list clears", async () => {
  await root();
  await db.query("update products set archived=true where id=$1", [p4]);
  await login(ownerA);
  await rejects(() => db.query("select save_bag_suggestions($1,$2)", [a, [p4]]), "INVALID_PRODUCTS");
  await db.query("select save_bag_suggestions($1,$2)", [a, []]);
  await root();
  assert.deepEqual((await db.query("select bag_suggestions from restaurants where id=$1", [a])).rows[0].bag_suggestions, []);
});

await db.close();
console.log(`${count} upsell database checks passed.`);
