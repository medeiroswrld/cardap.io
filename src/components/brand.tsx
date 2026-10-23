"use client";
import { Flame } from "lucide-react";
import Link from "next/link";
import { useContext } from "react";
import { DemoContext } from "./demo-provider";
export function Brand({ compact = false }: { compact?: boolean }) {
  // Outside a menu (e.g. login) there is no restaurant: show the platform.
  const context = useContext(DemoContext);
  const name = context?.state.settings.name ?? "Cardap.io";
  return (
    <Link
      href={context ? `/r/${context.slug}` : "/"}
      className="brand"
      aria-label={`${name} — início`}
    >
      <span className="brand-icon">
        <Flame size={27} strokeWidth={1.8} />
      </span>
      <span>
        <span className="brand-name">
          {name.toLocaleLowerCase("pt-BR")}
          {context && <span className="brand-period">.</span>}
        </span>
        {!compact && (
          <small>
            {context?.state.settings.subtitle ??
              "Cardápio digital com pedidos na mesa"}
          </small>
        )}
      </span>
    </Link>
  );
}
export function DemoBanner() {
  const mode = useContext(DemoContext)?.mode;
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
