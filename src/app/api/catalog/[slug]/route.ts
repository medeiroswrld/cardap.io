import { readCatalog } from "@/lib/catalog";
import { noStore } from "@/lib/server-security";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug))
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
  } catch {
    return Response.json(
      { error: "Não foi possível atualizar o cardápio." },
      { status: 503, headers: noStore },
    );
  }
}
