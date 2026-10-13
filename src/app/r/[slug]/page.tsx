import { notFound } from "next/navigation";
import { MenuApp } from "@/components/menu-app";
import { readCatalog } from "@/lib/catalog";
import { ConnectedMenuProvider } from "@/components/connected-menu-provider";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "demo") return <MenuApp />;
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  return (
    <ConnectedMenuProvider catalog={catalog}>
      <MenuApp />
    </ConnectedMenuProvider>
  );
}
