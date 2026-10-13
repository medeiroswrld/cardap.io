import { notFound } from "next/navigation";
import Link from "next/link";
import { readCatalog } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  const r = catalog.restaurant;
  return (
    <main className="standalone">
      <Link href={`/r/${slug}`}>Voltar ao cardápio</Link>
      <h1>Privacidade no {r.name}</h1>
      <p>
        Nome, telefone, mesa e itens são usados para preparar e atender o
        pedido. O telefone informado não é verificado.
      </p>
      <h2>Ofertas são opcionais</h2>
      <p>
        A autorização de marketing é separada do pedido. A equipe registra a
        escolha e pode revogá-la a seu pedido. Informar novamente um telefone
        não modifica uma preferência já registrada.
      </p>
      <h2>Armazenamento e acesso</h2>
      <p>
        A sacola fica neste navegador. Um cookie de sessão com duração de até 12
        horas protege o acesso aos seus pedidos. Os pedidos e contatos ficam no
        banco de dados do restaurante. A equipe autorizada tem acesso conforme
        sua função.
      </p>
      <h2>Fale com o restaurante</h2>
      <p>
        Para solicitar acesso, correção, exclusão dos seus dados ou revogação de
        ofertas:{" "}
        {r.privacy_email ? (
          <a href={`mailto:${r.privacy_email}`}>{r.privacy_email}</a>
        ) : (
          r.phone || "procure a equipe no estabelecimento"
        )}
        .
      </p>
    </main>
  );
}
