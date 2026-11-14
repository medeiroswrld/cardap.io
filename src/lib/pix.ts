// Static Pix "BR Code" (EMV QR) with a fixed amount, per the Banco Central
// manual. No bank or gateway involved: the restaurant confirms the receipt.

function field(id: string, value: string) {
  return id + String(value.length).padStart(2, "0") + value;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Bank apps reject accents in the merchant name and city.
export function pixText(text: string, max: number) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, max)
    .trim();
}

export function orderTxid(number: number) {
  return `PED${number}`;
}

export function pixPayload(input: {
  key: string;
  name: string;
  city: string;
  amountCents?: number;
  txid: string;
}) {
  const account = field("00", "br.gov.bcb.pix") + field("01", input.key.trim());
  let payload =
    field("00", "01") + field("26", account) + field("52", "0000") + field("53", "986");
  if (input.amountCents !== undefined)
    payload += field("54", (input.amountCents / 100).toFixed(2));
  payload +=
    field("58", "BR") +
    field("59", pixText(input.name, 25)) +
    field("60", pixText(input.city, 15)) +
    field("62", field("05", input.txid)) +
    "6304";
  return payload + crc16(payload);
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function pixReceiptLink(input: {
  phone: string;
  number: number;
  totalCents: number;
  restaurantName: string;
}) {
  let digits = input.phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  else if (!(digits.startsWith("55") && (digits.length === 12 || digits.length === 13)))
    return null;
  const text = `Olá! Pedido #${input.number} no ${input.restaurantName}. Segue o comprovante do Pix de ${brl(input.totalCents)}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type PixKeyType = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

// Bank apps only accept the raw key: digits for CPF/CNPJ, +55 phone, lowercase e-mail/UUID.
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const text = raw.trim();
  if (type === "cpf" || type === "cnpj") {
    const digits = text.replace(/\D/g, "");
    return digits.length === (type === "cpf" ? 11 : 14) ? digits : null;
  }
  if (type === "telefone") {
    let digits = text.replace(/\D/g, "");
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55"))
      digits = digits.slice(2);
    return digits.length === 10 || digits.length === 11 ? "+55" + digits : null;
  }
  const key = text.toLowerCase();
  if (type === "email")
    return key.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key) ? key : null;
  if (type === "aleatoria")
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key) ? key : null;
  return null;
}

// Only the key is stored, not its type: guess it to preselect the form.
export function guessPixKeyType(key: string): PixKeyType {
  if (key.startsWith("+55")) return "telefone";
  if (key.includes("@")) return "email";
  if (/^\d{11}$/.test(key)) return "cpf";
  if (/^\d{14}$/.test(key)) return "cnpj";
  return "aleatoria";
}
