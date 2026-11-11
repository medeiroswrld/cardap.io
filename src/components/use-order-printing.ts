"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ordersToPrint, ticketHtml, type PaperWidth, type TicketOrder } from "@/lib/order-ticket";

const AUTO_KEY = "gestao:impressao:auto";
const WIDTH_KEY = "gestao:impressao:largura";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Prints through a hidden iframe so the board stays on screen. Without Chrome's
// --kiosk-printing flag the browser shows its print dialog for each ticket.
function printHtml(html: string) {
  return new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const done = () => {
      setTimeout(() => {
        frame.remove();
        resolve();
      }, 500);
    };
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      return resolve();
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
      } catch {}
      done();
    }, 150);
  });
}

// Settings are per device: only the computer next to the printer turns on auto-print.
export function useOrderPrinting(
  orders: TicketOrder[] | undefined,
  restaurantName: string,
  timeZone?: string,
) {
  const [auto, setAuto] = useState(() => read(AUTO_KEY) === "1");
  const [width, setWidthState] = useState<PaperWidth>(() =>
    read(WIDTH_KEY) === "58" ? 58 : 80,
  );
  const printed = useRef<Set<string> | null>(null);
  const queue = useRef(Promise.resolve());

  const print = useCallback(
    (order: TicketOrder) => {
      const html = ticketHtml(order, restaurantName, width, timeZone);
      queue.current = queue.current.then(() => printHtml(html));
      return queue.current;
    },
    [restaurantName, width, timeZone],
  );

  useEffect(() => {
    if (!orders) return;
    // Seed on first data (and whenever auto-print is turned on): what is
    // already on screen is never printed automatically.
    if (printed.current === null || !auto) {
      printed.current = new Set(orders.filter((o) => o.status !== "aguardando_aceite").map((o) => o.id));
      return;
    }
    for (const order of ordersToPrint(orders, printed.current)) {
      printed.current.add(order.id);
      void print(order);
    }
  }, [orders, auto, print]);

  const toggleAuto = useCallback(() => {
    setAuto((value) => {
      write(AUTO_KEY, value ? "0" : "1");
      return !value;
    });
  }, []);
  const setWidth = useCallback((value: PaperWidth) => {
    write(WIDTH_KEY, String(value));
    setWidthState(value);
  }, []);

  return { auto, toggleAuto, width, setWidth, print };
}
