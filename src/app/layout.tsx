import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";
import { MODE_SCRIPT } from "@/lib/color-mode";
import { AppScope } from "@/components/app-scope";
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
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body>
        <AppScope />
        {children}
      </body>
    </html>
  );
}
