import type { Metadata } from "next";
import "@fontsource-variable/manrope";
// Menu theme fonts (only the @font-face rules load here; files download on first use).
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/alfa-slab-one/400.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/nunito";
import "@fontsource-variable/lora";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: "Fome Play",
  description: "Cardápio em vídeo com pedidos diretos, sem comissão.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
