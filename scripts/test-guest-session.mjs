import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const session = loader()("src/lib/guest-session.ts");

test("a created guest session is reused instead of POSTing again", async () => {
  await session.ensureGuestSession("r1");
  await session.ensureGuestSession("r1");
  await Promise.all([session.ensureGuestSession("r1"), session.ensureGuestSession("r1")]);
  assert.equal(calls.filter((u) => u.includes("/r1/session")).length, 1);
});

test("the session is created again after 30 minutes or when forgotten", async () => {
  await session.ensureGuestSession("r2");
  await session.ensureGuestSession("r2", Date.now() + 31 * 60 * 1000);
  assert.equal(calls.filter((u) => u.includes("/r2/session")).length, 2);
  session.forgetGuestSession("r2");
  await session.ensureGuestSession("r2");
  assert.equal(calls.filter((u) => u.includes("/r2/session")).length, 3);
});
