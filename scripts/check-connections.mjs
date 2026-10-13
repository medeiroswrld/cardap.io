import { loadEnvFile } from "node:process";
loadEnvFile(".env.local");
const root = process.env.NEXT_PUBLIC_SUPABASE_URL;
for (const [label, key] of [
  ["public", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ["server", process.env.SUPABASE_SERVICE_ROLE_KEY],
]) {
  try {
    const r = await fetch(root + "/rest/v1/restaurants?select=id&limit=1", {
      headers: { apikey: key, Authorization: "Bearer " + key },
    });
    const data = await r.json();
    console.log(
      JSON.stringify({
        service: "supabase",
        credential: label,
        status: r.status,
        code: data.code || null,
        tableAvailable: r.ok,
      }),
    );
  } catch {
    console.log(
      JSON.stringify({
        service: "supabase",
        credential: label,
        error: "NETWORK_ERROR",
      }),
    );
  }
}
try {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream?limit=1`,
    {
      headers: {
        Authorization: "Bearer " + process.env.CLOUDFLARE_STREAM_API_TOKEN,
      },
    },
  );
  const data = await r.json();
  console.log(
    JSON.stringify({
      service: "cloudflare-stream",
      status: r.status,
      success: data.success,
      errorCodes: data.errors?.map((e) => e.code),
    }),
  );
} catch {
  console.log(
    JSON.stringify({ service: "cloudflare-stream", error: "NETWORK_ERROR" }),
  );
}
