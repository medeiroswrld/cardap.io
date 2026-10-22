import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
// Compile just the modules under test in memory; never load .env or call a service.
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {}; // build-time guard, not runtime code
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier.startsWith("."))
        return load(path.resolve(path.dirname(file), specifier + ".ts"));
      return require(specifier);
    };
    new Function("require", "module", "exports", source)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    );
    return loadedModule.exports;
  }
  return load;
}
const core = loader()("src/lib/observability/core.ts");
test("apiError returns safe status codes without exposing raw provider errors", async () => {
  const failures = [];
  const security = loader({
    "./observability/logger": {
      logFailure: (error) => failures.push(core.errorCode(error)),
    },
  })("src/lib/server-security.ts");
  const marker = "PRIVATE-provider-password@example.test";
  const response = security.apiError(new Error(marker));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes(marker));
  assert.equal(security.apiError(new Error("FORBIDDEN")).status, 403);
  assert.equal(
    security.apiError(new Error("VIDEO_STORAGE_UNAVAILABLE")).status,
    503,
  );
  assert.equal(failures.length, 3);
});
test("client errors carry only valid request references and reject invalid JSON even on HTTP 200", async () => {
  const client = loader()("src/lib/client-api.ts");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("not JSON", {
        headers: { "X-Request-ID": "fac30b12-9300-43e1-9a4d-8374fbe17a9a" },
      });
    await assert.rejects(
      client.requestJson("https://example.test"),
      (error) =>
        error instanceof client.ApiRequestError &&
        error.status === 200 &&
        Boolean(error.requestId),
    );
    globalThis.fetch = async () =>
      Response.json(
        { error: "Falha" },
        {
          status: 503,
          headers: { "X-Request-ID": "PRIVATE-invalid-reference" },
        },
      );
    await assert.rejects(
      client.requestJson("https://example.test"),
      (error) =>
        error.requestId === undefined && !error.message.includes("PRIVATE"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
const testUser = "73617b12-9300-43e1-9a4d-8374fbe17a9a";
const requestId = "fac30b12-9300-43e1-9a4d-8374fbe17a9a";
const secret =
  "SENTINEL-secret-password-token-+5511999999999-private@example.test";
function capture(level) {
  const lines = [];
  return {
    lines,
    logger: core.createSafeLogger(
      { write: (line) => lines.push(JSON.parse(line)) },
      level,
    ),
  };
}
test("JSON has four severity levels, stable metadata and a real level filter", () => {
  const { logger, lines } = capture();
  for (const level of ["info", "warn", "error", "fatal"])
    logger[level](
      "request.completed",
      { status: 200, durationMs: 1.7 },
      { requestId, action: "GET /api/catalog/[slug]" },
    );
  assert.deepEqual(
    lines.map((line) => line.level),
    ["info", "warn", "error", "fatal"],
  );
  assert.ok(
    lines.every(
      (line) =>
        line.requestId === requestId &&
        line.durationMs === 2 &&
        line.time &&
        line.service === "cardapio",
    ),
  );
  const filtered = capture("error");
  filtered.logger.info("server.started");
  filtered.logger.warn("server.error");
  filtered.logger.error("server.error");
  filtered.logger.fatal("server.fatal");
  assert.deepEqual(
    filtered.lines.map((line) => line.level),
    ["error", "fatal"],
  );
  const invalid = capture(secret);
  invalid.logger.info("server.started");
  assert.equal(invalid.lines.length, 1);
});
test("drops secrets, PII, free text, stacks, nested fields, queries and injected identifiers", () => {
  const { logger, lines } = capture();
  const error = new Error(secret, { cause: { token: secret } });
  const input = {
    password: secret,
    token: secret,
    email: secret,
    phone: secret,
    name: secret,
    headers: { authorization: secret, cookie: secret },
    body: { nested: [{ password: secret }] },
    error,
    err: error,
    stack: error.stack,
    operation: secret,
    errorCode: secret,
    status: secret,
    durationMs: Infinity,
    toJSON: () => {
      throw Error("must not execute");
    },
  };
  input.circular = input;
  logger.error(secret, input, {
    requestId: secret,
    userId: testUser,
    action: "GET /api/auth?code=" + secret,
  });
  const encoded = JSON.stringify(lines);
  assert.ok(!encoded.includes(secret));
  assert.ok(!encoded.includes(testUser));
  assert.deepEqual(
    Object.keys(lines[0]).sort(),
    ["action", "level", "msg", "service", "time"].sort(),
  );
  assert.equal(lines[0].msg, "server.error");
  logger.error(
    "server.error",
    Object.defineProperty({}, "operation", {
      get() {
        throw Error("must not read getter");
      },
    }),
  );
  assert.equal(lines.length, 2);
});
test("user identity is HMAC pseudonymized, stable per key and omitted without a dedicated key", () => {
  const id = core.pseudonym(testUser, "a".repeat(32));
  assert.match(id, /^usr_[a-f0-9]{64}$/);
  assert.equal(id, core.pseudonym(testUser, "a".repeat(32)));
  assert.notEqual(id, core.pseudonym(testUser, "b".repeat(32)));
  assert.equal(core.pseudonym(testUser, undefined), undefined);
  assert.equal(core.pseudonym(secret, "a".repeat(32)), undefined);
  const { logger, lines } = capture();
  logger.info("request.completed", {}, { userId: id });
  assert.equal(lines[0].userId, id);
});
test("error classification never serializes messages and distinguishes business errors from outages", () => {
  assert.equal(core.errorCode(new Error(secret)), "UNEXPECTED_ERROR");
  assert.equal(
    core.errorStatus(core.errorCode({ code: "42P01", message: secret })),
    500,
  );
  assert.equal(
    core.errorCode(new Error("FORBIDDEN " + secret)),
    "UNEXPECTED_ERROR",
  );
  for (const [message, status] of [
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["PRICE_CHANGED", 409],
    ["RATE_LIMITED", 429],
    ["INVALID_SETTINGS", 400],
    ["DATABASE_ERROR", 500],
    ["STREAM_AUTH_FAILED", 503],
  ])
    assert.equal(core.errorStatus(core.errorCode(new Error(message))), status);
  const { z } = require("zod");
  assert.equal(
    core.errorCode(z.uuid().safeParse(secret).error),
    "INVALID_INPUT",
  );
  assert.equal(
    core.errorCode(
      Object.defineProperty({}, "message", {
        get() {
          throw Error("getter");
        },
      }),
    ),
    "UNEXPECTED_ERROR",
  );
});
test("concurrent requests keep independent contexts, ignore incoming IDs and preserve cookies/body", async () => {
  const lines = [];
  const load = loader({
    "./core": {
      ...core,
      createSafeLogger: () =>
        core.createSafeLogger({
          write: (line) => lines.push(JSON.parse(line)),
        }),
    },
  });
  const runtime = load("src/lib/observability/logger.ts");
  const oldKey = process.env.LOG_HASH_KEY;
  process.env.LOG_HASH_KEY = "a".repeat(32);
  try {
    const users = [testUser, "93617b12-9300-43e1-9a4d-8374fbe17a9a"];
    const handler = runtime.withRequestLogging(
      "/api/auth",
      async (_request, user) => {
        runtime.setLogUser(user);
        await new Promise((resolve) =>
          setTimeout(resolve, user === testUser ? 15 : 1),
        );
        runtime.logger.info("request.completed", {
          operation: "supabase.auth",
        });
        const response = Response.json({ ok: true });
        response.headers.append("Set-Cookie", "first=test; HttpOnly");
        response.headers.append("Set-Cookie", "second=test; HttpOnly");
        return response;
      },
    );
    const responses = await Promise.all(
      users.map((user) =>
        handler(
          new Request("https://example.test/api/auth?code=" + secret, {
            method: "POST",
            headers: { "x-request-id": secret, authorization: secret },
          }),
          user,
        ),
      ),
    );
    const ids = responses.map((response) =>
      response.headers.get("X-Request-ID"),
    );
    assert.notEqual(ids[0], ids[1]);
    for (let index = 0; index < responses.length; index++) {
      assert.deepEqual(await responses[index].json(), { ok: true });
      assert.equal(responses[index].headers.getSetCookie().length, 2);
      const records = lines.filter((line) => line.requestId === ids[index]);
      assert.equal(records.length, 2);
      assert.ok(
        records.every(
          (line) =>
            line.userId === core.pseudonym(users[index], "a".repeat(32)) &&
            line.action === "POST /api/auth",
        ),
      );
    }
    assert.equal(runtime.hasRequestContext(), false);
    assert.ok(!JSON.stringify(lines).includes(secret));
  } finally {
    if (oldKey === undefined) delete process.env.LOG_HASH_KEY;
    else process.env.LOG_HASH_KEY = oldKey;
  }
});
test("uncaught failures become safe 500s, direct failures are logged, immutable redirects survive", async () => {
  const lines = [];
  const runtime = loader({
    "./core": {
      ...core,
      createSafeLogger: () =>
        core.createSafeLogger({
          write: (line) => lines.push(JSON.parse(line)),
        }),
    },
  })("src/lib/observability/logger.ts");
  const request = new Request("https://example.test");
  const failure = await runtime.withRequestLogging("/api/auth", async () => {
    throw new Error(secret);
  })(request);
  assert.equal(failure.status, 500);
  assert.ok(!(await failure.text()).includes(secret));
  const rejected = await runtime.withRequestLogging(
    "/api/auth",
    async () => new Response(null, { status: 403 }),
  )(request);
  assert.ok(
    lines.some(
      (line) =>
        line.requestId === rejected.headers.get("X-Request-ID") &&
        line.level === "warn",
    ),
  );
  const redirect = await runtime.withRequestLogging("/auth/confirm", async () =>
    Response.redirect("https://example.test/login"),
  )(request);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), "https://example.test/login");
  assert.ok(redirect.headers.get("X-Request-ID"));
  assert.ok(!JSON.stringify(lines).includes(secret));
});
test("every exported API method uses the wrapper with an allowlisted static route", () => {
  function walk(dir) {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(path.join(dir, entry.name))
          : [path.join(dir, entry.name)],
      );
  }
  let count = 0;
  for (const file of [
    ...walk("src/app/api"),
    "src/app/auth/confirm/route.ts",
  ].filter((file) => file.endsWith("route.ts"))) {
    const source = fs.readFileSync(file, "utf8");
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of tree.statements) {
      if (
        !statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        )
      )
        continue;
      assert.ok(
        ts.isVariableStatement(statement),
        "Export must be wrapped: " + file,
      );
      for (const decl of statement.declarationList.declarations) {
        const call = decl.initializer;
        assert.ok(
          ts.isCallExpression(call) &&
            call.expression.getText(tree) === "withRequestLogging",
          file,
        );
        assert.equal(
          core.safeAction(decl.name.getText(tree), call.arguments[0].text),
          `${decl.name.getText(tree)} ${call.arguments[0].text}`,
        );
        count++;
      }
    }
  }
  assert.equal(count, 21);
});

test("rate-limit identity ignores untrusted forwarding and never stores raw identifiers", () => {
  const identity = loader()("src/lib/rate-limit-identity.ts");
  const headers = new Headers({
    "x-forwarded-for": "1.2.3.4",
    "x-vercel-forwarded-for": "2001:db8::1",
  });
  assert.equal(identity.rateLimitAddress(headers, false), "shared-origin");
  assert.equal(identity.rateLimitAddress(headers, true), "[2001:db8::1]");
  assert.equal(
    identity.rateLimitAddress(
      new Headers({ "x-vercel-forwarded-for": "1.2.3.4, 5.6.7.8" }),
      true,
    ),
    "shared-origin",
  );
  const value = identity.rateLimitHash(
    "a".repeat(32),
    "restaurant-a",
    "order",
    "1.2.3.4",
  );
  assert.match(value, /^[a-f0-9]{64}$/);
  assert.notEqual(
    value,
    identity.rateLimitHash("a".repeat(32), "restaurant-b", "order", "1.2.3.4"),
  );
  assert.throws(
    () => identity.rateLimitHash(undefined, "a", "order", "ip"),
    /RATE_LIMIT_UNAVAILABLE/,
  );
});
test("rate limiter is fail-closed and returns Retry-After on rejection", async () => {
  const old = process.env.RATE_LIMIT_HASH_KEY;
  process.env.RATE_LIMIT_HASH_KEY = "k".repeat(32);
  let result = { data: { allowed: false, retryAfter: 123 }, error: null };
  const runtime = loader({
    "./supabase/server": { serviceClient: () => ({ rpc: async () => result }) },
    "./observability/logger": {
      logger: { error: () => {} },
      logFailure: () => {},
    },
  });
  const limiter = runtime("src/lib/rate-limit.ts");
  const security = runtime("src/lib/server-security.ts");
  try {
    let failure;
    try {
      await limiter.enforcePublicLimit(
        new Request("https://example.test"),
        "tenant",
        "order",
      );
    } catch (error) {
      failure = error;
    }
    const response = security.apiError(failure);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "123");
    result = { data: null, error: { message: "DATABASE PRIVATE FAILURE" } };
    await assert.rejects(
      limiter.enforcePublicLimit(
        new Request("https://example.test"),
        "tenant",
        "order",
      ),
      /RATE_LIMIT_UNAVAILABLE/,
    );
  } finally {
    if (old === undefined) delete process.env.RATE_LIMIT_HASH_KEY;
    else process.env.RATE_LIMIT_HASH_KEY = old;
  }
});
