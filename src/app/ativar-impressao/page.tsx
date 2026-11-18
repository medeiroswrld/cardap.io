"use client";
import { useEffect } from "react";
import { AUTO_KEY } from "@/components/use-order-printing";

// Opened by the "Fome Play Pedidos" desktop shortcut: turns on automatic
// printing for this browser profile, then goes to the management area.
export default function ActivatePrintingPage() {
  useEffect(() => {
    try {
      localStorage.setItem(AUTO_KEY, "1");
    } catch {}
    location.replace("/gestao");
  }, []);
  return (
    <main className="standalone" style={{ textAlign: "center" }}>
      <p role="status">Ligando a impressão automática…</p>
    </main>
  );
}
