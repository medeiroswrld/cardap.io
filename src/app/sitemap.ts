import type { MetadataRoute } from "next";

const base = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base()}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base()}/assinar`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
