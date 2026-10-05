import type { AppData } from "../types";

// Datos iniciales: la aplicación arranca vacía (sin ejemplos).
// Se conservan solo tipos de palet, ubicaciones, muelles y el usuario base para poder empezar a trabajar.
export function createSeed(): AppData {
  const articles: AppData["articles"] = [];
  const customers: AppData["customers"] = [];
  const carriers: AppData["carriers"] = [];
  const vehicles: AppData["vehicles"] = [];
  const palletTypes = [
    { id: "pal-eur", name: "Europalet · 120 × 80", tareKg: 25, maxWeightKg: 1000 },
    { id: "pal-ind", name: "Palet industrial · 120 × 100", tareKg: 32, maxWeightKg: 1200 },
  ];
  const orders: AppData["orders"] = [];
  const pallets: AppData["pallets"] = [];
  const movements: AppData["movements"] = [];
  return { version: 6, articles, customers, carriers, vehicles, palletTypes, orders, pallets, loads: [], movements, locations: ["Cámara · A-01", "Cámara · A-02", "Cámara · B-01", "Zona de consolidación", "Muelle 1", "Muelle 2"], docks: ["Muelle 1", "Muelle 2", "Muelle 3"], users: [{ id: "user-operator", code: "OP", name: "Operaciones", role: "OPERARIO", active: true }], audit: [], incidents: [], syncQueue: [], settings: { companyPrefix: "000000000", ssccExtension: "0", currentUserId: "user-operator", syncEnabled: false } };
}
