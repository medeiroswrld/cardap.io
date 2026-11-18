import type { Metadata } from "next";
import "@/components/sales/site.css";
import { FAQ_ITEMS, Faq } from "@/components/sales/faq";
import { Features } from "@/components/sales/features";
import { Guarantee } from "@/components/sales/guarantee";
import { Hero } from "@/components/sales/hero";
import { PlansSection } from "@/components/sales/plans-section";
import { SavingsCalculator } from "@/components/sales/savings-calculator";
import { SiteFooter } from "@/components/sales/site-footer";
import { SiteHeader } from "@/components/sales/site-header";
import { founderSlotsLeft } from "@/lib/founders";
import { agencyWhatsappUrl } from "@/lib/sales";

// Mostly static: re-rendered at most once a minute to refresh the founder slots.
export const revalidate = 60;

const TITLE = "Fome Play — cardápio digital que traz seu cliente de volta";
const DESCRIPTION =
  "Cardápio em vídeo com pedidos diretos, sem comissão por pedido. Cupons, reconquista de clientes e financeiro para o seu restaurante.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "pt_BR", siteName: "Fome Play", title: TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function Home() {
  const founderLeft = await founderSlotsLeft();
  const whatsappUrl = agencyWhatsappUrl(process.env.NEXT_PUBLIC_SALES_WHATSAPP);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Fome Play", url: process.env.NEXT_PUBLIC_APP_URL || undefined },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  };
  return (
    <div className="site">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <SavingsCalculator />
        <PlansSection founderLeft={founderLeft} agencyUrl={whatsappUrl} />
        <Guarantee />
        <Faq />
      </main>
      <SiteFooter whatsappUrl={whatsappUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\u003c") }} />
    </div>
  );
}
