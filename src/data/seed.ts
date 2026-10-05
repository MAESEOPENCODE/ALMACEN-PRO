import type { AppData } from "../types";

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
const stamp = () => new Date().toISOString();

export function createSeed(): AppData {
  const articles = [
    { id: "art-gaz", sku: "GAZ-1L", name: "Gazpacho andaluz", family: "Gazpachos", format: "Brick", packSize: "1 L", unitsPerBox: 6, boxesPerPallet: 64, netKgPerBox: 6.4, gtin: "08412345000126", active: true },
    { id: "art-sal", sku: "SAL-1L", name: "Salmorejo cordobés", family: "Salmorejos", format: "Brick", packSize: "1 L", unitsPerBox: 6, boxesPerPallet: 64, netKgPerBox: 6.4, gtin: "08412345000225", active: true },
    { id: "art-brv", sku: "BRV-500", name: "Salsa brava", family: "Salsas", format: "Botella", packSize: "500 ml", unitsPerBox: 12, boxesPerPallet: 80, netKgPerBox: 6.3, gtin: "08412345000324", active: true },
    { id: "art-ali", sku: "ALI-2K", name: "Alioli artesano", family: "Salsas", format: "Cubo", packSize: "2 kg", unitsPerBox: 4, boxesPerPallet: 48, netKgPerBox: 8.2, gtin: "08412345000423", active: true },
  ];
  const customers = [
    { id: "cli-hue", code: "C-0048", name: "Mercado La Huerta", address: "Av. de la Industria, 18", city: "Córdoba", contact: "Recepción · 957 410 280", notes: "Descarga por muelle 2" },
    { id: "cli-vega", code: "C-0019", name: "Distribuciones Vega", address: "Pol. Las Quemadas, parcela 44", city: "Córdoba", contact: "Almacén · 957 322 110", notes: "Avisar 30 min antes" },
    { id: "cli-del", code: "C-0062", name: "Delicias del Sur", address: "Ctra. Sevilla, km 7", city: "Écija", contact: "Compras · 954 780 320", notes: "" },
  ];
  const carriers = [
    { id: "car-log", name: "Logística Guadalquivir", contact: "957 500 440" },
    { id: "car-frio", name: "Frío Express Sur", contact: "954 210 880" },
  ];
  const vehicles = [
    { id: "veh-1", carrierId: "car-log", plate: "4821 LPD", maxWeightKg: 24000 },
    { id: "veh-2", carrierId: "car-frio", plate: "6170 MKT", maxWeightKg: 18000 },
  ];
  const palletTypes = [
    { id: "pal-eur", name: "Europalet · 120 × 80", tareKg: 25, maxWeightKg: 1000 },
    { id: "pal-ind", name: "Palet industrial · 120 × 100", tareKg: 32, maxWeightKg: 1200 },
  ];
  const orders = [
    { id: "PED-2026-0412", reference: "OC-88371", customerId: "cli-hue", deliveryDate: day(2), deliveryAddress: "Av. de la Industria, 18 · Córdoba", priority: "Alta" as const, notes: "Descarga por muelle 2", createdAt: stamp(), lines: [{ articleId: "art-gaz", boxes: 48 }, { articleId: "art-sal", boxes: 24 }] },
    { id: "PED-2026-0413", reference: "OC-12506", customerId: "cli-vega", deliveryDate: day(3), deliveryAddress: "Pol. Las Quemadas, parcela 44 · Córdoba", priority: "Normal" as const, notes: "Avisar 30 min antes", createdAt: stamp(), lines: [{ articleId: "art-brv", boxes: 20 }, { articleId: "art-ali", boxes: 12 }] },
    { id: "PED-2026-0414", reference: "DD-2049", customerId: "cli-del", deliveryDate: day(5), deliveryAddress: "Ctra. Sevilla, km 7 · Écija", priority: "Urgente" as const, notes: "Pedido mixto de cajas sueltas", createdAt: stamp(), lines: [{ articleId: "art-gaz", boxes: 12 }, { articleId: "art-brv", boxes: 10 }, { articleId: "art-ali", boxes: 6 }] },
  ];
  const pallets = [
    { id: "p-041", code: "PAL-202610-0041", createdAt: stamp(), typeId: "pal-eur", location: "Cámara · A-01", orderId: orders[0].id, customerId: customers[0].id, orderPalletNo: 1, status: "RESERVADO" as const, labelRevision: 1, lines: [{ id: "l-041a", articleId: "art-gaz", lot: "GZ-261001", expiry: day(72), boxes: 24 }] },
    { id: "p-042", code: "PAL-202610-0042", createdAt: stamp(), typeId: "pal-eur", location: "Cámara · A-02", orderId: orders[0].id, customerId: customers[0].id, orderPalletNo: 2, status: "RESERVADO" as const, labelRevision: 1, lines: [{ id: "l-042a", articleId: "art-sal", lot: "SL-260928", expiry: day(86), boxes: 12 }] },
    { id: "p-043", code: "PAL-202610-0043", createdAt: stamp(), typeId: "pal-eur", location: "Cámara · B-03", status: "DISPONIBLE" as const, labelRevision: 2, lines: [{ id: "l-043a", articleId: "art-gaz", lot: "GZ-261001", expiry: day(72), boxes: 38 }] },
    { id: "p-044", code: "PAL-202610-0044", createdAt: stamp(), typeId: "pal-eur", location: "Cámara · C-01", status: "DISPONIBLE" as const, labelRevision: 1, lines: [{ id: "l-044a", articleId: "art-brv", lot: "SB-260925", expiry: day(150), boxes: 18 }, { id: "l-044b", articleId: "art-ali", lot: "AL-260929", expiry: day(90), boxes: 8 }] },
    { id: "p-045", code: "PAL-202610-0045", createdAt: stamp(), typeId: "pal-ind", location: "Cámara · B-05", orderId: orders[1].id, customerId: customers[1].id, orderPalletNo: 1, status: "RESERVADO" as const, labelRevision: 1, lines: [{ id: "l-045a", articleId: "art-brv", lot: "SB-260925", expiry: day(150), boxes: 12 }] },
  ];
  const movements = [
    { id: "mov-1", date: stamp(), kind: "FABRICACIÓN" as const, palletId: "p-041", orderId: orders[0].id, summary: "Palet confeccionado y asignado al pedido" },
    { id: "mov-2", date: stamp(), kind: "FABRICACIÓN" as const, palletId: "p-042", orderId: orders[0].id, summary: "Palet confeccionado y asignado al pedido" },
    { id: "mov-3", date: stamp(), kind: "FABRICACIÓN" as const, palletId: "p-043", summary: "Palet disponible en stock de cajas" },
    { id: "mov-4", date: stamp(), kind: "FABRICACIÓN" as const, palletId: "p-044", summary: "Palet mixto disponible en stock de cajas" },
    { id: "mov-5", date: stamp(), kind: "FABRICACIÓN" as const, palletId: "p-045", orderId: orders[1].id, summary: "Palet confeccionado y asignado al pedido" },
  ];
  return { version: 6, articles, customers, carriers, vehicles, palletTypes, orders, pallets, loads: [], movements, locations: ["Cámara · A-01", "Cámara · A-02", "Cámara · B-01", "Zona de consolidación", "Muelle 1", "Muelle 2"], docks: ["Muelle 1", "Muelle 2", "Muelle 3"], users: [{ id: "user-operator", code: "OP", name: "Operaciones", role: "OPERARIO", active: true }], audit: [], incidents: [], syncQueue: [], settings: { companyPrefix: "000000000", ssccExtension: "0", currentUserId: "user-operator", syncEnabled: false } };
}
