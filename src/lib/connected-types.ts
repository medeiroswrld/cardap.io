import type { Category, Product, Settings } from "./types";
import { isRestaurantOpen } from "./opening-hours";
export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  accepting_orders: boolean;
  timezone: string;
  opening_hours: { day: number; open: string; close: string }[];
  subtitle: string;
  phone: string;
  address: string;
  privacy_email: string;
  retention_days: number;
};
export type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  position: number;
  visible: boolean;
};
export type ProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  ingredients: string;
  allergens: string;
  price_cents: number;
  photo_url: string | null;
  published: boolean;
  available: boolean;
  archived: boolean;
  position: number;
};
export type MediaRow = {
  id: string;
  product_id: string;
  provider_asset_id: string;
  version: string;
  state: string;
  playback_url: string | null;
  duration_seconds: number | null;
};
export type TableRow = { id: string; number: number; active: boolean };
export type RealOrder = {
  id: string;
  number: number;
  table_id: string;
  customer_name?: string;
  customer_phone?: string;
  total_cents: number;
  status: "recebido" | "em_preparo" | "pronto" | "entregue" | "cancelado";
  created_at: string;
  estimate_minutes: number | null;
  cancellation_reason: string | null;
  dining_tables: { number: number } | null;
  order_items: {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    note: string;
  }[];
  order_status_events: { status: string; created_at: string }[];
};
export type RealContact = {
  id: string;
  name: string;
  phone: string;
  verified: boolean;
  marketing_status: "authorized" | "not_authorized" | "revoked";
  first_seen_at: string;
  last_seen_at: string;
};
export type Workspace = {
  restaurant: RestaurantRow;
  role: "owner" | "operations";
  categories: CategoryRow[];
  products: ProductRow[];
  media: MediaRow[];
  tables: TableRow[];
  orders: RealOrder[];
  contacts: RealContact[];
  metrics: {
    product_id: string;
    media_id: string;
    media_version: string;
    watched_seconds: number;
    coverage: number;
    qualified: boolean;
    created_at: string;
  }[];
};
export type Catalog = {
  restaurant: RestaurantRow;
  categories: CategoryRow[];
  products: ProductRow[];
  media: MediaRow[];
  tables: TableRow[];
};
export function catalogState(catalog: Catalog): {
  products: Product[];
  categories: Category[];
  settings: Settings;
} {
  return {
    products: catalog.products.map((p) => {
      const media = catalog.media.find(
        (m) => m.product_id === p.id && m.state === "ready",
      );
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        ingredients: p.ingredients,
        allergens: p.allergens,
        price: p.price_cents,
        categoryId: p.category_id,
        image: p.photo_url || "/images/placeholder.svg",
        video: media?.provider_asset_id
          ? media.playback_url || undefined
          : undefined,
        analytics: media
          ? {
              restaurantId: catalog.restaurant.id,
              mediaId: media.id,
              version: media.version,
              position: p.position,
            }
          : undefined,
        published: p.published,
        available: p.available,
      };
    }),
    categories: catalog.categories.map((c, i) => ({
      id: c.id,
      name: c.name,
      visible: c.visible,
      icon: ["burger", "fries", "drink", "dessert"][i % 4],
    })),
    settings: {
      name: catalog.restaurant.name,
      subtitle: catalog.restaurant.subtitle,
      accepting: isRestaurantOpen(catalog.restaurant),
      tables: Math.max(
        0,
        ...catalog.tables.filter((t) => t.active).map((t) => t.number),
      ),
      phone: catalog.restaurant.phone,
      address: catalog.restaurant.address,
      hours: catalog.restaurant.opening_hours
        .map(
          (h) =>
            `${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][h.day]} ${h.open}–${h.close}`,
        )
        .join(" • "),
      privacyEmail: catalog.restaurant.privacy_email,
    },
  };
}
