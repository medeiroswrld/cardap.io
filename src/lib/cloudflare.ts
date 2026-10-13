import "server-only";
const base = () => {
  if (
    !process.env.CLOUDFLARE_ACCOUNT_ID ||
    !process.env.CLOUDFLARE_STREAM_API_TOKEN
  )
    throw new Error("Cloudflare Stream não configurado");
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream`;
};
const headers = () => ({
  Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`,
  "Content-Type": "application/json",
});
export async function createVideoUpload(creator: string) {
  const response = await fetch(`${base()}/direct_upload`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      maxDurationSeconds: 45,
      expiry: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      creator,
      allowedOrigins: [new URL(process.env.NEXT_PUBLIC_APP_URL!).hostname],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("STREAM_UPLOAD_FAILED");
  const data = await response.json();
  if (!data.success || !data.result?.uid || !data.result?.uploadURL)
    throw new Error("STREAM_UPLOAD_FAILED");
  return data.result as { uid: string; uploadURL: string };
}
export async function getVideoStatus(uid: string) {
  if (!/^[a-f0-9]{32}$/.test(uid)) throw new Error("INVALID_ASSET");
  const response = await fetch(`${base()}/${uid}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("STREAM_STATUS_FAILED");
  const data = await response.json();
  if (!data.success) throw new Error("STREAM_STATUS_FAILED");
  return data.result as {
    uid: string;
    readyToStream: boolean;
    duration: number;
    status: { state: string };
    playback?: { hls: string };
  };
}
