import { notFound } from "next/navigation";
import { TrackingPage } from "@/components/tracking";
import { readCatalog } from "@/lib/catalog";
import { isCatalogSlug } from "@/lib/catalog-cache";
import { OwnThemeFlag } from "@/components/own-theme-flag";
import { DemoProvider } from "@/components/demo-provider";
import { ConnectedTracking } from "@/components/connected-tracking";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  if (slug === "demo")
    return (
      <DemoProvider>
        <TrackingPage id={id} />
      </DemoProvider>
    );
  if (!isCatalogSlug(slug)) notFound();
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  return (
    <>
      <OwnThemeFlag theme={catalog.restaurant.menu_theme} />
      <ConnectedTracking
        restaurantId={catalog.restaurant.id}
        slug={slug}
        id={id}
        theme={catalog.restaurant.menu_theme}
      />
    </>
  );
}
