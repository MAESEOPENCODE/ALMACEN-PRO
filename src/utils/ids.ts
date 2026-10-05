export function makeId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function nextDocument(prefix: "PED" | "PAL" | "CAR", existing: string[]): string {
  const year = new Date().getFullYear();
  if (prefix === "PED") {
    const marker = `${prefix}-${year}-`;
    const sequence = existing.filter((item) => item.startsWith(marker)).map((item) => Number(item.slice(marker.length))).filter(Number.isFinite);
    return `${marker}${String(Math.max(0, ...sequence) + 1).padStart(4, "0")}`;
  }
  const marker = `${prefix}-${year}${String(new Date().getMonth() + 1).padStart(2, "0")}-`;
  const sequence = existing.filter((item) => item.startsWith(marker)).map((item) => Number(item.slice(marker.length))).filter(Number.isFinite);
  return `${marker}${String(Math.max(0, ...sequence) + 1).padStart(4, "0")}`;
}
