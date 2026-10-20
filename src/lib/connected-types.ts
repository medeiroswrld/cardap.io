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
  google_review_url: string;
  feedback_enabled: boolean;
};
export type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  position: number;
  visible: boolean;
};
export type OptionRow = {
  id: string;
  restaurant_id: string;
  name: string;
  price_cents: number;
  active: boolean;
};
export type OptionLink = { product_id: string; option_id: string };
export type ProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  ingredients: string;
  removable_ingredients: string[];
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
  google_review_url?: string;
  feedback_enabled?: boolean;
  dining_tables: { number: number } | null;
  order_items: {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    note: string;
    removed_ingredients: string[];
    add_ons: import("./product-options").AddOn[];
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
  feedback: {
    id: string;
    product_id: string;
    liked: boolean;
    comment: string;
    comment_hidden: boolean;
    updated_at: string;
    products: { name: string } | null;
  }[];
  options: OptionRow[];
  optionLinks: OptionLink[];
  categories: CategoryRow[];
  products: ProductRow[];
  media: MediaRow[];
  tables: TableRow[];
  orders: RealOrder[];
  contacts: RealContact[];
  photoMetrics: {
    product_id: string;
    photo_url: string;
    visible_seconds: number;
    qualified: boolean;
    created_at: string;
  }[];
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
  options: OptionRow[];
  optionLinks: OptionLink[];
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
        restaurantId: catalog.restaurant.id,
        feedbackEnabled: catalog.restaurant.feedback_enabled,
        name: p.name,
        description: p.description,
        ingredients: p.ingredients,
        removableIngredients: p.removable_ingredients || [],
        addOns: (catalog.options || []).filter(
          (o) =>
            o.active &&
            catalog.optionLinks?.some(
              (l) => l.product_id === p.id && l.option_id === o.id,
            ),
        ),
        allergens: p.allergens,
        price: p.price_cents,
        categoryId: p.category_id,
        image: p.photo_url || "/images/placeholder.svg",
        photoAnalytics: p.photo_url
          ? { restaurantId: catalog.restaurant.id, url: p.photo_url }
          : undefined,
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
