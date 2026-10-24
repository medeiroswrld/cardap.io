"use client";
import { sameBagChoice } from "@/lib/product-options";
import { useEffect, useRef, useState } from "react";
import { DemoContext, type Checkout } from "./demo-provider";
import { catalogState, type Catalog } from "@/lib/connected-types";
import type { BagItem, DemoState } from "@/lib/types";
import { requestJson } from "@/lib/client-api";
import { ensureGuestSession } from "@/lib/guest-session";
import { onlineOptions } from "@/lib/fulfillment-draft";
import { isRestaurantOpen } from "@/lib/opening-hours";
export function ConnectedMenuProvider({
  catalog: initialCatalog,
  children,
}: {
  catalog: Catalog;
  children: React.ReactNode;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const lastCatalog = useRef(JSON.stringify(initialCatalog));
  const [state, setState] = useState<DemoState>(() => ({
    version: 1,
    ...catalogState(catalog),
    bag: [],
    orders: [],
    contacts: [],
  }));
  const current = useRef(state);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    const refresh = async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        const next = await requestJson<Catalog>(
          `/api/catalog/${encodeURIComponent(initialCatalog.restaurant.slug)}`,
        );
        const serialized = JSON.stringify(next);
        if (
          disposed ||
          next.restaurant.id !== initialCatalog.restaurant.id ||
          serialized === lastCatalog.current
        )
          return;
        lastCatalog.current = serialized;
        setCatalog(next);
        current.current = { ...current.current, ...catalogState(next) };
        setState(current.current);
      } catch {
        /* Preserve the loaded menu and bag during a connection failure. */
      } finally {
        refreshing = false;
      }
    };
    const timer = setInterval(() => void refresh(), 15000);
    const resume = () => void refresh();
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [initialCatalog.restaurant.id, initialCatalog.restaurant.slug]);
  const base = `/api/restaurants/${catalog.restaurant.id}`;
  const bagKey = `menu:${catalog.restaurant.id}:bag`;
  useEffect(() => {
    const timer = setInterval(() => {
      const accepting = isRestaurantOpen(catalog.restaurant);
      if (current.current.settings.accepting !== accepting) {
        current.current = {
          ...current.current,
          settings: { ...current.current.settings, accepting },
        };
        setState(current.current);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [catalog.restaurant]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(bagKey) || "[]");
        const bag: BagItem[] = Array.isArray(raw)
          ? raw.filter(
              (b) =>
                typeof b.productId === "string" &&
                Number.isInteger(b.quantity) &&
                b.quantity > 0 &&
                b.quantity <= 20 &&
                Number.isInteger(b.price) &&
                typeof b.note === "string" &&
                (b.removedIngredients === undefined ||
                  (Array.isArray(b.removedIngredients) &&
                    b.removedIngredients.every(
                      (v: unknown) => typeof v === "string",
                    ))) &&
                (b.addOns === undefined ||
                  (Array.isArray(b.addOns) &&
                    b.addOns.every(
                      (
                        v: {
                          id?: unknown;
                          name?: unknown;
                          price_cents?: unknown;
                        } | null,
                      ) =>
                        v &&
                        typeof v.id === "string" &&
                        typeof v.name === "string" &&
                        Number.isInteger(v.price_cents),
                    ))),
            )
          : [];
        current.current = { ...current.current, bag };
        setState(current.current);
      } catch {
        setError("Não foi possível recuperar sua sacola anterior.");
      }
      setReady(true);
    });
  }, [bagKey]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  function update(fn: (s: DemoState) => DemoState) {
    const next = fn(current.current);
    localStorage.setItem(bagKey, JSON.stringify(next.bag));
    current.current = { ...current.current, bag: next.bag };
    setState(current.current);
  }
  function add(item: BagItem) {
    update((s) => {
      const product = s.products.find((p) => p.id === item.productId);
      if (!product?.available)
        throw new Error("Este produto não está disponível.");
      const bag = [...s.bag];
      const i = bag.findIndex((b) => sameBagChoice(b, item));
      if (i < 0) bag.push(item);
      else
        bag[i] = {
          ...bag[i],
          quantity: Math.min(20, bag[i].quantity + item.quantity),
        };
      return { ...s, bag };
    });
    setToast("Adicionado à sua sacola");
    const eventId = crypto.randomUUID();
    void ensureGuestSession(catalog.restaurant.id)
      .then(() =>
        requestJson(base + "/cart-events", {
          id: eventId,
          product_id: item.productId,
        }),
      )
      .catch(() => {});
  }
  async function checkout(data: Checkout) {
    const items = current.current.bag.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      expected_price: i.price,
      note: i.note,
      removed_ingredients: [...(i.removedIngredients || [])].sort(),
      option_ids: (i.addOns || []).map((o) => o.id).sort(),
    }));
    const customer = {
      name: data.name.trim(),
      phone: data.phone.replace(/\D/g, ""),
      marketing_consent: data.consent,
    };
    let body: Record<string, unknown>;
    if (!data.online) {
      const table = catalog.tables.find(
        (t) => t.active && t.number === data.table,
      );
      if (!table) throw new Error("Escolha uma mesa válida.");
      body = { table_id: table.id, ...customer, items };
    } else if (data.online.fulfillment === "retirada") {
      body = {
        fulfillment: "retirada",
        payment_method: data.online.payment,
        change_for_cents: data.online.changeFor,
        ...customer,
        items,
      };
    } else {
      const a = data.online.address;
      body = {
        fulfillment: "entrega",
        payment_method: data.online.payment,
        change_for_cents: data.online.changeFor,
        address: {
          zone_id: a.zoneId,
          street: a.street.trim(),
          number: a.number.trim(),
          complement: a.complement.trim(),
          reference: a.reference.trim(),
        },
        ...customer,
        items,
      };
    }
    await ensureGuestSession(catalog.restaurant.id);
    const fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(body)),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const pendingKey = `menu:${catalog.restaurant.id}:pending`;
    let saved: { fingerprint: string; key: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(pendingKey) || "null");
    } catch {}
    const key =
      saved?.fingerprint === fingerprint ? saved.key : crypto.randomUUID();
    localStorage.setItem(pendingKey, JSON.stringify({ fingerprint, key }));
    const { order } = await requestJson<{ order: { id: string } }>(
      base + "/orders",
      {
        key,
        ...body,
      },
    );
    // The server has confirmed: local storage failure must not turn success into a retry.
    try {
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(bagKey);
      const key = `menu:${catalog.restaurant.id}:orders`;
      const ids = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(
        key,
        JSON.stringify(
          [order.id, ...ids.filter((id: string) => id !== order.id)].slice(
            0,
            30,
          ),
        ),
      );
    } catch {}
    current.current = { ...current.current, bag: [] };
    setState(current.current);
    return order;
  }
  async function subscribe(name: string, phone: string, consent: boolean) {
    if (!consent) throw new Error("Autorize o recebimento para continuar.");
    await ensureGuestSession(catalog.restaurant.id);
    await requestJson(base + "/subscribe", {
      name,
      phone: phone.replace(/\D/g, ""),
      consent,
    });
    setToast(
      "Solicitação registrada. Preferências anteriores são preservadas.",
    );
  }
  return (
    <DemoContext.Provider
      value={{
        mode: "connected",
        slug: catalog.restaurant.slug,
        state,
        ready,
        session: "",
        error,
        online: onlineOptions(catalog.restaurant, catalog.zones),
        update,
        add,
        checkout,
        subscribe,
        notify: setToast,
        changeStatus: () => {
          throw new Error("Use o painel de gestão.");
        },
      }}
    >
      {children}
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
      {error && (
        <div role="alert" className="global-error">
          {error}
        </div>
      )}
    </DemoContext.Provider>
  );
}
