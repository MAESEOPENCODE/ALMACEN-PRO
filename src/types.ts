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
  /** Vida útil en días desde la elaboración; se usa para la caducidad del producto terminado. */
  shelfLifeDays?: number;
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

export type RawMaterial = {
  id: string;
  code: string;
  name: string;
  family: string;
  unit: "kg" | "l" | "ud";
  supplierId?: string;
  allergens?: string[];
  active: boolean;
};

export type RawMaterialLotStatus = "LIBERADO" | "CUARENTENA" | "BLOQUEADO" | "AGOTADO";
export type RawMaterialLot = {
  id: string;
  materialId: string;
  supplierLot?: string;
  internalLot: string;
  quantity: number;
  unit: RawMaterial["unit"];
  expiry?: string;
  receivedAt: string;
  supplierId?: string;
  location: string;
  status: RawMaterialLotStatus;
  notes?: string;
};

export type RecipeIngredient = { id: string; materialId: string; quantity: number; unit: RawMaterial["unit"]; percentage?: number };
export type Recipe = { id: string; code: string; name: string; version: number; outputKg: number; articleId?: string; ingredients: RecipeIngredient[]; active: boolean; notes?: string };
export type ProductionStatus = "PLANIFICADA" | "EN_CURSO" | "FINALIZADA" | "BLOQUEADA";
export type ProductionStage = "PREPARACION" | "PESAJE" | "MEZCLA" | "COCCION" | "ENFRIAMIENTO" | "CONTROL" | "ENVASADO" | "PALETIZADO" | "LIBERACION";
export type ProductionStageStatus = "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "BLOQUEADA";
export type ProductionProcessStep = { id: string; stage: ProductionStage; status: ProductionStageStatus; startedAt?: string; completedAt?: string; operator?: string; notes?: string };
export type ProductionWeighing = { id: string; materialId: string; lotId: string; planned: number; actual: number; unit: RawMaterial["unit"]; tolerancePct?: number; operator?: string; weighedAt: string; status: "OK" | "DESVIACION" };
export type ProductionPackaging = { id: string; name: string; code?: string; planned: number; actual?: number; unit: "ud" | "cajas" | "kg"; lot?: string; notes?: string };
export type ProductionCriticalControl = { id: string; point: string; value?: number; unit?: string; min?: number; max?: number; status: "OK" | "DESVIACION"; checkedAt: string; operator?: string; correctiveAction?: string };
export type ProductionConsumption = { id: string; materialId: string; lotId: string; planned: number; actual: number; unit: RawMaterial["unit"] };
export type ProductionReservation = { id: string; materialId: string; lotId: string; quantity: number; unit: RawMaterial["unit"]; reservedAt: string };
export type PurchaseRequirementStatus = "PENDIENTE" | "SOLICITADA" | "RECIBIDA" | "CANCELADA";
export type PurchaseRequirement = { id: string; materialId: string; quantity: number; unit: RawMaterial["unit"]; requiredDate: string; productionOrderIds: string[]; supplierId?: string; status: PurchaseRequirementStatus; createdAt: string; requestedAt?: string; receivedAt?: string; receivedLotId?: string; notes?: string };
export type PlantResource = { id: string; name: string; type: "LINEA" | "TANQUE"; capacityKg: number; active: boolean; cleaningMinutes?: number };
export type ProductionOrder = { id: string; code: string; recipeId: string; recipeVersion: number; plannedKg: number; actualKg?: number; finishedBoxes?: number; wasteKg?: number; status: ProductionStatus; line?: string; tank?: string; lot: string; plannedAt: string; startedAt?: string; finishedAt?: string; consumptions: ProductionConsumption[]; reservations?: ProductionReservation[]; processSteps?: ProductionProcessStep[]; weighings?: ProductionWeighing[]; packaging?: ProductionPackaging[]; criticalControls?: ProductionCriticalControl[]; notes?: string };

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
  /** Último serial SSCC emitido. Solo sube: borrar palets no reutiliza números. */
  ssccCounter?: number;
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

export type QualityStatus = "PENDIENTE" | "LIBERADO" | "RETENIDO" | "BLOQUEADO";
export type QualityControl = {
  id: string;
  productionOrderId: string;
  productionLot: string;
  checkedAt: string;
  operator?: string;
  ph?: number;
  temperatureC?: number;
  viscosity?: number;
  weightKg?: number;
  status: QualityStatus;
  notes?: string;
};

export type AppData = {
  version: 15;
  articles: Article[];
  rawMaterials: RawMaterial[];
  rawMaterialLots: RawMaterialLot[];
  recipes: Recipe[];
  productionOrders: ProductionOrder[];
  purchaseRequirements: PurchaseRequirement[];
  plantResources: PlantResource[];
  qualityControls: QualityControl[];
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

export type ViewName = "inicio" | "operario" | "pedidos" | "palets" | "inventario" | "planificacion" | "produccion" | "fabricacion" | "calidad" | "cargas" | "trazabilidad" | "control" | "maestros";
