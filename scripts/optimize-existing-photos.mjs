// One-off conversion of already published menu photos to ≤1080 px WebP.
// Default is a dry run. `--apply` writes to production: run it only after the
// user explicitly approves. Never overwrites or deletes the original file.
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { runFfmpeg } from "./prepare-pilot-media.mjs";

const BUCKET = "restaurant-media";

export function planPhotoConversions(rows, supabaseUrl) {
  const prefix = `${new URL(supabaseUrl).origin}/storage/v1/object/public/${BUCKET}/`;
  return rows.filter(
    (row) =>
      typeof row.photo_url === "string" &&
      row.photo_url.startsWith(prefix) &&
      !row.photo_url.toLowerCase().endsWith(".webp"),
  );
}

export function convertToWebp(input, output) {
  return runFfmpeg([
    "-n",
    "-i",
    input,
    "-vf",
    "scale='min(1080,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "82",
    output,
  ]);
}

const PAGE_SIZE = 1000;

async function listProducts(service) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await service
      .from("products")
      .select("id,restaurant_id,photo_url")
      .eq("archived", false)
      .not("photo_url", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("Não foi possível listar os produtos.");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

class ProductError extends Error {
  constructor(message, target) {
    super(message);
    this.target = target;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const plan = planPhotoConversions(await listProducts(service), url);
  process.stdout.write(`${plan.length} foto(s) para converter${apply ? "" : " (simulação)"}\n`);
  const root = path.resolve(".tools");
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, "photo-backfill-"));
  let converted = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (const row of plan) {
      try {
        const response = await fetch(row.photo_url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new ProductError("download falhou");
        const input = path.join(dir, `${row.id}-in`);
        const output = path.join(dir, `${row.id}.webp`);
        writeFileSync(input, Buffer.from(await response.arrayBuffer()));
        try {
          await convertToWebp(input, output);
        } catch {
          throw new ProductError("conversão falhou");
        }
        const before = statSync(input).size;
        const after = statSync(output).size;
        if (after >= before) {
          process.stdout.write(`- produto ${row.id}: já otimizada, ignorada\n`);
          skipped++;
          continue;
        }
        process.stdout.write(`- produto ${row.id}: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB\n`);
        if (!apply) {
          converted++;
          continue;
        }
        const target = `${row.restaurant_id}/${randomUUID()}.webp`;
        const upload = await service.storage
          .from(BUCKET)
          .upload(target, readFileSync(output), { contentType: "image/webp", upsert: false });
        if (upload.error) throw new ProductError("envio falhou");
        const publicUrl = service.storage.from(BUCKET).getPublicUrl(target).data.publicUrl;
        // Only replace if the owner has not changed the photo meanwhile.
        const update = await service
          .from("products")
          .update({ photo_url: publicUrl })
          .eq("id", row.id)
          .eq("photo_url", row.photo_url)
          .select("id");
        if (update.error) throw new ProductError("atualização falhou", target);
        if (!update.data || update.data.length === 0) {
          process.stdout.write(
            `- produto ${row.id}: foto alterada durante a conversão, ignorada (arquivo novo sem uso: ${target})\n`,
          );
          skipped++;
          continue;
        }
        converted++;
      } catch (error) {
        failed++;
        const reason =
          error instanceof ProductError
            ? error.message
            : error?.name === "TimeoutError"
              ? "tempo esgotado no download"
              : "erro inesperado";
        const orphan = error instanceof ProductError && error.target ? ` (arquivo novo sem uso: ${error.target})` : "";
        process.stdout.write(`- produto ${row.id}: falhou (${reason})${orphan}\n`);
      }
    }
  } finally {
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error("Unsafe cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write(`Concluído: ${converted} convertida(s), ${skipped} ignorada(s), ${failed} com falha\n`);
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
