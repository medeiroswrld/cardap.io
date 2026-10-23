import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuApp } from "@/components/menu-app";
import { readCatalog } from "@/lib/catalog";
import { DemoProvider } from "@/components/demo-provider";
import { ConnectedMenuProvider } from "@/components/connected-menu-provider";
import { DEMO_METADATA, restaurantMetadata } from "@/lib/restaurant-metadata";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "demo") return DEMO_METADATA;
  try {
    const catalog = await readCatalog(slug);
    return catalog ? restaurantMetadata(catalog) : {};
  } catch {
    // The page itself reports the failure; metadata falls back to the root defaults.
    return {};
  }
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "demo")
    return (
      <DemoProvider>
        <MenuApp />
      </DemoProvider>
    );
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  return (
    <ConnectedMenuProvider catalog={catalog}>
      <MenuApp />
    </ConnectedMenuProvider>
  );
}
