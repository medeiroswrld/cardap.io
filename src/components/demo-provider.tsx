"use client";
import { sameBagChoice, choicePrice } from "@/lib/product-options";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { initialState } from "@/lib/fixtures";
import type { PaymentMethod } from "@/lib/order-flow";
import type { OnlineOptions } from "@/lib/fulfillment-draft";
import {
  statusFlow,
  type DemoState,
  type BagItem,
  type Order,
  type Status,
} from "@/lib/types";
const KEY = "brasa:demo:v1";
const CONSENT =
  "Quero receber novidades e ofertas do Brasa no WhatsApp. Posso cancelar quando quiser.";
export type Checkout = {
  name: string;
  phone: string;
  table: number;
  consent: boolean;
  key: string;
  online?: OnlineChoice;
};
export type OnlineChoice =
  | { fulfillment: "retirada"; payment: PaymentMethod; changeFor: number | null }
  | {
      fulfillment: "entrega";
      payment: PaymentMethod;
      changeFor: number | null;
      expectedFee: number;
      address: {
        zoneId: string;
        street: string;
        number: string;
        complement: string;
        reference: string;
      };
    };
type Context = {
  mode: "demo" | "connected";
  slug: string;
  state: DemoState;
  ready: boolean;
  session: string;
  error: string;
  online?: OnlineOptions;
  update: (fn: (state: DemoState) => DemoState) => void;
  add: (item: BagItem) => void;
  checkout: (data: Checkout) => { id: string } | Promise<{ id: string }>;
  changeStatus: (id: string, status: Status, reason?: string) => void;
  notify: (message: string) => void;
  subscribe: (
    name: string,
    phone: string,
    consent: boolean,
  ) => void | Promise<void>;
};
export const DemoContext = createContext<Context | null>(null);
function load(): DemoState {
  const raw = localStorage.getItem(KEY);
  if (!raw) return initialState();
  const data = JSON.parse(raw);
  if (
    data.version !== 1 ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.contacts) ||
    !Array.isArray(data.bag) ||
    !Array.isArray(data.orders) ||
    !data.settings
  )
    throw new Error(
      "Os dados da demonstração estão inválidos. Limpe os dados deste site para recomeçar.",
    );
  return data;
}
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const current = useRef(state);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const data = load();
        if (!localStorage.getItem(KEY))
          localStorage.setItem(KEY, JSON.stringify(data));
        current.current = data;
        setState(data);
        let id = localStorage.getItem("brasa:demo:session");
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem("brasa:demo:session", id);
        }
        setSession(id);
        setReady(true);
      } catch {
        setError(
          "Não foi possível acessar os dados locais. Permita o armazenamento do navegador para testar a demonstração.",
        );
      }
    });
    const sync = (e: StorageEvent) => {
      if (e.key === KEY) {
        try {
          const data = load();
          current.current = data;
          setState(data);
        } catch {
          setError("Falha ao atualizar a demonstração. Recarregue a página.");
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  const update = useCallback((fn: (state: DemoState) => DemoState) => {
    const latest = load();
    const next = fn(latest);
    localStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setState(next);
  }, []);
  const add = (item: BagItem) => {
    update((s) => {
      const product = s.products.find((p) => p.id === item.productId);
      if (
        !product?.available ||
        !product.published ||
        !s.categories.find((c) => c.id === product.categoryId)?.visible
      )
        throw new Error("Este produto não está disponível.");
      const bag = [...s.bag];
      const i = bag.findIndex((b) => sameBagChoice(b, item));
      if (i >= 0)
        bag[i] = {
          ...bag[i],
          quantity: Math.min(20, bag[i].quantity + item.quantity),
        };
      else bag.push(item);
      return { ...s, bag };
    });
    setToast("Adicionado à sua sacola");
  };
  const subscribe = (name: string, phone: string, consent: boolean) => {
    if (!consent)
      throw new Error("Selecione a autorização para receber novidades.");
    update((s) => ({
      ...s,
      contacts: saveContact(s, name, phone, consent, "Cadastro de novidades"),
    }));
    setToast("Preferência salva na demonstração");
  };
  const checkout = (data: Checkout) => {
    let result: Order | undefined;
    update((s) => {
      const fingerprint = JSON.stringify({
        bag: s.bag,
        name: data.name,
        phone: data.phone,
        table: data.table,
        consent: data.consent,
      });
      const existing = s.orders.find((o) => o.idempotencyKey === data.key);
      if (existing) {
        if (existing.session !== session)
          throw new Error("Tentativa de pedido inválida.");
        if (s.bag.length && existing.fingerprint !== fingerprint)
          throw new Error(
            "Os dados mudaram nesta tentativa. Reabra a confirmação para criar um novo pedido.",
          );
        result = existing;
        return s;
      }
      if (!session)
        throw new Error("Sua sessão ainda está carregando. Tente novamente.");
      if (!s.settings.accepting)
        throw new Error("Os pedidos estão pausados. Fale com a equipe.");
      if (
        !Number.isInteger(data.table) ||
        data.table < 1 ||
        data.table > s.settings.tables
      )
        throw new Error("Escolha uma mesa válida.");
      if (!s.bag.length) throw new Error("Sua sacola está vazia.");
      if (
        data.name.trim().length < 2 ||
        !/^\d{10,11}$/.test(data.phone.replace(/\D/g, ""))
      )
        throw new Error("Informe seu nome e WhatsApp com DDD.");
      const items = s.bag.map((b) => {
        const p = s.products.find((p) => p.id === b.productId);
        if (
          !p?.available ||
          !p.published ||
          !s.categories.find((c) => c.id === p.categoryId)?.visible
        )
          throw new Error(
            "Um item ficou indisponível. Remova-o da sacola para continuar.",
          );
        if (choicePrice(p, b) !== b.price)
          throw new Error(
            "Um preço mudou. Remova e adicione o item novamente para confirmar o novo valor.",
          );
        if (!Number.isInteger(b.quantity) || b.quantity < 1 || b.quantity > 20)
          throw new Error("Quantidade inválida.");
        return { ...b, name: p.name, price: choicePrice(p, b) };
      });
      const at = new Date().toISOString();
      result = {
        id: crypto.randomUUID(),
        number: Math.max(1044, ...s.orders.map((o) => o.number)) + 1,
        session,
        customer: data.name.trim(),
        phone: data.phone,
        table: data.table,
        items,
        total: items.reduce((n, i) => n + i.price * i.quantity, 0),
        status: "recebido",
        createdAt: at,
        history: [{ status: "recebido", at }],
        idempotencyKey: data.key,
        fingerprint,
      };
      return {
        ...s,
        bag: [],
        orders: [result, ...s.orders],
        contacts: saveContact(s, data.name, data.phone, data.consent, "Pedido"),
      };
    });
    if (!result) throw new Error("Não foi possível salvar. Tente novamente.");
    return result;
  };
  const changeStatus = (id: string, status: Status, reason?: string) =>
    update((s) => ({
      ...s,
      orders: s.orders.map((o) => {
        if (o.id !== id) return o;
        const valid =
          status === "cancelado"
            ? ["recebido", "em_preparo"].includes(o.status) && !!reason?.trim()
            : statusFlow[statusFlow.indexOf(o.status) + 1] === status &&
              o.status !== "cancelado";
        if (!valid) throw new Error("Esta transição não está disponível.");
        return {
          ...o,
          status,
          reason,
          history: [...o.history, { status, at: new Date().toISOString() }],
        };
      }),
    }));
  return (
    <DemoContext.Provider
      value={{
        mode: "demo",
        slug: "demo",
        state,
        ready,
        session,
        error,
        update,
        add,
        checkout,
        changeStatus,
        notify: setToast,
        subscribe,
      }}
    >
      {children}
      {error && (
        <div className="global-error" role="alert">
          {error}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </DemoContext.Provider>
  );
}
function saveContact(
  s: DemoState,
  name: string,
  phone: string,
  consent: boolean,
  source: string,
) {
  const normalized = phone.replace(/\D/g, "");
  const at = new Date().toISOString();
  const previous = s.contacts.find((c) => c.phone === normalized);
  if (previous)
    return s.contacts.map((c) =>
      c.id === previous.id ? { ...c, lastAt: at } : c,
    );
  return [
    ...s.contacts,
    {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: normalized,
      firstAt: at,
      lastAt: at,
      consent: consent ? ("autorizado" as const) : ("nao_autorizado" as const),
      source,
      events: [
        {
          at,
          action: consent ? "autorizado" : "nao_autorizado",
          text: CONSENT,
          version: "1",
        },
      ],
    },
  ];
}
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("DemoProvider necessário");
  return context;
}
