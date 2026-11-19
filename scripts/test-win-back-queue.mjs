import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const q = loader()("src/lib/win-back-queue.ts");

test("parseLog ignores junk", () => {
  assert.deepEqual(q.parseLog(null), {});
  assert.deepEqual(q.parseLog("not json"), {});
  assert.deepEqual(q.parseLog("[1,2]"), {});
  assert.deepEqual(q.parseLog('{"a":"2026-11-19","b":3,"c":"ontem"}'), { a: "2026-11-19" });
});

test("contactedRecently covers 7 days including today", () => {
  const log = { a: "2026-11-19", b: "2026-11-13", c: "2026-11-12", d: "2026-11-20" };
  assert.equal(q.contactedRecently(log, "a", "2026-11-19"), true);
  assert.equal(q.contactedRecently(log, "b", "2026-11-19"), true);
  assert.equal(q.contactedRecently(log, "c", "2026-11-19"), false);
  assert.equal(q.contactedRecently(log, "d", "2026-11-19"), false); // future day (clock change) does not hide
  assert.equal(q.contactedRecently(log, "x", "2026-11-19"), false);
});

test("markContacted records today and prunes old entries", () => {
  const next = q.markContacted({ old: "2026-09-01", keep: "2026-11-01" }, "new", "2026-11-19");
  assert.deepEqual(next, { keep: "2026-11-01", new: "2026-11-19" });
});

test("nextInQueue skips recent and skipped", () => {
  const log = { a: "2026-11-18" };
  assert.equal(q.nextInQueue(["a", "b", "c"], log, new Set(["b"]), "2026-11-19"), 2);
  assert.equal(q.nextInQueue(["a", "b"], log, new Set(["b"]), "2026-11-19"), -1);
  assert.equal(q.nextInQueue([], {}, new Set(), "2026-11-19"), -1);
});

test("storage key is per restaurant", () => {
  assert.notEqual(q.storageKey("r1"), q.storageKey("r2"));
});

const t = loader()("src/lib/turnstile.ts");
const ok = (body) => async () => new Response(JSON.stringify(body), { status: 200 });

test("verifyHuman is off without a secret", async () => {
  await t.verifyHuman(undefined, null, { secret: "", siteKey: "" });
});
test("verifyHuman requires a token once configured", async () => {
  await assert.rejects(t.verifyHuman(undefined, null, { secret: "s", siteKey: "k", fetcher: ok({ success: true }) }), /HUMAN_CHECK_FAILED/);
  await assert.rejects(t.verifyHuman("", null, { secret: "s", siteKey: "k", fetcher: ok({ success: true }) }), /HUMAN_CHECK_FAILED/);
});
test("verifyHuman accepts success and rejects failure", async () => {
  let sent;
  await t.verifyHuman("tok", "1.2.3.4", {
    secret: "s", siteKey: "k",
    fetcher: async (_url, init) => {
      sent = init.body.toString();
      return new Response(JSON.stringify({ success: true }));
    },
  });
  assert.match(sent, /secret=s/);
  assert.match(sent, /remoteip=1.2.3.4/);
  await assert.rejects(t.verifyHuman("tok", null, { secret: "s", siteKey: "k", fetcher: ok({ success: false }) }), /HUMAN_CHECK_FAILED/);
});
test("verifyHuman reports an outage separately", async () => {
  await assert.rejects(
    t.verifyHuman("tok", null, { secret: "s", siteKey: "k", fetcher: async () => { throw new Error("down"); } }),
    /HUMAN_CHECK_UNAVAILABLE/,
  );
  await assert.rejects(
    t.verifyHuman("tok", null, { secret: "s", siteKey: "k", fetcher: async () => new Response("x", { status: 500 }) }),
    /HUMAN_CHECK_UNAVAILABLE/,
  );
});
test("verifyHuman with only one key set", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    await t.verifyHuman(undefined, null, { secret: "s", siteKey: "" }); // widget hidden: do not lock everyone out
    await assert.rejects(t.verifyHuman("tok", null, { secret: "", siteKey: "k" }), /HUMAN_CHECK_UNAVAILABLE/);
  } finally {
    console.error = quiet;
  }
});
test("verifyHuman rejects a token minted for another action", async () => {
  await assert.rejects(
    t.verifyHuman("tok", null, { secret: "s", siteKey: "k", fetcher: ok({ success: true, action: "login" }) }),
    /HUMAN_CHECK_FAILED/,
  );
  await t.verifyHuman("tok", null, { secret: "s", siteKey: "k", fetcher: ok({ success: true, action: "assinar" }) });
});
