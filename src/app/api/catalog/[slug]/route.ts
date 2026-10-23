import { logFailure, withRequestLogging } from "@/lib/observability/logger";
import { readCatalog } from "@/lib/catalog";
import { isCatalogSlug } from "@/lib/catalog-cache";
import { noStore } from "@/lib/server-security";

async function handleGET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isCatalogSlug(slug))
    return Response.json(
      { error: "Cardápio não encontrado." },
      { status: 404, headers: noStore },
    );
  try {
    const catalog = await readCatalog(slug);
    if (!catalog)
      return Response.json(
        { error: "Cardápio não encontrado." },
        { status: 404, headers: noStore },
      );
    return Response.json(catalog, { headers: noStore });
  } catch (error) {
    logFailure(error, "supabase.catalog");
    return Response.json(
      { error: "Não foi possível atualizar o cardápio." },
      { status: 503, headers: noStore },
    );
  }
}

export const GET = withRequestLogging("/api/catalog/[slug]", handleGET);
