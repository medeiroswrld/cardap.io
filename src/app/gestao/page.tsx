import { redirect } from "next/navigation";
import Link from "next/link";
import { isConfigured, serverClient } from "@/lib/supabase/server";
import { SetupForm } from "@/components/setup-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
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
  if (members?.length) redirect(`/gestao/${members[0].restaurant_id}`);
  return (
    <main className="standalone">
      <span className="eyebrow">Seu primeiro cardápio</span>
      <h1>Vamos abrir a casa.</h1>
      <p>
        Crie o restaurante, cadastre os produtos e configure mesas e horários
        para começar a receber pedidos.
      </p>
      <SetupForm />
    </main>
  );
}
