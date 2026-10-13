import { AdminApp } from "@/components/admin-app";
import { redirect } from "next/navigation";
import { isConfigured, serverClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  if (!isConfigured()) redirect("/login");
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { section } = await params;
  return <AdminApp section={section?.[0] ?? "visao-geral"} />;
}
