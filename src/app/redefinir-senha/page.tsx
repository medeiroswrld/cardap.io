import { redirect } from "next/navigation";
import { isConfigured, serverClient } from "@/lib/supabase/server";
import { SetupForm } from "@/components/setup-forms";
export default async function Page() {
  if (!isConfigured()) redirect("/login");
  const {
    data: { user },
  } = await (await serverClient()).auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="standalone">
      <h1>Escolha uma nova senha</h1>
      <p>Use pelo menos dez caracteres.</p>
      <SetupForm password />
    </main>
  );
}
