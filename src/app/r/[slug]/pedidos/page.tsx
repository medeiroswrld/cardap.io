import { notFound } from "next/navigation";
import { readCatalog } from "@/lib/catalog";
import { isCatalogSlug } from "@/lib/catalog-cache";
import { ConnectedTracking } from "@/components/connected-tracking";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCatalogSlug(slug)) notFound();
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  return <ConnectedTracking restaurantId={catalog.restaurant.id} slug={slug} />;
}
