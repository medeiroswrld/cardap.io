import { notFound } from "next/navigation";
import { MenuApp } from "@/components/menu-app";
import { readCatalog } from "@/lib/catalog";
import { DemoProvider } from "@/components/demo-provider";
import { ConnectedMenuProvider } from "@/components/connected-menu-provider";
export const dynamic = "force-dynamic";
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
