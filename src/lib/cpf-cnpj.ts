export function normalizeDocument(value: string) {
  return value.replace(/\D/g, "");
}
function digit(digits: number[], weights: number[]) {
  const sum = digits.reduce((total, n, i) => total + n * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}
export function isValidCpf(value: string) {
  const d = normalizeDocument(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const n = d.split("").map(Number);
  const first = digit(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === n[9] && second === n[10];
}
export function isValidCnpj(value: string) {
  const d = normalizeDocument(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const n = d.split("").map(Number);
  const first = digit(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === n[12] && second === n[13];
}
export function isValidDocument(value: string) {
  return isValidCpf(value) || isValidCnpj(value);
}
