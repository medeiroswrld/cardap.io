"use client";
import { Flame } from "lucide-react";
import Link from "next/link";
import { useDemo } from "./demo-provider";
export function Brand({ compact = false }: { compact?: boolean }) {
  const { state, slug } = useDemo();
  return (
    <Link
      href={`/r/${slug}`}
      className="brand"
      aria-label={`${state.settings.name} — início`}
    >
      <span className="brand-icon">
        <Flame size={27} strokeWidth={1.8} />
      </span>
      <span>
        <span className="brand-name">
          {state.settings.name.toLocaleLowerCase("pt-BR")}
          <span className="brand-period">.</span>
        </span>
        {!compact && <small>{state.settings.subtitle}</small>}
      </span>
    </Link>
  );
}
export function DemoBanner() {
  const { mode } = useDemo();
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner">
      <span className="demo-dot" />
      Modo demonstração
      <span className="demo-banner-extra">
        {" "}
        • Explore à vontade. Nenhum pedido será enviado a um restaurante.
      </span>
    </div>
  );
}
