import { AdminApp } from "@/components/admin-app";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <AdminApp section={section?.[0] ?? "visao-geral"} />;
}
