// Brazilian phone typed by a customer -> the 10 or 11 digits (DDD + number) the server stores.
// Accepts what people paste from WhatsApp or the phone's autofill: +55, a trunk 0, spaces, dashes.

export const PHONE_MESSAGE = "Informe o WhatsApp com DDD, por exemplo (15) 99999-9999.";

export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits;
}

export function isValidPhone(digits: string): boolean {
  return /^[1-9]{2}\d{8,9}$/.test(digits);
}

// Throws the customer-facing message when the number cannot be a Brazilian phone with DDD.
export function phoneForOrder(input: string): string {
  const digits = normalizePhone(input);
  if (!isValidPhone(digits)) throw new Error(PHONE_MESSAGE);
  return digits;
}

// Shown when the server rejects the checkout data (it never names the field).
export const CHECKOUT_INVALID_TEXT =
  "Confira seus dados: nome, WhatsApp com DDD e endereço de entrega.";
