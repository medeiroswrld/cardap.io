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
    zoneId: options.zones[0]?.id ?? "",
    street: "",
    number: "",
    complement: "",
    reference: "",
  };
}

// Converts the form draft into the checkout choice; reais → centavos.
export function draftToChoice(draft: FulfillmentDraft): OnlineChoice {
  const changeFor =
    draft.payment === "dinheiro" && draft.changeFor.trim()
      ? Math.round(Number(draft.changeFor.replace(",", ".")) * 100)
      : null;
  if (draft.fulfillment === "retirada")
    return { fulfillment: "retirada", payment: draft.payment, changeFor };
  return {
    fulfillment: "entrega",
    payment: draft.payment,
    changeFor,
    address: {
      zoneId: draft.zoneId,
      street: draft.street,
      number: draft.number,
      complement: draft.complement,
      reference: draft.reference,
    },
  };
}
