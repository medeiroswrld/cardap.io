// Management sidebar: 7 sections; related pages are tabs inside a section (spec L).
export type PageKey =
  | "resumo" | "pedidos" | "produtos" | "opcionais" | "categorias" | "qr"
  | "contatos" | "avaliacoes" | "cupons" | "reconquistar"
  | "resultados" | "metricas" | "origem" | "caixa" | "mes" | "contas" | "configuracoes" | "plano";
export type SectionKey = "resumo" | "pedidos" | "cardapio" | "clientes" | "relatorios" | "financeiro" | "configuracoes";
export type Section = { key: SectionKey; label: string; pages: PageKey[] };

export const SECTIONS: Section[] = [
  { key: "resumo", label: "Visão geral", pages: ["resumo"] },
  { key: "pedidos", label: "Pedidos", pages: ["pedidos"] },
  { key: "cardapio", label: "Cardápio", pages: ["produtos", "opcionais", "categorias", "qr"] },
  { key: "clientes", label: "Clientes", pages: ["contatos", "avaliacoes", "cupons", "reconquistar"] },
  { key: "relatorios", label: "Relatórios", pages: ["resultados", "metricas", "origem"] },
  { key: "financeiro", label: "Financeiro", pages: ["caixa", "mes", "contas"] },
  { key: "configuracoes", label: "Configurações", pages: ["configuracoes", "plano"] },
];

const STAFF_PAGES: PageKey[] = ["resumo", "pedidos"];

export function sectionOf(page: PageKey): SectionKey {
  return SECTIONS.find((s) => s.pages.includes(page))!.key;
}
export function pageAllowed(page: PageKey, isOwner: boolean) {
  return isOwner || STAFF_PAGES.includes(page);
}
export function visibleSections(isOwner: boolean): Section[] {
  return SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => pageAllowed(p, isOwner)) })).filter((s) => s.pages.length > 0);
}
