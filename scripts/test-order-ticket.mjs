import { test } from "node:test";
import assert from "node:assert/strict";
import { loader } from "./lib/ts-loader.mjs";

const load = loader();
const ticket = load("src/lib/order-ticket.ts");

const order = {
  id: "o1",
  number: 42,
  status: "recebido",
  fulfillment: "entrega",
  created_at: "2026-11-11T22:30:00.000Z",
  customer_name: "Ana <script>",
  customer_phone: "11988887777",
  total_cents: 5700,
  delivery_fee_cents: 700,
  payment_method: "dinheiro",
  change_for_cents: 10000,
  estimate_minutes: 40,
  dining_tables: null,
  order_addresses: { zone_name: "Centro", street: "Rua A", number: "10", complement: "Apto 3", reference: "Portão azul" },
  order_items: [
    { product_name: "Burger", quantity: 2, unit_price_cents: 2500, note: "bem passado", removed_ingredients: ["cebola"], add_ons: [{ id: "x", name: "Bacon", price_cents: 300 }] },
  ],
};

test("ticket has number, address, items, choices, totals and change", () => {
  const html = ticket.ticketHtml(order, "Capi Burguer", 80, "America/Sao_Paulo");
  for (const text of ["PEDIDO #42", "ENTREGA · CENTRO", "Rua A, 10", "Apto 3", "Portão azul", "2x Burger", "SEM: cebola", "+ Bacon", "OBS: bem passado", "(11) 98888-7777", "Taxa de entrega", "Dinheiro", "19:30"])
    assert.ok(html.includes(text), text);
  assert.match(html, /TOTAL<\/span><span>R\$\s57,00/);
  assert.match(html, /levar R\$\s43,00/);
  assert.ok(html.includes("size:80mm auto"));
});

test("ticket escapes customer text", () => {
  const html = ticket.ticketHtml(order, "Casa", 58);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Ana &lt;script&gt;"));
  assert.ok(html.includes("size:58mm auto"));
});

test("table ticket shows the table and no phone", () => {
  const html = ticket.ticketHtml(
    { ...order, fulfillment: "mesa", dining_tables: { number: 3 }, order_addresses: null, payment_method: null, change_for_cents: null, delivery_fee_cents: 0, total_cents: 5000 },
    "Casa",
    80,
  );
  assert.ok(html.includes("MESA 03"));
  assert.ok(!html.includes("Tel:"));
  assert.ok(!html.includes("Taxa de entrega"));
});

test("auto-print takes each received order once", () => {
  const printed = new Set(["a"]);
  const list = [
    { id: "a", status: "recebido" },
    { id: "b", status: "recebido" },
    { id: "c", status: "aguardando_aceite" },
    { id: "d", status: "em_preparo" },
  ];
  assert.deepEqual(ticket.ordersToPrint(list, printed).map((o) => o.id), ["b"]);
});
