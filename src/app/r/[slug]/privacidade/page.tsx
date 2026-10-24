import { notFound } from "next/navigation";
import Link from "next/link";
import { readCatalog } from "@/lib/catalog";
import { isCatalogSlug } from "@/lib/catalog-cache";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCatalogSlug(slug)) notFound();
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
      <p>
        Em pedidos para entrega, o endereço informado (rua, número, complemento,
        referência e bairro) é usado apenas para entregar o pedido e fica visível
        somente para a equipe do restaurante e para você, neste navegador.
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
      <h2>Curtidas e comentários</h2>
      <p>
        Curtidas e comentários são opcionais e não exigem um pedido. São vinculados
        à sessão deste navegador, com duração de até 12 horas. Os
        comentários aparecem publicamente no cardápio sem seu nome ou telefone.
        Você pode editar ou remover sua avaliação neste navegador enquanto a
        sessão estiver válida. Depois disso, solicite a alteração à equipe pelo
        contato abaixo. O restaurante pode ocultar comentários e desativar as
        interações. O convite para avaliar no Google abre um serviço
        externo; nenhum comentário do cardápio é publicado lá automaticamente.
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
