import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, requireMember } from "@/lib/supabase/server";
import { ConnectedAdmin } from "@/components/connected-admin";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isConfigured()) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    await requireMember(id);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED")
      redirect("/login");
    if (error instanceof Error && error.message === "FORBIDDEN") notFound();
    // Infrastructure errors must reach Next instrumentation, not masquerade as 404.
    throw new Error("DATABASE_ERROR");
  }
  return <ConnectedAdmin id={id} />;
}
