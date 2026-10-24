import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

export const MIGRATIONS = [
  "001_foundation.sql",
  "002_connected_management.sql",
  "003_video_observations.sql",
  "004_cart_associations.sql",
  "005_video_storage.sql",
  "006_photo_observations.sql",
  "007_product_options.sql",
  "008_product_feedback.sql",
  "009_social_feedback.sql",
  "010_pilot_rate_limits.sql",
  "011_online_orders.sql",
];

// Supabase-owned schemas/roles are represented locally; business SQL is unchanged.
export async function createTestDatabase() {
  const db = new PGlite();
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
  for (const file of MIGRATIONS) {
    const sql = readFileSync(
      new URL("../../supabase/migrations/" + file, import.meta.url),
      "utf8",
    )
      .replace("create extension if not exists pgcrypto;", "")
      .replace(
        "alter publication supabase_realtime add table public.orders;",
        "",
      );
    await db.exec(sql);
  }
  return db;
}
