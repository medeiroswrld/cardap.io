export type Category = {
  id: string;
  name: string;
  icon: string;
  visible: boolean;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  allergens: string;
  price: number;
  categoryId: string;
  image: string;
  video?: string;
  photoAnalytics?: { restaurantId: string; url: string };
  analytics?: {
    restaurantId: string;
    mediaId: string;
    version: string;
    position: number;
  };
  published: boolean;
  available: boolean;
  featured?: boolean;
  tag?: string;
};
export type BagItem = {
  productId: string;
  quantity: number;
  note: string;
  price: number;
};
export type Status =
  "recebido" | "em_preparo" | "pronto" | "entregue" | "cancelado";
export type Order = {
  id: string;
  number: number;
  session: string;
  customer: string;
  phone: string;
  table: number;
  items: (BagItem & { name: string })[];
  total: number;
  status: Status;
  createdAt: string;
  history: { status: Status; at: string }[];
  estimate?: number;
  reason?: string;
  idempotencyKey: string;
  fingerprint: string;
  illustrative?: boolean;
};
export type Contact = {
  id: string;
  name: string;
  phone: string;
  firstAt: string;
  lastAt: string;
  consent: "autorizado" | "nao_autorizado" | "revogado";
  source: string;
  events: { at: string; action: string; text: string; version: string }[];
};
export type Settings = {
  name: string;
  subtitle: string;
  accepting: boolean;
  tables: number;
  phone: string;
  address: string;
  hours: string;
  privacyEmail: string;
};
export type DemoState = {
  version: 1;
  products: Product[];
  categories: Category[];
  bag: BagItem[];
  orders: Order[];
  contacts: Contact[];
  settings: Settings;
};
export const statusNames: Record<Status, string> = {
  recebido: "Recebido",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
export const statusFlow: Status[] = [
  "recebido",
  "em_preparo",
  "pronto",
  "entregue",
];
