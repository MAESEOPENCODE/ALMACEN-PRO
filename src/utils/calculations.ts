import type { AppData, Order, OrderLine, Pallet, PalletLine } from "../types";

const articleIndex = (data: AppData) => new Map(data.articles.map((article) => [article.id, article]));
const palletTypeIndex = (data: AppData) => new Map(data.palletTypes.map((type) => [type.id, type]));

export const sumBoxes = (lines: PalletLine[]) => lines.reduce((total, line) => total + line.boxes, 0);

export const sumUnits = (lines: PalletLine[], data: AppData) => {
  const articles = articleIndex(data);
  return lines.reduce((total, line) => total + line.boxes * (line.unitsPerBox ?? articles.get(line.articleId)?.unitsPerBox ?? 0), 0);
};

/** Uses the historical snapshot stored on each pallet line. */
export const netWeight = (lines: PalletLine[], data: AppData) => {
  const articles = articleIndex(data);
  return lines.reduce((total, line) => total + line.boxes * (line.netKgPerBox ?? articles.get(line.articleId)?.netKgPerBox ?? 0), 0);
};

export const palletWeight = (pallet: Pallet, data: AppData) => netWeight(pallet.lines, data) + (palletTypeIndex(data).get(pallet.typeId)?.tareKg ?? 0);
export const palletIsMixed = (pallet: Pallet) => new Set(pallet.lines.map((line) => line.articleId)).size > 1;

export type PalletProgress = { assigned: number; reserved: number; inLoad: number; shipped: number };

export function boxesForArticle(pallets: Pallet[], articleId: string, orderId?: string): number {
  return pallets
    .filter((pallet) => !orderId || pallet.orderId === orderId)
    .filter((pallet) => !["BLOQUEADO", "AGOTADO", "EXPEDIDO"].includes(pallet.status))
    .reduce((total, pallet) => total + pallet.lines.filter((line) => line.articleId === articleId).reduce((sum, line) => sum + line.boxes, 0), 0);
}

export function progressForLine(line: OrderLine, pallets: Pallet[], orderId: string) {
  return Math.min(line.boxes, boxesForArticle(pallets, line.articleId, orderId));
}

export function orderProgress(order: Order, data: AppData): PalletProgress {
  const assigned = order.lines.reduce((sum, line) => sum + Math.min(line.boxes, boxesForArticle(data.pallets, line.articleId, order.id)), 0);
  const reserved = data.pallets.filter((p) => p.orderId === order.id && p.status === "RESERVADO").reduce((sum, p) => sum + sumBoxes(p.lines), 0);
  const inLoad = data.pallets.filter((p) => p.orderId === order.id && p.status === "EN_CARGA").reduce((sum, p) => sum + sumBoxes(p.lines), 0);
  const shipped = data.pallets.filter((p) => p.orderId === order.id && p.status === "EXPEDIDO").reduce((sum, p) => sum + sumBoxes(p.lines), 0);
  return { assigned, reserved, inLoad, shipped };
}

export function orderStatus(order: Order, data: AppData): { label: string; tone: "neutral" | "orange" | "green" | "blue"; percent: number } {
  const total = order.lines.reduce((sum, line) => sum + line.boxes, 0);
  const progress = orderProgress(order, data);
  if (total > 0 && progress.shipped >= total) return { label: "Expedido", tone: "green", percent: 100 };
  if (progress.inLoad > 0) return { label: "En carga", tone: "blue", percent: total ? Math.round(((progress.shipped + progress.inLoad) / total) * 100) : 0 };
  if (progress.shipped > 0) return { label: "Expedición parcial", tone: "orange", percent: total ? Math.round((progress.shipped / total) * 100) : 0 };
  if (progress.assigned >= total && total > 0) return { label: "Preparado", tone: "green", percent: 100 };
  if (progress.assigned > 0) return { label: "En preparación", tone: "orange", percent: total ? Math.round((progress.assigned / total) * 100) : 0 };
  return { label: "Pendiente", tone: "neutral", percent: 0 };
}

export const orderBoxes = (order: Order) => order.lines.reduce((sum, line) => sum + line.boxes, 0);
export const orderWeight = (order: Order, data: AppData) => {
  const articles = articleIndex(data);
  return order.lines.reduce((sum, line) => sum + line.boxes * (articles.get(line.articleId)?.netKgPerBox ?? 0), 0);
};
export const loadWeight = (pallets: Pallet[], data: AppData) => pallets.reduce((sum, pallet) => sum + palletWeight(pallet, data), 0);
export const loadCapacityPercent = (pallets: Pallet[], data: AppData, maxWeightKg?: number) => {
  if (!maxWeightKg || maxWeightKg <= 0) return null;
  return Math.round((loadWeight(pallets, data) / maxWeightKg) * 100);
};
export type LoadValidation = { ok: boolean; warnings: string[]; errors: string[] };
export function validateLoad(pallets: Pallet[], data: AppData, maxWeightKg?: number): LoadValidation {
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!pallets.length) errors.push("La carga no contiene palets.");
  if (pallets.some((pallet) => !pallet.lines.length || sumBoxes(pallet.lines) <= 0)) errors.push("Hay palets sin mercancía.");
  if (pallets.some((pallet) => !pallet.location)) warnings.push("Hay palets sin ubicación registrada.");
  const weight = loadWeight(pallets, data);
  if (maxWeightKg && weight > maxWeightKg) errors.push(`Peso ${weight.toFixed(1)} kg > capacidad ${maxWeightKg.toFixed(1)} kg.`);
  else if (maxWeightKg && weight / maxWeightKg >= 0.9) warnings.push(`Capacidad utilizada: ${Math.round(weight / maxWeightKg * 100)}%.`);
  const expired = expiryAlerts(pallets).filter((item) => item.level === "expired");
  if (expired.length) errors.push(`${expired.length} línea(s) con caducidad superada.`);
  const customerIds = new Set(pallets.map((pallet) => pallet.customerId || data.orders.find((order) => order.id === pallet.orderId)?.customerId).filter(Boolean));
  if (customerIds.size > 1) warnings.push("La carga contiene mercancía de varios clientes.");
  return { ok: errors.length === 0, warnings, errors };
}
export const articleName = (data: AppData, id: string) => data.articles.find((article) => article.id === id)?.name ?? "Artículo eliminado";
export const customerName = (data: AppData, id?: string) => data.customers.find((customer) => customer.id === id)?.name ?? "Stock de cajas";

export type ExpiryLevel = "ok" | "soon" | "urgent" | "expired";

export function daysToExpiry(expiry?: string): number | null {
  if (!expiry) return null;
  const target = new Date(`${expiry.slice(0, 10)}T12:00:00`).getTime();
  const base = new Date(`${(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })()}T12:00:00`).getTime();
  return Math.ceil((target - base) / 86_400_000);
}

export function expiryLevel(expiry?: string): ExpiryLevel {
  const days = daysToExpiry(expiry);
  if (days === null) return "ok";
  if (days < 0) return "expired";
  if (days <= 2) return "urgent";
  if (days <= 7) return "soon";
  return "ok";
}

/** Returns available pallets ordered FEFO: earliest expiry first. */
export function fefoPallets(pallets: Pallet[], articleId?: string): Pallet[] {
  return pallets
    .filter((pallet) => ["DISPONIBLE", "RESERVADO"].includes(pallet.status))
    .filter((pallet) => !articleId || pallet.lines.some((line) => line.articleId === articleId && line.boxes > 0))
    .slice()
    .sort((a, b) => {
      const ea = Math.min(...a.lines.filter((line) => !articleId || line.articleId === articleId).map((line) => line.expiry ? new Date(`${line.expiry}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER));
      const eb = Math.min(...b.lines.filter((line) => !articleId || line.articleId === articleId).map((line) => line.expiry ? new Date(`${line.expiry}T12:00:00`).getTime() : Number.MAX_SAFE_INTEGER));
      return ea - eb || a.createdAt.localeCompare(b.createdAt);
    });
}

export function expiryAlerts(pallets: Pallet[]) {
  return pallets.flatMap((pallet) => pallet.lines.flatMap((line) => {
    const level = expiryLevel(line.expiry);
    return level === "ok" ? [] : [{ palletId: pallet.id, palletCode: pallet.code, articleId: line.articleId, lot: line.lot, expiry: line.expiry, boxes: line.boxes, level }];
  }));
}
