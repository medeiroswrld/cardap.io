import type { Metadata } from "next";
import type { Catalog } from "./connected-types";

// Link previews (WhatsApp, Instagram, Google) show the restaurant, not the platform.
export function restaurantMetadata(
  catalog: Pick<Catalog, "restaurant" | "products">,
): Metadata {
  const name = catalog.restaurant.name;
  const title = `${name} · Cardápio`;
  const description = `Veja o cardápio de ${name}, escolha e peça direto da mesa.`;
  const photo = catalog.products.find((p) => p.photo_url)?.photo_url;
  const images = photo ? [{ url: photo }] : undefined;
  return {
    title,
    description,
    // Table links (/r/<slug>?mesa=N) must not be indexed as duplicates.
    alternates: { canonical: `/r/${catalog.restaurant.slug}` },
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "website", locale: "pt_BR", images },
    twitter: {
      card: photo ? "summary_large_image" : "summary",
      title,
      description,
      images: photo ? [photo] : undefined,
    },
  };
}

export const DEMO_METADATA: Metadata = {
  title: "Demonstração · Cardap.io",
  robots: { index: false, follow: false },
};
