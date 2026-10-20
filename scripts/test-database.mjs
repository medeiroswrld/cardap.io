import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
let count = 0;
// Supabase-owned schemas/roles are represented locally; business SQL is unchanged.
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 -- Test-only digest stand-in: PGlite lacks pgcrypto. Cryptography is not tested here.
 create function extensions.digest(text,text) returns bytea language sql immutable as $$select convert_to(md5($1),'UTF8')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
`);
for (const file of [
  "001_foundation.sql",
  "002_connected_management.sql",
  "003_video_observations.sql",
  "004_cart_associations.sql",
  "005_video_storage.sql",
  "006_photo_observations.sql",
  "007_product_options.sql",
  "008_product_feedback.sql",
]) {
  const sql = readFileSync(
    new URL("../supabase/migrations/" + file, import.meta.url),
    "utf8",
  )
    .replace("create extension if not exists pgcrypto;", "")
    .replace(
      "alter publication supabase_realtime add table public.orders;",
      "",
    );
  await db.exec(sql);
}
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  ownerA = "20000000-0000-4000-8000-000000000001",
  ownerB = "20000000-0000-4000-8000-000000000002",
  staff = "20000000-0000-4000-8000-000000000003",
  ca = "30000000-0000-4000-8000-000000000001",
  cb = "30000000-0000-4000-8000-000000000002",
  pa = "40000000-0000-4000-8000-000000000001",
  pb = "40000000-0000-4000-8000-000000000002",
  ga = "50000000-0000-4000-8000-000000000001",
  table = "60000000-0000-4000-8000-000000000001",
  media = "70000000-0000-4000-8000-000000000001",
  version = "80000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users values($1),($2),($3)", [
  ownerA,
  ownerB,
  staff,
]);
await db.query(
  "insert into restaurants(id,name,slug,accepting_orders,opening_hours) values($1,'Casa A','casa-a',true,$3),($2,'Casa B','casa-b',true,$3)",
  [
    a,
    b,
    JSON.stringify(
      Array.from({ length: 7 }, (_, day) => ({
        day,
        open: "00:00",
        close: "23:59:59",
      })),
    ),
  ],
);
await db.query(
  "insert into restaurant_members values($1,$2,'owner'),($3,$4,'owner'),($1,$5,'operations')",
  [a, ownerA, b, ownerB, staff],
);
await db.query(
  "insert into categories(id,restaurant_id,name) values($1,$2,'Categoria A'),($3,$4,'Categoria B')",
  [ca, a, cb, b],
);
await db.query(
  "insert into products(id,restaurant_id,category_id,name,price_cents,published) values($1,$2,$3,'Prato A',2500,true),($4,$5,$6,'Prato B',3000,false)",
  [pa, a, ca, pb, b, cb],
);
await db.query(
  "insert into dining_tables(id,restaurant_id,number) values($1,$2,1)",
  [table, a],
);
await db.query(
  "insert into guest_sessions(id,restaurant_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 hour')",
  [ga, a, "a".repeat(64)],
);
async function ok(name, fn) {
  await fn();
  console.log("PASS " + name);
  count++;
}
async function login(user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function root() {
  await db.exec("reset role");
}
async function rejected(fn, pattern) {
  await assert.rejects(fn, pattern);
}
const payload = {
  table_id: table,
  name: "Pessoa de teste",
  phone: "11999990001",
  marketing_consent: false,
  items: [
    { product_id: pa, quantity: 2, expected_price: 2500, note: "Sem cebola" },
  ],
};
const place = async (key, body = payload) => {
  const result = await db.query(
    "select place_guest_order($1,$2,$3,$4) as result",
    [a, "a".repeat(64), key, JSON.stringify(body)],
  );
  return result.rows[0].result;
};
let order;
await ok("tenant owner cannot see other draft catalog", async () => {
  await login(ownerA);
  const { rows } = await db.query(
    "select id from products where restaurant_id=$1",
    [b],
  );
  assert.equal(rows.length, 0);
});
await ok("cross-tenant writes rejected by RLS", async () => {
  await rejected(
    () =>
      db.query(
        "insert into categories(restaurant_id,name) values($1,'Intrusão')",
        [b],
      ),
    /row-level security/,
  );
});
await ok("cross-tenant foreign keys rejected", async () => {
  await root();
  await rejected(
    () =>
      db.query(
        "insert into products(restaurant_id,category_id,name,price_cents) values($1,$2,'Inválido',100)",
        [a, cb],
      ),
    /foreign key/,
  );
});
await ok("order uses frozen server prices and exact totals", async () => {
  order = await place("90000000-0000-4000-8000-000000000001");
  assert.equal(order.total_cents, 5000);
  const { rows } = await db.query(
    "select quantity,unit_price_cents from order_items where order_id=$1",
    [order.id],
  );
  assert.deepEqual(rows, [{ quantity: 2, unit_price_cents: 2500 }]);
});
await ok("repeated order key returns same persisted order", async () => {
  const repeated = await place("90000000-0000-4000-8000-000000000001");
  assert.equal(repeated.id, order.id);
});
await ok("same key with changed payload rejected", () =>
  rejected(
    () =>
      place("90000000-0000-4000-8000-000000000001", {
        ...payload,
        name: "Outra pessoa",
      }),
    /IDEMPOTENCY_CONFLICT/,
  ),
);
await ok("stale price rolls back full order", async () => {
  await rejected(
    () =>
      place("90000000-0000-4000-8000-000000000002", {
        ...payload,
        items: [{ ...payload.items[0], expected_price: 1 }],
      }),
    /PRICE_CHANGED/,
  );
  assert.equal(
    (await db.query("select count(*)::int n from orders")).rows[0].n,
    1,
  );
});
await ok("order cannot include product from another tenant", () =>
  rejected(
    () =>
      place("90000000-0000-4000-8000-000000000003", {
        ...payload,
        items: [{ ...payload.items[0], product_id: pb }],
      }),
    /UNAVAILABLE/,
  ),
);
await ok("paused restaurant rejects new orders", async () => {
  await db.query("update restaurants set accepting_orders=false where id=$1", [
    a,
  ]);
  await rejected(() => place("90000000-0000-4000-8000-000000000004"), /CLOSED/);
  await db.query("update restaurants set accepting_orders=true where id=$1", [
    a,
  ]);
});
await ok("operations cannot read marketing contacts", async () => {
  await login(staff);
  assert.equal((await db.query("select * from contacts")).rows.length, 0);
});
await ok("operations cannot edit catalog", async () => {
  const { rows } = await db.query(
    "update products set price_cents=1 where id=$1 returning id",
    [pa],
  );
  assert.equal(rows.length, 0);
});
await ok("operations can advance assigned tenant order", async () => {
  const { rows } = await db.query(
    "select advance_order($1,$2,'recebido','em_preparo',null,15) as result",
    [a, order.id],
  );
  assert.equal(rows[0].result.status, "em_preparo");
});
await ok("stale status transition rejected", () =>
  rejected(
    () =>
      db.query("select advance_order($1,$2,'recebido','em_preparo')", [
        a,
        order.id,
      ]),
    /STALE_ORDER/,
  ),
);
await ok("cancel requires reason", () =>
  rejected(
    () =>
      db.query("select advance_order($1,$2,'em_preparo','cancelado','')", [
        a,
        order.id,
      ]),
    /INVALID_TRANSITION/,
  ),
);
await ok("another owner cannot read or mutate orders", async () => {
  await login(ownerB);
  assert.equal((await db.query("select * from orders")).rows.length, 0);
  await rejected(
    () =>
      db.query("select advance_order($1,$2,'em_preparo','pronto')", [
        a,
        order.id,
      ]),
    /FORBIDDEN/,
  );
});
await ok("revoked consent cannot be restored by anonymous signup", async () => {
  await login(ownerA);
  await db.query(
    "select revoke_marketing($1,(select id from contacts where restaurant_id=$1 limit 1))",
    [a],
  );
  await root();
  await db.query("select subscribe_guest($1,$2,$3,$4)", [
    a,
    "a".repeat(64),
    "Outro nome",
    payload.phone,
  ]);
  const c = (
    await db.query(
      "select name,marketing_status from contacts where restaurant_id=$1",
      [a],
    )
  ).rows[0];
  assert.equal(c.name, payload.name);
  assert.equal(c.marketing_status, "revoked");
});
await ok(
  "category migration preserves product references atomically",
  async () => {
    await login(ownerA);
    const c = (
      await db.query(
        "insert into categories(restaurant_id,name) values($1,'Nova categoria') returning id",
        [a],
      )
    ).rows[0].id;
    await db.query("select move_and_remove_category($1,$2,$3)", [a, ca, c]);
    assert.equal(
      (await db.query("select category_id from products where id=$1", [pa]))
        .rows[0].category_id,
      c,
    );
  },
);
await ok(
  "settings deactivate tables without deleting order references",
  async () => {
    await db.query("select save_restaurant_settings($1,$2,2)", [
      a,
      JSON.stringify({
        name: "Casa A",
        subtitle: "Comida",
        phone: "",
        address: "",
        privacy_email: "test@example.test",
        retention_days: 90,
        accepting_orders: true,
        opening_hours: [{ day: 1, open: "18:00", close: "23:00" }],
      }),
    ]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from dining_tables where active and restaurant_id=$1",
          [a],
        )
      ).rows[0].n,
      2,
    );
  },
);
await root();
await db.query(
  "insert into product_media(id,restaurant_id,product_id,kind,version,state,duration_seconds) values($1,$2,$3,'video',$4,'ready',10)",
  [media, a, pa, version],
);
const view = {
  id: "a0000000-0000-4000-8000-000000000001",
  media_id: media,
  version,
  product_id: pa,
  sequence: 1,
  position: 0,
  watched_seconds: 3,
  segments: [[0, 3]],
};
const observe = (body) =>
  db.query("select record_video_view($1,$2,$3)", [
    a,
    "a".repeat(64),
    JSON.stringify(body),
  ]);
await ok("video observation records qualified unique coverage", async () => {
  await observe(view);
  const v = (
    await db.query(
      "select watched_seconds::float,coverage::float,qualified from video_view_sessions",
    )
  ).rows[0];
  assert.equal(v.watched_seconds, 3);
  assert.equal(v.coverage, 0.3);
  assert.equal(v.qualified, true);
});
await ok("video retries are deduplicated by sequence", async () => {
  await observe(view);
  assert.equal(
    (await db.query("select count(*)::int n from video_view_sessions")).rows[0]
      .n,
    1,
  );
});
await ok("forged video intervals rejected", () =>
  rejected(
    () => observe({ ...view, sequence: 2, watched_seconds: 500 }),
    /INVALID_INTERVAL/,
  ),
);
await ok("wrong media version rejected", () =>
  rejected(
    () => observe({ ...view, version: "80000000-0000-4000-8000-000000000002" }),
    /INVALID_MEDIA/,
  ),
);
await ok(
  "cart events deduplicate and associate with qualified video and order",
  async () => {
    const event = "b0000000-0000-4000-8000-000000000001";
    await db.query("select record_cart_add($1,$2,$3,$4)", [
      a,
      "a".repeat(64),
      event,
      pa,
    ]);
    await db.query("select record_cart_add($1,$2,$3,$4)", [
      a,
      "a".repeat(64),
      event,
      pa,
    ]);
    assert.equal(
      (await db.query("select count(*)::int n from cart_add_events")).rows[0].n,
      1,
    );
    await login(ownerA);
    const row = (await db.query("select * from video_associations($1,30)", [a]))
      .rows[0];
    assert.equal(Number(row.viewer_sessions), 1);
    assert.equal(Number(row.cart_sessions), 1);
    assert.equal(Number(row.order_sessions), 1);
  },
);
await ok("association report rejects other tenant owner", async () => {
  await login(ownerB);
  await rejected(
    () => db.query("select * from video_associations($1,30)", [a]),
    /FORBIDDEN/,
  );
});
await db.exec("reset role");
await db.query("update products set photo_url=$1 where id=$2", [
  "https://example.test/photo.jpg",
  pa,
]);
const photoView = {
  id: "c0000000-0000-4000-8000-000000000001",
  product_id: pa,
  photo_url: "https://example.test/photo.jpg",
  sequence: 1,
  visible_seconds: 3,
};
const observePhoto = (body) =>
  db.query("select record_photo_view($1,$2,$3)", [
    a,
    "a".repeat(64),
    JSON.stringify(body),
  ]);
await ok("photo observation qualifies and deduplicates retries", async () => {
  await observePhoto(photoView);
  await observePhoto(photoView);
  const rows = (
    await db.query(
      "select visible_seconds::float,qualified from photo_view_sessions",
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].visible_seconds, 3);
  assert.equal(rows[0].qualified, true);
});
await ok("forged photo interval rejected", () =>
  rejected(
    () => observePhoto({ ...photoView, sequence: 2, visible_seconds: 500 }),
    /INVALID_INTERVAL/,
  ),
);
await ok("different photo rejected", () =>
  rejected(
    () =>
      observePhoto({
        ...photoView,
        photo_url: "https://example.test/forged.jpg",
      }),
    /INVALID_PHOTO/,
  ),
);
await ok("foreign product rejected for photo metrics", () =>
  rejected(
    () => observePhoto({ ...photoView, product_id: pb }),
    /INVALID_PHOTO/,
  ),
);
await ok("photo report associates same session cart and order", async () => {
  await login(ownerA);
  const row = (await db.query("select * from photo_associations($1,30)", [a]))
    .rows[0];
  assert.equal(Number(row.viewer_sessions), 1);
  assert.equal(Number(row.cart_sessions), 1);
  assert.equal(Number(row.order_sessions), 1);
});
await ok("photo data and report isolated by owner", async () => {
  await login(ownerB);
  assert.equal(
    (await db.query("select * from photo_view_sessions")).rows.length,
    0,
  );
  await rejected(
    () => db.query("select * from photo_associations($1,30)", [a]),
    /FORBIDDEN/,
  );
  await rejected(() => observePhoto(photoView), /permission denied/);
});

const extra = "a0000000-0000-4000-8000-000000000001";
const foreignExtra = "a0000000-0000-4000-8000-000000000002";
const optionKey = "b0000000-0000-4000-8000-000000000001";
const saveExtra = (
  tenant = a,
  id = extra,
  ids = [pa],
  price = 500,
  active = true,
) =>
  db.query("select save_product_option($1,$2,$3,$4,$5,$6)", [
    tenant,
    id,
    "Queijo extra",
    price,
    active,
    ids,
  ]);
await ok("owner creates an option and product links atomically", async () => {
  await login(ownerA);
  await saveExtra();
  await db.query(
    "update products set removable_ingredients=array['Cebola','Tomate'] where id=$1",
    [pa],
  );
  assert.equal(
    (
      await db.query("select * from product_option_links where option_id=$1", [
        extra,
      ])
    ).rows.length,
    1,
  );
});
await ok("foreign product assignment rolls back price and links", async () => {
  await rejected(() => saveExtra(a, extra, [pa, pb], 900), /INVALID_PRODUCTS/);
  assert.equal(
    (
      await db.query("select price_cents from product_options where id=$1", [
        extra,
      ])
    ).rows[0].price_cents,
    500,
  );
  assert.equal(
    (
      await db.query("select * from product_option_links where option_id=$1", [
        extra,
      ])
    ).rows.length,
    1,
  );
});
await ok("operations and foreign owner cannot edit options", async () => {
  await login(staff);
  await rejected(() => saveExtra(), /FORBIDDEN/);
  await login(ownerB);
  await rejected(() => saveExtra(), /FORBIDDEN/);
  await saveExtra(b, foreignExtra, [pb]);
  await root();
});
await root();
await db.query("update restaurants set opening_hours=$2 where id=$1", [
  a,
  JSON.stringify(
    Array.from({ length: 7 }, (_, day) => ({
      day,
      open: "00:00",
      close: "23:59:59",
    })),
  ),
]);
await db.query("update dining_tables set active=true where id=$1", [table]);
const custom = {
  ...payload,
  items: [
    {
      ...payload.items[0],
      expected_price: 3000,
      option_ids: [extra],
      removed_ingredients: ["Cebola"],
    },
  ],
};
await ok(
  "server prices extras per unit and freezes removals and names",
  async () => {
    const result = await place(optionKey, custom);
    assert.equal(result.total_cents, 6000);
    const row = (
      await db.query("select * from order_items where order_id=$1", [result.id])
    ).rows[0];
    assert.equal(row.unit_price_cents, 3000);
    assert.deepEqual(row.removed_ingredients, ["Cebola"]);
    assert.deepEqual(row.add_ons, [
      { id: extra, name: "Queijo extra", price_cents: 500 },
    ]);
  },
);
await ok(
  "tampered extra total and invalid removals reject whole order",
  async () => {
    const key = "b0000000-0000-4000-8000-000000000002";
    await rejected(
      () =>
        place(key, {
          ...custom,
          items: [{ ...custom.items[0], expected_price: 2500 }],
        }),
      /PRICE_CHANGED/,
    );
    await rejected(
      () =>
        place(key, {
          ...custom,
          items: [{ ...custom.items[0], removed_ingredients: ["Carne"] }],
        }),
      /OPTIONS_CHANGED/,
    );
    await rejected(
      () =>
        place(key, {
          ...custom,
          items: [
            { ...custom.items[0], removed_ingredients: ["Cebola", "Cebola"] },
          ],
        }),
      /OPTIONS_CHANGED/,
    );
    await rejected(
      () =>
        place(key, {
          ...custom,
          items: [{ ...custom.items[0], option_ids: [extra, extra] }],
        }),
      /OPTIONS_CHANGED/,
    );
    await rejected(
      () =>
        place(key, {
          ...custom,
          items: [{ ...custom.items[0], option_ids: [foreignExtra] }],
        }),
      /OPTIONS_CHANGED/,
    );
  },
);
await ok(
  "unlinked, paused and repriced extras cannot silently change a cart",
  async () => {
    const key = "b0000000-0000-4000-8000-000000000003";
    await login(ownerA);
    await saveExtra(a, extra, []);
    await root();
    await rejected(() => place(key, custom), /OPTIONS_CHANGED/);
    await login(ownerA);
    await saveExtra(a, extra, [pa], 500, false);
    await root();
    await rejected(() => place(key, custom), /OPTIONS_CHANGED/);
    await login(ownerA);
    await saveExtra(a, extra, [pa], 700, true);
    await root();
    await rejected(() => place(key, custom), /PRICE_CHANGED/);
    const repeated = await place(optionKey, custom);
    assert.equal(repeated.total_cents, 6000);
    const row = (
      await db.query("select add_ons from order_items where order_id=$1", [
        repeated.id,
      ])
    ).rows[0];
    assert.equal(row.add_ons[0].price_cents, 500);
    await rejected(
      () =>
        place(optionKey, {
          ...custom,
          items: [{ ...custom.items[0], removed_ingredients: [] }],
        }),
      /IDEMPOTENCY_CONFLICT/,
    );
  },
);
await ok(
  "free options add no charge and removals never discount the base",
  async () => {
    await login(ownerA);
    await saveExtra(a, extra, [pa], 0, true);
    await root();
    const result = await place("b0000000-0000-4000-8000-000000000004", {
      ...custom,
      items: [{ ...custom.items[0], expected_price: 2500 }],
    });
    assert.equal(result.total_cents, 5000);
  },
);
const feedback = (tenant = a, token = "a".repeat(64), product = pa) =>
  db
    .query("select read_guest_feedback($1,$2,$3) as result", [
      tenant,
      product,
      token,
    ])
    .then((r) => r.rows[0].result);
const saveFeedback = (
  tenant = a,
  token = "a".repeat(64),
  product = pa,
  liked = true,
  comment = "Muito bom!",
) =>
  db.query("select save_guest_feedback($1,$2,$3,$4,$5,$6)", [
    tenant,
    token,
    order.id,
    product,
    liked,
    comment,
  ]);
await ok("feedback requires a delivered order owned by the guest", async () => {
  await root();
  await db.query(
    "update guest_sessions set expires_at=now()+interval '1 hour' where id=$1",
    [ga],
  );
  for (const status of ["recebido", "em_preparo", "pronto", "cancelado"]) {
    await db.query("update orders set status=$1 where id=$2", [
      status,
      order.id,
    ]);
    await rejected(() => saveFeedback(), /DELIVERED_PURCHASE_REQUIRED/);
  }
  await db.query("update orders set status='entregue' where id=$1", [order.id]);
  await rejected(() => saveFeedback(a, "z".repeat(64)), /SESSION_EXPIRED/);
  await rejected(() => saveFeedback(b), /SESSION_EXPIRED/);
  await rejected(
    () => saveFeedback(a, "a".repeat(64), pb),
    /DELIVERED_PURCHASE_REQUIRED/,
  );
  await db.query(
    "insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
    [a, "f".repeat(64)],
  );
  await rejected(
    () => saveFeedback(a, "f".repeat(64)),
    /DELIVERED_PURCHASE_REQUIRED/,
  );
});
await ok(
  "feedback retries and edits never inflate likes; public output omits identity",
  async () => {
    await db.query(
      "update products set published=true, archived=false where id=$1",
      [pa],
    );
    await saveFeedback();
    await saveFeedback();
    let data = await feedback();
    assert.equal(data.likes, 1);
    assert.equal(data.commentCount, 1);
    assert.ok(data.eligibleOrderId);
    assert.equal(data.mine.comment, "Muito bom!");
    data = await feedback(a, null);
    assert.equal(data.eligibleOrderId, null);
    assert.equal(data.mine, null);
    assert.deepEqual(Object.keys(data.comments[0]).sort(), [
      "comment",
      "id",
      "liked",
      "updated_at",
    ]);
    assert.ok(!JSON.stringify(data).includes("1199999"));
    await saveFeedback(a, "a".repeat(64), pa, false, "Poderia melhorar.");
    data = await feedback();
    assert.equal(data.likes, 0);
    assert.equal(data.commentCount, 1);
    await saveFeedback(a, "a".repeat(64), pa, false, "");
    data = await feedback();
    assert.equal(data.commentCount, 0);
  },
);
await ok(
  "feedback is isolated by RLS and cannot be forged directly",
  async () => {
    await login(ownerB);
    assert.equal(
      (
        await db.query(
          "select * from product_feedback where restaurant_id=$1",
          [a],
        )
      ).rows.length,
      0,
    );
    await rejected(() => saveFeedback(), /permission denied/);
    await login(ownerA);
    assert.equal(
      (
        await db.query(
          "select * from product_feedback where restaurant_id=$1",
          [a],
        )
      ).rows.length,
      1,
    );
    await rejected(
      () => db.query("update product_feedback set liked=true"),
      /permission denied/,
    );
    await db.exec("set role anon");
    await rejected(
      () => db.query("select * from product_feedback"),
      /permission denied/,
    );
    await rejected(() => feedback(), /permission denied/);
    await root();
  },
);
await ok(
  "expired sessions cannot review; Google invite does not depend on positive feedback",
  async () => {
    await rejected(
      () =>
        db.query(
          "update restaurants set google_review_url='https://evil.test' where id=$1",
          [a],
        ),
      /check constraint/,
    );
    await db.query(
      "update restaurants set google_review_url='https://g.page/r/test/review' where id=$1",
      [a],
    );
    assert.equal(
      (await feedback()).googleReviewUrl,
      "https://g.page/r/test/review",
    );
    await db.query(
      "update guest_sessions set expires_at=now()-interval '1 minute' where id=$1",
      [ga],
    );
    await rejected(() => saveFeedback(), /SESSION_EXPIRED/);
    assert.equal((await feedback()).eligibleOrderId, null);
    assert.equal((await feedback()).googleReviewUrl, "");
  },
);
await db.close();
console.log(
  `${count} database checks passed. Supabase Auth, Storage, Realtime and pgcrypto still require hosted validation.`,
);
