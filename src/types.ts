export type Article = {
  id: string;
  sku: string;
  name: string;
  family: string;
  format: string;
  packSize: string;
  unitsPerBox: number;
  boxesPerPallet: number;
  netKgPerBox: number;
  gtin?: string;
  active: boolean;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  contact?: string;
  notes?: string;
};

export type Carrier = { id: string; name: string; contact?: string };
export type Vehicle = { id: string; carrierId: string; plate: string; maxWeightKg: number };
export type PalletType = { id: string; name: string; tareKg: number; maxWeightKg: number };

export type OrderLine = { articleId: string; boxes: number };
export type Order = {
  id: string;
  reference?: string;
  customerId: string;
  deliveryDate: string;
  deliveryAddress: string;
  priority: "Normal" | "Alta" | "Urgente";
  notes?: string;
  createdAt: string;
  lines: OrderLine[];
};

export type PalletLine = {
  id: string;
  articleId: string;
  format?: string;
  packSize?: string;
  unitsPerBox?: number;
  /** Historical snapshot captured when the pallet line is created. */
  netKgPerBox?: number;
  lot: string;
  expiry?: string;
  boxes: number;
  sourcePalletId?: string;
};

export type PalletStatus = "DISPONIBLE" | "RESERVADO" | "EN_CARGA" | "EXPEDIDO" | "BLOQUEADO" | "AGOTADO";
export type Pallet = {
  id: string;
  code: string;
  createdAt: string;
  typeId: string;
  location: string;
  orderId?: string;
  customerId?: string;
  orderPalletNo?: number;
  status: PalletStatus;
  statusBeforeLoad?: PalletStatus;
  lines: PalletLine[];
  labelRevision: number;
  /** "bricks": palet de bricks sueltos; las líneas cuentan unidades (unitsPerBox = 1). Sin valor: cajas. */
  stockKind?: "bricks";
  /** GS1 logistic unit identifier. */
  sscc?: string;
  notes?: string;
};

export type Load = {
  id: string;
  code: string;
  customerId?: string;
  carrierId?: string;
  vehicleId?: string;
  dock?: string;
  departureAt: string;
  notes?: string;
  palletIds: string[];
  status: "BORRADOR" | "CERRADA";
  createdAt: string;
  closedAt?: string;
  loadingStartedAt?: string;
  loadingCompletedAt?: string;
  seal?: string;
  temperatureC?: number;
  /** GS1 SSCC of the transport/load logistic grouping when used. */
  sscc?: string;
};

export type UserRole = "ADMIN" | "RESPONSABLE" | "OPERARIO" | "CONSULTA";

export type AppUser = {
  id: string;
  code: string;
  name: string;
  role: UserRole;
  active: boolean;
};

export type AuditEvent = {
  id: string;
  at: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
};

export type AppSettings = {
  companyPrefix: string;
  ssccExtension: string;
  currentUserId?: string;
  syncEnabled: boolean;
  syncEndpoint?: string;
};

export type Movement = {
  id: string;
  date: string;
  kind: "FABRICACIÓN" | "EXTRACCIÓN" | "CONSOLIDACIÓN" | "ASIGNACIÓN" | "EXPEDICIÓN" | "UBICACIÓN" | "TRASLADO" | "RESERVA" | "LIBERACIÓN" | "AJUSTE" | "CARGA" | "CIERRE_CARGA";
  palletId: string;
  relatedPalletId?: string;
  orderId?: string;
  summary: string;
};

export type Incident = {
  id: string;
  createdAt: string;
  type: "PALET_DANADO" | "DIFERENCIA_CANTIDAD" | "PRODUCTO_INCORRECTO" | "TEMPERATURA" | "ETIQUETA" | "RECHAZO_CARGA" | "OTRA";
  severity: "BAJA" | "MEDIA" | "ALTA";
  status: "ABIERTA" | "RESUELTA";
  summary: string;
  palletId?: string;
  loadId?: string;
  orderId?: string;
  notes?: string;
};

export type SyncQueueItem = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId: string;
  payload: unknown;
  status: "PENDIENTE" | "ENVIADO";
};

export type AppData = {
  version: 6;
  articles: Article[];
  customers: Customer[];
  carriers: Carrier[];
  vehicles: Vehicle[];
  palletTypes: PalletType[];
  orders: Order[];
  pallets: Pallet[];
  loads: Load[];
  movements: Movement[];
  /** Reusable warehouse location codes for fast mobile operations. */
  locations: string[];
  docks: string[];
  users: AppUser[];
  audit: AuditEvent[];
  incidents: Incident[];
  syncQueue: SyncQueueItem[];
  settings: AppSettings;
};

export type ViewName = "inicio" | "operario" | "pedidos" | "palets" | "cargas" | "control" | "maestros";
