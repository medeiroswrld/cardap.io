import { ImageResponse } from "next/og";

export const alt = "Fome Play — o cardápio que traz seu cliente de volta";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #d32f2f 0%, #8f1d1d 100%)",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>fome play</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>O cardápio que traz seu cliente de volta.</div>
          <div style={{ fontSize: 34, marginTop: 28, opacity: 0.9 }}>Cardápio em vídeo · Sem comissão por pedido</div>
        </div>
      </div>
    ),
    size,
  );
}
