import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
loadEnvFile(".env.local");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const name = "restaurant-videos";
const { data: existing } = await client.storage.getBucket(name);
if (!existing) {
  const { error } = await client.storage.createBucket(name, {
    public: true,
    fileSizeLimit: 20971520,
    allowedMimeTypes: ["video/mp4", "video/webm"],
  });
  if (error)
    throw new Error("Could not configure video storage: " + error.message);
}
const { data, error } = await client.storage.getBucket(name);
if (
  error ||
  !data?.public ||
  Number(data.file_size_limit) !== 20971520 ||
  JSON.stringify([...(data.allowed_mime_types || [])].sort()) !==
    JSON.stringify(["video/mp4", "video/webm"].sort())
)
  throw new Error(
    "Video bucket has unexpected settings; review before changing existing data.",
  );
console.log(
  "Video storage ready: public playback, 20 MB limit, MP4/WebM, signed uploads only.",
);
