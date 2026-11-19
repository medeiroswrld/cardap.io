// Turns OUR OWN test restaurant ("meu-test") into the "Brasa Burger" presentation account:
// fictional identity, tidy catalog, realistic 90-day history (orders, CRM, coupons, origins,
// metrics, reviews and finance). Every write is scoped to ONE restaurant id.
//
//   node scripts/seed-presentation.mjs              -> --dry-run (default): reads only, prints the plan
//   node scripts/seed-presentation.mjs --validate   -> dry-run + replays the plan twice on a local PGlite
//                                                      database with all migrations (no remote writes)
//   node scripts/seed-presentation.mjs --apply      -> wipes this restaurant's activity and writes the plan
//
// Idempotent: --apply deletes this restaurant's activity first and uses deterministic ids, so running it
// twice gives the same end state (dates are relative to the moment it runs). Never prints keys.
import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const RESTAURANT_ID = "52edae74-8b07-46cb-b506-cd20c203bdfe";
const ALLOWED_SLUGS = ["meu-test", "brasa-burger"];
const NEW_SLUG = "brasa-burger";
const DAY = 86400000;
const MIN = 60000;

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const VALIDATE = args.has("--validate");
if (APPLY && (VALIDATE || args.has("--dry-run"))) {
  console.error("Use --apply sozinho, ou --dry-run/--validate.");
  process.exit(1);
}
for (const a of args)
  if (!["--apply", "--dry-run", "--validate"].includes(a)) {
    console.error("Flag desconhecida: " + a);
    process.exit(1);
  }

// ---------------------------------------------------------------- deterministic helpers
function did(name) {
  const h = createHash("sha256").update("brasa-presentation:" + name).digest("hex");
  const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const hex64 = (name) => createHash("sha256").update("brasa-presentation-token:" + name).digest("hex");
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261119);
const chance = (p) => rand() < p;
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
function weighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) if ((r -= w) < 0) return value;
  return entries[entries.length - 1][0];
}
const brl = (c) => "R$ " + (c / 100).toFixed(2).replace(".", ",");

// ---------------------------------------------------------------- time (America/Sao_Paulo = UTC-3, no DST)
const NOW = new Date();
const SP_OFFSET = 3 * 60 * MIN;
const localNow = new Date(NOW.getTime() - SP_OFFSET);
const TODAY = { y: localNow.getUTCFullYear(), m: localNow.getUTCMonth(), d: localNow.getUTCDate() };
const MIDNIGHT = Date.UTC(TODAY.y, TODAY.m, TODAY.d) + SP_OFFSET; // local 00:00 today, as UTC ms
const at = (dayOffset, minutes) => new Date(MIDNIGHT + dayOffset * DAY + minutes * MIN);
const weekday = (dayOffset) => new Date(Date.UTC(TODAY.y, TODAY.m, TODAY.d + dayOffset)).getUTCDay();
const isoDate = (dayOffset) => new Date(Date.UTC(TODAY.y, TODAY.m, TODAY.d + dayOffset)).toISOString().slice(0, 10);
const monthKey = (date) => new Date(date.getTime() - SP_OFFSET).toISOString().slice(0, 7);
const minutesAgo = (n) => new Date(NOW.getTime() - n * MIN);
const iso = (d) => d.toISOString();
const later = (d, minutes) => new Date(d.getTime() + minutes * MIN);
const capNow = (d) => (d.getTime() > NOW.getTime() - MIN ? new Date(NOW.getTime() - MIN) : d);

// Fri/Sat peaks, Thu/Sun good, Tue/Wed quiet, Monday closed (no orders).
const DOW_WEIGHT = [2.2, 0, 0.9, 1, 1.6, 3, 3.3];
function eveningMinutes() {
  // 18:00 -> 23:15, triangular with the peak around 20:15.
  const a = 0, b = 315, c = 135, u = rand();
  const x = u < c / b ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
  return 18 * 60 + Math.round(x);
}
function pickDays(count, from, to, taken = new Set()) {
  const days = [];
  let guard = 0;
  while (days.length < count && guard++ < 5000) {
    const d = int(from, to);
    if (taken.has(d) || days.includes(d)) continue;
    if (rand() * 3.3 > DOW_WEIGHT[weekday(d)]) continue;
    days.push(d);
  }
  return days.sort((x, y) => x - y);
}

// ---------------------------------------------------------------- copy
const IDENTITY = {
  name: "Brasa Burger",
  slug: NEW_SLUG,
  subtitle: "Hambúrguer artesanal na brasa · Itapetininga",
  address: "Rua Campos Salles, 410 · Centro, Itapetininga - SP",
};
// A presentation can happen at any hour and place_guest_order rejects orders outside these slots
// (and the menu shows "Fechado agora"), so the menu stays open every day, 00:00-23:59.
const OPENING_HOURS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "00:00", close: "23:59" }));
// Exactly the "Brasa" preset of src/lib/menu-theme.ts (warm red), as the theme editor saves it. No logo:
// the previous upload was an unrelated test image, so the brand initials show instead.
const MENU_THEME = {
  preset: "brasa", mode: "light", brand: "#a63232", background: "#fff8f2", surface: "#ffffff",
  text: "#251c1a", heading_font: "padrao", body_font: "manrope", radius: "suave",
};
const CATEGORY_NAMES = { Lanches: "Burgers" };
const PRODUCT_COPY = {
  "Burger Clássico": "Blend bovino de 150 g na brasa, queijo prato derretido, alface, tomate e molho da casa no pão brioche.",
  "Burger Bacon": "Blend de 150 g na brasa, queijo, bacon crocante e cebola caramelizada no brioche selado na manteiga.",
  "Burger Duplo": "Dois blends de 150 g na brasa, queijo em dobro, picles e molho da casa.",
  "Burger Vegetariano": "Hambúrguer artesanal de grão-de-bico grelhado, queijo, folhas frescas, tomate e molho da casa.",
  "Batata Frita": "Porção generosa de batatas sequinhas e douradas, com sal na medida. Serve bem duas pessoas.",
  "Batata com Cheddar e Bacon": "Batatas crocantes cobertas com cheddar cremoso e bacon em cubos. Difícil dividir.",
  "Anéis de Cebola": "Anéis empanados, crocantes por fora e macios por dentro, com o molho da casa para mergulhar.",
  "Refrigerante Lata": "Lata de 350 ml bem gelada. Diga o sabor nas observações.",
  "Suco de Laranja": "Suco natural de laranja, 300 ml, feito na hora do pedido.",
  "Água Mineral": "Garrafa de 500 ml. Com ou sem gás, é só avisar nas observações.",
  "Brownie com Sorvete": "Brownie de chocolate meio amargo, quentinho, com uma bola de sorvete de baunilha por cima.",
  "Pudim da Casa": "Pudim de leite cremoso, receita da casa, com calda de caramelo.",
};
// Only products without a photo get one. /images/burger.jpg ships with the app (public/images, Unsplash,
// see public/images/SOURCES.md) and the menu renders photo_url as a plain <img>.
const PHOTO_FALLBACK = { "Burger Clássico": "/images/burger.jpg" };
const COMBO_CATEGORY_ID = did("category:combos");
const UPSELL_OPTION_ID = did("option:vira-combo");
const ZONES = [
  { key: "centro", name: "Centro", fee: 500, eta: 30, streets: ["Rua Monsenhor Soares", "Rua Saldanha Marinho", "Rua Prudente de Moraes"] },
  { key: "vila-regina", name: "Vila Regina", fee: 700, eta: 40, streets: ["Rua das Acácias", "Rua dos Ipês", "Rua das Palmeiras"] },
  { key: "jardim-italia", name: "Jardim Itália", fee: 800, eta: 45, streets: ["Rua Florença", "Rua Veneza", "Rua Verona"] },
  { key: "vila-aparecida", name: "Vila Aparecida", fee: 900, eta: 50, streets: ["Rua São Benedito", "Rua Santa Rita", "Rua São Judas Tadeu"] },
].map((z, i) => ({ ...z, id: did("zone:" + z.key), position: i }));
const ORIGINS = [
  { slug: "panfleto", name: "Panfleto no bairro" },
  { slug: "google-maps", name: "Google Maps" },
];
const NAMES = [
  "Ana Paula Souza", "Bruno Oliveira", "Camila Santos", "Diego Ferreira", "Eduarda Lima", "Felipe Rodrigues",
  "Gabriela Almeida", "Gustavo Pereira", "Helena Carvalho", "Igor Ribeiro", "Juliana Gomes", "Lucas Martins",
  "Larissa Araújo", "Marcos Barbosa", "Mariana Rocha", "Mateus Dias", "Natália Castro", "Otávio Moreira",
  "Patrícia Nunes", "Rafael Mendes", "Renata Freitas", "Rodrigo Teixeira", "Sabrina Correia", "Thiago Cardoso",
  "Vanessa Pinto", "Vinícius Azevedo", "Aline Monteiro", "André Lopes", "Beatriz Cavalcanti", "Carlos Eduardo Ramos",
  "Daniela Vieira", "Fernanda Batista", "Henrique Moura", "Isabela Farias", "João Pedro Campos", "Letícia Duarte",
  "Leonardo Machado", "Luana Pires", "Marcelo Tavares", "Priscila Fonseca", "Ricardo Nogueira", "Tatiane Prado",
  "Wesley Andrade", "Yasmin Borges", "Caio Fernandes", "Bianca Melo", "Matheus Siqueira", "Paula Rezende",
  "Samuel Queiroz", "Júlia Antunes",
];
const COMMENTS = {
  "Burger Clássico": ["Carne no ponto certinho e pão macio. Virou meu pedido de sexta.", "Simples e muito bem feito, o molho da casa é ótimo."],
  "Burger Bacon": ["Bacon crocante de verdade e a cebola caramelizada faz toda a diferença.", "Melhor burger de bacon da cidade, chegou quentinho."],
  "Burger Vegetariano": ["Finalmente um vegetariano que não é só salada. Muito saboroso!"],
  "Batata com Cheddar e Bacon": ["Porção bem servida, deu para três pessoas."],
  "Anéis de Cebola": ["Sequinhos e crocantes, o molho combina demais."],
  "Brownie com Sorvete": ["Brownie quentinho com sorvete, sobremesa perfeita."],
  "Pudim da Casa": ["Pudim lisinho, igual de vó."],
  "Combo Brasa": ["Combo vale muito a pena, chegou tudo certo e rápido."],
};

// ---------------------------------------------------------------- read state (read-only)
async function readState(sb) {
  const one = async (q, label) => {
    const { data, error } = await q;
    if (error) throw new Error(`Leitura falhou (${label}): ${error.message}`);
    return data;
  };
  const R = RESTAURANT_ID;
  const restaurant = await one(sb.from("restaurants").select("*").eq("id", R).maybeSingle(), "restaurants");
  if (!restaurant) throw new Error("Restaurante não encontrado: " + R);
  if (!ALLOWED_SLUGS.includes(restaurant.slug))
    throw new Error(`ABORTADO: slug atual "${restaurant.slug}" não é ${ALLOWED_SLUGS.join(" nem ")}.`);
  const clash = await one(sb.from("restaurants").select("id").eq("slug", NEW_SLUG).neq("id", R), "slug");
  if (clash.length) throw new Error(`ABORTADO: o slug ${NEW_SLUG} já pertence a outro restaurante.`);
  const [categories, products, options, links, media, tables, pix, billing, zones] = await Promise.all([
    one(sb.from("categories").select("*").eq("restaurant_id", R).order("position"), "categories"),
    one(sb.from("products").select("*").eq("restaurant_id", R).order("position"), "products"),
    one(sb.from("product_options").select("*").eq("restaurant_id", R), "product_options"),
    one(sb.from("product_option_links").select("*").eq("restaurant_id", R), "product_option_links"),
    one(sb.from("product_media").select("*").eq("restaurant_id", R), "product_media"),
    one(sb.from("dining_tables").select("*").eq("restaurant_id", R).order("number"), "dining_tables"),
    one(sb.from("restaurant_pix").select("restaurant_id").eq("restaurant_id", R), "restaurant_pix"),
    one(sb.from("restaurant_billing").select("plan,status").eq("restaurant_id", R), "restaurant_billing"),
    one(sb.from("delivery_zones").select("*").eq("restaurant_id", R), "delivery_zones"),
  ]);
  const counts = {};
  for (const table of WIPE_ORDER) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("restaurant_id", R);
    if (error) throw new Error(`Contagem falhou (${table}): ${error.message}`);
    counts[table] = count;
  }
  return { restaurant, categories, products, options, links, media, tables, hasPix: pix.length > 0, billing: billing[0] || null, zones, counts };
}

// Children before parents (no ON DELETE CASCADE between these tables).
const WIPE_ORDER = [
  "product_feedback", "video_view_sessions", "photo_view_sessions", "cart_add_events",
  "order_status_events", "order_items", "order_addresses", "orders", "guest_sessions",
  "marketing_consent_events", "contacts", "coupons", "order_origins", "finance_entries",
  "data_erasure_events", "delivery_zones",
];

// ---------------------------------------------------------------- plan
function buildPlan(state) {
  const R = RESTAURANT_ID;
  const byName = new Map(state.products.map((p) => [p.name, p]));
  const need = (name) => {
    const p = byName.get(name);
    if (!p) throw new Error("Produto esperado não encontrado: " + name);
    return p;
  };
  const optionByName = new Map(state.options.filter((o) => o.active).map((o) => [o.name, o]));
  const catByName = new Map(state.categories.map((c) => [c.name, c]));
  const burgersCat = catByName.get("Lanches") || catByName.get("Burgers");
  if (!burgersCat) throw new Error("Categoria Lanches/Burgers não encontrada.");
  const activeTables = state.tables.filter((t) => t.active);
  if (!activeTables.length) throw new Error("Nenhuma mesa ativa.");

  // --- catalog
  const productUpdates = state.products.map((p) => {
    const patch = {};
    const copy = PRODUCT_COPY[p.name] ?? p.description.replace(/\s*Produto de demonstração\.?/g, "").trim();
    if (copy !== p.description) patch.description = copy;
    if (!p.photo_url && PHOTO_FALLBACK[p.name]) patch.photo_url = PHOTO_FALLBACK[p.name];
    return { id: p.id, name: p.name, patch };
  });
  const photoOf = (name) => {
    const u = productUpdates.find((x) => x.name === name);
    return u?.patch.photo_url ?? byName.get(name)?.photo_url ?? null;
  };
  const categoryUpdates = state.categories
    .filter((c) => CATEGORY_NAMES[c.name])
    .map((c) => ({ id: c.id, patch: { name: CATEGORY_NAMES[c.name] } }));
  const comboCategory = { id: COMBO_CATEGORY_ID, restaurant_id: R, name: "Combos", position: 4, visible: true };
  const combos = [
    { key: "brasa", name: "Combo Brasa", price_cents: 4290, photo: photoOf("Burger Clássico"),
      description: "Burger Clássico + batata frita individual + refrigerante lata. O jeito mais fácil de matar a fome.",
      ingredients: "Burger Clássico, batata frita individual e refrigerante lata.", position: 12 },
    { key: "bacon", name: "Combo Bacon", price_cents: 4790, photo: photoOf("Burger Bacon"),
      description: "Burger Bacon + batata frita individual + refrigerante lata. Para quem não abre mão do bacon.",
      ingredients: "Burger Bacon, batata frita individual e refrigerante lata.", position: 13 },
  ].map((c) => ({
    id: did("product:combo-" + c.key), restaurant_id: R, category_id: COMBO_CATEGORY_ID, name: c.name,
    description: c.description, ingredients: c.ingredients, allergens: "Contém trigo, leite e ovos.",
    price_cents: c.price_cents, photo_url: c.photo, published: true, available: true, archived: false,
    position: c.position, removable_ingredients: [],
  }));
  const P = {
    classico: need("Burger Clássico"), bacon: need("Burger Bacon"), veg: need("Burger Vegetariano"),
    batata: need("Batata Frita"), cheddar: need("Batata com Cheddar e Bacon"), aneis: need("Anéis de Cebola"),
    refri: need("Refrigerante Lata"), suco: need("Suco de Laranja"), agua: need("Água Mineral"),
    brownie: need("Brownie com Sorvete"), pudim: need("Pudim da Casa"),
    comboBrasa: combos[0], comboBacon: combos[1],
  };
  const burgers = [P.classico, P.bacon, P.veg];
  const upsell = { id: UPSELL_OPTION_ID, restaurant_id: R, name: "Vira combo: batata + refri", price_cents: 1490, active: true, offer_in_bag: true };
  const upsellLinks = burgers.map((p) => ({ restaurant_id: R, product_id: p.id, option_id: upsell.id }));
  const staleOptions = state.options.filter((o) => o.name.trim().toLowerCase() === "batata frita" && !o.active).map((o) => o.id);
  const extras = ["Bacon extra", "Queijo extra", "Molho extra", "Hambúrguer extra"]
    .map((n) => optionByName.get(n)).filter(Boolean);
  const linkSet = new Set(state.links.filter((l) => !staleOptions.includes(l.option_id)).map((l) => l.product_id + ":" + l.option_id));
  for (const l of upsellLinks) linkSet.add(l.product_id + ":" + l.option_id);
  const optionsFor = (product) => [...extras, upsell].filter((o) => linkSet.has(product.id + ":" + o.id));

  const restaurantPatch = {
    ...IDENTITY, opening_hours: OPENING_HOURS, menu_theme: MENU_THEME, accepting_orders: true,
    pickup_enabled: true, delivery_enabled: true, delivery_min_order_cents: 2500, auto_accept_orders: true,
    feedback_enabled: true, bag_suggestions: [P.aneis.id, P.refri.id, P.brownie.id],
  };
  const zones = ZONES.map((z) => ({ id: z.id, restaurant_id: R, name: z.name, fee_cents: z.fee, estimate_minutes: z.eta, active: true, position: z.position }));
  const coupons = [
    { id: did("coupon:VOLTA10"), restaurant_id: R, code: "VOLTA10", kind: "percent", value: 10, min_order_cents: 0, valid_until: isoDate(60), active: true, created_at: iso(at(-55, 15 * 60)) },
    { id: did("coupon:FRETEGRATIS"), restaurant_id: R, code: "FRETEGRATIS", kind: "fixed", value: 700, min_order_cents: 4000, valid_until: isoDate(45), active: true, created_at: iso(at(-42, 16 * 60)) },
  ];
  const origins = ORIGINS.map((o, i) => ({ id: did("origin:" + o.slug), restaurant_id: R, slug: o.slug, name: o.name, created_at: iso(at(-70 + i * 20, 15 * 60)) }));

  // --- customers
  const profiles = [
    ...Array(8).fill("vip"), ...Array(14).fill("recorrente"), ...Array(10).fill("novo"),
    ...Array(6).fill("sumido35"), ...Array(4).fill("sumido65"), ...Array(3).fill("sumido95"), ...Array(3).fill("sem_pedidos"),
  ];
  const customers = profiles.map((profile, i) => {
    const name = NAMES[i];
    const phone = "1590000" + String(1000 + i * 37).padStart(4, "0");
    const zone = pick(ZONES);
    return {
      i, name, phone, profile, id: did("contact:" + phone),
      prefers: weighted([["mesa", 4], ["retirada", 2], ["entrega", 4]]),
      zone, street: pick(zone.streets), number: String(int(12, 1890)),
      complement: chance(0.3) ? pick(["Apto 12", "Apto 34", "Casa 2", "Fundos", "Bloco B, apto 21"]) : "",
      reference: chance(0.4) ? pick(["Portão verde", "Ao lado da padaria", "Em frente à praça", "Casa de esquina"]) : "",
      marketing: profile.startsWith("sumido") ? (chance(0.85) ? "authorized" : "not_authorized")
        : weighted([["authorized", 8], ["not_authorized", 2]]),
      days: [],
    };
  });
  customers[5].marketing = "revoked"; // one revoked consent, as happens in real life
  const ranges = {
    vip: () => { const n = int(8, 12); const d = pickDays(n - 1, -88, -10); return [...d, ...pickDays(1, -9, -1, new Set(d))]; },
    recorrente: () => { const n = int(2, 4); const last = pickDays(1, -25, -3); return [...pickDays(n - 1, -58, last[0] - 4), ...last]; },
    novo: () => pickDays(1, -25, -1),
    sumido35: () => { const last = pickDays(1, -45, -32); return [...pickDays(int(1, 2), -88, last[0] - 7), ...last]; },
    sumido65: () => { const last = pickDays(1, -80, -62); return [...pickDays(int(0, 2), -95, last[0] - 6), ...last]; },
    sumido95: () => { const last = pickDays(1, -100, -92); return [...pickDays(int(0, 1), -110, last[0] - 6), ...last]; },
    sem_pedidos: () => [],
  };
  for (const c of customers) c.days = ranges[c.profile]().sort((a, b) => a - b);
  customers.find((c) => c.profile === "vip").tags = ["Cliente fiel"];
  customers.filter((c) => c.profile === "vip")[1].notes = "Gosta do burger mais passado. Sempre pede molho extra.";
  customers.filter((c) => c.profile === "vip")[2].tags = ["Cliente fiel", "Aniversário em dezembro"];
  customers.filter((c) => c.profile === "recorrente")[0].tags = ["Pede sem cebola"];
  customers.filter((c) => c.profile === "recorrente")[3].tags = ["Vegetariana"];
  customers.filter((c) => c.profile === "sumido35")[0].notes = "Vinha toda semana com a família. Mandar o VOLTA10.";

  // --- orders
  const guestSessions = [], orders = [], items = [], addresses = [], events = [];
  const cartAdds = [], photoViews = [], videoViews = [], feedback = [];
  const video = state.media.find((m) => m.kind === "video" && m.state === "ready" && Number(m.duration_seconds) > 0);
  const photoProducts = [
    ...state.products.filter((p) => !p.archived && p.published).map((p) => ({ id: p.id, photo: photoOf(p.name), position: p.position })),
    ...combos.map((c) => ({ id: c.id, photo: c.photo_url, position: c.position })),
  ].filter((p) => p.photo);

  function newSession(key, start) {
    const s = { id: did("guest:" + key), restaurant_id: R, token_hash: hex64(key), created_at: iso(start), expires_at: iso(later(start, 12 * 60)) };
    guestSessions.push(s);
    return s;
  }
  function line(product, extraOptions = [], removed = [], note = "") {
    const addOns = extraOptions.map((o) => ({ id: o.id, name: o.name, price_cents: o.price_cents })).sort((a, b) => (a.id < b.id ? -1 : 1));
    return { product, addOns, removed, note, unit: product.price_cents + addOns.reduce((s, o) => s + o.price_cents, 0), quantity: 1 };
  }
  function buildBag(kind) {
    const people = kind === "mesa" ? weighted([[1, 1], [2, 4], [3, 2], [4, 1]]) : weighted([[1, 4], [2, 4], [3, 1]]);
    const bag = [];
    for (let i = 0; i < people; i++) {
      if (kind !== "mesa" && chance(0.18)) { bag.push(line(chance(0.55) ? P.comboBrasa : P.comboBacon, [], [], "Refri: " + pick(["Coca-Cola", "Guaraná", "Coca Zero"]))); continue; }
      const burger = weighted([[P.classico, 35], [P.bacon, 38], [P.veg, 12]]);
      const opts = optionsFor(burger);
      const chosen = [];
      if (chance(0.25)) { const e = opts.filter((o) => o.id !== upsell.id); if (e.length) chosen.push(pick(e)); }
      if (kind !== "mesa" && chance(0.12) && opts.some((o) => o.id === upsell.id)) chosen.push(upsell);
      const removable = (burger.removable_ingredients || []).filter((x) => ["Cebola", "Tomate", "Alface", "Molho", "Picles"].includes(x));
      const removed = removable.length && chance(0.12) ? [pick(removable)] : [];
      const note = chance(0.07) ? pick(["Carne ao ponto, por favor", "Caprichar no molho", "Cortar ao meio"]) : "";
      bag.push(line(burger, chosen, removed, note));
      if (!chosen.includes(upsell) && chance(0.75)) {
        const drink = weighted([[P.refri, 6], [P.suco, 2.5], [P.agua, 1.5]]);
        const dnote = drink === P.refri ? pick(["Coca-Cola", "Guaraná", "Coca Zero", "Fanta Laranja"]) : drink === P.agua ? pick(["Sem gás", "Com gás"]) : "";
        bag.push(line(drink, [], [], dnote));
      }
    }
    for (let i = 0; i < Math.ceil(people / 2); i++) if (chance(0.6)) bag.push(line(weighted([[P.batata, 4], [P.cheddar, 3.5], [P.aneis, 2.5]])));
    if (chance(0.22)) bag.push(line(chance(0.6) ? P.brownie : P.pudim));
    const merged = [];
    for (const l of bag) {
      const k = (x) => [x.product.id, x.addOns.map((o) => o.id).join(","), x.removed.join(","), x.note].join("|");
      const same = merged.find((m) => k(m) === k(l));
      if (same) same.quantity++;
      else merged.push(l);
    }
    return merged;
  }

  let orderSeq = 0;
  function addOrder(c, created, opts = {}) {
    const key = "order:" + orderSeq++;
    const kind = opts.kind ?? (chance(0.7) ? c.prefers : weighted([["mesa", 4], ["retirada", 2], ["entrega", 4]]));
    const session = newSession(key, new Date(created.getTime() - int(3, 14) * MIN));
    const bag = buildBag(kind);
    const subtotal = bag.reduce((s, l) => s + l.unit * l.quantity, 0);
    const payment = kind === "mesa" ? null : opts.payment ?? weighted([["pix", 45], ["cartao", 40], ["dinheiro", 15]]);
    const zone = kind === "entrega" ? c.zone : null;
    const fee = zone ? zone.fee : 0;
    let coupon = null, discount = 0;
    if (opts.coupon === "VOLTA10") { coupon = "VOLTA10"; discount = Math.floor((subtotal * 10) / 100); }
    if (opts.coupon === "FRETEGRATIS" && subtotal >= 4000) { coupon = "FRETEGRATIS"; discount = Math.min(700, subtotal); }
    const total = subtotal - discount + fee;
    const change = payment === "dinheiro" && chance(0.6) ? Math.ceil((total + 1) / 5000) * 5000 : null;
    const origin = kind === "mesa" ? null : opts.origin !== undefined ? opts.origin
      : weighted([[null, 40], ["ifood", 25], ["instagram", 20], ["panfleto", 10], ["google-maps", 5]]);
    const status = opts.status ?? "entregue";
    const pixFirst = payment === "pix" && state.hasPix;
    const order = {
      id: did(key), restaurant_id: R, guest_session_id: session.id,
      table_id: kind === "mesa" ? pick(activeTables).id : null,
      customer_name: c.name, customer_phone: c.phone, total_cents: total, status,
      idempotency_key: did(key + ":idem"), payload_hash: hex64(key + ":payload"),
      estimate_minutes: kind === "entrega" ? zone.eta : int(15, 25), cancellation_reason: null,
      created_at: iso(created), fulfillment: kind, delivery_fee_cents: fee, payment_method: payment,
      change_for_cents: change, coupon_code: coupon, discount_cents: discount, origin,
    };
    // Status events consistent with the timestamps (auto-accept is on; Pix online waits for payment).
    const chain = [];
    let t = created;
    const step = (s, minutes) => { t = later(t, minutes); chain.push([s, t]); };
    chain.push([pixFirst ? "aguardando_pagamento" : "recebido", created]);
    if (pixFirst) step("recebido", int(1, 3));
    const flow = kind === "entrega" ? ["em_preparo", "pronto", "saiu_para_entrega", "entregue"] : ["em_preparo", "pronto", "entregue"];
    const gaps = { em_preparo: [1, 5], pronto: [10, 20], saiu_para_entrega: [2, 8], entregue: kind === "entrega" ? [12, 30] : [3, 25] };
    if (status === "cancelado") {
      if (chance(0.5)) step("em_preparo", int(1, 4));
      step("cancelado", int(2, 8));
      order.cancellation_reason = pick(["Cliente desistiu do pedido", "Endereço fora da área de entrega", "Cliente pediu em duplicidade", "Item acabou, cliente preferiu cancelar"]);
    } else if (status !== chain[chain.length - 1][0]) {
      for (const s of flow) { step(s, int(...gaps[s])); if (s === status) break; }
    }
    if (chain.some(([, when]) => when.getTime() > NOW.getTime())) {
      // Live orders: squeeze the chain into the time already elapsed.
      const span = NOW.getTime() - MIN - created.getTime();
      const last = chain[chain.length - 1][1].getTime() - created.getTime() || 1;
      chain.forEach((e) => { e[1] = new Date(created.getTime() + ((e[1].getTime() - created.getTime()) * span) / last); });
    }
    chain.forEach(([s, when], i) => events.push({
      id: did(key + ":event:" + i), restaurant_id: R, order_id: order.id, status: s, actor_id: null,
      reason: s === "cancelado" ? order.cancellation_reason : null, created_at: iso(when),
    }));
    orders.push(order);
    bag.forEach((l, n) => items.push({
      id: did(key + ":item:" + n), restaurant_id: R, order_id: order.id, product_id: l.product.id,
      product_name: l.product.name, unit_price_cents: l.unit, quantity: l.quantity, note: l.note,
      removed_ingredients: l.removed, add_ons: l.addOns,
    }));
    if (zone) addresses.push({
      order_id: order.id, restaurant_id: R, zone_id: zone.id, zone_name: zone.name,
      street: c.street, number: c.number, complement: c.complement, reference: c.reference,
    });
    return { order, session, bag, kind };
  }

  // History (by customer), then the live board for today.
  const history = [];
  for (const c of customers) for (const d of c.days) history.push({ c, created: at(d, eveningMinutes()) });
  history.sort((a, b) => a.created - b.created);
  const cancelable = new Set();
  for (const c of customers.filter((x) => x.profile === "vip" || x.profile === "recorrente"))
    c.days.slice(0, -1).forEach((d) => cancelable.add(c.phone + ":" + d));
  const cancelPicks = new Set([...cancelable].filter(() => chance(0.09)).slice(0, 6));
  const placed = [];
  for (const h of history) {
    const day = Math.round((h.created.getTime() - MIDNIGHT) / DAY - 0.5);
    const cancelled = cancelPicks.has(h.c.phone + ":" + Math.floor((h.created.getTime() - MIDNIGHT) / DAY));
    const recent = h.created.getTime() > NOW.getTime() - 45 * DAY;
    const opts = { status: cancelled ? "cancelado" : "entregue" };
    if (recent && !cancelled) {
      if (chance(0.11)) opts.coupon = "VOLTA10";
      else if (chance(0.12)) { opts.coupon = "FRETEGRATIS"; opts.kind = "entrega"; }
    }
    void day;
    placed.push(addOrder(h.c, h.created, opts));
  }
  // Today: two already delivered, plus the live board (recebido / em_preparo / pronto).
  const vips = customers.filter((c) => c.profile === "vip");
  const recs = customers.filter((c) => c.profile === "recorrente");
  const freshA = { ...customers.find((c) => c.profile === "sem_pedidos") }; // first-time customers placing their first order now
  const today = [
    [vips[3], 85, { kind: "mesa", status: "entregue" }],
    [recs[4], 58, { kind: "retirada", status: "entregue", payment: "cartao" }],
    [recs[6], 31, { kind: "entrega", status: "pronto", payment: "dinheiro" }],
    [vips[5], 19, { kind: "mesa", status: "em_preparo" }],
    [freshA, 14, { kind: "retirada", status: "em_preparo", payment: "pix", origin: "instagram" }],
    [vips[0], 7, { kind: "mesa", status: "recebido" }],
    [recs[9], 4, { kind: "entrega", status: "recebido", payment: "cartao", origin: "ifood" }],
  ];
  // freshA is a newsletter subscriber who now orders for the first time: keep the contact, it gets an order.
  freshA.profile = "novo";
  customers[customers.findIndex((c) => c.phone === freshA.phone)] = freshA;
  for (const [c, ago, opts] of today) {
    const r = addOrder(c, minutesAgo(ago), opts);
    c.days.push(0);
    placed.push(r);
  }

  // --- metrics: photo/video views and cart adds (last 30 days feed "Métricas" and the reports)
  const since30 = NOW.getTime() - 30 * DAY;
  const browseSessions = [];
  for (let d = -30; d <= 0; d++) {
    const n = Math.round(DOW_WEIGHT[weekday(d)] * 2.2 + (weekday(d) === 1 ? 1 : 0));
    for (let k = 0; k < n; k++) {
      const start = d === 0 ? minutesAgo(int(30, 300)) : at(d, eveningMinutes() - 10);
      if (start.getTime() < since30) continue;
      browseSessions.push(newSession(`browse:${d}:${k}`, start));
    }
  }
  function observe(session, start, ordered) {
    const viewed = new Set(ordered.map((l) => l.product.id));
    const extra = int(1, 5);
    for (let k = 0; k < extra; k++) viewed.add(pick(photoProducts).id);
    let seq = 0, t = start;
    for (const pid of viewed) {
      const p = photoProducts.find((x) => x.id === pid);
      if (!p) continue;
      const secs = Math.round((ordered.some((l) => l.product.id === pid) ? 2 + rand() * 9 : 0.4 + rand() * 5) * 10) / 10;
      seq++;
      t = later(t, 0.4);
      const created = capNow(t);
      photoViews.push({
        id: did(`${session.id}:photo:${pid}`), restaurant_id: R, guest_session_id: session.id, product_id: pid,
        photo_url: p.photo, visible_seconds: secs, qualified: secs >= 1, sequence: int(1, 4),
        created_at: iso(created), updated_at: iso(capNow(new Date(created.getTime() + secs * 1000))),
      });
    }
    void seq;
    if (video && (ordered.some((l) => l.product.id === video.product_id) ? chance(0.6) : chance(0.3))) {
      const duration = Number(video.duration_seconds);
      const watched = Math.round(Math.min(duration, 0.5 + rand() * duration * 1.1) * 10) / 10;
      const created = capNow(later(start, 0.2));
      videoViews.push({
        id: did(`${session.id}:video`), restaurant_id: R, guest_session_id: session.id, product_id: video.product_id,
        media_id: video.id, media_version: video.version, watched_seconds: watched,
        coverage: Math.min(1, Math.round((watched / duration) * 1000) / 1000), qualified: watched >= 1,
        sequence: int(1, 6), position: state.products.find((p) => p.id === video.product_id)?.position ?? 0,
        segments: [[0, watched]], created_at: iso(created), updated_at: iso(capNow(new Date(created.getTime() + watched * 1000))),
      });
    }
  }
  for (const { order, session, bag } of placed) {
    const start = new Date(session.created_at);
    if (start.getTime() >= since30) observe(session, start, bag);
    // Every ordered line was added to the bag first (the associations need it), before the order.
    const gap = Math.min(40000, (Date.parse(order.created_at) - start.getTime()) / (bag.length + 1));
    bag.forEach((l, n) => cartAdds.push({
      id: did(order.id + ":cart:" + n), restaurant_id: R, guest_session_id: session.id, product_id: l.product.id,
      created_at: iso(new Date(start.getTime() + (n + 1) * gap)),
    }));
  }
  for (const s of browseSessions) {
    const start = new Date(s.created_at);
    observe(s, start, []);
    if (chance(0.2)) {
      const p = pick([P.classico, P.bacon, P.cheddar, P.brownie]);
      cartAdds.push({ id: did(s.id + ":cart"), restaurant_id: R, guest_session_id: s.id, product_id: p.id, created_at: iso(capNow(later(start, 1.5))) });
    }
  }

  // --- reviews: likes and a few comments on delivered purchases
  const delivered = placed.filter((x) => x.order.status === "entregue");
  const commented = new Set();
  for (const { order, session, bag } of delivered) {
    if (!chance(0.32)) continue;
    const reviewable = bag.filter((l) => l.product.published && !l.product.archived && l.product.category_id);
    const l = pick(reviewable);
    if (!l) continue;
    const pool = (COMMENTS[l.product.name] || []).filter((t) => !commented.has(t));
    const comment = pool.length && chance(0.35) ? pick(pool) : "";
    if (comment) commented.add(comment);
    const when = capNow(later(new Date(order.created_at), int(60, 20 * 60)));
    feedback.push({
      id: did(order.id + ":feedback"), restaurant_id: R, guest_session_id: session.id, order_id: order.id,
      product_id: l.product.id, liked: true, comment, comment_hidden: false, created_at: iso(when), updated_at: iso(when),
    });
  }

  // --- contacts (+ consent trail), from the orders actually placed
  const contacts = [], consents = [];
  for (const c of customers) {
    const own = orders.filter((o) => o.customer_phone === c.phone).map((o) => new Date(o.created_at));
    const first = own.length ? new Date(Math.min(...own)) : at(-int(5, 40), 19 * 60);
    const last = own.length ? new Date(Math.max(...own)) : first;
    const subscribed = own.length && c.profile === "novo" && c === freshA ? at(-int(10, 30), 20 * 60) : first;
    contacts.push({
      id: c.id, restaurant_id: R, name: c.name, phone: c.phone, verified: false, marketing_status: c.marketing,
      first_seen_at: iso(subscribed < first ? subscribed : first), last_seen_at: iso(last),
      tags: c.tags || [], notes: c.notes || "",
    });
    const consentText = "Quero receber novidades e ofertas do Brasa Burger no WhatsApp. Posso cancelar quando quiser.";
    const initial = c.marketing === "revoked" ? "authorized" : c.marketing;
    consents.push({
      id: did("consent:" + c.phone), restaurant_id: R, contact_id: c.id, action: initial, purpose: "restaurant_offers",
      text_version: "1", consent_text: consentText, source: own.length && c !== freshA ? "checkout" : "newsletter",
      created_at: iso(subscribed < first ? subscribed : first),
    });
    if (c.marketing === "revoked")
      consents.push({
        id: did("consent-revoked:" + c.phone), restaurant_id: R, contact_id: c.id, action: "revoked", purpose: "restaurant_offers",
        text_version: "1", consent_text: "Revogação solicitada ao restaurante.", source: "owner", created_at: iso(later(last, 60 * 24)),
      });
  }

  // --- finance: last 3 months, sized from the generated sales
  const monthSales = new Map();
  for (const o of orders) if (o.status === "entregue") monthSales.set(monthKey(new Date(o.created_at)), (monthSales.get(monthKey(new Date(o.created_at))) || 0) + o.total_cents);
  const months = [-2, -1, 0].map((k) => {
    const first = new Date(Date.UTC(TODAY.y, TODAY.m + k, 1));
    return { k, key: first.toISOString().slice(0, 7), firstOffset: Math.round((first.getTime() - Date.UTC(TODAY.y, TODAY.m, TODAY.d)) / DAY) };
  });
  const finance = [];
  const round10 = (c) => Math.max(100, Math.round(c / 1000) * 1000);
  const expense = (tag, description, category, amount, entryOffset, { due = null, paid = "entry" } = {}) => finance.push({
    id: did("finance:" + tag), restaurant_id: R, kind: "expense", description, category, amount_cents: amount,
    entry_date: isoDate(entryOffset), due_date: due === null ? null : isoDate(due),
    paid_at: paid === null ? null : isoDate(paid === "entry" ? entryOffset : paid), created_at: iso(capNow(at(Math.min(entryOffset, 0), 10 * 60))),
  });
  const income = (tag, description, amount, offset) => finance.push({
    id: did("finance:" + tag), restaurant_id: R, kind: "income", description, category: null, amount_cents: amount,
    entry_date: isoDate(offset), due_date: null, paid_at: isoDate(offset), created_at: iso(capNow(at(offset, 11 * 60))),
  });
  for (const m of months) {
    const base = Math.max(monthSales.get(m.key) || 0, 380000);
    const upTo = m.k === 0 ? 0 : 27;
    const monthDays = new Date(Date.UTC(TODAY.y, TODAY.m + m.k + 1, 0)).getUTCDate();
    // "Day n" of the month as an offset from today, never past today nor past the month's end.
    const day = (n) => m.firstOffset + Math.min(n - 1, monthDays - 1, m.k === 0 ? -m.firstOffset : 99);
    const tag = (s) => m.key + ":" + s;
    [3, 10, 17, 24].forEach((n, i) => { if (m.k < 0 || m.firstOffset + n <= 0) expense(tag("carnes" + i), "Carnes e frios (fornecedor)", "insumos", round10(base * 0.07 * (0.9 + rand() * 0.2)), day(n)); });
    [5, 19].forEach((n, i) => { if (m.k < 0 || m.firstOffset + n <= 0) expense(tag("paes" + i), "Pães brioche e hortifrúti", "insumos", round10(base * 0.035 * (0.9 + rand() * 0.2)), day(n)); });
    if (m.k < 0 || m.firstOffset + 8 <= 0) expense(tag("embalagens"), "Embalagens e sacolas kraft", "embalagens", round10(base * 0.045), day(8));
    expense(tag("aluguel"), "Aluguel do ponto", "aluguel", 65000, day(5));
    [14, 28].forEach((n, i) => { if (m.k < 0 || m.firstOffset + n <= 0) expense(tag("chapeiro" + i), "Chapeiro e atendente (quinzena)", "funcionarios", round10(base * 0.08), day(n)); });
    if (m.k < 0) {
      expense(tag("energia"), "Conta de energia", "contas", round10(base * 0.035), day(12), { due: day(15), paid: day(14) });
      expense(tag("agua"), "Conta de água", "contas", 18900, day(12), { due: day(18), paid: day(17) });
      expense(tag("internet"), "Internet e telefone", "contas", 14990, day(10), { due: day(10), paid: day(10) });
      expense(tag("instagram"), "Impulsionamento no Instagram", "marketing", 15000, day(6));
    }
    if (m.k === -1) expense(tag("panfletos"), "Panfletos para o bairro (2.000 un.)", "marketing", 18000, day(9));
    void upTo;
  }
  // Current month: bills open in the next days, one overdue.
  expense("open:carnes", "Boleto do fornecedor de carnes", "insumos", round10((monthSales.get(months[2].key) || 380000) * 0.06), -2, { due: 2, paid: null });
  expense("open:energia", "Conta de energia", "contas", 41890, -1, { due: 5, paid: null });
  expense("open:embalagens", "Embalagens (boleto 28 dias)", "embalagens", 23450, 0, { due: 8, paid: null });
  expense("open:gas", "Gás (botijões P45)", "contas", 38000, -9, { due: -3, paid: null });
  expense("open:instagram", "Impulsionamento no Instagram", "marketing", 15000, -4);
  income("ifood:-2", "Repasse iFood (quinzena)", 124000, months[0].firstOffset + 15);
  income("evento:-1", "Encomenda: mini burgers para aniversário", 69000, months[1].firstOffset + 20);
  income("ifood:0", "Repasse iFood (quinzena)", 138500, Math.min(months[2].firstOffset + 15, 0));

  const financeSettings = { restaurant_id: R, card_fee_percent: 3.5, pix_fee_percent: 0, updated_at: iso(NOW) };

  return {
    restaurantPatch, categoryUpdates, comboCategory, productUpdates, combos, upsell, upsellLinks, staleOptions,
    zones, coupons, origins, contacts, consents, guestSessions, orders, items, addresses, events,
    cartAdds, photoViews, videoViews, feedback, finance, financeSettings, customers,
  };
}

// ---------------------------------------------------------------- apply (through an adapter)
async function apply(db, plan) {
  const R = RESTAURANT_ID;
  const scope = [["restaurant_id", "eq", R]];
  // 1. Wipe this restaurant's activity, children first.
  for (const table of WIPE_ORDER) await db.del(table, scope);
  // 2. Stale duplicated upsell options + our own upsell (recreated below). Links cascade.
  const optionIds = [...plan.staleOptions, plan.upsell.id];
  await db.del("product_options", [...scope, ["id", "in", optionIds]]);
  // 3. Identity, theme, hours.
  const { bag_suggestions, ...identity } = plan.restaurantPatch;
  await db.update("restaurants", identity, [["id", "eq", R]]);
  // 4. Catalog.
  for (const c of plan.categoryUpdates) await db.update("categories", c.patch, [...scope, ["id", "eq", c.id]]);
  await db.upsert("categories", [plan.comboCategory], ["id"]);
  for (const p of plan.productUpdates)
    if (Object.keys(p.patch).length) await db.update("products", p.patch, [...scope, ["id", "eq", p.id]]);
  await db.upsert("products", plan.combos, ["id"]);
  await db.insert("product_options", [plan.upsell]);
  await db.insert("product_option_links", plan.upsellLinks);
  await db.update("restaurants", { bag_suggestions }, [["id", "eq", R]]);
  await db.insert("delivery_zones", plan.zones);
  await db.insert("coupons", plan.coupons);
  await db.insert("order_origins", plan.origins);
  // 5. People and history.
  await db.insert("contacts", plan.contacts);
  await db.insert("marketing_consent_events", plan.consents);
  await db.insert("guest_sessions", plan.guestSessions);
  const sorted = [...plan.orders].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); // numbers follow time
  await db.insert("orders", sorted);
  await db.insert("order_addresses", plan.addresses);
  await db.insert("order_items", plan.items);
  await db.insert("order_status_events", plan.events);
  await db.insert("cart_add_events", plan.cartAdds);
  await db.insert("photo_view_sessions", plan.photoViews);
  await db.insert("video_view_sessions", plan.videoViews);
  await db.insert("product_feedback", plan.feedback);
  // 6. Finance.
  await db.upsert("restaurant_finance_settings", [plan.financeSettings], ["restaurant_id"]);
  await db.insert("finance_entries", plan.finance);
}

function assertScoped(table, filters) {
  const key = table === "restaurants" ? "id" : "restaurant_id";
  if (!filters.some(([col, op, val]) => col === key && op === "eq" && val === RESTAURANT_ID))
    throw new Error(`Escrita sem filtro do restaurante em ${table} — abortado.`);
}
function assertRows(table, rows) {
  for (const r of rows) if (r.restaurant_id !== RESTAURANT_ID) throw new Error(`Linha de outro restaurante em ${table} — abortado.`);
}
const chunks = (rows, n) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, i * n + n));

function supabaseAdapter(sb) {
  const filtered = (q, filters) => {
    for (const [col, op, val] of filters) q = op === "eq" ? q.eq(col, val) : q.in(col, val);
    return q;
  };
  const check = (error, what) => { if (error) throw new Error(`${what}: ${error.message}`); };
  return {
    async del(table, filters) {
      assertScoped(table, filters);
      const { error, count } = await filtered(sb.from(table).delete({ count: "exact" }), filters);
      check(error, "delete " + table);
      console.log(`  - apagado ${table}: ${count ?? "?"}`);
    },
    async update(table, patch, filters) {
      assertScoped(table, filters);
      const { error } = await filtered(sb.from(table).update(patch), filters);
      check(error, "update " + table);
    },
    async insert(table, rows) {
      assertRows(table, rows);
      for (const part of chunks(rows, 400)) { const { error } = await sb.from(table).insert(part); check(error, "insert " + table); }
      if (rows.length) console.log(`  + inserido ${table}: ${rows.length}`);
    },
    async upsert(table, rows, conflict) {
      assertRows(table, rows);
      const { error } = await sb.from(table).upsert(rows, { onConflict: conflict.join(",") });
      check(error, "upsert " + table);
    },
  };
}

// ---------------------------------------------------------------- PGlite validation (local only)
const JSONB = new Set(["opening_hours", "menu_theme", "add_ons", "segments"]);
function pgAdapter(pg) {
  const val = (col, v) => (JSONB.has(col) && v !== null && v !== undefined ? JSON.stringify(v) : v);
  const where = (filters, start) => {
    const params = [];
    const sql = filters.map(([col, op, v]) => { params.push(v); return op === "eq" ? `${col}=$${start + params.length}` : `${col}=any($${start + params.length})`; }).join(" and ");
    return { sql, params };
  };
  const insertSql = (table, rows, conflict) => {
    const cols = Object.keys(rows[0]);
    const params = [];
    const values = rows.map((r) => "(" + cols.map((c) => { params.push(val(c, r[c])); return "$" + params.length; }).join(",") + ")").join(",");
    let sql = `insert into public.${table}(${cols.join(",")}) values ${values}`;
    if (conflict) sql += ` on conflict(${conflict.join(",")}) do update set ` + cols.filter((c) => !conflict.includes(c)).map((c) => `${c}=excluded.${c}`).join(",");
    return { sql, params };
  };
  return {
    async del(table, filters) { assertScoped(table, filters); const w = where(filters, 0); await pg.query(`delete from public.${table} where ${w.sql}`, w.params); },
    async update(table, patch, filters) {
      assertScoped(table, filters);
      const cols = Object.keys(patch);
      const w = where(filters, cols.length);
      await pg.query(`update public.${table} set ${cols.map((c, i) => `${c}=$${i + 1}`).join(",")} where ${w.sql}`, [...cols.map((c) => val(c, patch[c])), ...w.params]);
    },
    async insert(table, rows) {
      assertRows(table, rows);
      for (const part of chunks(rows, 150)) if (part.length) { const q = insertSql(table, part); await pg.query(q.sql, q.params); }
    },
    async upsert(table, rows, conflict) { assertRows(table, rows); const q = insertSql(table, rows, conflict); await pg.query(q.sql, q.params); },
  };
}

async function validateOnPGlite(state, plan) {
  const { createTestDatabase } = await import("./lib/test-db.mjs");
  const pg = await createTestDatabase();
  const db = pgAdapter(pg);
  const R = RESTAURANT_ID;
  const owner = "99999999-0000-4000-8000-000000000001";
  // Mirror the current catalog (no secrets: the Pix row is a dummy).
  const mirror = async (table, rows) => { for (const part of chunks(rows, 100)) if (part.length) { const cols = Object.keys(part[0]); const params = []; const v = part.map((r) => "(" + cols.map((c) => { params.push(JSONB.has(c) && r[c] != null ? JSON.stringify(r[c]) : r[c]); return "$" + params.length; }).join(",") + ")").join(","); await pg.query(`insert into public.${table}(${cols.join(",")}) values ${v}`, params); } };
  await mirror("restaurants", [state.restaurant]);
  await pg.query("insert into auth.users values($1)", [owner]);
  await pg.query("insert into restaurant_members values($1,$2,'owner')", [R, owner]);
  await mirror("categories", state.categories);
  await mirror("products", state.products);
  await mirror("product_media", state.media);
  await mirror("dining_tables", state.tables);
  await mirror("product_options", state.options);
  await mirror("product_option_links", state.links);
  await mirror("delivery_zones", state.zones);
  if (state.hasPix) await pg.query("insert into restaurant_pix(restaurant_id,pix_key,merchant_name,merchant_city) values($1,'teste@exemplo.com','BRASA BURGER','ITAPETININGA')", [R]);
  await pg.query("update restaurant_billing set plan='profissional',status='cortesia' where restaurant_id=$1", [R]);
  // Twice: the second run proves the wipe order and idempotency.
  await apply(db, plan);
  await apply(db, plan);
  const count = async (t) => (await pg.query(`select count(*)::int n from public.${t} where restaurant_id=$1`, [R])).rows[0].n;
  const counts = {};
  for (const t of [...WIPE_ORDER, "product_options", "product_option_links", "categories", "products"]) counts[t] = await count(t);
  // Read back through the app's own SQL functions, as the owner.
  await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await pg.exec("set role authenticated");
  const rpc = async (sql, params) => (await pg.query(sql, params)).rows[0].r;
  const month = isoDate(0).slice(0, 8) + "01";
  const crm = await rpc("select crm_customers($1,null,null,null,false,'last_order',5,0) r", [R]);
  const lapsed = {};
  for (const d of [30, 60, 90]) lapsed[d] = (await rpc("select lapsed_customers($1,$2,0) r", [R, d])).total;
  const report = await rpc("select results_report($1,$2::date) r", [R, month]);
  const finance = await rpc("select finance_month($1,$2::date) r", [R, month]);
  const bills = await rpc("select bills_due($1) r", [R]);
  const coupons = await rpc("select coupon_stats($1) r", [R]);
  const origins = await rpc("select origin_report($1,$2::date) r", [R, month]);
  const photo = (await pg.query("select * from photo_associations($1,30)", [R])).rows.length;
  const videoA = (await pg.query("select * from video_associations($1,30)", [R])).rows;
  await pg.exec("reset role");
  // The menu still takes an order right now (opening hours + accepting_orders).
  await pg.query("insert into guest_sessions(restaurant_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')", [R, "f".repeat(64)]);
  const table = (await pg.query("select id from dining_tables where restaurant_id=$1 and active order by number limit 1", [R])).rows[0].id;
  const burger = plan.productUpdates.find((p) => p.name === "Burger Bacon");
  const price = state.products.find((p) => p.id === burger.id).price_cents;
  const placed = await rpc("select place_guest_order($1,$2,gen_random_uuid(),$3::jsonb) r", [R, "f".repeat(64),
    JSON.stringify({ table_id: table, name: "Teste Local", phone: "15900009999", items: [{ product_id: burger.id, quantity: 1, expected_price: price }] })]);
  return { counts, crm, lapsed, report, finance, bills, coupons, origins, photo, videoA, placed };
}

// ---------------------------------------------------------------- output
function summarize(plan) {
  const sold = plan.orders.filter((o) => o.status === "entregue");
  const last30 = sold.filter((o) => Date.parse(o.created_at) >= NOW.getTime() - 30 * DAY);
  const lastByPhone = new Map();
  for (const o of plan.orders) if (o.status !== "cancelado") lastByPhone.set(o.customer_phone, Math.max(lastByPhone.get(o.customer_phone) || 0, Date.parse(o.created_at)));
  const lapsed = {};
  for (const d of [30, 60, 90])
    lapsed[d] = plan.contacts.filter((c) => c.marketing_status === "authorized" && lastByPhone.has(c.phone) && lastByPhone.get(c.phone) < NOW.getTime() - d * DAY).length;
  const byMonth = {};
  for (const o of sold) byMonth[monthKey(new Date(o.created_at))] = (byMonth[monthKey(new Date(o.created_at))] || 0) + o.total_cents;
  const tally = (list, f) => list.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
  return {
    revenue30: last30.reduce((s, o) => s + o.total_cents, 0), orders30: last30.length, lapsed, byMonth,
    statuses: tally(plan.orders, (o) => o.status), fulfillment: tally(plan.orders, (o) => o.fulfillment),
    coupons: tally(plan.orders.filter((o) => o.coupon_code), (o) => o.coupon_code),
    origins: tally(plan.orders.filter((o) => o.fulfillment !== "mesa"), (o) => o.origin ?? "direto"),
    profiles: tally(plan.customers, (c) => c.profile),
    marketing: tally(plan.contacts, (c) => c.marketing_status),
  };
}

function printPlan(state, plan) {
  const R = state.restaurant;
  console.log(`\nRestaurante ${R.id}`);
  console.log(`  atual: "${R.name}" (/${R.slug}) · tema ${R.menu_theme?.preset ?? "padrão"} · logo ${R.menu_theme?.logo_url ? "sim" : "não"}`);
  console.log(`  novo:  "${plan.restaurantPatch.name}" (/${plan.restaurantPatch.slug}) · tema brasa · sem logo (iniciais)`);
  console.log(`  subtítulo: ${plan.restaurantPatch.subtitle}`);
  console.log(`  endereço:  ${plan.restaurantPatch.address} · telefone mantido · Pix mantido (${state.hasPix ? "configurado" : "não configurado"})`);
  console.log(`  horário: todos os dias 00:00–23:59 (cardápio sempre aceitando pedidos) · entrega mínima ${brl(plan.restaurantPatch.delivery_min_order_cents)}`);
  console.log(`  plano: ${state.billing ? state.billing.plan + "/" + state.billing.status : "?"} (não é alterado)`);
  console.log("\nSERÁ APAGADO (atividade deste restaurante):");
  for (const t of WIPE_ORDER) console.log(`  ${t.padEnd(26)} ${state.counts[t]}`);
  console.log(`  product_options "batata frita" inativas duplicadas: ${plan.staleOptions.length}`);
  console.log("\nCATÁLOGO:");
  for (const c of plan.categoryUpdates) console.log(`  categoria → ${c.patch.name}`);
  console.log(`  categoria nova: Combos (${plan.combos.map((c) => c.name + " " + brl(c.price_cents)).join(", ")})`);
  const described = plan.productUpdates.filter((p) => p.patch.description).length;
  console.log(`  descrições reescritas: ${described}/${plan.productUpdates.length}`);
  for (const p of plan.productUpdates) if (p.patch.photo_url) console.log(`  foto adicionada: ${p.name} → ${p.patch.photo_url}`);
  const noPhoto = state.products.filter((p) => !p.photo_url && !plan.productUpdates.find((u) => u.id === p.id)?.patch.photo_url);
  console.log(`  sem foto depois: ${noPhoto.map((p) => p.name + (p.archived ? " (arquivado)" : "")).join(", ") || "nenhum"}`);
  console.log(`  upsell na sacola: "${plan.upsell.name}" ${brl(plan.upsell.price_cents)} em ${plan.upsellLinks.length} burgers · sugestões da sacola: 3`);
  console.log(`  zonas: ${plan.zones.map((z) => `${z.name} ${brl(z.fee_cents)}/${z.estimate_minutes} min`).join(" · ")}`);
  console.log(`  cupons: ${plan.coupons.map((c) => `${c.code} (${c.kind} ${c.kind === "percent" ? c.value + "%" : brl(c.value)}, até ${c.valid_until})`).join(", ")}`);
  console.log(`  origens: ${plan.origins.map((o) => o.name).join(", ")} (+ iFood e Instagram nativas)`);
  console.log("\nSERÁ CRIADO:");
  const rows = {
    contacts: plan.contacts, marketing_consent_events: plan.consents, guest_sessions: plan.guestSessions, orders: plan.orders,
    order_items: plan.items, order_addresses: plan.addresses, order_status_events: plan.events, cart_add_events: plan.cartAdds,
    photo_view_sessions: plan.photoViews, video_view_sessions: plan.videoViews, product_feedback: plan.feedback,
    finance_entries: plan.finance, delivery_zones: plan.zones, coupons: plan.coupons, order_origins: plan.origins,
  };
  for (const [t, list] of Object.entries(rows)) console.log(`  ${t.padEnd(26)} ${list.length}`);
  const s = summarize(plan);
  console.log("\nRESUMO DO HISTÓRICO:");
  console.log(`  pedidos por status: ${JSON.stringify(s.statuses)}`);
  console.log(`  por modalidade: ${JSON.stringify(s.fulfillment)} · cupons: ${JSON.stringify(s.coupons)}`);
  console.log(`  origens (online): ${JSON.stringify(s.origins)}`);
  console.log(`  perfis de cliente: ${JSON.stringify(s.profiles)} · marketing: ${JSON.stringify(s.marketing)}`);
  console.log(`  vendido (entregue) por mês: ${Object.entries(s.byMonth).map(([m, v]) => m + " " + brl(v)).join(" · ")}`);
  console.log(`  últimos 30 dias: ${s.orders30} pedidos entregues · ${brl(s.revenue30)}`);
  console.log(`  sumidos com WhatsApp autorizado: 30d ${s.lapsed[30]} · 60d ${s.lapsed[60]} · 90d ${s.lapsed[90]}`);
  const exp = plan.finance.filter((f) => f.kind === "expense");
  console.log(`  finanças: ${exp.length} despesas (${exp.filter((f) => !f.paid_at).length} em aberto, ${exp.filter((f) => !f.paid_at && f.due_date < isoDate(0)).length} vencida) · ${plan.finance.filter((f) => f.kind === "income").length} receitas avulsas · taxas cartão 3,5% / Pix 0%`);
}

// ---------------------------------------------------------------- main
loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local."); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`Modo: ${APPLY ? "APPLY (escreve no banco)" : VALIDATE ? "DRY-RUN + validação local (PGlite)" : "DRY-RUN (somente leitura)"}`);
console.log(`Agora: ${iso(NOW)} · hoje em São Paulo: ${isoDate(0)}`);
const state = await readState(sb);
const plan = buildPlan(state);
printPlan(state, plan);

if (VALIDATE) {
  console.log("\nVALIDAÇÃO LOCAL (PGlite, migrations 001–021, aplicado 2x):");
  const v = await validateOnPGlite(state, plan);
  console.log(`  linhas após 2ª execução: ${JSON.stringify(v.counts)}`);
  console.log(`  CRM segmentos: ${JSON.stringify(v.crm.segments)} · total ${v.crm.total}`);
  console.log(`  sumidos (lapsed_customers): 30d ${v.lapsed[30]} · 60d ${v.lapsed[60]} · 90d ${v.lapsed[90]}`);
  console.log(`  relatório do mês: ${v.report.orders.count} pedidos · ${brl(v.report.orders.revenue_cents)} · clientes ${JSON.stringify(v.report.customers)} · top ${v.report.top_quantity.map((d) => d.name).join(", ")} · vídeos ${v.report.top_videos.length}`);
  console.log(`  finanças do mês: vendido ${brl(v.finance.sales.sold_cents)} · taxa maquininha ${brl(v.finance.sales.machine_fee_cents)} · despesas ${brl(v.finance.expenses_cents)} · outras receitas ${brl(v.finance.other_income_cents)} · lucro ${brl(v.finance.profit_cents)} (mês anterior ${brl(v.finance.previous_profit_cents)})`);
  console.log(`  contas: ${v.bills.open.length} em aberto · ${v.bills.due_this_week} vencem em 7 dias · ${v.bills.recently_paid.length} pagas recentes`);
  console.log(`  cupons: ${JSON.stringify(v.coupons)}`);
  console.log(`  origens no mês: ${JSON.stringify(v.origins)}`);
  console.log(`  associações 30d: fotos ${v.photo} produtos · vídeo ${JSON.stringify(v.videoA.map((r) => ({ viewers: Number(r.viewer_sessions), cart: Number(r.cart_sessions), orders: Number(r.order_sessions) })))}`);
  console.log(`  pedido de teste agora via place_guest_order: ${JSON.stringify({ status: v.placed.status, total_cents: v.placed.total_cents })}`);
}

if (APPLY) {
  console.log("\nAPLICANDO…");
  await apply(supabaseAdapter(sb), plan);
  const after = {};
  for (const t of [...WIPE_ORDER, "product_options", "categories", "products"]) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true }).eq("restaurant_id", RESTAURANT_ID);
    if (error) throw new Error(`Contagem final falhou (${t}): ${error.message}`);
    after[t] = count;
  }
  console.log("\nCONTAGENS FINAIS:");
  for (const [t, n] of Object.entries(after)) console.log(`  ${t.padEnd(26)} ${n}`);
  const s = summarize(plan);
  console.log(`\nReceita dos últimos 30 dias: ${brl(s.revenue30)} (${s.orders30} pedidos) · sumidos 30/60/90: ${s.lapsed[30]}/${s.lapsed[60]}/${s.lapsed[90]}`);
  console.log(`Cardápio: /r/${NEW_SLUG}`);
} else {
  console.log("\nNada foi escrito no banco remoto.");
}
