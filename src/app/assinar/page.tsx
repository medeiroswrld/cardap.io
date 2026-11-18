import type { Metadata } from "next";
import { Suspense } from "react";
import "@/components/sales/site.css";
import { SiteHeader } from "@/components/sales/site-header";
import { SubscribeForm } from "@/components/subscribe-form";
import { founderSlotsLeft } from "@/lib/founders";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Assinar o Fome Play",
  description: "Crie sua conta e assine o Fome Play. Cardápio em vídeo, pedidos diretos e sem comissão por pedido.",
  alternates: { canonical: "/assinar" },
  robots: { index: true, follow: true },
};

export default async function Page() {
  const founderLeft = await founderSlotsLeft();
  return (
    <div className="site">
      <SiteHeader plain />
      <main className="s-wrap s-assinar-main">
        <h1 className="s-assinar-title">Crie sua conta e assine</h1>
        <Suspense fallback={<div className="s-assinar-loading" aria-busy="true" />}>
          <SubscribeForm founderLeft={founderLeft} />
        </Suspense>
      </main>
    </div>
  );
}
