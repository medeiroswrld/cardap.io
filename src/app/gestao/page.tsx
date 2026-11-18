import { redirect } from "next/navigation";
import Link from "next/link";
import { isConfigured, serverClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pagamento?: string | string[] }>;
}) {
  if (!isConfigured()) redirect("/login");
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  const { data: members, error } = await client
    .from("restaurant_members")
    .select("restaurant_id,role")
    .eq("user_id", user.id);
  if (error)
    return (
      <main className="standalone">
        <h1>Banco de dados ainda indisponível</h1>
        <p>
          Confira a conexão e execute as migrations da pasta supabase antes de
          continuar.
        </p>
        <Link className="button button-primary" href="/gestao">
          Tentar novamente
        </Link>
      </main>
    );
  // Keep the "?pagamento=documento" notice that the subscription form sends along.
  const { pagamento } = await searchParams;
  if (members?.length)
    redirect(
      `/gestao/${members[0].restaurant_id}${pagamento === "documento" ? "?pagamento=documento" : ""}`,
    );
  // No restaurant yet: accounts are created by the subscription form.
  redirect("/assinar");
}
