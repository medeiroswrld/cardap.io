import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import { DemoProvider } from "@/components/demo-provider";
export const metadata: Metadata = {
  title: "Brasa • Seu próximo favorito",
  description:
    "Explore o cardápio, escolha seus favoritos e faça seu pedido direto da mesa. Ambiente de demonstração.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
