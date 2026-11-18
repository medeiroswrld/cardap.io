import { isValidDocument, normalizePhone } from "./cpf-cnpj";
// Pure helpers for the public sales page and the subscription form.
export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

// WhatsApp link for the "Agência" plan; null when the number is not configured.
export function agencyWhatsappUrl(number: string | undefined | null) {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent("Oi! Quero saber do plano Agência do Fome Play.")}`;
}

// Where the browser may be sent after the subscription call: a same-origin path or an https Asaas page.
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("/")) return value.startsWith("//") || value.includes("\\") ? null : value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (host !== "asaas.com" && !host.endsWith(".asaas.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type SubscribeFields = {
  restaurantName: string;
  ownerName: string;
  email: string;
  phone: string;
  document: string;
  password: string;
  acceptTerms: boolean;
};
export type SubscribeErrors = Partial<Record<keyof SubscribeFields, string>>;

// Client-side mirror of the API schema, so mistakes show up before the request.
export function validateSubscription(v: SubscribeFields): SubscribeErrors {
  const e: SubscribeErrors = {};
  if (v.restaurantName.trim().length < 2) e.restaurantName = "Informe o nome do restaurante.";
  if (v.ownerName.trim().length < 2) e.ownerName = "Informe seu nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = "Confira o e-mail.";
  const phone = normalizePhone(v.phone);
  if (!/^[0-9]{10,11}$/.test(phone)) e.phone = "Use DDD + número, com 10 ou 11 dígitos.";
  if (!isValidDocument(v.document)) e.document = "CPF ou CNPJ inválido.";
  if (v.password.length < 8) e.password = "Use pelo menos 8 caracteres.";
  if (!v.acceptTerms) e.acceptTerms = "Aceite para continuar.";
  return e;
}

export function formatDocument(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11)
    return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
