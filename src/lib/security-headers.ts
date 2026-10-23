// Pure builder for the HTTP security headers applied in next.config.ts.
// Keep it free of server-only imports: the config loads it at build time.
// Any third-party script or pixel (e.g. Meta Pixel, GA4) must be allowed here
// explicitly, in the narrowest directive it needs.
export type SecurityHeaderOptions = {
  supabaseUrl?: string;
  legacyStream: boolean;
  dev: boolean;
  https: boolean;
};

// Legacy Cloudflare Stream playback, only when its credentials are configured.
const STREAM_HOSTS = [
  "https://*.cloudflarestream.com",
  "https://videodelivery.net",
];

function supabaseOrigins(url?: string) {
  if (!url) return { http: [] as string[], ws: [] as string[] };
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      return { http: [], ws: [] };
    const ws = parsed.protocol === "https:" ? "wss:" : "ws:";
    return { http: [parsed.origin], ws: [`${ws}//${parsed.host}`] };
  } catch {
    return { http: [], ws: [] };
  }
}

export function contentSecurityPolicy(o: SecurityHeaderOptions) {
  const supabase = supabaseOrigins(o.supabaseUrl);
  const stream = o.legacyStream ? STREAM_HOSTS : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // App Router inline bootstrap scripts need 'unsafe-inline' without nonces;
    // nonces would force dynamic rendering of every page.
    "script-src": ["'self'", "'unsafe-inline'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...supabase.http, ...stream],
    "media-src": ["'self'", "blob:", ...supabase.http, ...stream],
    "connect-src": [
      "'self'",
      ...supabase.http,
      ...supabase.ws,
      ...stream,
      ...(o.dev ? ["ws:"] : []),
    ],
    "font-src": ["'self'", "data:"],
    "worker-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(o: SecurityHeaderOptions) {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(o) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
  ];
  if (o.https && !o.dev)
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  return headers;
}
