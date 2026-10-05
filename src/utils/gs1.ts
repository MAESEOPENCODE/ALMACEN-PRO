/** GS1 helpers for SSCC generation. The application keeps the generated value on the pallet as a historical identifier. */
export function gs1CheckDigit(numberWithoutCheck: string): string {
  const digits = numberWithoutCheck.replace(/\D/g, "");
  let sum = 0;
  let weight = 3;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    sum += Number(digits[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return String((10 - (sum % 10)) % 10);
}

export function normalizeGs1Prefix(prefix: string): string {
  return prefix.replace(/\D/g, "").slice(0, 9).padStart(9, "0");
}

export function makeSscc(companyPrefix: string, serial: number, extension = "0"): string {
  const prefix = normalizeGs1Prefix(companyPrefix);
  const ext = (extension.replace(/\D/g, "").slice(-1) || "0");
  const serialPart = String(Math.max(0, serial)).padStart(7, "0").slice(-7);
  const body = `${ext}${prefix}${serialPart}`.slice(0, 17).padStart(17, "0");
  return `${body}${gs1CheckDigit(body)}`;
}

export function ssccHuman(value?: string): string {
  if (!value) return "—";
  return value.length === 18 ? `00 ${value.slice(0,2)} ${value.slice(2,8)} ${value.slice(8,18)}` : value;
}
