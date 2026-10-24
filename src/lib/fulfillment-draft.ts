import type { PaymentMethod } from "./order-flow";
import type { DeliveryZone } from "./connected-types";
import type { OnlineChoice } from "@/components/demo-provider";

export type OnlineOptions = {
  pickup: boolean;
  delivery: boolean;
  minimum: number;
  zones: DeliveryZone[];
};
export type FulfillmentDraft = {
  fulfillment: "retirada" | "entrega";
  payment: PaymentMethod;
  changeFor: string;
  zoneId: string;
  street: string;
  number: string;
  complement: string;
  reference: string;
};

// Online ordering is offered only when at least one mode is actually usable.
export function onlineOptions(
  restaurant: {
    pickup_enabled: boolean;
    delivery_enabled: boolean;
    delivery_min_order_cents: number;
  },
  zones: DeliveryZone[],
): OnlineOptions | undefined {
  const delivery = restaurant.delivery_enabled && zones.length > 0;
  if (!restaurant.pickup_enabled && !delivery) return undefined;
  return {
    pickup: restaurant.pickup_enabled,
    delivery,
    minimum: restaurant.delivery_min_order_cents,
    zones,
  };
}

export function initialDraft(options: OnlineOptions): FulfillmentDraft {
  return {
    fulfillment: options.pickup ? "retirada" : "entrega",
    payment: "pix",
    changeFor: "",
    zoneId: "", // the customer always picks the zone (and sees its fee) explicitly
    street: "",
    number: "",
    complement: "",
    reference: "",
  };
}

export const CHANGE_FORMAT_MESSAGE =
  "Informe o troco em reais, por exemplo 50 ou 50,00.";

// "50", "50,00", "50.5", "R$ 50", "1.000,00" → centavos. Empty → null.
export function parseChangeFor(text: string): number | null {
  const value = text.replace(/^\s*R\$\s*/i, "").trim();
  if (!value) return null;
  let normalized: string | null = null;
  if (/^\d+$/.test(value)) normalized = value;
  else if (/^\d+[.,]\d{1,2}$/.test(value)) normalized = value.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(value))
    normalized = value.replace(/\./g, "").replace(",", ".");
  const cents = normalized === null ? NaN : Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 10000000)
    throw new Error(CHANGE_FORMAT_MESSAGE);
  return cents;
}

// Keeps the draft consistent with options refreshed while the checkout is open:
// a zone that disappeared must be chosen again. Returns the same object if unchanged.
export function reconcileDraft(
  draft: FulfillmentDraft,
  options: OnlineOptions,
): FulfillmentDraft {
  if (draft.zoneId && !options.zones.some((z) => z.id === draft.zoneId))
    return { ...draft, zoneId: "" };
  return draft;
}

// Blocks submit when the chosen mode stopped being offered; the customer picks again.
export function unavailableModeMessage(
  draft: FulfillmentDraft,
  options: OnlineOptions,
): string {
  if (draft.fulfillment === "entrega" && !options.delivery)
    return "A entrega deixou de estar disponível agora. Escolha a retirada para continuar.";
  if (draft.fulfillment === "retirada" && !options.pickup)
    return "A retirada deixou de estar disponível agora. Escolha a entrega para continuar.";
  return "";
}

// Converts the form draft into the checkout choice; reais → centavos.
export function draftToChoice(
  draft: FulfillmentDraft,
  zones: DeliveryZone[],
): OnlineChoice {
  const changeFor =
    draft.payment === "dinheiro" ? parseChangeFor(draft.changeFor) : null;
  if (draft.fulfillment === "retirada")
    return { fulfillment: "retirada", payment: draft.payment, changeFor };
  const zone = zones.find((z) => z.id === draft.zoneId);
  if (!zone) throw new Error("Escolha o bairro da entrega.");
  return {
    fulfillment: "entrega",
    payment: draft.payment,
    changeFor,
    expectedFee: zone.fee_cents,
    address: {
      zoneId: zone.id,
      street: draft.street,
      number: draft.number,
      complement: draft.complement,
      reference: draft.reference,
    },
  };
}
