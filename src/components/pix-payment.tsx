"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { money } from "@/lib/utils";
import type { RealOrder } from "@/lib/connected-types";

export function PixPayment({ order }: { order: RealOrder }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const code = order.pix_code;
  useEffect(() => {
    if (!code) return;
    QRCode.toDataURL(code, { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [code]);
  return (
    <section className="pix-payment" aria-label="Pagamento por Pix">
      <h3>Pague {money(order.total_cents)} no Pix</h3>
      <p>Seu pedido vai para a cozinha assim que o restaurante confirmar o pagamento.</p>
      {code ? (
        <>
          {qr && <img src={qr} alt="QR Code do Pix" width={240} height={240} />}
          <label className="form-label">
            Pix copia e cola
            <textarea readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(code)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? "Código copiado" : "Copiar código Pix"}
          </button>
        </>
      ) : (
        <p className="notice">O Pix pelo cardápio foi desligado. Fale com o restaurante para pagar.</p>
      )}
      {order.pix_whatsapp ? (
        <a className="button" href={order.pix_whatsapp} target="_blank" rel="noopener noreferrer">
          Enviar comprovante no WhatsApp
        </a>
      ) : (
        <p>Depois de pagar, envie o comprovante para o restaurante.</p>
      )}
    </section>
  );
}
