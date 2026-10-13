import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the real route with only its external auth service replaced.
// No recovery email is sent and no real account is modified.
const require = createRequire(import.meta.url);
const code = ts.transpileModule(
  readFileSync(
    new URL("../src/app/api/auth/route.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

async function recover(error) {
  const exports = {};
  const calls = [];
  vm.runInNewContext(code, {
    exports,
    Response,
    process: { env: { NEXT_PUBLIC_APP_URL: "https://app.example.test" } },
    require(name) {
      if (name === "@/lib/supabase/server")
        return {
          serverClient: async () => ({
            auth: {
              resetPasswordForEmail: async (...args) => {
                calls.push(args);
                return { error };
              },
            },
          }),
        };
      if (name === "@/lib/server-security")
        return {
          checkOrigin: () => {},
          noStore: { "Cache-Control": "no-store" },
          apiError: () =>
            Response.json({ error: "Unexpected failure" }, { status: 500 }),
        };
      return require(name);
    },
  });
  const response = await exports.POST(
    new Request("https://app.example.test/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: "recover", email: "person@example.test" }),
    }),
  );
  return { response, body: await response.json(), calls };
}

test("provider rejection cannot be reported as successful recovery", async () => {
  for (const code of [
    "email_address_not_authorized",
    "over_email_send_rate_limit",
    "unexpected_failure",
  ]) {
    const result = await recover({
      code,
      message: "Sensitive provider detail",
    });
    assert.equal(result.response.status, 503);
    assert.equal(result.body.ok, undefined);
    assert.match(result.body.error, /Não foi possível solicitar/);
    assert.doesNotMatch(
      JSON.stringify(result.body),
      /Sensitive provider detail|person@example/,
    );
    assert.equal(result.response.headers.get("cache-control"), "no-store");
  }
});

test("recovery preserves account privacy and the production redirect", async () => {
  const accepted = await recover(null);
  const unknown = await recover({ code: "user_not_found" });
  assert.equal(accepted.response.status, 200);
  assert.equal(unknown.response.status, 200);
  assert.deepEqual(accepted.body, unknown.body);
  assert.equal(
    accepted.calls[0][1].redirectTo,
    "https://app.example.test/auth/confirm?next=/redefinir-senha",
  );
});
