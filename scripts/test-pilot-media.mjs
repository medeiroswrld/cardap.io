import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { runFfmpeg, prepareVideo } from "./prepare-pilot-media.mjs";

test("compresses a real clip, generates JPEG and creates a browser cover without overwriting originals", async () => {
  const root = path.resolve(".tools");
  const temporary = mkdtempSync(path.join(root, "pilot-media-test-"));
  let browser;
  try {
    const original = path.join(temporary, "original.mp4");
    await runFfmpeg([
      "-n",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1080x1920:rate=30",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-crf",
      "12",
      original,
    ]);
    const before = readFileSync(original);
    const result = await prepareVideo(original, path.join(temporary, "export"));
    assert.deepEqual(readFileSync(original), before);
    assert.ok(result.preparedBytes < result.originalBytes);
    const clip = readFileSync(result.video);
    assert.ok(
      clip.indexOf("moov") < clip.indexOf("mdat"),
      "faststart puts metadata before media",
    );
    assert.equal(readFileSync(result.cover).readUInt16BE(0), 0xffd8);
    await assert.rejects(
      prepareVideo(original, path.join(temporary, "export")),
      { code: "EEXIST" },
    );
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });
    const page = await browser.newPage();
    const compiled = ts.transpileModule(
      readFileSync("src/lib/video-cover.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    const cover = await page.evaluate(
      async ({ code, bytes }) => {
        const exports = {};
        new Function("exports", code)(exports);
        const file = new File([new Uint8Array(bytes)], "test.mp4", {
          type: "video/mp4",
        });
        const result = await exports.createVideoCover(file);
        const bitmap = await createImageBitmap(result);
        return {
          type: result.type,
          bytes: result.size,
          width: bitmap.width,
          height: bitmap.height,
        };
      },
      { code: compiled, bytes: Array.from(clip) },
    );
    assert.equal(cover.type, "image/jpeg");
    assert.ok(cover.bytes > 0 && cover.width <= 720 && cover.height <= 1280);
    process.stdout.write(
      JSON.stringify({
        originalBytes: result.originalBytes,
        compressedBytes: result.preparedBytes,
        coverBytes: cover.bytes,
      }) + "\n",
    );
  } finally {
    await browser?.close();
    // Delete only the test directory allocated beneath this workspace's .tools.
    if (!path.resolve(temporary).startsWith(root + path.sep))
      throw new Error("Unsafe cleanup path");
    rmSync(temporary, { recursive: true, force: true });
  }
});
