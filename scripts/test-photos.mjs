import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { runFfmpeg } from "./prepare-pilot-media.mjs";
import { planPhotoConversions, convertToWebp } from "./optimize-existing-photos.mjs";

function compiled(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test("large photos become ≤1080 px WebP; small efficient photos stay untouched", async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async (code) => {
      const exports = {};
      new Function("exports", code)(exports);
      async function make(width, height, type, quality) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#b3261e");
        gradient.addColorStop(1, "#f7c948");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 400; i++) {
          ctx.fillStyle = `hsl(${i % 360} 70% 50%)`;
          ctx.fillRect((i * 37) % width, (i * 53) % height, 40, 40);
        }
        const blob = await new Promise((r) => canvas.toBlob(r, type, quality));
        return new File([blob], "original", { type });
      }
      const big = await make(3000, 2000, "image/png");
      const optimized = await exports.optimizePhoto(big);
      const bitmap = await createImageBitmap(optimized);
      const small = await make(300, 200, "image/webp", 0.5);
      const kept = await exports.optimizePhoto(small);
      return {
        bigBytes: big.size,
        type: optimized.type,
        bytes: optimized.size,
        width: bitmap.width,
        height: bitmap.height,
        keptSame: kept === small,
      };
    }, compiled("src/lib/photo-optimizer.ts"));
    assert.equal(result.type, "image/webp");
    assert.equal(result.width, 1080);
    assert.equal(result.height, 720);
    assert.ok(result.bytes < result.bigBytes);
    assert.ok(result.bytes <= 5 * 1024 * 1024);
    assert.equal(result.keptSame, true);
  } finally {
    await browser.close();
  }
});

test("plans only this project's non-WebP menu photos", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public/restaurant-media/";
  const rows = [
    { id: "1", restaurant_id: "r", photo_url: base + "r/a.jpg" },
    { id: "2", restaurant_id: "r", photo_url: base + "r/b.webp" },
    { id: "3", restaurant_id: "r", photo_url: "https://elsewhere.com/x.jpg" },
    { id: "4", restaurant_id: "r", photo_url: null },
    { id: "5", restaurant_id: "r", photo_url: base + "r/c.PNG" },
  ];
  assert.deepEqual(
    planPhotoConversions(rows, "https://abc.supabase.co").map((r) => r.id),
    ["1", "5"],
  );
});

test("FFmpeg converts a large image into a smaller WebP", async () => {
  const root = path.resolve(".tools");
  const dir = mkdtempSync(path.join(root, "photo-test-"));
  try {
    const input = path.join(dir, "in.png");
    const output = path.join(dir, "out.webp");
    await runFfmpeg(["-n", "-f", "lavfi", "-i", "testsrc2=size=3000x2000", "-frames:v", "1", input]);
    await convertToWebp(input, output);
    const bytes = readFileSync(output);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(statSync(output).size < statSync(input).size);
  } finally {
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error("Unsafe cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
});
