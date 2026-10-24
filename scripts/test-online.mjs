import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const flow = load("src/lib/order-flow.ts");
const online = load("src/lib/online-order.ts");
const alerts = load("src/lib/order-alerts.ts");

test("each fulfillment has its own customer steps", () => {
  assert.deepEqual(flow.customerSteps("mesa"), ["recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.customerSteps("retirada"), ["aguardando_aceite", "recebido", "em_preparo", "pronto", "entregue"]);
  assert.deepEqual(flow.customerSteps("entrega"), ["aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega", "entregue"]);
});

test("next action follows the database transitions", () => {
  assert.equal(flow.nextAction("aguardando_aceite", "entrega").status, "recebido");
  assert.equal(flow.nextAction("pronto", "entrega").status, "saiu_para_entrega");
  assert.equal(flow.nextAction("pronto", "retirada").status, "entregue");
  assert.equal(flow.nextAction("pronto", "retirada").label, "Confirmar retirada");
  assert.equal(flow.nextAction("saiu_para_entrega", "entrega").status, "entregue");
  assert.equal(flow.nextAction("entregue", "mesa"), null);
  assert.equal(flow.canCancel("saiu_para_entrega"), true);
  assert.equal(flow.canCancel("pronto"), false);
  assert.equal(flow.canCancel("aguardando_aceite"), false);
});

test("labels speak the customer's language per fulfillment", () => {
  assert.equal(flow.statusLabel("entregue", "retirada"), "Retirado");
  assert.equal(flow.statusLabel("pronto", "retirada"), "Pronto para retirar");
  assert.equal(flow.statusLabel("aguardando_aceite", "entrega"), "Aguardando o restaurante aceitar");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "mesa", table: 4 }), "Mesa 04");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "entrega", zone: "Centro" }), "Entrega · Centro");
  assert.equal(flow.fulfillmentLabel({ fulfillment: "retirada" }), "Retirada");
});

test("totals add the zone fee only for delivery", () => {
  assert.deepEqual(online.orderTotals(5000, "entrega", { fee_cents: 700 }), { subtotal: 5000, fee: 700, total: 5700 });
  assert.deepEqual(online.orderTotals(5000, "retirada", { fee_cents: 700 }), { subtotal: 5000, fee: 0, total: 5000 });
  assert.deepEqual(online.orderTotals(5000, "entrega", null), { subtotal: 5000, fee: 0, total: 5000 });
  assert.equal(online.missingForMinimum(2500, 3000), 500);
  assert.equal(online.missingForMinimum(3500, 3000), 0);
});

test("change is only for cash and never below the total", () => {
  assert.equal(online.isValidChange(null, 5700, "dinheiro"), true);
  assert.equal(online.isValidChange(10000, 5700, "dinheiro"), true);
  assert.equal(online.isValidChange(5000, 5700, "dinheiro"), false);
  assert.equal(online.isValidChange(10000, 5700, "pix"), false);
});

test("WhatsApp link targets the customer's Brazilian number with a readable summary", () => {
  const url = new URL(
    online.whatsappConfirmationLink({
      number: 42,
      customer_name: "Ana",
      customer_phone: "11988887777",
      fulfillment: "entrega",
      total_cents: 5700,
      payment_method: "dinheiro",
      change_for_cents: 10000,
      items: [{ quantity: 2, product_name: "Burger" }],
      address: { zone_name: "Centro", street: "Rua A", number: "10", complement: "", reference: "Portão azul" },
      restaurantName: "Casa X",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://wa.me/5511988887777");
  const text = url.searchParams.get("text");
  assert.match(text, /Casa X/);
  assert.match(text, /pedido #42/);
  assert.match(text, /2× Burger/);
  assert.match(text, /Rua A, 10 · Centro/);
  assert.match(text, /Dinheiro \(troco para R\$\s?100,00\)/);
  assert.match(text, /R\$\s?57,00/);
});

test("alert repeats while there are pending orders, unless muted", () => {
  assert.equal(alerts.pendingCount([{ status: "aguardando_aceite" }, { status: "recebido" }]), 1);
  const base = { pending: 1, newOrderIds: [], lastPlayedAt: 0, now: 25000, muted: false };
  assert.equal(alerts.shouldPlayAlert(base), true);
  assert.equal(alerts.shouldPlayAlert({ ...base, now: 10000 }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, pending: 0, newOrderIds: ["x"], now: 1 }), true);
  assert.equal(alerts.shouldPlayAlert({ ...base, pending: 0 }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, muted: true }), false);
  assert.equal(alerts.shouldPlayAlert({ ...base, lastPlayedAt: null, now: 1 }), true);
});

test("draft converts reais to cents and keeps change only for cash", () => {
  const draftLib = load("src/lib/fulfillment-draft.ts");
  const options = { pickup: true, delivery: true, minimum: 2000, zones: [{ id: "z1" }] };
  const base = draftLib.initialDraft(options);
  assert.equal(base.fulfillment, "retirada");
  assert.equal(draftLib.initialDraft({ ...options, pickup: false }).fulfillment, "entrega");
  assert.equal(base.zoneId, "z1");
  assert.deepEqual(
    draftLib.draftToChoice({ ...base, payment: "dinheiro", changeFor: "100,50" }),
    { fulfillment: "retirada", payment: "dinheiro", changeFor: 10050 },
  );
  assert.equal(draftLib.draftToChoice({ ...base, payment: "pix", changeFor: "100" }).changeFor, null);
  assert.equal(draftLib.draftToChoice({ ...base, payment: "dinheiro", changeFor: " " }).changeFor, null);
  const delivery = draftLib.draftToChoice({ ...base, fulfillment: "entrega", street: "Rua A", number: "10" });
  assert.equal(delivery.fulfillment, "entrega");
  assert.equal(delivery.address.zoneId, "z1");
  assert.equal(delivery.address.street, "Rua A");
});
