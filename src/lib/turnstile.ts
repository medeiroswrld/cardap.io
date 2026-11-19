// Cloudflare Turnstile check for public sign-up (/assinar).
// Off until TURNSTILE_SECRET_KEY is set; once set, every sign-up needs a valid token.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export async function verifyHuman(
  token: unknown,
  ip: string | null,
  options: { secret?: string; fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<void> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    throw new Error("HUMAN_CHECK_FAILED");
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  let result: { success?: unknown };
  try {
    const response = await (options.fetcher ?? fetch)(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
    });
    if (!response.ok) throw new Error(`turnstile ${response.status}`);
    result = (await response.json()) as { success?: unknown };
  } catch {
    throw new Error("HUMAN_CHECK_UNAVAILABLE");
  }
  if (result.success !== true) throw new Error("HUMAN_CHECK_FAILED");
}
