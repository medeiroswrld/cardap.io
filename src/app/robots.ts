import type { MetadataRoute } from "next";

const base = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/assinar"], disallow: ["/api/", "/gestao", "/login", "/redefinir-senha", "/auth/", "/demo/", "/ativar-impressao"] }],
    sitemap: `${base()}/sitemap.xml`,
  };
}
