// One-off conversion of already published menu photos to ≤1080 px WebP.
// Default is a dry run. `--apply` writes to production: run it only after the
// user explicitly approves. Never overwrites or deletes the original file.
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await service
    .from("products")
    .select("id,restaurant_id,photo_url")
    .eq("archived", false)
    .not("photo_url", "is", null);
  if (error) throw new Error("Não foi possível listar os produtos.");
  const plan = planPhotoConversions(data, url);
  process.stdout.write(`${plan.length} foto(s) para converter${apply ? "" : " (simulação)"}\n`);
  const root = path.resolve(".tools");
  const dir = mkdtempSync(path.join(root, "photo-backfill-"));
  try {
    for (const row of plan) {
      const response = await fetch(row.photo_url);
      if (!response.ok) {
        process.stdout.write(`- produto ${row.id}: download falhou, ignorado\n`);
        continue;
      }
      const input = path.join(dir, `${row.id}-in`);
      const output = path.join(dir, `${row.id}.webp`);
      writeFileSync(input, Buffer.from(await response.arrayBuffer()));
      await convertToWebp(input, output);
      const before = statSync(input).size;
      const after = statSync(output).size;
      if (after >= before) {
        process.stdout.write(`- produto ${row.id}: já otimizada, ignorada\n`);
        continue;
      }
      process.stdout.write(`- produto ${row.id}: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB\n`);
      if (!apply) continue;
      const target = `${row.restaurant_id}/${randomUUID()}.webp`;
      const upload = await service.storage
        .from(BUCKET)
        .upload(target, readFileSync(output), { contentType: "image/webp", upsert: false });
      if (upload.error) throw new Error(`Envio falhou no produto ${row.id}.`);
      const publicUrl = service.storage.from(BUCKET).getPublicUrl(target).data.publicUrl;
      // Only replace if the owner has not changed the photo meanwhile.
      const update = await service
        .from("products")
        .update({ photo_url: publicUrl })
        .eq("id", row.id)
        .eq("photo_url", row.photo_url);
      if (update.error) throw new Error(`Atualização falhou no produto ${row.id}.`);
    }
  } finally {
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error("Unsafe cleanup path");
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
