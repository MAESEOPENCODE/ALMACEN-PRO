import type { AppData, OrderLine, PalletStatus } from "../types";
import { createSeed } from "./seed";
import { highestSsccSerial } from "../utils/gs1";

const DATA_KEY = "salsalog-v15";
const LEGACY_DATA_KEYS = ["salsalog-v14", "salsalog-v13", "salsalog-v12", "salsalog-v11", "salsalog-v10", "salsalog-v9", "salsalog-v8", "salsalog-v7", "salsalog-v6", "salsalog-v5", "salsalog-v4", "salsalog-v3", "salsalog-v2", "salsalog-v1"];
const BACKUP_KEY = "salsalog-last-backup-v14";

const isAppDataShape = (value: unknown): value is AppData => {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  return Array.isArray(data.articles) && Array.isArray(data.customers) && Array.isArray(data.orders) && Array.isArray(data.pallets) && Array.isArray(data.loads) && Array.isArray(data.movements);
};

function migrate(data: AppData): AppData {
  const migrated: AppData = { ...data, version: 15, qualityControls: Array.isArray((data as Partial<AppData>).qualityControls) ? (data as Partial<AppData>).qualityControls! : [], recipes: Array.isArray((data as Partial<AppData>).recipes) ? (data as Partial<AppData>).recipes! : [], productionOrders: Array.isArray((data as Partial<AppData>).productionOrders) ? (data as Partial<AppData>).productionOrders! : [], purchaseRequirements: Array.isArray((data as Partial<AppData>).purchaseRequirements) ? (data as Partial<AppData>).purchaseRequirements! : [], plantResources: Array.isArray((data as Partial<AppData>).plantResources) ? (data as Partial<AppData>).plantResources! : [{id:"line-1",name:"Línea 1",type:"LINEA",capacityKg:1000,active:true,cleaningMinutes:30},{id:"line-2",name:"Línea 2",type:"LINEA",capacityKg:1500,active:true,cleaningMinutes:45},{id:"tank-1",name:"Tanque 01",type:"TANQUE",capacityKg:1000,active:true,cleaningMinutes:30}], rawMaterials: Array.isArray((data as Partial<AppData>).rawMaterials) ? (data as Partial<AppData>).rawMaterials! : [], rawMaterialLots: Array.isArray((data as Partial<AppData>).rawMaterialLots) ? (data as Partial<AppData>).rawMaterialLots! : [], locations: Array.isArray((data as Partial<AppData>).locations) ? (data as Partial<AppData>).locations! : ["Cámara · A-01", "Cámara · A-02", "Cámara · B-01", "Zona de consolidación", "Muelle 1", "Muelle 2"], docks: Array.isArray((data as Partial<AppData>).docks) ? (data as Partial<AppData>).docks! : ["Muelle 1", "Muelle 2", "Muelle 3"], pallets: data.pallets ?? [], orders: data.orders ?? [], loads: data.loads ?? [], movements: data.movements ?? [], users: [], audit: [], incidents: [], syncQueue: [], settings: { companyPrefix: "000000000", ssccExtension: "0", syncEnabled: false } };
  migrated.users = Array.isArray((data as Partial<AppData>).users) ? (data as Partial<AppData>).users! : [{ id: "user-operator", code: "OP", name: "Operaciones", role: "OPERARIO", active: true }];
  migrated.audit = Array.isArray((data as Partial<AppData>).audit) ? (data as Partial<AppData>).audit! : [];
  migrated.incidents = Array.isArray((data as Partial<AppData>).incidents) ? (data as Partial<AppData>).incidents! : [];
  migrated.syncQueue = Array.isArray((data as Partial<AppData>).syncQueue) ? (data as Partial<AppData>).syncQueue! : [];
  migrated.settings = (data as Partial<AppData>).settings ?? { companyPrefix: "000000000", ssccExtension: "0", currentUserId: "user-operator", syncEnabled: false };
  migrated.productionOrders = migrated.productionOrders.map((order) => ({
    ...order,
    reservations: Array.isArray((order as any).reservations) ? (order as any).reservations : [], processSteps: Array.isArray((order as any).processSteps) ? (order as any).processSteps : [],
    weighings: Array.isArray((order as any).weighings) ? (order as any).weighings : [],
    packaging: Array.isArray((order as any).packaging) ? (order as any).packaging : [],
    criticalControls: Array.isArray((order as any).criticalControls) ? (order as any).criticalControls : [],
  }));
  migrated.pallets = migrated.pallets.map((pallet) => ({
    ...pallet,
    lines: (pallet.lines ?? []).map((line) => ({
      ...line,
      netKgPerBox: line.netKgPerBox ?? migrated.articles.find((article) => article.id === line.articleId)?.netKgPerBox ?? 0,
    })),
  }));
  return migrated;
}

export function normalizeAppData(input: AppData): AppData {
  const data = migrate(input);
  const orders = data.orders.map((order) => {
    const merged = new Map<string, number>();
    for (const line of order.lines ?? []) {
      if (!line.articleId || !Number.isFinite(line.boxes) || line.boxes <= 0) continue;
      merged.set(line.articleId, (merged.get(line.articleId) ?? 0) + line.boxes);
    }
    const lines: OrderLine[] = [...merged.entries()].map(([articleId, boxes]) => ({ articleId, boxes }));
    return { ...order, lines };
  });

  const orderNumbers = new Map<string, number>();
  const nextNumbers = new Map<string, number>();
  [...data.pallets].filter((pallet) => pallet.orderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).forEach((pallet) => {
    const orderId = pallet.orderId!;
    const next = (nextNumbers.get(orderId) ?? 0) + 1;
    nextNumbers.set(orderId, next);
    orderNumbers.set(pallet.id, next);
  });
  const draftPalletIds = new Set(data.loads.filter((load) => load.status === "BORRADOR").flatMap((load) => load.palletIds));
  const pallets = data.pallets.map((pallet) => {
    const locked = draftPalletIds.has(pallet.id) && ["DISPONIBLE", "RESERVADO", "EN_CARGA"].includes(pallet.status);
    const statusBeforeLoad: PalletStatus | undefined = locked
      ? (pallet.status === "EN_CARGA" ? pallet.statusBeforeLoad ?? (pallet.orderId || pallet.customerId ? "RESERVADO" : "DISPONIBLE") : pallet.status)
      : undefined;
    const lines = (pallet.lines ?? []).map((line) => {
      const article = data.articles.find((item) => item.id === line.articleId);
      return {
        ...line,
        format: line.format || article?.format || "Otro",
        packSize: line.packSize || article?.packSize || "",
        unitsPerBox: line.unitsPerBox && line.unitsPerBox > 0 ? line.unitsPerBox : article?.unitsPerBox ?? 1,
      };
    });
    return {
      ...pallet,
      lines,
      orderPalletNo: pallet.orderId ? orderNumbers.get(pallet.id) : undefined,
      status: locked ? "EN_CARGA" as const : pallet.status === "EN_CARGA" ? (pallet.statusBeforeLoad ?? (pallet.orderId || pallet.customerId ? "RESERVADO" : "DISPONIBLE")) : pallet.status,
      statusBeforeLoad,
    };
  });
  const locations = [...new Set([...(data.locations ?? []), ...pallets.map((pallet) => pallet.location).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "es"));
  const docks = [...new Set([...(data.docks ?? []), ...data.loads.map((load) => load.dock).filter((dock): dock is string => Boolean(dock))])].sort((a, b) => a.localeCompare(b, "es"));
  const settings = { ...data.settings, ssccCounter: highestSsccSerial(data.settings, pallets) };
  return { ...data, version: 15, orders, pallets, locations, docks, users: data.users, audit: data.audit, incidents: data.incidents, syncQueue: data.syncQueue, settings };
}

const RECOVERY_KEY = "salsalog-recovery";

export function readData(): AppData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DATA_KEY);
    if (!raw) {
      for (const key of LEGACY_DATA_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) {
      const seed = createSeed();
      localStorage.setItem(DATA_KEY, JSON.stringify(seed));
      return normalizeAppData(seed);
    }
    const parsed = JSON.parse(raw) as AppData;
    if (!isAppDataShape(parsed)) throw new Error("Formato no válido");
    const normalized = normalizeAppData(parsed);
    localStorage.setItem(DATA_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    // Si había datos pero no se pudieron leer, se conserva una copia antes de que el siguiente guardado los pise.
    try {
      if (raw) localStorage.setItem(RECOVERY_KEY, raw);
    } catch { /* sin espacio: no hay más que hacer */ }
    return normalizeAppData(createSeed());
  }
}

export function writeData(data: AppData): void {
  const normalized = normalizeAppData(data);
  const serialized = JSON.stringify(normalized);
  // Keep a rolling safety copy locally. This is not a replacement for an explicit export.
  const previous = localStorage.getItem(DATA_KEY);
  if (previous) localStorage.setItem(BACKUP_KEY, previous);
  localStorage.setItem(DATA_KEY, serialized);
}

export function getLocalBackup(): AppData | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppData;
    return isAppDataShape(parsed) ? normalizeAppData(parsed) : null;
  } catch {
    return null;
  }
}

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    startIn?: "downloads" | "documents";
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (content: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export async function exportData(data: AppData): Promise<"saved" | "downloaded" | "cancelled"> {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const filename = `salsalog-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: filename,
        startIn: "downloads",
        types: [{ description: "Copia de seguridad SalsaLog", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1500);
  return "downloaded";
}

export async function importData(file: File): Promise<AppData> {
  const parsed = JSON.parse(await file.text()) as AppData;
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(parsed.version) || !Array.isArray(parsed.articles) || !Array.isArray(parsed.customers) || !Array.isArray(parsed.orders) || !Array.isArray(parsed.pallets) || !Array.isArray(parsed.loads) || !Array.isArray(parsed.movements)) {
    throw new Error("El fichero no parece una copia de seguridad válida de SalsaLog.");
  }
  return normalizeAppData(parsed);
}
