import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const flow = load("src/lib/order-flow.ts");
const online = load("src/lib/online-order.ts");
const alerts = load("src/lib/order-alerts.ts");
const board = load("src/lib/order-board.ts");

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
  const zones = [{ id: "z1", fee_cents: 700 }];
  const options = { pickup: true, delivery: true, minimum: 2000, zones };
  const base = draftLib.initialDraft(options);
  assert.equal(base.fulfillment, "retirada");
  assert.equal(draftLib.initialDraft({ ...options, pickup: false }).fulfillment, "entrega");
  assert.equal(base.zoneId, "", "no zone is pre-selected");
  assert.deepEqual(
    draftLib.draftToChoice({ ...base, payment: "dinheiro", changeFor: "100,50" }, zones),
    { fulfillment: "retirada", payment: "dinheiro", changeFor: 10050 },
  );
  assert.equal(draftLib.draftToChoice({ ...base, payment: "pix", changeFor: "100" }, zones).changeFor, null);
  assert.equal(draftLib.draftToChoice({ ...base, payment: "dinheiro", changeFor: " " }, zones).changeFor, null);
  const entrega = { ...base, fulfillment: "entrega", street: "Rua A", number: "10" };
  assert.throws(() => draftLib.draftToChoice(entrega, zones), /Escolha o bairro/);
  const delivery = draftLib.draftToChoice({ ...entrega, zoneId: "z1" }, zones);
  assert.equal(delivery.fulfillment, "entrega");
  assert.equal(delivery.address.zoneId, "z1");
  assert.equal(delivery.address.street, "Rua A");
  assert.equal(delivery.expectedFee, 700, "the fee shown is sent for confirmation");
});

test("change accepts common Brazilian formats and rejects anything else", () => {
  const draftLib = load("src/lib/fulfillment-draft.ts");
  assert.equal(draftLib.parseChangeFor(""), null);
  assert.equal(draftLib.parseChangeFor("  "), null);
  assert.equal(draftLib.parseChangeFor("50"), 5000);
  assert.equal(draftLib.parseChangeFor("50,00"), 5000);
  assert.equal(draftLib.parseChangeFor("50.5"), 5050);
  assert.equal(draftLib.parseChangeFor("R$ 50"), 5000);
  assert.equal(draftLib.parseChangeFor("R$50,90"), 5090);
  assert.equal(draftLib.parseChangeFor("1.000,00"), 100000);
  assert.equal(draftLib.parseChangeFor("1.000"), 100000);
  for (const bad of ["abc", "50,", "50,000", "1,000.00", "-50", "0", "5 0", "50 reais", "1.00.0", "Infinity"])
    assert.throws(() => draftLib.parseChangeFor(bad), /Informe o troco em reais, por exemplo 50 ou 50,00\./, bad);
});

test("checkout draft follows refreshed options", () => {
  const draftLib = load("src/lib/fulfillment-draft.ts");
  const options = { pickup: true, delivery: true, minimum: 0, zones: [{ id: "z1", fee_cents: 500 }] };
  const draft = { ...draftLib.initialDraft(options), fulfillment: "entrega", zoneId: "z1" };
  assert.equal(draftLib.reconcileDraft(draft, options), draft, "unchanged draft keeps identity");
  assert.equal(draftLib.reconcileDraft(draft, { ...options, zones: [{ id: "z2", fee_cents: 500 }] }).zoneId, "");
  assert.equal(draftLib.unavailableModeMessage(draft, options), "");
  assert.match(draftLib.unavailableModeMessage(draft, { ...options, delivery: false, zones: [] }), /entrega deixou de estar disponível/);
  assert.match(
    draftLib.unavailableModeMessage({ ...draft, fulfillment: "retirada" }, { ...options, pickup: false }),
    /retirada deixou de estar disponível/,
  );
});

test("one-to-one embeds normalize arrays and missing values", () => {
  const embed = load("src/lib/embed.ts");
  assert.equal(embed.firstOrNull([]), null);
  assert.deepEqual(embed.firstOrNull([{ street: "Rua A" }]), { street: "Rua A" });
  assert.deepEqual(embed.firstOrNull({ street: "Rua A" }), { street: "Rua A" });
  assert.equal(embed.firstOrNull(null), null);
  assert.equal(embed.firstOrNull(undefined), null);
  assert.deepEqual(embed.withOrderAddress({ id: "o1", order_addresses: [] }), { id: "o1", order_addresses: null });
});

test("online options require at least one usable mode", () => {
  const draftLib = load("src/lib/fulfillment-draft.ts");
  const r = (pickup_enabled, delivery_enabled) => ({ pickup_enabled, delivery_enabled, delivery_min_order_cents: 1500 });
  const zones = [{ id: "z1" }];
  assert.equal(draftLib.onlineOptions(r(false, false), zones), undefined);
  assert.equal(draftLib.onlineOptions(r(false, true), []), undefined);
  const pickupOnly = draftLib.onlineOptions(r(true, true), []);
  assert.equal(pickupOnly.pickup, true);
  assert.equal(pickupOnly.delivery, false);
  const delivery = draftLib.onlineOptions(r(false, true), zones);
  assert.equal(delivery.delivery, true);
  assert.equal(delivery.pickup, false);
  assert.equal(delivery.minimum, 1500);
});

test("board shows online-only columns only when they have orders", () => {
  assert.deepEqual(board.boardColumns([], false), ["recebido", "em_preparo", "pronto"]);
  assert.deepEqual(
    board.boardColumns([{ status: "aguardando_aceite" }, { status: "saiu_para_entrega" }], false),
    ["aguardando_aceite", "recebido", "em_preparo", "pronto", "saiu_para_entrega"],
  );
  assert.deepEqual(board.boardColumns([], true), ["entregue", "recusado", "cancelado"]);
  assert.equal(board.columnTitle("aguardando_aceite"), "Aguardando aceite");
  assert.equal(board.columnTitle("pronto"), "Pronto");
});

test("modal kind follows the action", () => {
  assert.equal(board.modalKind("aguardando_aceite", "recebido"), "accept");
  assert.equal(board.modalKind("aguardando_aceite", "recusado"), "refuse");
  assert.equal(board.modalKind("em_preparo", "cancelado"), "cancel");
  assert.equal(board.modalKind("recebido", "em_preparo"), "preparing");
  assert.equal(board.modalKind("pronto", "saiu_para_entrega"), "confirm");
});
