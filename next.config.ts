import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          legacyStream: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
          dev: process.env.NODE_ENV !== "production",
          https: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
        }),
      },
    ];
  },
};
export default config;
