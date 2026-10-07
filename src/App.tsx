import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Barcode, Bell,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Download, FileText,
  LayoutDashboard, MapPin, MoreHorizontal, Package, Pencil, Plus, Printer, Trash2, ScanLine,
  Search, Settings2, ShieldCheck, Truck, Upload, Users, X, Boxes, ClipboardList, Warehouse, Factory, AlertCircle, PackageCheck, CalendarClock, ShoppingCart, Gauge, Layers3,
} from "lucide-react";
import type { AppData, Article, Carrier, Customer, Incident, Load, Movement, Order, Pallet, PalletLine, PalletStatus, PalletType, ViewName, RawMaterial, RawMaterialLot, Recipe, ProductionOrder, QualityControl, ProductionStage, ProductionCriticalControl, ProductionPackaging, ProductionReservation, ProductionWeighing } from "./types";
import { exportData, importData, readData, writeData } from "./data/repository";
import { articleName, boxesForArticle, customerName, expiryAlerts, expiryLevel, fefoPallets, loadWeight, loadCapacityPercent, validateLoad, netWeight, orderBoxes, orderStatus, palletIsMixed, palletWeight, progressForLine, sumBoxes, sumUnits } from "./utils/calculations";
import { makeId, nextDocument } from "./utils/ids";
import { makeSscc, nextSsccSerial, ssccHuman } from "./utils/gs1";
import { Barcode as BarcodeView } from "./components/Barcode";
import { ArticleForm, CarrierForm, CustomerForm, ExtractForm, LoadEditForm, LoadForm, OrderForm, PalletEditForm, PalletForm, PalletTypeForm, VehicleForm } from "./components/Forms";
import { ConfirmDialog, type ConfirmOptions } from "./components/ConfirmDialog";
import { clearInstallPrompt, getInstallPrompt, subscribeInstallPrompt, type InstallPromptEvent } from "./pwaInstall";

const boxUnit = (pallet: Pallet) => (pallet.stockKind === "bricks" ? "bricks" : "cajas");

const NAV: { id: ViewName; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard },
  { id: "operario", label: "Operario", icon: ScanLine },
  { id: "pedidos", label: "Pedidos", icon: FileText },
  { id: "palets", label: "Palets", icon: Package },
  { id: "inventario", label: "Inventario", icon: Warehouse },
  { id: "planificacion", label: "Planificación", icon: CalendarClock },
  { id: "produccion", label: "Producción", icon: Factory },
  { id: "fabricacion", label: "Fabricación", icon: Factory },
  { id: "calidad", label: "Calidad", icon: ShieldCheck },
  { id: "cargas", label: "Cargas", icon: Truck },
  { id: "trazabilidad", label: "Trazabilidad", icon: Activity },
  { id: "control", label: "Control", icon: ShieldCheck },
  { id: "maestros", label: "Maestros", icon: Settings2 },
];
const num = (value: number, digits = 0) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
const kg = (value: number) => `${num(value, 1)} kg`;
const PALLET_STATUS_META: Record<PalletStatus, { label: string; tone: "neutral" | "orange" | "green" | "blue" | "red" }> = {
  DISPONIBLE: { label: "Disponible", tone: "green" },
  RESERVADO: { label: "Reservado", tone: "orange" },
  EN_CARGA: { label: "En carga", tone: "blue" },
  EXPEDIDO: { label: "Expedido", tone: "neutral" },
  BLOQUEADO: { label: "Bloqueado", tone: "red" },
  AGOTADO: { label: "Agotado", tone: "neutral" },
};
const dateText = (value?: string) => value ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : "—";
const dateTimeText = (value?: string) => value ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const localIso = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localIso();
const relativeDate = (value: string) => { const days = Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000); return days < 0 ? `Hace ${Math.abs(days)} d` : days === 0 ? "Hoy" : days === 1 ? "Mañana" : `En ${days} d`; };
const movementLabels: Record<Movement["kind"], string> = { "FABRICACIÓN": "Palet confeccionado", "EXTRACCIÓN": "Cajas extraídas", "CONSOLIDACIÓN": "Palet consolidado", "ASIGNACIÓN": "Asignación actualizada", "EXPEDICIÓN": "Palet expedido", "UBICACIÓN": "Palet ubicado", "TRASLADO": "Palet trasladado", "RESERVA": "Palet reservado", "LIBERACIÓN": "Reserva liberada", "AJUSTE": "Ajuste de stock", "CARGA": "Palet incorporado a carga", "CIERRE_CARGA": "Carga expedida" };

type ModalState = { kind: string; id?: string; orderId?: string };
type ToastState = { message: string; type: "success" | "warning" | "error" };

function Status({ label, tone = "neutral" }: { label: string; tone?: string }) { return <span className={`status-pill ${tone}`}>{label}</span>; }
function Logo() { return <div className="brand-lockup"><img src={`${import.meta.env.BASE_URL}salsa-log-mark.svg`} alt="" /><span>Salsa<span>Log</span></span></div>; }
function PageTitle({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) { return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>; }
function Metric({ label, value, detail, icon: Icon, accent }: { label: string; value: string | number; detail: string; icon: typeof Package; accent?: string }) { return <div className="metric-card"><div className={`metric-icon ${accent ?? ""}`}><Icon size={18} strokeWidth={1.8} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>; }
function Progress({ value }: { value: number }) { return <div className="progress-track"><span style={{ width: `${Math.min(100, value)}%` }} /></div>; }
function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Package; title: string; detail: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-icon"><Icon size={23} /></div><strong>{title}</strong><p>{detail}</p>{action}</div>; }
function Modal({ title, eyebrow, onClose, children, size = "normal" }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode; size?: "normal" | "wide" | "print" }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-card ${size}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div><button className="icon-button modal-close" aria-label="Cerrar" onClick={onClose}><X size={18} /></button></div><div className="modal-body">{children}</div></section></div>; }

function PalletLabel({ pallet, data }: { pallet: Pallet; data: AppData }) {
  const order = data.orders.find((item) => item.id === pallet.orderId);
  const customerId = order?.customerId ?? pallet.customerId;
  const type = data.palletTypes.find((item) => item.id === pallet.typeId);
  const mixed = palletIsMixed(pallet);
  return <div className="print-sheet pallet-label">
    <div className="label-top"><Logo /><span className="label-kind">ETIQUETA DE PALET</span></div>
    <div className="label-code-row"><div><div className="label-overline">IDENTIFICADOR LOGÍSTICO</div><div className="label-code">{pallet.code}</div></div><div className="label-stamps">{order && <div className="order-seq-stamp"><span>ORDEN DEL PEDIDO</span><b>{String(pallet.orderPalletNo ?? 1).padStart(2, "0")}</b></div>}<div className="revision-stamp">REV<br /><b>{String(pallet.labelRevision).padStart(2, "0")}</b></div></div></div>
    <div className="label-barcode"><BarcodeView value={pallet.sscc ? `00${pallet.sscc}` : pallet.code} /><small className="gs1-caption">(00) SSCC · {ssccHuman(pallet.sscc)}</small></div>
    {mixed && <div className="mixed-banner">PALET MIXTO · {new Set(pallet.lines.map((line) => line.articleId)).size} ARTÍCULOS</div>}{pallet.status === "AGOTADO" && <div className="empty-pallet-banner">PALET AGOTADO · 0 CAJAS · ETIQUETA ACTUALIZADA</div>}
    <div className="label-destination"><div className="label-overline">DESTINO</div><strong>{pallet.stockKind === "bricks" && !customerId ? "Stock de bricks" : customerName(data, customerId)}</strong><span>{order ? `Pedido ${order.id}${order.reference ? ` · Ref. ${order.reference}` : ""}` : pallet.stockKind === "bricks" ? "Stock de bricks (unidades)" : "Stock de cajas"}</span></div>
    <div className="label-lines"><div className="label-lines-head"><span>ARTÍCULO / LOTE</span><span>CAJAS</span></div>{pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="label-line" key={line.id}><div><strong>{article?.sku} · {article?.name}</strong><span>Lote {line.lot} · Cad. {dateText(line.expiry)}</span><small>{line.boxes * (line.unitsPerBox ?? article?.unitsPerBox ?? 0)} uds · {line.format ?? article?.format} {line.packSize ?? article?.packSize} · {line.unitsPerBox ?? article?.unitsPerBox} uds/caja</small></div><b>{num(line.boxes)}</b></div>; })}</div>
    <div className="label-summary"><div><span>CAJAS</span><b>{pallet.stockKind === "bricks" ? "—" : num(sumBoxes(pallet.lines))}</b></div><div><span>UNIDADES</span><b>{num(sumUnits(pallet.lines, data))}</b></div><div><span>PESO BRUTO</span><b>{kg(palletWeight(pallet, data))}</b></div></div>
    <div className="label-footer"><span>{type?.name} · {pallet.location}</span><span>Confeccionado {dateText(pallet.createdAt)}</span></div>
  </div>;
}

function PackingList({ load, data }: { load: Load; data: AppData }) {
  const pallets = load.palletIds.map((id) => data.pallets.find((pallet) => pallet.id === id)).filter((item): item is Pallet => Boolean(item));
  const carrier = data.carriers.find((item) => item.id === load.carrierId);
  const vehicle = data.vehicles.find((item) => item.id === load.vehicleId);
  const orders = [...new Set(pallets.map((pallet) => pallet.orderId).filter((id): id is string => Boolean(id)))].map((id) => data.orders.find((order) => order.id === id)).filter((item): item is Order => Boolean(item));
  return <div className="print-sheet packing-sheet">
    <div className="packing-heading"><div><Logo /><div className="doc-kicker">DOCUMENTO DE EXPEDICIÓN</div><h1>Lista de carga</h1><p>Relación de palets y secuencia de carga</p></div><div className="packing-number"><span>Nº DE CARGA</span><strong>{load.code}</strong><Status label={load.status === "CERRADA" ? "Expedida" : "En preparación"} tone={load.status === "CERRADA" ? "green" : "orange"} /></div></div>
    <div className="packing-meta"><div><span>CLIENTES / PEDIDOS</span><strong>{orders.length ? orders.map((order) => `${customerName(data, order.customerId)} · ${order.id}`).join("\n") : "Carga manual"}</strong></div><div><span>TRANSPORTE</span><strong>{carrier?.name ?? "—"}{vehicle ? ` · ${vehicle.plate}` : ""}</strong></div><div><span>SALIDA PREVISTA</span><strong>{dateTimeText(load.departureAt)}</strong></div><div><span>MUELLE</span><strong>{load.dock || "—"}</strong></div></div>
    <div className="packing-summary"><div><span>PALETS</span><b>{num(pallets.length)}</b></div><div><span>CAJAS</span><b>{num(pallets.reduce((sum, pallet) => sum + sumBoxes(pallet.lines), 0))}</b></div><div><span>PESO BRUTO</span><b>{kg(loadWeight(pallets, data))}</b></div></div>
    <table className="packing-table"><thead><tr><th>ORDEN</th><th>PALET / DESTINO</th><th>CONTENIDO</th><th>LOTE / CADUCIDAD</th><th>CAJAS</th><th>PESO</th></tr></thead><tbody>{pallets.map((pallet, index) => <tr key={pallet.id}><td><span className="sequence">{String(index + 1).padStart(2, "0")}</span></td><td><strong>{pallet.code}</strong><small>{customerName(data, data.orders.find((order) => order.id === pallet.orderId)?.customerId ?? pallet.customerId)}</small>{pallet.orderId && <small>{pallet.orderId} · Palet {String(pallet.orderPalletNo ?? 1).padStart(2, "0")}</small>}</td><td>{pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return <div key={line.id}>{line.boxes} × {articleName(data, line.articleId)} · {line.format ?? article?.format} {line.packSize ?? article?.packSize} · {line.unitsPerBox ?? article?.unitsPerBox} uds/caja</div>; })}</td><td>{pallet.lines.map((line) => <div key={line.id}>Lote {line.lot} · Cad. {dateText(line.expiry)}</div>)}</td><td>{num(sumBoxes(pallet.lines))}</td><td>{kg(palletWeight(pallet, data))}</td></tr>)}</tbody></table>
    {load.notes && <div className="packing-notes"><span>OBSERVACIONES</span><p>{load.notes}</p></div>}
    <div className="packing-signatures"><div>Preparado por</div><div>Conductor / transportista</div><div>Recibido por</div></div><div className="packing-footer"><span>SalsaLog · Control de expedición</span><span>Generado {dateText(today())} · {load.code}</span></div>
  </div>;
}


function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        const Detector = (window as Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
        if (!Detector) { setError("Este navegador no dispone de BarcodeDetector. Puedes usar un lector Bluetooth o introducir el código manualmente."); return; }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const detector = new Detector({ formats: ["code_128", "ean_13", "ean_8", "qr_code"] });
        const tick = async () => {
          if (!active || !videoRef.current) return;
          try { const found = await detector.detect(videoRef.current); const code = found[0]?.rawValue?.trim(); if (code) { onCode(code); return; } } catch { /* continue scanning */ }
          window.setTimeout(tick, 180);
        };
        void tick();
      } catch { setError("No se pudo abrir la cámara. Comprueba el permiso de cámara del navegador."); }
    };
    void start();
    return () => { active = false; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; };
  }, [onCode]);
  return <Modal title="Escanear código" eyebrow="CÁMARA · LECTOR" onClose={onClose}><div className="camera-scanner"><video ref={videoRef} muted playsInline /><div className="camera-frame" /><p>{error || "Apunta al código de barras del palet o SSCC."}</p>{error && <div className="operator-message"><AlertTriangle size={16} /> {error}</div>}<button className="button secondary" onClick={onClose}>Cerrar cámara</button></div></Modal>;
}


function InventoryPage({ data, setData, notify }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void }) {
  const [tab, setTab] = useState<"stock" | "recepcion" | "materiales">("stock");
  const [search, setSearch] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [supplierLot, setSupplierLot] = useState("");
  const [internalLot, setInternalLot] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<RawMaterial["unit"]>("kg");
  const [expiry, setExpiry] = useState("");
  const [location, setLocation] = useState(data.locations[0] ?? "Almacén MP");
  const [status, setStatus] = useState<RawMaterialLot["status"]>("CUARENTENA");
  const [materialName, setMaterialName] = useState("");
  const [materialCode, setMaterialCode] = useState("");
  const [materialFamily, setMaterialFamily] = useState("");
  const [materialUnit, setMaterialUnit] = useState<RawMaterial["unit"]>("kg");

  const materialNameOf = (id: string) => data.rawMaterials.find(m => m.id === id)?.name ?? "Materia prima";
  const lots = data.rawMaterialLots.filter(l => {
    const m = data.rawMaterials.find(x => x.id === l.materialId);
    return !search.trim() || `${m?.name} ${m?.code} ${l.internalLot} ${l.supplierLot ?? ""} ${l.location}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a,b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
  const todayIso = today();
  const available = data.rawMaterialLots.filter(l => l.status === "LIBERADO" && l.quantity > 0).reduce((n,l) => n+l.quantity, 0);
  const quarantine = data.rawMaterialLots.filter(l => l.status === "CUARENTENA").length;
  const expiring = data.rawMaterialLots.filter(l => l.expiry && l.expiry >= todayIso && (new Date(`${l.expiry}T12:00:00`).getTime()-new Date(`${todayIso}T12:00:00`).getTime()) <= 30*86400000).length;

  const receive = () => {
    const qty = Number(quantity);
    if (!materialId || !internalLot.trim() || !Number.isFinite(qty) || qty <= 0) return notify("Selecciona una materia prima, indica lote interno y una cantidad válida.", "warning");
    const lot: RawMaterialLot = { id: makeId("rmlot"), materialId, supplierLot: supplierLot.trim() || undefined, internalLot: internalLot.trim(), quantity: qty, unit, expiry: expiry || undefined, receivedAt: new Date().toISOString(), location: location.trim() || "Almacén MP", status };
    setData(current => ({ ...current, rawMaterialLots: [lot, ...current.rawMaterialLots], locations: [...new Set([...current.locations, lot.location])] }));
    setQuantity(""); setSupplierLot(""); setInternalLot(""); setExpiry("");
    notify(`Recepción ${lot.internalLot} registrada en ${lot.location}.`);
    setTab("stock");
  };
  const addMaterial = () => {
    if (!materialCode.trim() || !materialName.trim()) return notify("Código y nombre son obligatorios.", "warning");
    if (data.rawMaterials.some(m => m.code.toLowerCase() === materialCode.trim().toLowerCase())) return notify("Ese código de materia prima ya existe.", "warning");
    const material: RawMaterial = { id: makeId("rm"), code: materialCode.trim().toUpperCase(), name: materialName.trim(), family: materialFamily.trim() || "General", unit: materialUnit, active: true };
    setData(current => ({ ...current, rawMaterials: [material, ...current.rawMaterials] }));
    setMaterialCode(""); setMaterialName(""); setMaterialFamily("");
    notify(`${material.code} · ${material.name} creado.`);
  };
  const setLotStatus = (lotId: string, next: RawMaterialLot["status"]) => setData(current => ({ ...current, rawMaterialLots: current.rawMaterialLots.map(l => l.id === lotId ? { ...l, status: next } : l) }));

  return <>
    <PageTitle eyebrow="ALMACÉN · MATERIAS PRIMAS" title="Inventario" description="Recepción, lotes, cuarentenas y salida por FEFO para materias primas alimentarias." actions={<button className="button primary" onClick={() => setTab("recepcion")}><Plus size={16}/> Nueva recepción</button>} />
    <div className="metric-grid"><Metric label="Stock MP" value={`${num(available,1)} u.`} detail="Materias primas liberadas" icon={Warehouse} accent="green"/><Metric label="Cuarentena" value={num(quarantine)} detail="Lotes pendientes de liberar" icon={AlertCircle} accent="coral"/><Metric label="Caducidad ≤ 30 días" value={num(expiring)} detail="Lotes que requieren atención" icon={Clock3} accent="orange"/><Metric label="Referencias MP" value={num(data.rawMaterials.length)} detail="Materias primas registradas" icon={PackageCheck} accent="blue"/></div>
    <div className="inventory-tabs"><button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}><ClipboardList size={16}/> Stock FEFO</button><button className={tab === "recepcion" ? "active" : ""} onClick={() => setTab("recepcion")}><Download size={16}/> Recepción</button><button className={tab === "materiales" ? "active" : ""} onClick={() => setTab("materiales")}><Factory size={16}/> Materias primas</button></div>
    {tab === "stock" && <section className="panel"><div className="panel-heading"><div><div className="eyebrow">FEFO · FIRST EXPIRED, FIRST OUT</div><h2>Stock por lote</h2></div><input className="inventory-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar materia, lote o ubicación…"/></div>{lots.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Materia prima</th><th>Lote interno</th><th>Lote proveedor</th><th>Caducidad</th><th>Cantidad</th><th>Ubicación</th><th>Estado</th><th></th></tr></thead><tbody>{lots.map(l => { const expiryDays = l.expiry ? Math.ceil((new Date(`${l.expiry}T12:00:00`).getTime()-new Date(`${todayIso}T12:00:00`).getTime())/86400000) : 9999; const urgent = expiryDays <= 30; return <tr key={l.id}><td><strong>{materialNameOf(l.materialId)}</strong><small className="cell-sub">{data.rawMaterials.find(m=>m.id===l.materialId)?.code}</small></td><td className="mono">{l.internalLot}</td><td>{l.supplierLot ?? "—"}</td><td><span className={urgent ? "delivery-date due-now" : "delivery-date"}>{l.expiry ? dateText(l.expiry) : "Sin fecha"}</span>{urgent && <small className="cell-sub">{expiryDays < 0 ? "CADUCADO" : `${expiryDays} días`}</small>}</td><td><strong>{num(l.quantity,1)} {l.unit}</strong></td><td>{l.location}</td><td><Status label={l.status === "LIBERADO" ? "Liberado" : l.status === "CUARENTENA" ? "Cuarentena" : l.status === "BLOQUEADO" ? "Bloqueado" : "Agotado"} tone={l.status === "LIBERADO" ? "green" : l.status === "CUARENTENA" ? "orange" : "red"}/></td><td>{l.status === "CUARENTENA" && <button className="button small secondary" onClick={() => { setLotStatus(l.id,"LIBERADO"); notify(`${l.internalLot} liberado para uso.`); }}>Liberar</button>}{l.status === "LIBERADO" && <button className="button small secondary danger-text" onClick={() => setLotStatus(l.id,"BLOQUEADO")}>Bloquear</button>}</td></tr>})}</tbody></table></div> : <EmptyState icon={Warehouse} title="Sin stock de materias primas" detail="Registra una recepción para empezar la trazabilidad desde proveedor."/>}</section>}
    {tab === "recepcion" && <section className="panel inventory-form"><div className="panel-heading"><div><div className="eyebrow">ENTRADA · TRAZABILIDAD</div><h2>Registrar recepción</h2><p>Un lote nuevo entra en cuarentena por defecto hasta su liberación.</p></div></div><div className="form-grid"><div><label>Materia prima</label><select value={materialId} onChange={e => { setMaterialId(e.target.value); const m=data.rawMaterials.find(x=>x.id===e.target.value); if(m) setUnit(m.unit); }}><option value="">Seleccionar…</option>{data.rawMaterials.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></div><div><label>Lote interno *</label><input value={internalLot} onChange={e=>setInternalLot(e.target.value)} placeholder="MP-261006-001"/></div><div><label>Lote proveedor</label><input value={supplierLot} onChange={e=>setSupplierLot(e.target.value)} placeholder="Lote indicado por proveedor"/></div><div><label>Cantidad *</label><input type="number" min="0" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="0"/></div><div><label>Unidad</label><select value={unit} onChange={e=>setUnit(e.target.value as RawMaterial["unit"])}><option value="kg">kg</option><option value="l">litros</option><option value="ud">unidades</option></select></div><div><label>Caducidad</label><input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}/></div><div><label>Ubicación</label><select value={location} onChange={e=>setLocation(e.target.value)}>{data.locations.map(x=><option key={x}>{x}</option>)}</select></div><div><label>Estado inicial</label><select value={status} onChange={e=>setStatus(e.target.value as RawMaterialLot["status"])}><option value="CUARENTENA">Cuarentena</option><option value="LIBERADO">Liberado</option><option value="BLOQUEADO">Bloqueado</option></select></div></div><div className="form-actions"><button className="button primary" onClick={receive}><Check size={16}/> Registrar recepción</button></div></section>}
    {tab === "materiales" && <section className="panel inventory-form"><div className="panel-heading"><div><div className="eyebrow">MAESTRO</div><h2>Materias primas</h2><p>Base para conectar después con recetas y órdenes de fabricación.</p></div></div><div className="form-grid"><div><label>Código *</label><input value={materialCode} onChange={e=>setMaterialCode(e.target.value)} placeholder="MP-TOM-001"/></div><div><label>Nombre *</label><input value={materialName} onChange={e=>setMaterialName(e.target.value)} placeholder="Tomate triturado"/></div><div><label>Familia</label><input value={materialFamily} onChange={e=>setMaterialFamily(e.target.value)} placeholder="Vegetales"/></div><div><label>Unidad</label><select value={materialUnit} onChange={e=>setMaterialUnit(e.target.value as RawMaterial["unit"])}><option value="kg">kg</option><option value="l">litros</option><option value="ud">unidades</option></select></div></div><div className="form-actions"><button className="button primary" onClick={addMaterial}><Plus size={16}/> Crear materia prima</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Materia prima</th><th>Familia</th><th>Unidad</th><th>Lotes</th></tr></thead><tbody>{data.rawMaterials.map(m=><tr key={m.id}><td className="mono">{m.code}</td><td><strong>{m.name}</strong></td><td>{m.family}</td><td>{m.unit}</td><td>{data.rawMaterialLots.filter(l=>l.materialId===m.id).length}</td></tr>)}</tbody></table></div></section>}
  </>;
}


function TraceabilityPage({ data }: { data: AppData }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const rawHits = data.rawMaterialLots.filter(lot => [lot.internalLot, lot.supplierLot, lot.id].some(v => v?.toLowerCase().includes(q)));
  const prodHits = data.productionOrders.filter(order => [order.lot, order.code, order.id].some(v => v?.toLowerCase().includes(q)));
  const palletHits = data.pallets.filter(p => [p.code, p.id, p.sscc, ...p.lines.map(l => l.lot)].some(v => v?.toLowerCase().includes(q)));
  const loadHits = data.loads.filter(load => [load.code, load.id, load.sscc].some(v => v?.toLowerCase().includes(q)));
  const hasQuery = q.length > 0;

  const selectedProd = data.productionOrders.find(o => o.id === selected || o.lot.toLowerCase() === selected?.toLowerCase());
  const selectedRaw = data.rawMaterialLots.find(l => l.id === selected || l.internalLot.toLowerCase() === selected?.toLowerCase() || l.supplierLot?.toLowerCase() === selected?.toLowerCase());
  const selectedPallet = data.pallets.find(p => p.id === selected || p.code.toLowerCase() === selected?.toLowerCase() || p.sscc === selected);
  const selectedLoad = data.loads.find(l => l.id === selected || l.code.toLowerCase() === selected?.toLowerCase() || l.sscc === selected);

  const palletsForProd = selectedProd ? data.pallets.filter(p => p.lines.some(l => l.lot === selectedProd.lot)) : [];
  const loadsForPallets = palletsForProd.filter(p => data.loads.some(l => l.palletIds.includes(p.id)));
  const consumptions = selectedProd ? selectedProd.consumptions.map(c => ({ c, lot: data.rawMaterialLots.find(l => l.id === c.lotId), material: data.rawMaterials.find(m => m.id === c.materialId) })) : [];
  const rawProdOrders = selectedRaw ? data.productionOrders.filter(o => o.consumptions.some(c => c.lotId === selectedRaw.id)) : [];
  const rawPallets = selectedRaw ? data.pallets.filter(p => rawProdOrders.some(o => p.lines.some(l => l.lot === o.lot))) : [];
  const rawLoads = rawPallets.filter(p => data.loads.some(l => l.palletIds.includes(p.id)));

  const resultCount = rawHits.length + prodHits.length + palletHits.length + loadHits.length;
  const totalTracePallets = selectedProd ? palletsForProd.length : selectedRaw ? rawPallets.length : selectedPallet ? 1 : selectedLoad ? selectedLoad.palletIds.length : 0;
  const totalTraceLoads = selectedProd ? loadsForPallets.length : selectedRaw ? rawLoads.length : selectedPallet ? data.loads.filter(l=>l.palletIds.includes(selectedPallet.id)).length : selectedLoad ? 1 : 0;

  return <>
    <PageTitle eyebrow="FOOD · TRAZABILIDAD" title="Trazabilidad total" description="Consulta hacia atrás y hacia delante desde un lote, palet, SSCC o expedición." actions={<div className="trace-live-badge"><ShieldCheck size={15}/> Genealogía de lotes activa</div>} />
    <div className="trace-kpis">
      <Metric label="Lotes MP" value={num(data.rawMaterialLots.length)} detail="Con origen de proveedor" icon={PackageCheck} accent="green"/>
      <Metric label="Fabricaciones" value={num(data.productionOrders.length)} detail="Órdenes y lotes internos" icon={Factory} accent="blue"/>
      <Metric label="Palets" value={num(data.pallets.length)} detail="Unidades logísticas" icon={Package} accent="orange"/>
      <Metric label="Expediciones" value={num(data.loads.length)} detail="Cargas registradas" icon={Truck} accent="coral"/>
    </div>

    <section className="panel trace-engine">
      <div className="panel-heading"><div><div className="eyebrow">BUSCADOR DE GENEALOGÍA</div><h2>Buscar cualquier identificador</h2><p>Ejemplos: lote MP, lote de fabricación, palet, SSCC o número de carga.</p></div></div>
      <div className="trace-engine-search"><Search size={19}/><input autoFocus value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} onKeyDown={e => { if (e.key === "Enter" && resultCount) { const first = rawHits[0]?.internalLot || prodHits[0]?.lot || palletHits[0]?.code || loadHits[0]?.code; if (first) setSelected(first); } }} placeholder="Ej. MP-261006-001 · SB-261006-001 · SSCC…"/><span>{hasQuery ? `${resultCount} coincidencias` : "Listo para buscar"}</span></div>
      {hasQuery && <div className="trace-result-grid">
        {rawHits.map(l => <button className="trace-hit" key={`r-${l.id}`} onClick={() => setSelected(l.internalLot)}><span className="trace-hit-type">MATERIA PRIMA</span><strong>{l.internalLot}</strong><small>{data.rawMaterials.find(m=>m.id===l.materialId)?.name ?? l.materialId} · {l.supplierLot ?? "sin lote proveedor"}</small></button>)}
        {prodHits.map(o => <button className="trace-hit" key={`p-${o.id}`} onClick={() => setSelected(o.lot)}><span className="trace-hit-type">FABRICACIÓN</span><strong>{o.lot}</strong><small>{o.code} · {o.status.replaceAll("_", " ")} · {kg(o.actualKg ?? o.plannedKg)}</small></button>)}
        {palletHits.map(p => <button className="trace-hit" key={`pa-${p.id}`} onClick={() => setSelected(p.code)}><span className="trace-hit-type">PALET / SSCC</span><strong>{p.code}</strong><small>{p.sscc || "Sin SSCC"} · {p.lines.length} líneas · {p.status}</small></button>)}
        {loadHits.map(l => <button className="trace-hit" key={`l-${l.id}`} onClick={() => setSelected(l.code)}><span className="trace-hit-type">EXPEDICIÓN</span><strong>{l.code}</strong><small>{dateTimeText(l.departureAt)} · {l.palletIds.length} palets</small></button>)}
        {!resultCount && <EmptyState icon={Search} title="Sin coincidencias" detail="Prueba con el lote interno, lote proveedor, lote de fabricación, código de palet, SSCC o carga."/>}
      </div>}
    </section>

    {selectedProd && <section className="trace-flow">
      <div className="trace-flow-head"><div><div className="eyebrow">TRAZABILIDAD BIDIRECCIONAL</div><h2>{selectedProd.lot}</h2><p>{selectedProd.code} · {kg(selectedProd.actualKg ?? selectedProd.plannedKg)} · {selectedProd.status.replaceAll("_", " ")}</p></div><div className="trace-flow-stats"><b>{consumptions.length}</b><span>MP utilizadas</span><b>{totalTracePallets}</b><span>palets</span><b>{totalTraceLoads}</b><span>cargas</span></div></div>
      <div className="trace-chain"><article><span>01 · ORIGEN</span><h3>Materias primas</h3>{consumptions.length ? consumptions.map(({c, lot, material}) => <div className="trace-chain-row" key={c.id}><strong>{material?.name ?? c.materialId}</strong><span>{lot?.internalLot ?? c.lotId}</span><b>{num(c.actual || c.planned,1)} {c.unit}</b></div>) : <p>Sin consumos registrados.</p>}</article>
      <div className="trace-arrow">→</div><article><span>02 · FABRICACIÓN</span><h3>Proceso</h3><div className="trace-process"><div><b>Receta</b><span>{selectedProd.recipeVersion}</span></div><div><b>Línea</b><span>{selectedProd.line || "—"}</span></div><div><b>Tanque</b><span>{selectedProd.tank || "—"}</span></div><div><b>Rendimiento</b><span>{selectedProd.actualKg && selectedProd.plannedKg ? `${num(selectedProd.actualKg / selectedProd.plannedKg * 100,1)} %` : "Pendiente"}</span></div></div></article>
      <div className="trace-arrow">→</div><article><span>03 · DISTRIBUCIÓN</span><h3>Palets y expediciones</h3>{palletsForProd.length ? palletsForProd.map(p => <div className="trace-chain-row" key={p.id}><strong>{p.code}</strong><span>{p.location}</span><b>{p.status}</b></div>) : <p>El lote todavía no está asociado a palets.</p>}{loadsForPallets.length > 0 && <div className="trace-loads">{loadsForPallets.map(p => data.loads.filter(l=>l.palletIds.includes(p.id)).map(l => <span key={`${p.id}-${l.id}`}>{l.code}</span>))}</div>}</article></div>
    </section>}

    {selectedPallet && !selectedProd && !selectedRaw && <section className="trace-flow"><div className="trace-flow-head"><div><div className="eyebrow">TRAZABILIDAD DE UNIDAD LOGÍSTICA</div><h2>{selectedPallet.code}</h2><p>{selectedPallet.sscc || "Sin SSCC"} · {selectedPallet.location} · {selectedPallet.status}</p></div><div className="trace-flow-stats"><b>{selectedPallet.lines.length}</b><span>líneas</span><b>{totalTraceLoads}</b><span>cargas</span><b>{sumBoxes(selectedPallet.lines)}</b><span>cajas</span></div></div><div className="trace-chain"><article><span>01 · CONTENIDO</span><h3>Artículos y lotes</h3>{selectedPallet.lines.map(line => <div className="trace-chain-row" key={line.id}><strong>{data.articles.find(a=>a.id===line.articleId)?.name ?? line.articleId}</strong><span>{line.lot}</span><b>{num(line.boxes)} cajas</b></div>)}</article><div className="trace-arrow">→</div><article><span>02 · PEDIDO</span><h3>Origen comercial</h3>{selectedPallet.orderId ? <div className="trace-process"><div><b>Pedido</b><span>{selectedPallet.orderId}</span></div><div><b>Cliente</b><span>{customerName(data, data.orders.find(o=>o.id===selectedPallet.orderId)?.customerId ?? selectedPallet.customerId)}</span></div></div> : <p>Palet de stock sin pedido asignado.</p>}</article><div className="trace-arrow">→</div><article><span>03 · EXPEDICIÓN</span><h3>Cargas</h3>{data.loads.filter(l=>l.palletIds.includes(selectedPallet.id)).map(l=><div className="trace-chain-row" key={l.id}><strong>{l.code}</strong><span>{dateTimeText(l.departureAt)}</span><b>{l.status}</b></div>)}{!data.loads.some(l=>l.palletIds.includes(selectedPallet.id)) && <p>Aún no expedido.</p>}</article></div></section>}

    {selectedLoad && !selectedProd && !selectedRaw && !selectedPallet && <section className="trace-flow"><div className="trace-flow-head"><div><div className="eyebrow">TRAZABILIDAD DE EXPEDICIÓN</div><h2>{selectedLoad.code}</h2><p>{dateTimeText(selectedLoad.departureAt)} · {selectedLoad.palletIds.length} palets · {selectedLoad.status}</p></div><div className="trace-flow-stats"><b>{selectedLoad.palletIds.length}</b><span>palets</span><b>{new Set(selectedLoad.palletIds.map(id=>data.pallets.find(p=>p.id===id)?.orderId).filter(Boolean)).size}</b><span>pedidos</span><b>{new Set(selectedLoad.palletIds.map(id=>data.pallets.find(p=>p.id===id)?.customerId ?? data.orders.find(o=>o.id===data.pallets.find(p=>p.id===id)?.orderId)?.customerId).filter(Boolean)).size}</b><span>clientes</span></div></div><div className="trace-chain"><article><span>01 · ORIGEN</span><h3>Pedidos</h3>{selectedLoad.palletIds.map(id=>data.pallets.find(p=>p.id===id)).filter((p): p is Pallet=>Boolean(p)).map(p=><div className="trace-chain-row" key={p.id}><strong>{p.orderId || "Stock"}</strong><span>{p.code}</span><b>{p.status}</b></div>)}</article><div className="trace-arrow">→</div><article><span>02 · TRANSPORTE</span><h3>Salida</h3><div className="trace-process"><div><b>Transportista</b><span>{data.carriers.find(c=>c.id===selectedLoad.carrierId)?.name || "—"}</span></div><div><b>Matrícula</b><span>{data.vehicles.find(v=>v.id===selectedLoad.vehicleId)?.plate || "—"}</span></div><div><b>Muelle</b><span>{selectedLoad.dock || "—"}</span></div><div><b>Precinto</b><span>{selectedLoad.seal || "—"}</span></div></div></article><div className="trace-arrow">→</div><article><span>03 · DESTINO</span><h3>Clientes</h3>{[...new Set(selectedLoad.palletIds.map(id=>data.pallets.find(p=>p.id===id)?.customerId ?? data.orders.find(o=>o.id===data.pallets.find(p=>p.id===id)?.orderId)?.customerId).filter((id): id is string=>Boolean(id)))].map(id=><div className="trace-chain-row" key={id}><strong>{customerName(data,id)}</strong><span>Cliente afectado</span><b>DESTINO</b></div>)}{!selectedLoad.customerId && !selectedLoad.palletIds.length && <p>Sin destino identificado.</p>}</article></div></section>}

    {selectedRaw && !selectedProd && <section className="trace-flow"><div className="trace-flow-head"><div><div className="eyebrow">TRAZABILIDAD HACIA DELANTE</div><h2>{selectedRaw.internalLot}</h2><p>{data.rawMaterials.find(m=>m.id===selectedRaw.materialId)?.name ?? selectedRaw.materialId} · proveedor {selectedRaw.supplierLot || "—"} · {num(selectedRaw.quantity,1)} {selectedRaw.unit}</p></div><div className="trace-flow-stats"><b>{rawProdOrders.length}</b><span>fabricaciones</span><b>{totalTracePallets}</b><span>palets</span><b>{totalTraceLoads}</b><span>cargas</span></div></div><div className="trace-chain"><article><span>01 · PROVEEDOR</span><h3>Lote recibido</h3><div className="trace-process"><div><b>Lote proveedor</b><span>{selectedRaw.supplierLot || "—"}</span></div><div><b>Recepción</b><span>{dateTimeText(selectedRaw.receivedAt)}</span></div><div><b>Estado</b><span>{selectedRaw.status}</span></div><div><b>Ubicación</b><span>{selectedRaw.location}</span></div></div></article><div className="trace-arrow">→</div><article><span>02 · TRANSFORMACIÓN</span><h3>Órdenes afectadas</h3>{rawProdOrders.length ? rawProdOrders.map(o=><div className="trace-chain-row" key={o.id}><strong>{o.lot}</strong><span>{o.code}</span><b>{kg(o.actualKg ?? o.plannedKg)}</b></div>) : <p>Este lote aún no se ha consumido en fabricación.</p>}</article><div className="trace-arrow">→</div><article><span>03 · DESTINO</span><h3>Palets / cargas</h3>{rawPallets.length ? rawPallets.map(p=><div className="trace-chain-row" key={p.id}><strong>{p.code}</strong><span>{p.location}</span><b>{p.status}</b></div>) : <p>No hay producto terminado asociado.</p>}</article></div></section>}

    {!selected && !hasQuery && <section className="trace-guide"><div><ShieldCheck size={22}/><div><strong>¿Qué puedes investigar?</strong><p>Una incidencia en una materia prima, un lote fabricado, un palet o una expedición. El sistema conecta automáticamente las relaciones que ya existen en tus datos.</p></div></div><div className="trace-guide-grid"><span>Proveedor → lote MP</span><span>Lote MP → fabricación</span><span>Fabricación → palets</span><span>Palets → expediciones</span><span>Expedición → cliente</span><span>Recall → alcance afectado</span></div></section>}
  </>;
}

function PlanningPage({ data, setData, notify }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void }) {
  const todayDate = localIso();
  const [date, setDate] = useState(todayDate);
  const pendingOrders = data.orders.filter(o => o.deliveryDate >= date && orderStatus(o, data).label !== "Expedido").sort((a,b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const availableBoxes = (articleId: string) => data.pallets.filter(p => p.status === "DISPONIBLE").reduce((sum,p) => sum + p.lines.filter(l => l.articleId === articleId).reduce((x,l)=>x+l.boxes,0),0);
  const plannedForArticle = (articleId: string) => data.productionOrders.filter(o => ["PLANIFICADA","EN_CURSO"].includes(o.status)).reduce((sum,o)=>{ const r=data.recipes.find(x=>x.id===o.recipeId); return sum+(r?.articleId===articleId?o.plannedKg:0); },0);
  const reservedForMaterial = (materialId: string) => data.productionOrders.filter(o => ["PLANIFICADA","EN_CURSO"].includes(o.status)).reduce((sum,o)=>sum+(o.reservations??[]).filter(r=>r.materialId===materialId).reduce((x,r)=>x+r.quantity,0),0);
  const availableMaterial=(materialId:string)=>Math.max(0,data.rawMaterialLots.filter(l=>l.materialId===materialId&&l.status==="LIBERADO"&&(!l.expiry||l.expiry>=todayDate)).reduce((s,l)=>s+l.quantity,0)-reservedForMaterial(materialId));
  const plans = data.articles.filter(a=>a.active).map(article=>{
    const demand = pendingOrders.reduce((sum,o)=>sum+(o.lines.find(l=>l.articleId===article.id)?.boxes??0),0);
    const prepared = pendingOrders.reduce((sum,o)=>sum+Math.min(o.lines.find(l=>l.articleId===article.id)?.boxes??0, boxesForArticle(data.pallets,article.id,o.id)),0);
    const stock = availableBoxes(article.id);
    const pending = Math.max(0,demand-prepared);
    const needBoxes = Math.max(0,pending-stock);
    const kg = needBoxes*article.netKgPerBox;
    const recipe = data.recipes.find(r=>r.articleId===article.id && r.active);
    const plannedKg = plannedForArticle(article.id);
    const netKgToMake = Math.max(0,kg-plannedKg);
    return {article,demand,prepared,stock,pending,needBoxes,kg,recipe,plannedKg,netKgToMake};
  }).filter(x=>x.demand>0 || x.needBoxes>0 || x.plannedKg>0);
  const blocking = plans.filter(x=>x.needBoxes>0 && !x.recipe);
  const materialNeeds = plans.filter(x=>x.netKgToMake>0 && x.recipe).flatMap(x=>x.recipe!.ingredients.map(i=>({article:x.article, material:data.rawMaterials.find(m=>m.id===i.materialId), need:i.quantity/x.recipe!.outputKg*x.netKgToMake, unit:i.unit}))).reduce((acc,item)=>{ if(!item.material)return acc; const key=item.material.id; const existing=acc.get(key); acc.set(key,{...item,material:item.material,need:(existing?.need??0)+item.need}); return acc; },new Map<string,{article:Article;material:RawMaterial;need:number;unit:RawMaterial["unit"]}>());
  const shortages=[...materialNeeds.values()].map(x=>({ ...x, available: availableMaterial(x.material.id), deficit: Math.max(0,x.need-availableMaterial(x.material.id)) })).filter(x=>x.deficit>0);
  const activeOrders=data.productionOrders.filter(o=>["PLANIFICADA","EN_CURSO"].includes(o.status)).sort((a,b)=>a.plannedAt.localeCompare(b.plannedAt));
  const allergenKey=(o:ProductionOrder)=>{const r=data.recipes.find(x=>x.id===o.recipeId);return r?.ingredients.flatMap(i=>data.rawMaterials.find(m=>m.id===i.materialId)?.allergens??[]).filter(Boolean).sort().join("|")||"SIN_ALERGENOS";};
  const sequence=[...activeOrders].sort((a,b)=>{const aa=allergenKey(a),bb=allergenKey(b); const same=aa===bb?0:1; return same || a.plannedAt.localeCompare(b.plannedAt);});
  const resourceLoad=(resourceName:string)=>data.productionOrders.filter(o=>(o.line===resourceName||o.tank===resourceName)&&["PLANIFICADA","EN_CURSO"].includes(o.status)).reduce((s,o)=>s+o.plannedKg,0);
  const createPlanOrder=(plan:typeof plans[number])=>{
    if(!plan.recipe || plan.netKgToMake<=0)return;
    const resources=data.plantResources.filter(r=>r.active&&r.type==="LINEA").sort((a,b)=>resourceLoad(a.name)-resourceLoad(b.name));
    const line=resources[0]?.name??"Línea 1";
    const tank=data.plantResources.find(r=>r.active&&r.type==="TANQUE"&&r.capacityKg>=plan.netKgToMake)?.name ?? data.plantResources.find(r=>r.active&&r.type==="TANQUE")?.name ?? "Tanque 01";
    const baseLot=`OF-${date.replaceAll('-','')}-${plan.article.sku}`;let lot=baseLot;for(let n=2;data.productionOrders.some(o=>o.lot===lot);n++)lot=`${baseLot}-${n}`;
    const orderId=makeId("of");
    const reservations: ProductionReservation[]=[];
    const purchaseRequirements:any[]=[];
    for(const ing of plan.recipe.ingredients){
      const required=ing.quantity/plan.recipe.outputKg*plan.netKgToMake;
      let remaining=required;
      const lots=data.rawMaterialLots.filter(l=>l.materialId===ing.materialId&&l.status==="LIBERADO"&&l.quantity>0&&(!l.expiry||l.expiry>=todayDate)).sort((a,b)=>(a.expiry??"9999-12-31").localeCompare(b.expiry??"9999-12-31"));
      for(const l of lots){ if(remaining<=0) break; const free=Math.max(0,l.quantity-(data.productionOrders.filter(o=>["PLANIFICADA","EN_CURSO"].includes(o.status)).reduce((sum,o)=>sum+(o.reservations??[]).filter(r=>r.lotId===l.id).reduce((x,r)=>x+r.quantity,0),0))); const take=Math.min(remaining,free); if(take>0){reservations.push({id:makeId("res"),materialId:ing.materialId,lotId:l.id,quantity:take,unit:ing.unit,reservedAt:new Date().toISOString()}); remaining-=take;}}
      if(remaining>0) purchaseRequirements.push({id:makeId("comp"),materialId:ing.materialId,quantity:remaining,unit:ing.unit,requiredDate:date,productionOrderIds:[orderId],supplierId:data.rawMaterials.find(m=>m.id===ing.materialId)?.supplierId,status:"PENDIENTE",createdAt:new Date().toISOString(),notes:`Déficit MRP para ${lot}.`});
    }
    const order:ProductionOrder={id:orderId,code:nextDocument("OF",data.productionOrders.map(x=>x.code)),recipeId:plan.recipe.id,recipeVersion:plan.recipe.version,plannedKg:Math.ceil(plan.netKgToMake),status:"PLANIFICADA",line,tank,lot,plannedAt:`${date}T08:00:00`,consumptions:[],reservations};
    setData(d=>({...d,productionOrders:[...d.productionOrders,order],purchaseRequirements:[...d.purchaseRequirements,...purchaseRequirements]}));
    notify(purchaseRequirements.length?`${order.code} creada · ${num(order.plannedKg,0)} kg · ${purchaseRequirements.length} necesidad(es) de compra.`:`${order.code} creada · ${num(order.plannedKg,0)} kg · materias primas reservadas por FEFO.`);
  };
  const createPurchase=(reqId:string)=>setData(d=>({...d,purchaseRequirements:d.purchaseRequirements.map(r=>r.id===reqId?{...r,status:"SOLICITADA",requestedAt:new Date().toISOString()}:r)}));
  const receivePurchase=(reqId:string)=>{
    const req=data.purchaseRequirements.find(r=>r.id===reqId); if(!req || req.status!=="SOLICITADA") return;
    const material=data.rawMaterials.find(m=>m.id===req.materialId); if(!material) return notify("No se encuentra la materia prima de la compra.","error");
    const supplierLot=window.prompt(`Lote de proveedor para ${material.name}`,""); if(supplierLot===null||!supplierLot.trim()) return;
    const internalLot=window.prompt("Lote interno",`MP-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(data.rawMaterialLots.length+1).padStart(3,"0")}`); if(internalLot===null||!internalLot.trim()) return;
    const expiry=window.prompt("Caducidad (AAAA-MM-DD), opcional",""); if(expiry===null) return;
    const lotId=makeId("lot"); const now=new Date().toISOString();
    const lot:RawMaterialLot={id:lotId,materialId:req.materialId,supplierLot:supplierLot.trim(),internalLot:internalLot.trim(),quantity:req.quantity,unit:req.unit,expiry:expiry.trim()||undefined,receivedAt:now,supplierId:req.supplierId,location:data.locations[0]??"Almacén MP",status:"CUARENTENA",notes:`Recepción vinculada a necesidad ${req.id}.`};
    setData(d=>({...d,rawMaterialLots:[lot,...d.rawMaterialLots],purchaseRequirements:d.purchaseRequirements.map(r=>r.id===reqId?{...r,status:"RECIBIDA",receivedAt:now,receivedLotId:lotId}:r),audit:[{id:makeId("audit"),at:now,action:"RECEPCION_COMPRA",entity:"rawMaterialLot",entityId:lotId,summary:`Recepción ${lot.internalLot}: ${num(req.quantity,2)} ${req.unit} de ${material.name}. Queda en cuarentena.`},...d.audit]}));
    notify(`Recepción registrada: ${lot.internalLot}. Queda en CUARENTENA hasta calidad.`);
  };
  const activePurchases=data.purchaseRequirements.filter(r=>r.status!=="CANCELADA");
  return <><PageTitle eyebrow="PLANIFICACIÓN · MRP FOOD" title="Planificación de producción" description="Pedidos → necesidades → reservas FEFO → compras → secuenciación → órdenes de fabricación." actions={<label className="planning-date"><CalendarClock size={16}/><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}/>
    <div className="production-kpis planning-kpis"><Metric label="Pedidos en riesgo" value={blocking.length+shortages.length} detail="Receta o materiales bloqueantes" icon={AlertTriangle} accent={blocking.length+shortages.length?"red":"green"}/><Metric label="A fabricar" value={`${num(plans.reduce((s,x)=>s+x.netKgToMake,0),0)} kg`} detail="Necesidad neta" icon={Factory} accent="blue"/><Metric label="Compras pendientes" value={activePurchases.filter(r=>r.status==="PENDIENTE").length} detail="Necesidades MRP" icon={ShoppingCart} accent="orange"/><Metric label="Órdenes activas" value={activeOrders.length} detail="Planificadas + en curso" icon={Layers3} accent="purple"/></div>
    <section className="panel planning-hero"><div><div className="eyebrow">DECISIÓN DEL PLANIFICADOR</div><h2>Qué fabricar y en qué orden</h2><p>El plan comprueba demanda, stock, reservas, FEFO, materias primas, capacidad y alérgenos antes de crear una orden.</p></div><div className="planning-flow"><span>Pedidos</span><b>→</b><span>Stock</span><b>→</b><span>MRP</span><b>→</b><span>Reservas</span><b>→</b><span>OF</span></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">MPS · DEMANDA</div><h2>Propuesta de fabricación</h2></div><span className="muted">Fecha objetivo: {dateText(date)}</span></div><div className="data-table-wrap"><table className="data-table planning-table"><thead><tr><th>Producto</th><th>Demanda</th><th>Preparado</th><th>Stock libre</th><th>Necesidad</th><th>Fabricación</th><th>Estado</th><th></th></tr></thead><tbody>{plans.map(x=><tr key={x.article.id}><td><strong>{x.article.name}</strong><small className="cell-sub">{x.article.sku} · {x.article.netKgPerBox} kg/caja</small></td><td>{x.demand} cajas</td><td>{x.prepared} cajas</td><td>{x.stock} cajas</td><td><strong>{x.needBoxes}</strong> cajas<br/><small>{num(x.kg,0)} kg</small></td><td>{x.netKgToMake>0?`${num(x.netKgToMake,0)} kg`:`${num(x.plannedKg,0)} kg plan.`}</td><td>{x.needBoxes===0?<Status label="Cubierto" tone="green"/>:!x.recipe?<Status label="Sin receta" tone="red"/>:x.netKgToMake<=0?<Status label="Planificado" tone="blue"/>:<Status label="Fabricar" tone="orange"/>}</td><td>{x.netKgToMake>0&&x.recipe?<button className="button small primary" onClick={()=>createPlanOrder(x)}><Plus size={14}/> Crear OF</button>:null}</td></tr>)}{!plans.length&&<tr><td colSpan={8} className="muted">No hay demanda pendiente para la fecha seleccionada.</td></tr>}</tbody></table></div></section>
    <section className="planning-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">MRP · MATERIAS PRIMAS</div><h2>Necesidades de compra</h2></div><ShoppingCart size={18} className="muted-icon"/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Materia prima</th><th>Necesaria</th><th>Disponible</th><th>Déficit</th><th>Estado</th></tr></thead><tbody>{[...materialNeeds.values()].map(x=>{const avail=availableMaterial(x.material.id);const deficit=Math.max(0,x.need-avail);return <tr key={x.material.id}><td><strong>{x.material.name}</strong><small className="cell-sub">{x.material.code}</small></td><td>{num(x.need,1)} {x.unit}</td><td>{num(avail,1)} {x.unit}</td><td>{deficit>0?num(deficit,1):"—"}</td><td>{deficit>0?<Status label="Comprar" tone="red"/>:<Status label="Reservable" tone="green"/>}</td></tr>})}{!materialNeeds.size&&<tr><td colSpan={5} className="muted">No hay necesidades de materias primas.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">SECUENCIACIÓN</div><h2>Orden recomendado</h2></div><Gauge size={18} className="muted-icon"/></div><div className="quality-trace">{sequence.map((o,i)=><div key={o.id}><span><strong>{i+1}. {o.code}</strong> · {data.recipes.find(r=>r.id===o.recipeId)?.name??"Producción"}</span><span>{o.line??"Sin línea"} · {o.tank??"Sin tanque"}</span><b>{allergenKey(o)==="SIN_ALERGENOS"?"Sin alérgenos":allergenKey(o).replaceAll("|",", ")}</b></div>)}{!sequence.length&&<p className="muted">No hay órdenes activas.</p>}</div><div className="quality-note"><strong>Regla aplicada</strong><span>Se agrupan primero órdenes con el mismo perfil de alérgenos y después se respeta la fecha planificada, reduciendo cambios y limpiezas.</span></div></section></section>
    <section className="planning-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">COMPRAS · APROVISIONAMIENTO</div><h2>Necesidades generadas</h2></div><ShoppingCart size={18} className="muted-icon"/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Materia prima</th><th>Cantidad</th><th>Fecha</th><th>OF</th><th>Estado</th><th></th></tr></thead><tbody>{activePurchases.map(r=>{const m=data.rawMaterials.find(x=>x.id===r.materialId);return <tr key={r.id}><td><strong>{m?.name??r.materialId}</strong><small className="cell-sub">{m?.code??""} {r.supplierId?`· Prov. ${r.supplierId}`:""}</small></td><td>{num(r.quantity,1)} {r.unit}</td><td>{dateText(r.requiredDate)}</td><td>{r.productionOrderIds.join(", ")}</td><td><Status label={r.status} tone={r.status==="PENDIENTE"?"red":r.status==="SOLICITADA"?"orange":"green"}/></td><td>{r.status==="PENDIENTE"&&<button className="button small secondary" onClick={()=>createPurchase(r.id)}>Solicitar</button>}{r.status==="SOLICITADA"&&<button className="button small secondary" onClick={()=>receivePurchase(r.id)}>Registrar recepción</button>}{r.status==="RECIBIDA"&&<Status label="En cuarentena" tone="orange"/>}</td></tr>})}{!activePurchases.length&&<tr><td colSpan={6} className="muted">Todavía no hay necesidades de compra.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">CAPACIDAD</div><h2>Recursos de planta</h2></div><Gauge size={18} className="muted-icon"/></div><div className="capacity-list">{data.plantResources.filter(r=>r.active).map(r=>{const used=resourceLoad(r.name);return <div className="capacity-row" key={r.id}><div><strong>{r.name}</strong><span>{num(used,0)} / {num(r.capacityKg,0)} kg planificados · limpieza {r.cleaningMinutes??0} min</span></div><div className="capacity-bar"><i style={{width:`${Math.min(100,used/r.capacityKg*100)}%`}}/></div><Status label={`${num(used/r.capacityKg*100,0)}%`} tone={used>r.capacityKg?"red":used/r.capacityKg>=.9?"orange":"green"}/></div>})}</div></section></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">ALERTAS DEL PLAN</div><h2>Lo que impide fabricar</h2></div><AlertCircle size={18} className="muted-icon"/></div>{blocking.length||shortages.length?<div className="planning-alerts">{blocking.map(x=><div key={`recipe-${x.article.id}`}><AlertTriangle size={17}/><div><strong>{x.article.name}</strong><span>{x.needBoxes} cajas / {num(x.kg,0)} kg pendientes y no hay receta activa vinculada al artículo.</span></div></div>)}{shortages.map(x=><div key={`short-${x.material.id}`}><AlertTriangle size={17}/><div><strong>Falta {x.material.name}</strong><span>Déficit {num(x.deficit,1)} {x.unit}. La OF podrá planificarse, pero queda necesidad de compra.</span></div></div>)}</div>:<div className="planning-ok"><CheckCircle2 size={18}/><div><strong>No hay bloqueos de planificación.</strong><span>Demanda, receta y aprovisionamiento están preparados.</span></div></div>}</section>
  </>;
}

function ProductionPage({ data, setData, notify }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void }) {
  const [tab, setTab] = useState<"ordenes" | "recetas">("ordenes");
  const [showRecipe, setShowRecipe] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [recipeCode, setRecipeCode] = useState(""); const [recipeName, setRecipeName] = useState(""); const [recipeArticleId, setRecipeArticleId] = useState(""); const [outputKg, setOutputKg] = useState("1000");
  const [ingredients, setIngredients] = useState<{materialId:string; quantity:string; unit:RawMaterial["unit"]}[]>([{materialId:"",quantity:"",unit:"kg"}]);
  const [recipeId, setRecipeId] = useState(""); const [plannedKg, setPlannedKg] = useState("1000"); const [prodLot, setProdLot] = useState(""); const [line, setLine] = useState(""); const [tank, setTank] = useState("");
  const activeRecipes = data.recipes.filter(r => r.active);
  const addRecipe = () => {
    if (!recipeCode.trim() || !recipeName.trim() || !recipeArticleId || Number(outputKg)<=0 || ingredients.some(i=>!i.materialId || Number(i.quantity)<=0)) return notify("Completa la receta y sus ingredientes.", "warning");
    const recipe: Recipe = { id: makeId("rec"), code: recipeCode.trim(), name: recipeName.trim(), version: (data.recipes.filter(r=>r.code.trim().toLowerCase()===recipeCode.trim().toLowerCase()).reduce((m,r)=>Math.max(m,r.version),0)||0)+1, outputKg:Number(outputKg), active:true, articleId:recipeArticleId, ingredients:ingredients.map((i,n)=>({id:makeId(`ing${n}`),materialId:i.materialId,quantity:Number(i.quantity),unit:i.unit,percentage:Number(outputKg)>0?Number(i.quantity)/Number(outputKg)*100:0})) };
    setData(d=>({...d,recipes:[...d.recipes,recipe]})); setRecipeCode("");setRecipeName("");setRecipeArticleId("");setOutputKg("1000");setIngredients([{materialId:"",quantity:"",unit:"kg"}]);setShowRecipe(false);notify(`Receta ${recipe.code} v${recipe.version} creada.`);
  };
  const addOrder = () => {
    const recipe=activeRecipes.find(r=>r.id===recipeId); if(!recipe || Number(plannedKg)<=0 || !prodLot.trim()) return notify("Selecciona receta, cantidad y lote de fabricación.","warning");
    if(data.productionOrders.some(o=>o.lot.toLowerCase()===prodLot.trim().toLowerCase()))return notify("Ya existe una OF con ese lote. Usa otro código de lote.","warning");const order:ProductionOrder={id:makeId("of"),code:nextDocument("OF",data.productionOrders.map(x=>x.code)),recipeId:recipe.id,recipeVersion:recipe.version,plannedKg:Number(plannedKg),status:"PLANIFICADA",line:line||undefined,tank:tank||undefined,lot:prodLot.trim(),plannedAt:new Date().toISOString(),consumptions:[]};
    setData(d=>({...d,productionOrders:[order,...d.productionOrders]}));setShowOrder(false);notify(`${order.code} planificada.`);
  };
  const updateStatus=(order:ProductionOrder,status:ProductionOrder["status"])=>{setData(d=>({...d,productionOrders:d.productionOrders.map(o=>o.id===order.id?{...o,status,...(status==="EN_CURSO"?{startedAt:new Date().toISOString()}:{})}:o)}));notify(`${order.code}: ${status.replaceAll("_"," ")}.`)};
  const finalize=(order:ProductionOrder)=>{const required:ProductionStage[]=["PREPARACION","PESAJE","MEZCLA","COCCION","ENFRIAMIENTO","CONTROL","ENVASADO","PALETIZADO"];const completed=new Set((order.processSteps??[]).filter(x=>x.status==="COMPLETADA").map(x=>x.stage));const missing=required.filter(x=>!completed.has(x));if(missing.length)return notify(`No se puede cerrar ${order.code}. Faltan: ${missing.map(x=>x.charAt(0)+x.slice(1).toLowerCase()).join(", ")}.`,"warning");if(!(order.weighings?.length))return notify("No hay pesadas registradas.","warning");const finRecipe=data.recipes.find(r=>r.id===order.recipeId&&r.version===order.recipeVersion)??data.recipes.find(r=>r.id===order.recipeId);const finScale=order.plannedKg/Math.max(1,finRecipe?.outputKg??order.plannedKg);const notWeighed:string[]=[];const shortMaterials:string[]=[];for(const ing of finRecipe?.ingredients??[]){const ws=(order.weighings??[]).filter(w=>w.materialId===ing.materialId);const name=data.rawMaterials.find(m=>m.id===ing.materialId)?.name??ing.materialId;if(!ws.length){notWeighed.push(name);continue;}const total=ws.reduce((sum,w)=>sum+w.actual,0);const exp=ing.quantity*finScale;const tolPct=Math.max(...ws.map(w=>w.tolerancePct??0),2);if(exp>0&&total<exp*(1-tolPct/100))shortMaterials.push(ing.materialId);}if(notWeighed.length)return notify(`No se puede cerrar ${order.code}. Sin pesar: ${notWeighed.join(", ")}.`,"warning");if(shortMaterials.length&&!window.confirm("Hay ingredientes pesados por debajo de lo previsto. ¿Cerrar la OF igualmente? Quedarán como desviación para Calidad."))return;if((order.criticalControls??[]).some(c=>c.status==="DESVIACION")&&!window.confirm("Hay PCC con desviaciones. ¿Cerrar la OF? El lote quedará pendiente de Calidad (retener o liberar con justificación)."))return;const actual=window.prompt("Kg reales producidos", String(order.actualKg??order.plannedKg));if(actual===null)return;const a=Number(actual.replace(",","."));if(!Number.isFinite(a)||a<0)return notify("Cantidad de kg no válida.","warning");const waste=Math.max(0,order.plannedKg-a);setData(d=>({...d,productionOrders:d.productionOrders.map(o=>o.id===order.id?{...o,actualKg:a,wasteKg:waste,status:"FINALIZADA",finishedAt:new Date().toISOString(),weighings:(o.weighings??[]).map(w=>shortMaterials.includes(w.materialId)?{...w,status:"DESVIACION" as const}:w)}:o)}));notify(`${order.code} finalizada · rendimiento ${order.plannedKg?num(a/order.plannedKg*100,1):0}%.`);};
  const recipeNameOf=(id:string)=>data.recipes.find(r=>r.id===id)?.name??"Receta eliminada";
  return <>
    <PageTitle eyebrow="FABRICACIÓN · INDUSTRIA ALIMENTARIA" title="Producción" description="Recetas versionadas, órdenes de fabricación, consumos, mermas y rendimiento." actions={<button className="button primary" onClick={()=>tab==="recetas"?setShowRecipe(true):setShowOrder(true)}><Plus size={16}/>{tab==="recetas"?"Nueva receta":"Nueva orden"}</button>}/>
    <div className="production-tabs"><button className={tab==="ordenes"?"active":""} onClick={()=>setTab("ordenes")}><ClipboardList size={16}/> Órdenes de fabricación</button><button className={tab==="recetas"?"active":""} onClick={()=>setTab("recetas")}><Factory size={16}/> Recetas / formulaciones</button></div>
    {tab==="ordenes" && <section className="panel"><div className="production-kpis"><Metric label="Planificadas" value={data.productionOrders.filter(o=>o.status==="PLANIFICADA").length} detail="Pendientes de fabricar" icon={CalendarDays}/><Metric label="En curso" value={data.productionOrders.filter(o=>o.status==="EN_CURSO").length} detail="Fabricación activa" icon={Activity}/><Metric label="Finalizadas" value={data.productionOrders.filter(o=>o.status==="FINALIZADA").length} detail="Histórico" icon={CheckCircle2}/><Metric label="Rendimiento" value={data.productionOrders.filter(o=>o.actualKg!=null).length?`${num(data.productionOrders.filter(o=>o.actualKg!=null).reduce((s,o)=>s+(o.actualKg??0),0)/Math.max(1,data.productionOrders.filter(o=>o.actualKg!=null).reduce((s,o)=>s+o.plannedKg,0))*100,1)}%`:"—"} detail="Media global por kg" icon={Activity}/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Orden</th><th>Producto / receta</th><th>Lote</th><th>Planificado</th><th>Real</th><th>Rendimiento</th><th>Estado</th><th></th></tr></thead><tbody>{data.productionOrders.map(o=>{const pct=o.actualKg!=null&&o.plannedKg?o.actualKg/o.plannedKg*100:undefined;return <tr key={o.id}><td><strong className="mono">{o.code}</strong><small className="cell-sub">{dateText(o.plannedAt.slice(0,10))}</small></td><td><strong>{recipeNameOf(o.recipeId)}</strong><small className="cell-sub">v{o.recipeVersion}</small></td><td className="mono">{o.lot}</td><td>{num(o.plannedKg,1)} kg</td><td>{o.actualKg==null?"—":`${num(o.actualKg,1)} kg`}</td><td>{pct==null?"—":<Status label={`${num(pct,1)}%`} tone={pct>=95?"green":pct>=90?"orange":"red"}/>}</td><td><Status label={o.status.replaceAll("_"," ")} tone={o.status==="FINALIZADA"?"green":o.status==="EN_CURSO"?"blue":o.status==="BLOQUEADA"?"red":"orange"}/></td><td>{o.status==="PLANIFICADA"&&<button className="button small secondary" onClick={()=>updateStatus(o,"EN_CURSO")}>Iniciar</button>}{o.status==="EN_CURSO"&&<button className="button small secondary" onClick={()=>finalize(o)}>Finalizar</button>}</td></tr>})}</tbody></table>{!data.productionOrders.length&&<EmptyState icon={Factory} title="Sin órdenes de fabricación" detail="Crea una receta y después planifica tu primera fabricación."/>}</div></section>}
    {tab==="recetas" && <section className="panel"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Producto</th><th>Versión</th><th>Salida estándar</th><th>Ingredientes</th><th>Estado</th></tr></thead><tbody>{data.recipes.map((r) => <tr key={r.id}><td className="mono">{r.code}</td><td><strong>{r.name}</strong></td><td>v{r.version}</td><td>{num(r.outputKg,1)} kg</td><td>{r.ingredients.length}</td><td><Status label={r.active ? "Activa" : "Inactiva"} tone={r.active ? "green" : "neutral"} /></td></tr>)}</tbody></table>{!data.recipes.length && <EmptyState icon={Factory} title="Sin recetas" detail="Define la formulación para poder planificar producción."/>}</div></section>}
    {showRecipe&&<Modal title="Nueva receta" eyebrow="PRODUCCIÓN · FORMULACIÓN" onClose={()=>setShowRecipe(false)} size="wide"><div className="form-grid"><div><label>Código *</label><input value={recipeCode} onChange={e=>setRecipeCode(e.target.value)} placeholder="SAL-TOM-001"/></div><div><label>Nombre *</label><input value={recipeName} onChange={e=>setRecipeName(e.target.value)} placeholder="Salsa de tomate"/></div><div><label>Producto terminado *</label><select value={recipeArticleId} onChange={e=>setRecipeArticleId(e.target.value)}><option value="">Seleccionar artículo…</option>{data.articles.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.sku} · {a.name} · {a.netKgPerBox} kg/caja</option>)}</select></div><div><label>Salida estándar (kg) *</label><input type="number" min="1" value={outputKg} onChange={e=>setOutputKg(e.target.value)}/></div></div><div className="recipe-ingredients"><div className="panel-heading"><div><div className="eyebrow">FORMULACIÓN</div><h3>Ingredientes</h3></div><button className="button secondary" onClick={()=>setIngredients(x=>[...x,{materialId:"",quantity:"",unit:"kg"}])}><Plus size={15}/> Añadir</button></div>{ingredients.map((i,n)=><div className="ingredient-row" key={n}><select value={i.materialId} onChange={e=>setIngredients(x=>x.map((v,k)=>k===n?{...v,materialId:e.target.value,unit:data.rawMaterials.find(m=>m.id===e.target.value)?.unit??v.unit}:v))}><option value="">Materia prima…</option>{data.rawMaterials.filter(m=>m.active).map(m=><option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select><input type="number" min="0" step="0.01" placeholder="Cantidad" value={i.quantity} onChange={e=>setIngredients(x=>x.map((v,k)=>k===n?{...v,quantity:e.target.value}:v))}/><span>{i.unit}</span>{ingredients.length>1&&<button className="icon-button danger-text" onClick={()=>setIngredients(x=>x.filter((_,k)=>k!==n))}><X size={15}/></button>}</div>)}</div><div className="form-actions"><button className="button primary" onClick={addRecipe}><Check size={16}/> Guardar receta</button></div></Modal>}
    {showOrder&&<Modal title="Nueva orden de fabricación" eyebrow="PRODUCCIÓN · PLANIFICACIÓN" onClose={()=>setShowOrder(false)}><div className="form-grid"><div><label>Receta *</label><select value={recipeId} onChange={e=>setRecipeId(e.target.value)}><option value="">Seleccionar…</option>{activeRecipes.map(r=><option key={r.id} value={r.id}>{r.code} · {r.name} · v{r.version}</option>)}</select></div><div><label>Cantidad planificada (kg) *</label><input type="number" min="1" value={plannedKg} onChange={e=>setPlannedKg(e.target.value)}/></div><div><label>Lote fabricación *</label><input value={prodLot} onChange={e=>setProdLot(e.target.value)} placeholder="SB-261006-001"/></div><div><label>Línea</label><input value={line} onChange={e=>setLine(e.target.value)} placeholder="Línea 1"/></div><div><label>Tanque</label><input value={tank} onChange={e=>setTank(e.target.value)} placeholder="T-03"/></div></div><div className="production-preview">{recipeId&&(()=>{const r=activeRecipes.find(x=>x.id===recipeId);if(!r)return null;const factor=Number(plannedKg)/r.outputKg;return <><strong>Consumo teórico</strong>{r.ingredients.map(i=><div key={i.id}><span>{data.rawMaterials.find(m=>m.id===i.materialId)?.name??"Materia prima"}</span><b>{num(i.quantity*factor,2)} {i.unit}</b></div>)}</>})()}</div><div className="form-actions"><button className="button primary" onClick={addOrder}><Check size={16}/> Planificar orden</button></div></Modal>}
  </>;
}


function FabricationPage({ data, setData, notify }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void }) {
  const [selectedId, setSelectedId] = useState(data.productionOrders[0]?.id ?? "");
  const [operator, setOperator] = useState("OP");
  const [materialId, setMaterialId] = useState("");
  const [lotId, setLotId] = useState("");
  const [actual, setActual] = useState("");
  const [tolerance, setTolerance] = useState("2");
  const [point, setPoint] = useState("pH");
  const [value, setValue] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [unit, setUnit] = useState("pH");
  const [corrective, setCorrective] = useState("");
  const [packName, setPackName] = useState("");
  const [packCode, setPackCode] = useState("");
  const [packPlanned, setPackPlanned] = useState("");
  const [packActual, setPackActual] = useState("");
  const [packUnit, setPackUnit] = useState<ProductionPackaging["unit"]>("ud");

  const orders = data.productionOrders;
  const order = orders.find(o => o.id === selectedId) ?? orders[0];
  const recipe = order ? data.recipes.find(r => r.id === order.recipeId && r.version === order.recipeVersion) ?? data.recipes.find(r => r.id === order.recipeId) : undefined;
  const stages: ProductionStage[] = ["PREPARACION","PESAJE","MEZCLA","COCCION","ENFRIAMIENTO","CONTROL","ENVASADO","PALETIZADO","LIBERACION"];
  const stageLabels: Record<ProductionStage,string> = { PREPARACION:"Preparación", PESAJE:"Pesaje", MEZCLA:"Mezcla", COCCION:"Cocción", ENFRIAMIENTO:"Enfriamiento", CONTROL:"Control", ENVASADO:"Envasado", PALETIZADO:"Paletizado", LIBERACION:"Liberación" };
  const steps = order?.processSteps ?? [];
  const stepFor = (s: ProductionStage) => steps.find(x => x.stage === s);
  const allergens = recipe ? [...new Set(recipe.ingredients.flatMap(i => data.rawMaterials.find(m => m.id === i.materialId)?.allergens ?? []))] : [];
  const lots = materialId ? data.rawMaterialLots.filter(l => l.materialId === materialId && l.status === "LIBERADO" && l.quantity > 0 && (!l.expiry || l.expiry >= localIso())) : [];
  const totalWeighed = order?.weighings?.reduce((sum,w)=>sum+w.actual,0) ?? 0;
  const totalPlanned = order?.weighings?.reduce((sum,w)=>sum+w.planned,0) ?? 0;
  const deviationCount = (order?.weighings?.filter(w=>w.status === "DESVIACION").length ?? 0) + (order?.criticalControls?.filter(c=>c.status === "DESVIACION").length ?? 0);

  useEffect(() => { if (order && !selectedId) setSelectedId(order.id); }, [order?.id, selectedId]);

  const updateOrder = (id: string, updater: (o: ProductionOrder) => ProductionOrder) => setData(d => ({ ...d, productionOrders: d.productionOrders.map(o => o.id === id ? updater(o) : o) }));

  const changeStage = (target: ProductionStage) => {
    if (!order) return;
    const completed = new Set((order.processSteps ?? []).filter(s => s.status === "COMPLETADA").map(s => s.stage));
    const prev: ProductionStage[] = ["PREPARACION","PESAJE","MEZCLA","COCCION","ENFRIAMIENTO","CONTROL","ENVASADO","PALETIZADO","LIBERACION"];
    const idx = prev.indexOf(target);
    if (idx > 0 && !completed.has(prev[idx - 1])) return notify(`Primero debes completar ${stageLabels[prev[idx - 1]]}.`, "warning");
    if (target === "CONTROL" && (order.weighings?.length ?? 0) === 0) return notify("No puedes pasar a control sin registrar las pesadas.", "warning");
    if (target === "LIBERACION") return notify("La liberación final la realiza Calidad después del control del lote.", "warning");
    const now = new Date().toISOString();
    updateOrder(order.id, o => {
      const current = [...(o.processSteps ?? [])];
      const existing = current.find(x => x.stage === target);
      const next = existing ? current.map(x => x.id === existing.id ? { ...x, status: x.status === "COMPLETADA" ? "COMPLETADA" as const : "EN_CURSO" as const, startedAt: x.startedAt ?? now, operator } : x) : [...current, { id: makeId("step"), stage: target, status: "EN_CURSO" as const, startedAt: now, operator }];
      return { ...o, processSteps: next, status: o.status === "PLANIFICADA" ? "EN_CURSO" as const : o.status, startedAt: o.startedAt ?? now };
    });
  };
  const completeStage = (target: ProductionStage) => {
    if (!order) return;
    const now = new Date().toISOString();
    updateOrder(order.id, o => ({ ...o, processSteps: (o.processSteps ?? []).map(x => x.stage === target ? { ...x, status: "COMPLETADA", completedAt: now, operator } : x) }));
    notify(`${stageLabels[target]} completada.`);
  };
  const addWeighing = () => {
    if (!order || !materialId || !lotId || Number(actual) <= 0) return notify("Selecciona materia prima, lote y una cantidad positiva.", "warning");
    const ing = recipe?.ingredients.find(i => i.materialId === materialId);
    const lot = data.rawMaterialLots.find(l => l.id === lotId);
    if (!ing || !lot) return notify("La materia prima o el lote no pertenecen a la receta/fabricación.", "warning");
    if (lot.status !== "LIBERADO") return notify("Solo se puede consumir materia prima LIBERADA. El lote está retenido o en cuarentena.", "error");
    if (order.status === "FINALIZADA") return notify("La orden ya está cerrada: no se pueden registrar más pesadas.", "warning");
    if (!(order.processSteps ?? []).some(x => x.stage === "PREPARACION" && x.status === "COMPLETADA")) return notify("Completa la fase Preparación antes de pesar.", "warning");
    const a = Number(actual);
    if (lot.expiry && lot.expiry < localIso()) return notify(`El lote ${lot.internalLot} está caducado (${lot.expiry}). No se puede consumir.`, "error");
    if (a > lot.quantity) return notify(`Stock insuficiente en ${lot.internalLot}: quedan ${num(lot.quantity,2)} ${lot.unit}.`, "warning");
    const reservedByOthers = data.productionOrders.filter(o => o.id !== order.id && ["PLANIFICADA","EN_CURSO"].includes(o.status)).reduce((sum, o) => sum + (o.reservations ?? []).filter(r => r.lotId === lot.id).reduce((x, r) => x + r.quantity, 0), 0);
    if (a > lot.quantity - reservedByOthers + 0.000001) return notify(`En ${lot.internalLot} hay ${num(reservedByOthers,2)} ${lot.unit} reservados para otras órdenes. Disponible para esta: ${num(Math.max(0, lot.quantity - reservedByOthers),2)} ${lot.unit}.`, "warning");
    const planned = ing.quantity * (order.plannedKg / Math.max(1, recipe?.outputKg ?? order.plannedKg));
    const tol = Number(tolerance) || 0;
    const prevTotal = (order.weighings ?? []).filter(w => w.materialId === materialId).reduce((sum, w) => sum + w.actual, 0);
    const ok = planned === 0 ? true : (prevTotal + a) <= planned * (1 + tol / 100);
    const now = new Date().toISOString();
    const weighing: ProductionWeighing = { id: makeId("pes"), materialId, lotId, planned, actual: a, unit: ing.unit, tolerancePct: tol, operator, weighedAt: now, status: ok ? "OK" : "DESVIACION" };
    const consumption = { id: makeId("con"), materialId, lotId, planned, actual: a, unit: ing.unit };
    setData(current => ({
      ...current,
      rawMaterialLots: current.rawMaterialLots.map(l => l.id === lot.id ? { ...l, quantity: Math.max(0, l.quantity - a), status: l.quantity - a <= 0.000001 ? "AGOTADO" : l.status } : l),
      productionOrders: current.productionOrders.map(o => o.id === order.id ? { ...o, weighings: [...(o.weighings ?? []), weighing].map(w => w.materialId === materialId ? { ...w, status: ok ? "OK" as const : "DESVIACION" as const } : w), consumptions: [...o.consumptions, consumption], reservations: (o.reservations ?? []).flatMap(r => { if (r.lotId !== lot.id) return [r]; const left=Math.max(0,r.quantity-a); return left>0.000001 ? [{...r,quantity:left}] : []; }), processSteps: (o.processSteps ?? []).some(x=>x.stage==="PESAJE") ? o.processSteps : [...(o.processSteps ?? []), { id: makeId("step"), stage: "PESAJE", status: "EN_CURSO", startedAt: now, operator }] } : o),
      audit: [{ id: makeId("audit"), at: now, action: "CONSUMO_MP", entity: "rawMaterialLot", entityId: lot.id, summary: `${a} ${lot.unit} consumidos del lote ${lot.internalLot} en ${order.code}.` }, ...current.audit],
    }));
    setActual(""); setLotId(""); notify(ok ? `Pesaje registrado y stock descontado: ${a} ${ing.unit}.` : `Pesaje con exceso sobre lo previsto: ${num(prevTotal+a-planned,2)} ${ing.unit}. Stock descontado.`, ok ? "success" : "warning");
  };
  const addControl = () => {
    if (!order || !point.trim() || value === "") return notify("Indica el punto de control y su valor.", "warning");
    if (!(order.processSteps ?? []).some(x => x.stage === "ENFRIAMIENTO" && x.status === "COMPLETADA")) return notify("Completa la fase Enfriamiento antes de registrar el control.", "warning");
    const v = Number(value); const lo = min === "" ? undefined : Number(min); const hi = max === "" ? undefined : Number(max); const ok = (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
    const control: ProductionCriticalControl = { id: makeId("pcc"), point: point.trim(), value: v, unit, min: lo, max: hi, status: ok ? "OK" : "DESVIACION", checkedAt: new Date().toISOString(), operator, correctiveAction: ok ? undefined : corrective.trim() || "Pendiente de acción correctiva" };
    updateOrder(order.id, o => ({ ...o, criticalControls: [...(o.criticalControls ?? []), control], processSteps: (o.processSteps ?? []).some(x=>x.stage==="CONTROL") ? o.processSteps : [...(o.processSteps ?? []), { id: makeId("step"), stage: "CONTROL", status: "EN_CURSO", startedAt: new Date().toISOString(), operator }] }));
    setValue(""); setCorrective(""); notify(ok ? `${point} dentro de límites.` : `${point} fuera de límites: lote requiere revisión.`, ok ? "success" : "warning");
  };
  const addPackaging = () => {
    if (!order || !packName.trim() || Number(packPlanned)<=0) return notify("Indica material de envase y cantidad prevista.", "warning");
    const item: ProductionPackaging = { id: makeId("pack"), name: packName.trim(), code: packCode.trim() || undefined, planned: Number(packPlanned), actual: packActual === "" ? undefined : Number(packActual), unit: packUnit };
    updateOrder(order.id, o => ({ ...o, packaging: [...(o.packaging ?? []), item] })); setPackName("");setPackCode("");setPackPlanned("");setPackActual(""); notify("Material de packaging añadido.");
  };

  if (!order) return <><PageTitle eyebrow="FABRICACIÓN · SALSAS" title="Fabricación" description="Flujo de planta, pesadas, APPCC/PCC, alérgenos y packaging." /><EmptyState icon={Factory} title="No hay órdenes de fabricación" detail="Crea primero una orden en Producción."/></>;

  return <div>
    <PageTitle eyebrow="FABRICACIÓN · SALSAS" title="Fabricación" description="Seguimiento del lote desde la preparación hasta la liberación, con pesadas y controles trazables." />
    <section className="panel" style={{marginBottom:16}}><div className="panel-heading"><div><div className="eyebrow">ORDEN ACTIVA</div><h2>{order.code} · {recipe?.name ?? "Receta"}</h2><p className="muted">Lote <strong className="mono">{order.lot}</strong> · {num(order.plannedKg,1)} kg previstos · receta v{order.recipeVersion}</p></div><select value={order.id} onChange={e=>setSelectedId(e.target.value)} style={{maxWidth:360}}>{orders.map(o=><option key={o.id} value={o.id}>{o.code} · {o.lot}</option>)}</select></div>
      <div className="control-metrics"><Metric label="Pesado" value={`${num(totalWeighed,1)} kg`} detail={`${num(totalPlanned,1)} kg teóricos`} icon={Boxes} accent="blue"/><Metric label="Desviaciones" value={deviationCount} detail="Pesajes + PCC" icon={AlertTriangle} accent={deviationCount ? "coral" : "green"}/><Metric label="Alérgenos" value={allergens.length} detail={allergens.length ? allergens.join(", ") : "Ninguno declarado"} icon={ShieldCheck} accent={allergens.length ? "orange" : "green"}/><Metric label="Rendimiento" value={order.actualKg != null ? `${num(order.actualKg / Math.max(1,order.plannedKg)*100,1)}%` : "Pendiente"} detail={order.actualKg != null ? `${num(order.wasteKg ?? 0,1)} kg merma` : "Al finalizar"} icon={Activity} accent="blue"/></div>
    </section>
    <section className="panel" style={{marginBottom:16}}><div className="panel-heading"><div><div className="eyebrow">FLUJO DE PLANTA</div><h2>Proceso de fabricación</h2></div><span className="muted">Operario: {operator}</span></div><div className="trace-guide-grid">{stages.map(s=>{const step=stepFor(s); const done=step?.status==="COMPLETADA"; const active=step?.status==="EN_CURSO"; return <button key={s} className={`button ${done?"primary":active?"secondary":"ghost"}`} onClick={()=>active?completeStage(s):changeStage(s)} title={active?"Completar fase":"Iniciar fase"}>{done?<CheckCircle2 size={15}/>:active?<Activity size={15}/>:<Clock3 size={15}/>} {stageLabels[s]}</button>})}</div></section>
    <div className="control-grid">
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">PESAJE REAL</div><h2>Ingredientes y lotes</h2></div><ScaleIcon /></div>{recipe ? <><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Materia prima</th><th>Lote</th><th>Teórico</th><th>Real</th><th>Estado</th></tr></thead><tbody>{(order.weighings ?? []).map(w=><tr key={w.id}><td>{data.rawMaterials.find(m=>m.id===w.materialId)?.name ?? w.materialId}</td><td className="mono">{data.rawMaterialLots.find(l=>l.id===w.lotId)?.internalLot ?? w.lotId}</td><td>{num(w.planned,2)} {w.unit}</td><td>{num(w.actual,2)} {w.unit}</td><td><Status label={w.status} tone={w.status==="OK"?"green":"red"}/></td></tr>)}{!(order.weighings?.length) && <tr><td colSpan={5} className="muted">Todavía no hay pesadas registradas.</td></tr>}</tbody></table></div><div className="form-grid" style={{marginTop:14}}><label>Materia prima<select value={materialId} onChange={e=>{setMaterialId(e.target.value);setLotId("")}}><option value="">Seleccionar ingrediente…</option>{recipe.ingredients.map(i=><option key={i.id} value={i.materialId}>{data.rawMaterials.find(m=>m.id===i.materialId)?.name ?? i.materialId}</option>)}</select></label><label>Lote disponible<select value={lotId} onChange={e=>setLotId(e.target.value)}><option value="">Seleccionar lote…</option>{lots.map(l=><option key={l.id} value={l.id}>{l.internalLot} · {num(l.quantity,1)} {l.unit} · {l.status}</option>)}</select></label><label>Cantidad pesada<input type="number" step="0.01" value={actual} onChange={e=>setActual(e.target.value)} placeholder="0,00"/></label><label>Tolerancia %<input type="number" step="0.1" value={tolerance} onChange={e=>setTolerance(e.target.value)}/></label></div><div className="form-actions"><button className="button primary" onClick={addWeighing}><CheckCircle2 size={16}/> Registrar pesada</button></div></> : <EmptyState icon={Factory} title="Receta no encontrada" detail="La orden apunta a una receta que ya no está disponible."/>}</section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">APPCC · PCC</div><h2>Control crítico</h2></div><ShieldCheck size={18} className="muted-icon"/></div><div className="form-grid"><label>Punto de control<input value={point} onChange={e=>setPoint(e.target.value)} placeholder="pH, cocción, enfriamiento…"/></label><label>Unidad<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="pH / °C / min"/></label><label>Valor<input type="number" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></label><label>Mínimo<input type="number" step="0.01" value={min} onChange={e=>setMin(e.target.value)}/></label><label>Máximo<input type="number" step="0.01" value={max} onChange={e=>setMax(e.target.value)}/></label></div><label>Acción correctiva si hay desviación<textarea rows={2} value={corrective} onChange={e=>setCorrective(e.target.value)} placeholder="Retener lote, repetir análisis, ajustar proceso…"/></label><div className="form-actions"><button className="button primary" onClick={addControl}><ShieldCheck size={16}/> Registrar PCC</button></div><div className="quality-trace">{(order.criticalControls ?? []).map(c=><div key={c.id}><span><strong>{c.point}</strong> · {c.value ?? "—"} {c.unit ?? ""}</span><span>{c.min ?? "—"} / {c.max ?? "—"}</span><Status label={c.status} tone={c.status==="OK"?"green":"red"}/></div>)}{!(order.criticalControls?.length) && <p className="muted">Sin controles críticos registrados.</p>}</div></section>
    </div>
    <div className="control-grid" style={{marginTop:16}}>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">ALÉRGENOS</div><h2>Perfil automático del producto</h2></div><AlertTriangle size={18} className="muted-icon"/></div>{allergens.length ? <div className="trace-guide-grid">{allergens.map(a=><span key={a}>⚠ {a}</span>)}</div> : <p className="muted">No hay alérgenos declarados en las materias primas de esta receta.</p>}<p className="muted" style={{marginTop:12}}>El perfil se calcula desde los ingredientes de la versión de receta utilizada por esta orden.</p></section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">ENVASES Y PACKAGING</div><h2>Material consumido</h2></div><Package size={18} className="muted-icon"/></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Material</th><th>Código</th><th>Previsto</th><th>Real</th><th></th></tr></thead><tbody>{(order.packaging ?? []).map(p=><tr key={p.id}><td>{p.name}</td><td className="mono">{p.code ?? "—"}</td><td>{num(p.planned)} {p.unit}</td><td>{p.actual == null ? "—" : `${num(p.actual)} ${p.unit}`}</td><td></td></tr>)}{!(order.packaging?.length) && <tr><td colSpan={5} className="muted">Sin materiales de packaging.</td></tr>}</tbody></table></div><div className="form-grid" style={{marginTop:12}}><label>Material<input value={packName} onChange={e=>setPackName(e.target.value)} placeholder="Bote 500 g / tapa / caja…"/></label><label>Código<input value={packCode} onChange={e=>setPackCode(e.target.value)} placeholder="SKU / lote"/></label><label>Previsto<input type="number" value={packPlanned} onChange={e=>setPackPlanned(e.target.value)}/></label><label>Real<input type="number" value={packActual} onChange={e=>setPackActual(e.target.value)}/></label><label>Unidad<select value={packUnit} onChange={e=>setPackUnit(e.target.value as ProductionPackaging["unit"])}><option value="ud">ud</option><option value="cajas">cajas</option><option value="kg">kg</option></select></label></div><div className="form-actions"><button className="button secondary" onClick={addPackaging}><Plus size={16}/> Añadir material</button></div></section>
    </div>
  </div>;
}

function ScaleIcon() { return <span className="muted-icon" style={{fontSize:18}}>⚖</span>; }

function QualityPage({ data, setData, notify }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void }) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [ph, setPh] = useState(""); const [temperatureC, setTemperatureC] = useState(""); const [viscosity, setViscosity] = useState(""); const [weightKg, setWeightKg] = useState(""); const [notes, setNotes] = useState("");
  const order = data.productionOrders.find(o => o.id === selectedOrderId);
  const controls = data.qualityControls ?? [];
  const pending = data.productionOrders.filter(o => o.status === "FINALIZADA" && !controls.some(c => c.productionOrderId === o.id && ["LIBERADO","RETENIDO","BLOQUEADO"].includes(c.status))).length;
  const addControl = (status: QualityControl["status"]) => {
    if (!order) return notify("Selecciona una orden de fabricación.", "warning");
    const id = makeId("qc"); const now = new Date().toISOString();
    let fgExpiry: string | undefined;
    const hasDeviation = (order.criticalControls ?? []).some(c => c.status === "DESVIACION") || (order.weighings ?? []).some(w => w.status === "DESVIACION");
    const item: QualityControl = { id, productionOrderId: order.id, productionLot: order.lot, checkedAt: now, ph: ph ? Number(ph) : undefined, temperatureC: temperatureC ? Number(temperatureC) : undefined, viscosity: viscosity ? Number(viscosity) : undefined, weightKg: weightKg ? Number(weightKg) : undefined, status, notes: notes.trim() || undefined };
    if (status === "LIBERADO") {
      if (controls.some(c => c.productionOrderId === order.id && c.status === "LIBERADO")) return notify("Este lote ya está liberado.", "warning");
      if (order.status !== "FINALIZADA") return notify("Solo se puede liberar un lote después de cerrar la fabricación.", "warning");
      if ((order.actualKg ?? 0) <= 0) return notify("El lote no tiene producción real registrada.", "warning");
      if (hasDeviation && !notes.trim()) return notify("Hay desviaciones (PCC o pesadas). Escribe en Notas la justificación y la acción correctiva para liberar, o retén el lote.", "warning");
      const relRecipe = data.recipes.find(r => r.id === order.recipeId && r.version === order.recipeVersion) ?? data.recipes.find(r => r.id === order.recipeId);
      const relArticle = relRecipe?.articleId ? data.articles.find(a => a.id === relRecipe.articleId) : undefined;
      if (!relArticle) return notify("La receta no tiene un artículo de producto terminado vinculado. Vincúlalo antes de liberar.", "warning");
      if (relArticle.shelfLifeDays && relArticle.shelfLifeDays > 0) {
        const made = new Date(order.finishedAt ?? now); made.setDate(made.getDate() + relArticle.shelfLifeDays); fgExpiry = localIso(made);
      } else {
        const typed = window.prompt(`Caducidad del producto terminado (AAAA-MM-DD). El artículo ${relArticle.sku} no tiene vida útil definida.`, "");
        if (typed === null || !/^\d{4}-\d{2}-\d{2}$/.test(typed.trim())) return notify("Liberación cancelada: indica una fecha de caducidad válida (AAAA-MM-DD).", "warning");
        fgExpiry = typed.trim();
      }
      const requiredStages: ProductionStage[] = ["PREPARACION","PESAJE","MEZCLA","COCCION","ENFRIAMIENTO","CONTROL","ENVASADO","PALETIZADO"];
      const completedStages = new Set((order.processSteps ?? []).filter(x => x.status === "COMPLETADA").map(x => x.stage));
      if (requiredStages.some(stage => !completedStages.has(stage))) return notify("No se puede liberar: el flujo de fabricación no está completo.", "warning");
    }
    setData(current => {
      const nextControls = [item, ...(current.qualityControls ?? [])];
      let pallets = current.pallets;
      let createdMovements: Movement[] = [];
      let audit = [{ id: makeId("audit"), at: now, action: status === "LIBERADO" ? "LIBERAR_LOTE" : status === "RETENIDO" ? "RETENER_LOTE" : "CONTROL_CALIDAD", entity: "qualityControl", entityId: id, summary: `${status}: lote ${order.lot}${status === "LIBERADO" && hasDeviation ? ` · con desviación justificada: ${notes.trim()}` : ""}` }, ...current.audit];
      if (status === "LIBERADO") {
        const recipe = current.recipes.find(r => r.id === order.recipeId && r.version === order.recipeVersion) ?? current.recipes.find(r => r.id === order.recipeId);
        const article = recipe?.articleId ? current.articles.find(a => a.id === recipe.articleId) : undefined;
        if (!recipe || !article) return current;
        const boxes = Math.max(1, Math.round((order.actualKg ?? 0) / Math.max(0.001, article.netKgPerBox)));
        const boxesPerPallet = Math.max(1, article.boxesPerPallet || boxes);
        const palletCount = Math.ceil(boxes / boxesPerPallet);
        const usedSerials = nextSsccSerial(current.settings, current.pallets) - 1;
        const palCodes: string[] = [];
        const created = Array.from({ length: palletCount }, (_, index) => {
          const remaining = boxes - index * boxesPerPallet;
          const palletBoxes = Math.min(boxesPerPallet, remaining);
          const palletId = makeId("pal");
          const code = nextDocument("PAL", [...current.pallets.map((item) => item.code), ...palCodes]); palCodes.push(code);
          return { id: palletId, code, createdAt: now, typeId: current.palletTypes[0]?.id ?? "pal-eur", location: "Zona producto terminado", status: "DISPONIBLE" as const, lines: [{ id: makeId("pl"), articleId: article.id, format: article.format, packSize: article.packSize, unitsPerBox: article.unitsPerBox, netKgPerBox: article.netKgPerBox, lot: order.lot, expiry: fgExpiry, boxes: palletBoxes }], labelRevision: 1, sscc: makeSscc(current.settings.companyPrefix, usedSerials + index + 1, current.settings.ssccExtension), notes: `Generado automáticamente al liberar ${order.code}.` };
        });
        pallets = [...current.pallets, ...created];
        createdMovements = created.map(p => ({ id: makeId("mov"), date: now, kind: "FABRICACIÓN", palletId: p.id, summary: `Producto terminado ${order.lot} liberado y paletizado desde ${order.code}.` }));
        audit = [...created.map(p => ({ id: makeId("audit"), at: now, action: "ALTA_PRODUCTO_TERMINADO", entity: "pallet", entityId: p.id, summary: `Palet ${p.code} creado al liberar lote ${order.lot}.` })), ...audit];
      }
      return { ...current, qualityControls: nextControls, pallets, movements: [...createdMovements, ...current.movements], audit };
    });
    setPh(""); setTemperatureC(""); setViscosity(""); setWeightKg(""); setNotes(""); notify(status === "LIBERADO" ? `Lote ${order.lot} liberado.` : `Control de calidad registrado: ${status.toLowerCase()}.`);
  };
  const lotSearch = (lot: string) => {
    const o = data.productionOrders.find(x => x.lot.toLowerCase() === lot.toLowerCase());
    if (o) setSelectedOrderId(o.id);
  };
  const recallLot = order?.lot ?? "";
  const recallPallets = recallLot ? data.pallets.filter(p => p.lines.some(line => line.lot.toLowerCase() === recallLot.toLowerCase())) : [];
  const recallLoads = recallPallets.length ? data.loads.filter(l => recallPallets.some(p => l.palletIds.includes(p.id))) : [];
  const recallCustomers = Array.from(new Set(recallLoads.map(l => l.customerId).filter(Boolean))).map(id => data.customers.find(c => c.id === id)).filter(Boolean);
  const executeRecall = () => {
    if (!order || !recallPallets.length) return notify("Selecciona un lote con palets trazados para iniciar la retirada.", "warning");
    const now = new Date().toISOString();
    setData(current => ({
      ...current,
      pallets: current.pallets.map(p => recallPallets.some(r => r.id === p.id) ? { ...p, status: "BLOQUEADO" } : p),
      audit: [{ id: makeId("audit"), at: now, action: "RETIRADA_LOTE", entity: "productionLot", entityId: order.id, summary: `Retirada iniciada para lote ${order.lot}: ${recallPallets.length} palets bloqueados.` }, ...current.audit],
    }));
    notify(`Retirada iniciada: ${recallPallets.length} palets bloqueados.`, "warning");
  };
  return <div>
    <PageTitle eyebrow="CALIDAD · TRAZABILIDAD" title="Control de calidad" description="Expediente del lote: fabricación, controles, estado y materias primas utilizadas." />
    <div className="control-metrics"><Metric label="Pendientes de liberar" value={pending} detail="Lotes fabricados sin decisión" icon={Clock3} accent="orange" /><Metric label="Liberados" value={controls.filter(c=>c.status === "LIBERADO").length} detail="Controles conformes" icon={CheckCircle2} accent="green" /><Metric label="Retenidos" value={controls.filter(c=>c.status === "RETENIDO").length} detail="Revisión necesaria" icon={AlertTriangle} accent="coral" /><Metric label="Lotes fabricados" value={data.productionOrders.length} detail="Con trazabilidad de producción" icon={Factory} accent="blue" /></div>
    <div className="control-grid">
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">NUEVO CONTROL</div><h2>Registrar análisis del lote</h2></div><ShieldCheck size={18} className="muted-icon"/></div>
        <label>Lote / orden de fabricación<select value={selectedOrderId} onChange={e=>setSelectedOrderId(e.target.value)}><option value="">Seleccionar…</option>{data.productionOrders.slice().reverse().map(o=><option key={o.id} value={o.id}>{o.lot} · {o.code}</option>)}</select></label>
        <div className="quality-grid"><label>pH<input type="number" step="0.01" value={ph} onChange={e=>setPh(e.target.value)} placeholder="3,72"/></label><label>Temperatura °C<input type="number" step="0.1" value={temperatureC} onChange={e=>setTemperatureC(e.target.value)} placeholder="82"/></label><label>Viscosidad<input type="number" step="1" value={viscosity} onChange={e=>setViscosity(e.target.value)} placeholder="1250"/></label><label>Peso kg<input type="number" step="0.01" value={weightKg} onChange={e=>setWeightKg(e.target.value)} placeholder="5,02"/></label></div>
        <label>Observaciones<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Resultados, desviaciones, observaciones…"/></label>
        <div className="form-actions"><button className="button secondary" onClick={()=>addControl("RETENIDO")}><AlertTriangle size={16}/> Retener</button><button className="button primary" onClick={()=>addControl("LIBERADO")}><CheckCircle2 size={16}/> Liberar lote</button></div>
      </section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">EXPEDIENTE</div><h2>{order ? `Lote ${order.lot}` : "Selecciona un lote"}</h2></div><Barcode size={18} className="muted-icon"/></div>
        {order ? <><div className="trace-result"><div><strong>{order.code}</strong><span>{order.recipeId ? data.recipes.find(r=>r.id===order.recipeId)?.name ?? "Receta" : "Producción"} · {kg(order.actualKg ?? order.plannedKg)}</span><span>Estado producción · <b>{order.status}</b></span></div></div><div className="quality-trace"><h3>Materias primas utilizadas</h3>{order.consumptions.length ? order.consumptions.map(c=><div key={c.id}><span>{data.rawMaterials.find(m=>m.id===c.materialId)?.name ?? "Materia prima"}</span><span>Lote {data.rawMaterialLots.find(l=>l.id===c.lotId)?.internalLot ?? c.lotId}</span><b>{num(c.actual || c.planned,2)} {c.unit}</b></div>) : <p className="muted">Todavía no hay consumos de lotes registrados.</p>}</div><div className="quality-trace"><h3>Controles registrados</h3>{controls.filter(c=>c.productionOrderId===order.id).map(c=><div key={c.id}><span>{dateTimeText(c.checkedAt)}</span><span>pH {c.ph ?? "—"} · {c.temperatureC ?? "—"}°C</span><Status label={c.status} tone={c.status === "LIBERADO" ? "green" : c.status === "RETENIDO" ? "orange" : "red"}/></div>)}</div></> : <EmptyState icon={ShieldCheck} title="Sin lote seleccionado" detail="Selecciona una orden para ver su expediente de trazabilidad."/>}
      </section>
    </div>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD HACIA ATRÁS</div><h2>Buscar por lote de fabricación</h2></div></div><div className="trace-search"><input placeholder="Ej. SB-261006-001" onKeyDown={e=>{if(e.key==="Enter") lotSearch(e.currentTarget.value)}}/><button className="button secondary" onClick={()=>notify("Introduce el lote y pulsa Enter.")}>Buscar</button></div><div className="quality-note"><strong>Preparado para Recall</strong><span>La relación lote de fabricación → consumos de materias primas → palets → expediciones será la base del módulo de retirada de lotes.</span></div></section>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">RECALL · TRAZABILIDAD HACIA DELANTE</div><h2>{order ? `Impacto del lote ${order.lot}` : "Selecciona un lote para consultar impacto"}</h2></div><AlertTriangle size={18} className="muted-icon"/></div>
      {order ? <><div className="control-metrics recall-metrics"><Metric label="Palets afectados" value={recallPallets.length} detail="Contienen el lote fabricado" icon={Package} accent="coral"/><Metric label="Expediciones" value={recallLoads.length} detail="Cargas relacionadas" icon={Truck} accent="orange"/><Metric label="Clientes" value={recallCustomers.length} detail="Destinos identificados" icon={Users} accent="blue"/><Metric label="Estado" value={recallPallets.some(p=>p.status==="BLOQUEADO") ? "RETIRADA" : "LISTO"} detail="Estado de la acción" icon={ShieldCheck} accent={recallPallets.some(p=>p.status==="BLOQUEADO") ? "coral" : "green"}/></div>
        <div className="quality-trace"><h3>Palets afectados</h3>{recallPallets.length ? recallPallets.map(p=><div key={p.id}><span><strong>{p.code}</strong> · {p.location}</span><span>{p.status}</span><b>{p.sscc ?? "Sin SSCC"}</b></div>) : <p className="muted">No se han encontrado palets cuyo lote coincida con la fabricación.</p>}</div>
        <div className="quality-trace"><h3>Expediciones y clientes</h3>{recallLoads.length ? recallLoads.map(l=>{const customer=l.customerId ? data.customers.find(c=>c.id===l.customerId) : undefined; return <div key={l.id}><span><strong>{l.code}</strong> · {dateText(l.departureAt)}</span><span>{customer?.name ?? "Cliente no asignado"}</span><b>{l.status}</b></div>}) : <p className="muted">Ninguna expedición relacionada con los palets afectados.</p>}</div>
        <div className="form-actions"><button className="button secondary danger-text" onClick={executeRecall} disabled={!recallPallets.length}><AlertTriangle size={16}/> Iniciar retirada y bloquear palets</button></div>
      </> : <EmptyState icon={AlertTriangle} title="Sin lote seleccionado" detail="Selecciona una orden de fabricación arriba para calcular automáticamente el alcance de una retirada."/>}
    </section>
  </div>;
}

function ControlPage({ data, setData, notify, onOpenPallet, scanOpen, setScanOpen }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void; onOpenPallet: (id: string) => void; scanOpen: boolean; setScanOpen: (open: boolean) => void }) {
  const [trace, setTrace] = useState("");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [incidentType, setIncidentType] = useState<Incident["type"]>("PALET_DANADO");
  const [severity, setSeverity] = useState<Incident["severity"]>("MEDIA");
  const [summary, setSummary] = useState("");
  const [palletId, setPalletId] = useState("");
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
  const traceValue = trace.trim().toLowerCase();
  const pallet = data.pallets.find(p => p.code.toLowerCase() === traceValue || p.id.toLowerCase() === traceValue || p.sscc === trace.trim());
  const load = data.loads.find(l => l.code.toLowerCase() === traceValue || l.id.toLowerCase() === traceValue);
  const order = data.orders.find(o => o.id.toLowerCase() === traceValue || o.reference?.toLowerCase() === traceValue);
  const movements = pallet ? data.movements.filter(m => m.palletId === pallet.id || m.relatedPalletId === pallet.id) : [];
  const relatedLoads = pallet ? data.loads.filter(l => l.palletIds.includes(pallet.id)) : [];
  const addIncident = () => {
    if (!summary.trim()) return notify("Describe brevemente la incidencia.", "warning");
    const id = makeId("inc"); const now = new Date().toISOString();
    const item: Incident = { id, createdAt: now, type: incidentType, severity, status: "ABIERTA", summary: summary.trim(), palletId: palletId || undefined };
    setData(current => ({ ...current, incidents: [item, ...current.incidents], syncQueue: [...current.syncQueue, { id: makeId("sync"), createdAt: now, action: "CREAR_INCIDENCIA", entity: "incident", entityId: id, payload: item, status: "PENDIENTE" }] }));
    setSummary(""); notify("Incidencia registrada. Queda disponible para sincronizar cuando haya conexión.");
  };
  const resolveIncident = (id: string) => setData(current => ({ ...current, incidents: current.incidents.map(i => i.id === id ? { ...i, status: "RESUELTA" } : i) }));
  const onScan = (code: string) => { setScanOpen(false); setTrace(code); notify(`Código leído: ${code}`); };
  return <div className="control-page">
    <PageTitle eyebrow="CONTROL · PRODUCCIÓN" title="Centro de control" description="Escaneo, trazabilidad, incidencias y estado de conectividad en un único punto." actions={<><div className={`connectivity ${online ? "online" : "offline"}`}><span />{online ? "Conectado" : "Sin conexión"}</div><button className="button primary" onClick={() => setScanOpen(true)}><ScanLine size={16}/> Escanear</button></>} />
    <div className="control-metrics"><Metric label="Incidencias abiertas" value={data.incidents.filter(i => i.status === "ABIERTA").length} detail="Pendientes de resolver" icon={AlertTriangle} accent="coral" /><Metric label="Cola offline" value={data.syncQueue.filter(i => i.status === "PENDIENTE").length} detail="Operaciones locales pendientes" icon={Activity} accent="blue" /><Metric label="Palets trazables" value={data.pallets.filter(p => p.sscc).length} detail="Con SSCC asignado" icon={Barcode} accent="green" /><Metric label="Expediciones" value={data.loads.filter(l => l.status === "CERRADA").length} detail="Histórico cerrado" icon={Truck} accent="violet" /></div>
    <div className="control-grid">
      <section className="panel control-trace"><div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Buscar palet, SSCC, pedido o carga</h2></div><Barcode size={18} className="muted-icon"/></div><div className="trace-search"><input value={trace} onChange={e => setTrace(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pallet) onOpenPallet(pallet.id); }} placeholder="PAL-00001 · 00… · PED-00001 · CAR-00001"/><button className="button secondary" onClick={() => setScanOpen(true)}><ScanLine size={16}/></button></div>{pallet && <div className="trace-result"><div><strong>{pallet.code}</strong><span>{pallet.location} · {sumBoxes(pallet.lines)} {boxUnit(pallet)} · {kg(palletWeight(pallet, data))}</span><span>SSCC · <b className="mono">{pallet.sscc ?? "—"}</b></span></div><button className="button secondary" onClick={() => onOpenPallet(pallet.id)}>Abrir palet</button></div>}{(load || order) && <div className="trace-result"><div><strong>{load ? load.code : order?.id}</strong><span>{load ? `${load.palletIds.length} palets · ${dateTimeText(load.departureAt)}` : `${customerName(data, order!.customerId)} · ${dateText(order!.deliveryDate)}`}</span></div></div>}{pallet && <div className="trace-timeline">{movements.slice().reverse().map(event => <div key={event.id}><span className="timeline-dot"/><div><strong>{movementLabels[event.kind]}</strong><span>{event.summary}</span><small>{dateTimeText(event.date)}</small></div></div>)}{relatedLoads.map(l => <div key={`load-${l.id}`}><span className="timeline-dot"/><div><strong>{l.status === "CERRADA" ? "Expedición" : "Carga preparada"}</strong><span>{l.code} · {l.dock || "Sin muelle"}</span><small>{dateTimeText(l.closedAt ?? l.createdAt)}</small></div></div>)}</div>}</section>
      <section className="panel"><div className="panel-heading"><div><div className="eyebrow">INCIDENCIAS</div><h2>Registrar incidencia</h2></div><AlertTriangle size={18} className="muted-icon"/></div><div className="incident-form"><div className="field-row"><label>Tipo<select value={incidentType} onChange={e => setIncidentType(e.target.value as Incident["type"])}><option value="PALET_DANADO">Palet dañado</option><option value="DIFERENCIA_CANTIDAD">Diferencia de cantidad</option><option value="PRODUCTO_INCORRECTO">Producto incorrecto</option><option value="TEMPERATURA">Temperatura</option><option value="ETIQUETA">Etiqueta</option><option value="RECHAZO_CARGA">Rechazo de carga</option><option value="OTRA">Otra</option></select></label><label>Prioridad<select value={severity} onChange={e => setSeverity(e.target.value as Incident["severity"])}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option></select></label></div><label>Palet relacionado<select value={palletId} onChange={e => setPalletId(e.target.value)}><option value="">Sin palet</option>{data.pallets.slice(0,300).map(p => <option key={p.id} value={p.id}>{p.code} · {p.location}</option>)}</select></label><label>Descripción<textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Qué ha ocurrido…"/></label><button className="button primary" onClick={addIncident}><Plus size={16}/> Registrar incidencia</button></div></section>
    </div>
    <section className="panel"><div className="panel-heading"><div><div className="eyebrow">HISTÓRICO</div><h2>Incidencias recientes</h2></div><span className="nav-count">{data.incidents.length}</span></div><div className="incident-list">{data.incidents.slice(0,12).map(item => <div className={`incident-row ${item.status.toLowerCase()}`} key={item.id}><div><strong>{item.summary}</strong><span>{item.type.replaceAll("_", " ")} · {item.severity} · {dateTimeText(item.createdAt)}</span></div><div>{item.palletId && <span className="mono">{data.pallets.find(p=>p.id===item.palletId)?.code ?? item.palletId}</span>}{item.status === "ABIERTA" && <button className="button small secondary" onClick={() => resolveIncident(item.id)}><Check size={14}/> Resolver</button>}{item.status === "RESUELTA" && <Status label="Resuelta" tone="green"/>}</div></div>)}{!data.incidents.length && <EmptyState icon={CheckCircle2} title="Sin incidencias" detail="Las incidencias operativas aparecerán aquí."/>}</div></section>
    {scanOpen && <CameraScanner onCode={onScan} onClose={() => setScanOpen(false)}/>}
  </div>;
}

export default function App() {
  const [data, setData] = useState<AppData>(() => readData());
  const [view, setView] = useState<ViewName>("inicio");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [palletFilter, setPalletFilter] = useState("Todos");
  const [masterTab, setMasterTab] = useState("Artículos");
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [manualPalletId, setManualPalletId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [showChromeInstallHint, setShowChromeInstallHint] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmOptions | null>(null);
  const confirmResolveRef = useRef<((accepted: boolean) => void) | null>(null);

  const askConfirmation = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    if (confirmResolveRef.current) {
      confirmResolveRef.current(false);
      confirmResolveRef.current = null;
    }
    confirmResolveRef.current = resolve;
    setConfirmation(options);
  }), []);
  const resolveConfirmation = useCallback((accepted: boolean) => {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);

  useEffect(() => { try { setSaved(false); writeData(data); setSaved(true); } catch { setSaved(false); } }, [data]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(null), 4200); return () => window.clearTimeout(timer); }, [toast]);
  // Botón "atrás" (Android o navegador): cierra lo que esté encima (aviso, escáner, ventana, menú) y,
  // si no hay nada abierto, vuelve a la pantalla anterior. Nunca pregunta si se quiere salir.
  const navRef = useRef({ trail: [] as ViewName[], prevView: view, overlays: 0, ignorePops: 0 });
  const liveRef = useRef({ view, modal, mobileNav, scanOpen, confirmation });
  liveRef.current = { view, modal, mobileNav, scanOpen, confirmation };
  const overlayCount = (modal ? 1 : 0) + (mobileNav ? 1 : 0) + (scanOpen ? 1 : 0) + (confirmation ? 1 : 0);
  useEffect(() => {
    const nav = navRef.current;
    const viewChanged = nav.prevView !== view;
    const delta = (viewChanged ? 1 : 0) + (overlayCount - nav.overlays);
    if (viewChanged) nav.trail.push(nav.prevView);
    nav.prevView = view;
    nav.overlays = overlayCount;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) history.pushState({ almacenNav: true }, "");
    } else if (delta < 0) {
      nav.ignorePops += 1;
      history.go(delta);
    }
  }, [view, overlayCount]);
  useEffect(() => {
    const onPop = () => {
      const nav = navRef.current;
      if (nav.ignorePops > 0) { nav.ignorePops -= 1; return; }
      const live = liveRef.current;
      if (live.confirmation) { nav.overlays -= 1; resolveConfirmation(false); return; }
      if (live.scanOpen) { nav.overlays -= 1; setScanOpen(false); return; }
      if (live.modal) { nav.overlays -= 1; setModal(null); return; }
      if (live.mobileNav) { nav.overlays -= 1; setMobileNav(false); return; }
      const previous = nav.trail.pop();
      if (previous) { nav.prevView = previous; setView(previous); return; }
      history.back(); // entradas antiguas de una sesión anterior: seguir hacia atrás hasta salir
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [resolveConfirmation]);
  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const userAgent = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isChromeFamily = /(Chrome|Chromium|CriOS)\//.test(userAgent) && !/(Edg|OPR|SamsungBrowser)\//.test(userAgent);
    setShowIosInstallHint(isIos && !isStandalone);
    setShowChromeInstallHint(isChromeFamily && !isIos && !isStandalone);
    setInstallPrompt(getInstallPrompt());
    const unsubscribeInstallPrompt = subscribeInstallPrompt(setInstallPrompt);
    const onInstalled = () => { setInstallPrompt(null); setShowIosInstallHint(false); setShowChromeInstallHint(false); };
    window.addEventListener("appinstalled", onInstalled);
    return () => { unsubscribeInstallPrompt(); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const notify = (message: string, type: ToastState["type"] = "success") => setToast({ message, type });
  const installApp = async () => {
    const prompt = installPrompt;
    if (!prompt) { setShowChromeInstallHint(true); return; }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      clearInstallPrompt();
      setInstallPrompt(null);
      setShowChromeInstallHint(choice.outcome !== "accepted");
    } catch {
      clearInstallPrompt();
      setInstallPrompt(null);
      setShowChromeInstallHint(true);
      notify("Chrome no ha ofrecido la instalación automática. Comprueba que la web está en HTTPS y usa el menú ⋮.", "warning");
    }
  };
  const activeLoad = data.loads.find((load) => load.id === selectedLoadId) ?? null;
  const allDraftPalletIds = data.loads.filter((load) => load.status === "BORRADOR").flatMap((load) => load.palletIds);
  const openPalletModal = (orderId?: string) => setModal({ kind: "pallet", orderId });
  const searchMatch = (value: string) => !search.trim() || value.toLowerCase().includes(search.trim().toLowerCase());

  const saveOrder = async (draft: Omit<Order, "id" | "createdAt">, existingId?: string) => {
    const mergedLines = new Map<string, number>();
    draft.lines.forEach((line) => mergedLines.set(line.articleId, (mergedLines.get(line.articleId) ?? 0) + line.boxes));
    const cleanDraft = { ...draft, lines: [...mergedLines.entries()].map(([articleId, boxes]) => ({ articleId, boxes })) };
    if (cleanDraft.lines.length === 0) return notify("Añade al menos una línea de artículo al pedido.", "warning");
    const duplicate = data.orders.find((order) => order.reference && cleanDraft.reference && order.reference.toLowerCase() === cleanDraft.reference.toLowerCase() && order.id !== existingId);
    if (duplicate && !(await askConfirmation({
      title: "Referencia de cliente duplicada",
      message: `La referencia «${cleanDraft.reference}» ya está registrada en ${duplicate.id}.`,
      details: "Si continúas, los dos pedidos seguirán siendo independientes, pero compartirán la misma referencia.",
      confirmLabel: "Guardar igualmente",
      tone: "warning",
    }))) return;
    if (existingId) setData((current) => ({ ...current, orders: current.orders.map((order) => order.id === existingId ? { ...order, ...cleanDraft } : order), pallets: current.pallets.map((pallet) => pallet.orderId === existingId ? { ...pallet, customerId: cleanDraft.customerId } : pallet) }));
    else {
      const id = nextDocument("PED", data.orders.map((order) => order.id));
      setData((current) => ({ ...current, orders: [{ ...cleanDraft, id, createdAt: new Date().toISOString() }, ...current.orders] }));
    }
    setModal(null); notify(existingId ? "Pedido actualizado." : "Pedido creado y listo para preparar.");
  };

  const savePallet = async (draft: Omit<Pallet, "id" | "code" | "createdAt" | "labelRevision">) => {
    if (draft.orderId) {
      const order = data.orders.find((item) => item.id === draft.orderId);
      if (!order) return notify("El pedido seleccionado ya no está disponible. Vuelve a elegirlo.", "error");
      const boxesByArticle = new Map<string, number>();
      draft.lines.forEach((line) => boxesByArticle.set(line.articleId, (boxesByArticle.get(line.articleId) ?? 0) + line.boxes));
      const overages = [...boxesByArticle.entries()].flatMap(([articleId, palletBoxes]) => {
        const requested = order.lines.find((line) => line.articleId === articleId)?.boxes ?? 0;
        const alreadyAssigned = boxesForArticle(data.pallets, articleId, order.id);
        const totalAfter = alreadyAssigned + palletBoxes;
        if (totalAfter <= requested) return [];
        const article = data.articles.find((item) => item.id === articleId);
        return [{ label: `${article?.sku ?? articleId} · ${article?.name ?? "Artículo"}`, pending: Math.max(0, requested - alreadyAssigned), palletBoxes, excess: totalAfter - requested }];
      });
      if (overages.length && !(await askConfirmation({
        title: "Cajas por encima de lo pendiente",
        message: `El palet supera la cantidad que falta para completar el pedido ${order.id}. Si continúas, quedarán más cajas asignadas que las solicitadas.`,
        details: overages.map((item) => `${item.label}: ${num(item.pending)} pendientes · ${num(item.palletBoxes)} en este palet · ${num(item.excess)} por encima`).join("\n"),
        confirmLabel: "Asignar igualmente",
        tone: "warning",
      }))) return;
    }
    const id = makeId("pallet");
    const pallet: Pallet = { ...draft, id, code: nextDocument("PAL", data.pallets.map((item) => item.code)), createdAt: new Date().toISOString(), orderPalletNo: draft.orderId ? Math.max(0, ...data.pallets.filter((item) => item.orderId === draft.orderId).map((item) => item.orderPalletNo ?? 0)) + 1 : undefined, labelRevision: 1, sscc: makeSscc(data.settings.companyPrefix, nextSsccSerial(data.settings, data.pallets), data.settings.ssccExtension) };
    const movement: Movement = { id: makeId("mov"), date: new Date().toISOString(), kind: "FABRICACIÓN", palletId: id, orderId: pallet.orderId, summary: pallet.orderId ? "Palet confeccionado y reservado para pedido" : "Palet confeccionado y añadido a stock" };
    setData((current) => ({ ...current, pallets: [pallet, ...current.pallets], movements: [movement, ...current.movements] }));
    setModal({ kind: "label", id }); notify(`${pallet.code} creado · revisión 01. Etiqueta lista para imprimir.`);
  };

  const savePalletEdit = (pallet: Pallet, changes: { typeId: string; location: string; notes: string; lines: Pallet["lines"] }) => {
    if (pallet.status !== "DISPONIBLE" && pallet.status !== "RESERVADO") return notify("Solo se pueden editar palets disponibles o reservados.", "warning");
    const signature = (lines: Pallet["lines"]) => JSON.stringify(lines.map((line) => [line.id, line.lot.trim(), line.expiry ?? "", line.boxes]));
    const lines = changes.lines.map((line) => ({ ...line, lot: line.lot.trim() }));
    const contentChanged = signature(lines) !== signature(pallet.lines);
    const movement: Movement = { id: makeId("mov"), date: new Date().toISOString(), kind: "AJUSTE", palletId: pallet.id, orderId: pallet.orderId, summary: contentChanged ? "Contenido del palet modificado · etiqueta revisada" : "Datos del palet modificados" };
    setData((current) => ({
      ...current,
      pallets: current.pallets.map((item) => item.id === pallet.id ? { ...item, typeId: changes.typeId, location: changes.location, notes: changes.notes.trim() || undefined, lines, labelRevision: contentChanged ? item.labelRevision + 1 : item.labelRevision } : item),
      movements: [movement, ...current.movements],
    }));
    setModal({ kind: "pallet-detail", id: pallet.id });
    notify(contentChanged ? `${pallet.code} actualizado · nueva revisión de etiqueta.` : `${pallet.code} actualizado.`);
  };

  const deletePallet = async (pallet: Pallet) => {
    const inLoad = data.loads.some((load) => load.palletIds.includes(pallet.id));
    if (inLoad || pallet.status === "EN_CARGA" || pallet.status === "EXPEDIDO") return notify("Este palet está en una carga o ya salió, y no se puede eliminar. Quítalo antes de la carga.", "warning");
    if (!(await askConfirmation({ title: "Eliminar palet", message: `¿Quieres eliminar ${pallet.code}?`, details: "Se borrará el palet y su historial de movimientos. Esta acción no se puede deshacer.", confirmLabel: "Eliminar palet", tone: "danger" }))) return;
    setData((current) => ({ ...current, pallets: current.pallets.filter((item) => item.id !== pallet.id), movements: current.movements.filter((event) => event.palletId !== pallet.id) }));
    setModal(null);
    notify(`${pallet.code} eliminado.`);
  };

  const deleteOrder = async (order: Order) => {
    const related = data.pallets.filter((pallet) => pallet.orderId === order.id);
    const blocked = related.some((pallet) => pallet.status === "EN_CARGA" || pallet.status === "EXPEDIDO" || data.loads.some((load) => load.palletIds.includes(pallet.id)));
    if (blocked) return notify("Este pedido tiene palets en una carga o ya expedidos, y no se puede eliminar.", "warning");
    if (!(await askConfirmation({ title: "Eliminar pedido", message: `¿Quieres eliminar ${order.id}?`, details: related.length ? `${related.length} palets asignados quedarán libres en el stock. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer.", confirmLabel: "Eliminar pedido", tone: "danger" }))) return;
    const date = new Date().toISOString();
    const released: Movement[] = related.map((pallet) => ({ id: makeId("mov"), date, kind: "LIBERACIÓN", palletId: pallet.id, summary: `Liberado al eliminar el pedido ${order.id}` }));
    setData((current) => ({
      ...current,
      orders: current.orders.filter((item) => item.id !== order.id),
      pallets: current.pallets.map((pallet) => pallet.orderId === order.id ? { ...pallet, orderId: undefined, customerId: undefined, orderPalletNo: undefined, status: pallet.status === "RESERVADO" ? "DISPONIBLE" : pallet.status } : pallet),
      movements: [...released, ...current.movements],
    }));
    setModal(null);
    notify(`${order.id} eliminado.`);
  };

  const saveExtraction = async (sourceId: string, result: { lineId: string; boxes: number; targetPalletId: string; orderId: string; location: string }) => {
    const source = data.pallets.find((item) => item.id === sourceId);
    const sourceLine = source?.lines.find((line) => line.id === result.lineId);
    if (!source || !sourceLine || result.boxes <= 0 || result.boxes > sourceLine.boxes || source.status !== "DISPONIBLE") return notify("El palet ya no tiene esa cantidad disponible para extraer.", "error");
    let target = result.targetPalletId ? data.pallets.find((item) => item.id === result.targetPalletId) : undefined;
    if (result.targetPalletId && (!target || !["DISPONIBLE", "RESERVADO"].includes(target.status))) return notify("El palet de destino ya no está disponible.", "error");
    if (target?.orderId && result.orderId && target.orderId !== result.orderId) return notify("El palet de destino está reservado para otro pedido.", "warning");
    const targetOrderId = target?.orderId || result.orderId || undefined;
    const order = data.orders.find((item) => item.id === targetOrderId);
    const nextOrderPalletNo = targetOrderId ? (target?.orderPalletNo ?? Math.max(0, ...data.pallets.filter((item) => item.orderId === targetOrderId && item.id !== target?.id).map((item) => item.orderPalletNo ?? 0)) + 1) : undefined;
    const ordered = order?.lines.find((item) => item.articleId === sourceLine.articleId)?.boxes ?? 0;
    const alreadyAssigned = targetOrderId ? boxesForArticle(data.pallets, sourceLine.articleId, targetOrderId) : 0;
    const transferWithinSameOrder = source.orderId === targetOrderId ? result.boxes : 0;
    const projectedBoxes = alreadyAssigned - transferWithinSameOrder + result.boxes;
    if (order && targetOrderId && projectedBoxes > ordered && !(await askConfirmation({
      title: "La consolidación supera el pedido",
      message: `Las cajas que vas a añadir superan las solicitadas para ${order.id}.`,
      details: `${articleName(data, sourceLine.articleId)}: ${num(Math.max(0, ordered - alreadyAssigned))} pendientes · ${num(result.boxes)} a consolidar · ${num(projectedBoxes - ordered)} por encima.`,
      confirmLabel: "Consolidar igualmente",
      tone: "warning",
    }))) return;
    const remaining = sourceLine.boxes - result.boxes;
    const sourceLines = source.lines.map((line) => line.id === result.lineId ? { ...line, boxes: remaining } : line).filter((line) => line.boxes > 0);
    const sourceUpdated: Pallet = { ...source, status: sourceLines.length ? source.status : "AGOTADO", statusBeforeLoad: undefined, labelRevision: source.labelRevision + 1, lines: sourceLines };
    if (!target) {
      const targetId = makeId("pallet");
      target = { id: targetId, code: nextDocument("PAL", data.pallets.map((item) => item.code)), createdAt: new Date().toISOString(), typeId: source.typeId, location: result.location, orderId: targetOrderId, customerId: targetOrderId ? order?.customerId : undefined, orderPalletNo: nextOrderPalletNo, status: targetOrderId ? "RESERVADO" : "DISPONIBLE", labelRevision: 1, sscc: makeSscc(data.settings.companyPrefix, nextSsccSerial(data.settings, data.pallets), data.settings.ssccExtension), notes: "Palet mixto por consolidación de cajas", lines: [] };
    }
    const carried: PalletLine = { ...sourceLine, id: makeId("lin"), boxes: result.boxes, sourcePalletId: source.id };
    const consolidatedLines = [...target.lines, carried];
    const targetType = data.palletTypes.find((item) => item.id === target?.typeId);
    const consolidatedWeight = netWeight(consolidatedLines, data) + (targetType?.tareKg ?? 0);
    if (targetType && consolidatedWeight > targetType.maxWeightKg && !(await askConfirmation({
      title: "Se supera el peso máximo del palet",
      message: "La consolidación dejará el palet por encima del peso bruto configurado para su tipo.",
      details: `Peso resultante: ${kg(consolidatedWeight)} · máximo del tipo: ${kg(targetType.maxWeightKg)}.`,
      confirmLabel: "Consolidar igualmente",
      tone: "warning",
    }))) return;
    const targetUpdated: Pallet = { ...target, orderId: targetOrderId ?? target.orderId, customerId: targetOrderId ? order?.customerId : target.customerId, orderPalletNo: nextOrderPalletNo, status: targetOrderId ? "RESERVADO" : target.status, labelRevision: result.targetPalletId ? target.labelRevision + 1 : target.labelRevision, lines: [...target.lines, carried] };
    const extraction: Movement = { id: makeId("mov"), date: new Date().toISOString(), kind: "EXTRACCIÓN", palletId: source.id, relatedPalletId: target.id, orderId: targetOrderId, summary: `${result.boxes} cajas de ${articleName(data, sourceLine.articleId)} · lote ${sourceLine.lot}` };
    const consolidation: Movement = { id: makeId("mov"), date: new Date().toISOString(), kind: "CONSOLIDACIÓN", palletId: target.id, relatedPalletId: source.id, orderId: targetOrderId, summary: `${result.boxes} cajas incorporadas desde ${source.code} · lote ${sourceLine.lot}` };
    setData((current) => ({ ...current, pallets: [sourceUpdated, ...(result.targetPalletId ? current.pallets.filter((item) => item.id !== target?.id) : current.pallets), targetUpdated], movements: [extraction, consolidation, ...current.movements] }));
    setModal({ kind: "label", id: source.id }); notify(`Extracción registrada. ${source.code} queda en revisión ${String(sourceUpdated.labelRevision).padStart(2, "0")}; etiqueta actualizada.`);
  };

  const saveLoad = (draft: { orderId: string; carrierId: string; vehicleId: string; dock: string; departureAt: string; notes: string }) => {
    const occupied = data.loads.filter((load) => load.status === "BORRADOR").flatMap((load) => load.palletIds);
    const orderPallets = draft.orderId ? data.pallets.filter((pallet) => pallet.orderId === draft.orderId && ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0 && !occupied.includes(pallet.id)) : [];
    if (draft.orderId && !orderPallets.length) return notify("Ese pedido no tiene palets disponibles. Puedes preparar una carga manual.", "warning");
    const id = makeId("load"); const code = nextDocument("CAR", data.loads.map((load) => load.code));
    const load: Load = { id, code, customerId: draft.orderId ? data.orders.find((order) => order.id === draft.orderId)?.customerId : undefined, carrierId: draft.carrierId || undefined, vehicleId: draft.vehicleId || undefined, dock: draft.dock, departureAt: draft.departureAt, notes: draft.notes, palletIds: orderPallets.map((pallet) => pallet.id), status: "BORRADOR", createdAt: new Date().toISOString() };
    const loadEvents: Movement[] = orderPallets.map((pallet) => ({ id: makeId("mov"), date: new Date().toISOString(), kind: "CARGA", palletId: pallet.id, orderId: pallet.orderId, summary: `${pallet.code} reservado para ${code} · ${draft.dock || "sin muelle"}` }));
    setData((current) => ({ ...current, loads: [load, ...current.loads], pallets: current.pallets.map((pallet) => orderPallets.some((loaded) => loaded.id === pallet.id) ? { ...pallet, statusBeforeLoad: pallet.status, status: "EN_CARGA" } : pallet), movements: [...loadEvents, ...current.movements] })); setSelectedLoadId(id); setModal(null); setView("cargas"); notify(orderPallets.length ? `${code} creada con ${orderPallets.length} palets del pedido.` : `${code} creada. Añade palets manualmente.`);
  };

  const addPalletsToLoad = (loadId: string, palletIds: string[]) => {
    const load = data.loads.find((item) => item.id === loadId);
    if (!load || load.status !== "BORRADOR") return;
    const takenElsewhere = data.loads.filter((item) => item.status === "BORRADOR" && item.id !== loadId).flatMap((item) => item.palletIds);
    const eligible = palletIds.filter((id) => !load.palletIds.includes(id) && !takenElsewhere.includes(id) && data.pallets.some((pallet) => pallet.id === id && ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0));
    if (!eligible.length) return notify("No hay palets disponibles nuevos para añadir.", "warning");
    const addEvents: Movement[] = eligible.map((palletId) => { const pallet = data.pallets.find((item) => item.id === palletId); return { id: makeId("mov"), date: new Date().toISOString(), kind: "CARGA" as const, palletId, orderId: pallet?.orderId, summary: `${pallet?.code ?? palletId} añadido a ${load.code} · ${load.dock || "sin muelle"}` }; });
    setData((current) => ({ ...current, loads: current.loads.map((item) => item.id === loadId ? { ...item, palletIds: [...item.palletIds, ...eligible] } : item), pallets: current.pallets.map((pallet) => eligible.includes(pallet.id) ? { ...pallet, statusBeforeLoad: pallet.status, status: "EN_CARGA" } : pallet), movements: [...addEvents, ...current.movements] }));
    notify(`${eligible.length} ${eligible.length === 1 ? "palet añadido" : "palets añadidos"} a ${load.code}.`);
  };

  const updateLoad = (loadId: string, patch: Partial<Load>) => setData((current) => ({ ...current, loads: current.loads.map((item) => item.id === loadId ? { ...item, ...patch } : item) }));

  const deleteLoad = async (load: Load) => {
    if (load.status !== "BORRADOR") return notify("Una carga cerrada no se puede eliminar porque sus palets ya salieron.", "warning");
    if (!(await askConfirmation({ title: "Eliminar carga", message: `¿Quieres eliminar ${load.code}?`, details: load.palletIds.length ? `${load.palletIds.length} palets volverán a estar disponibles. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer.", confirmLabel: "Eliminar carga", tone: "danger" }))) return;
    const date = new Date().toISOString();
    const released: Movement[] = load.palletIds.map((palletId) => ({ id: makeId("mov"), date, kind: "LIBERACIÓN", palletId, summary: `Liberado al eliminar ${load.code}` }));
    setData((current) => {
      const stillInDraft = (palletId: string) => current.loads.some((item) => item.id !== load.id && item.status === "BORRADOR" && item.palletIds.includes(palletId));
      return {
        ...current,
        loads: current.loads.filter((item) => item.id !== load.id),
        pallets: current.pallets.map((pallet) => load.palletIds.includes(pallet.id) && pallet.status === "EN_CARGA" && !stillInDraft(pallet.id) ? { ...pallet, status: pallet.statusBeforeLoad ?? (pallet.orderId || pallet.customerId ? "RESERVADO" : "DISPONIBLE"), statusBeforeLoad: undefined } : pallet),
        movements: [...released, ...current.movements],
      };
    });
    setSelectedLoadId(null);
    notify(`${load.code} eliminada.`);
  };

  const removePalletFromLoad = (loadId: string, palletId: string) => setData((current) => {
    const load = current.loads.find((item) => item.id === loadId);
    if (!load || load.status !== "BORRADOR" || !load.palletIds.includes(palletId)) return current;
    const stillInDraft = current.loads.some((item) => item.id !== loadId && item.status === "BORRADOR" && item.palletIds.includes(palletId));
    return { ...current, loads: current.loads.map((item) => item.id === loadId ? { ...item, palletIds: item.palletIds.filter((id) => id !== palletId) } : item), pallets: current.pallets.map((pallet) => {
      if (pallet.id !== palletId) return pallet;
      if (stillInDraft) return { ...pallet, status: pallet.status === "EN_CARGA" ? "EN_CARGA" : pallet.status };
      return { ...pallet, status: pallet.status === "EN_CARGA" ? pallet.statusBeforeLoad ?? (pallet.orderId || pallet.customerId ? "RESERVADO" : "DISPONIBLE") : pallet.status, statusBeforeLoad: undefined };
    }) };
  });
  const movePallet = (loadId: string, index: number, offset: number) => setData((current) => ({ ...current, loads: current.loads.map((load) => { if (load.id !== loadId) return load; const next = [...load.palletIds]; const target = index + offset; if (target < 0 || target >= next.length) return load; [next[index], next[target]] = [next[target], next[index]]; return { ...load, palletIds: next }; }) }));

  const closeLoad = async (load: Load) => {
    if (load.status !== "BORRADOR") return notify("Esta carga ya está cerrada.", "warning");
    if (!load.palletIds.length) return notify("Añade al menos un palet antes de cerrar la carga.", "warning");
    const pallets = load.palletIds.map((id) => data.pallets.find((item) => item.id === id)).filter((item): item is Pallet => Boolean(item));
    if (pallets.length !== load.palletIds.length || pallets.some((pallet) => pallet.status !== "EN_CARGA" || pallet.lines.length === 0)) return notify("La carga contiene un palet vacío, no disponible o ya asignado a otra operación. Retíralo y revisa la carga.", "error");
    const vehicle = data.vehicles.find((item) => item.id === load.vehicleId);
    const validation = validateLoad(pallets, data, vehicle?.maxWeightKg);
    if (validation.errors.length) return notify(`No se puede cerrar: ${validation.errors[0]}`, "error");
    if (validation.warnings.length && !(await askConfirmation({ title: "Revisión de expedición", message: validation.warnings.join(" "), details: "Puedes continuar si el responsable de expedición ha comprobado estas advertencias.", confirmLabel: "Continuar", tone: "warning" }))) return;
    const totalWeight = loadWeight(pallets, data);
    if (vehicle && totalWeight > vehicle.maxWeightKg && !(await askConfirmation({
      title: "La carga supera el límite del vehículo",
      message: `El peso previsto para ${load.code} supera la capacidad configurada de ${vehicle.plate}.`,
      details: `Peso de la carga: ${kg(totalWeight)} · máximo del vehículo: ${kg(vehicle.maxWeightKg)}.`,
      confirmLabel: "Cerrar carga igualmente",
      tone: "warning",
    }))) return;
    const affectedOrders = [...new Set(pallets.map((pallet) => pallet.orderId).filter((id): id is string => Boolean(id)))].map((id) => data.orders.find((order) => order.id === id)).filter((order): order is Order => Boolean(order));
    const shippedPallets = data.pallets.filter((pallet) => pallet.status === "EXPEDIDO");
    const partial = affectedOrders.filter((order) => order.lines.some((line) => {
      const alreadyShipped = boxesForArticle(shippedPallets, line.articleId, order.id);
      const inThisLoad = pallets.filter((pallet) => pallet.orderId === order.id).reduce((sum, pallet) => sum + pallet.lines.filter((item) => item.articleId === line.articleId).reduce((boxes, item) => boxes + item.boxes, 0), 0);
      return Math.min(line.boxes, alreadyShipped + inThisLoad) < line.boxes;
    }));
    if (partial.length) {
      const pendingByOrder = partial.map((order) => {
        const pending = order.lines.reduce((sum, line) => {
          const shipped = boxesForArticle(shippedPallets, line.articleId, order.id);
          const inThisLoad = pallets.filter((pallet) => pallet.orderId === order.id).reduce((boxes, pallet) => boxes + pallet.lines.filter((item) => item.articleId === line.articleId).reduce((total, item) => total + item.boxes, 0), 0);
          return sum + Math.max(0, line.boxes - shipped - inThisLoad);
        }, 0);
        return `${order.id}: ${num(pending)} cajas seguirán pendientes`;
      }).join("\n");
      if (!(await askConfirmation({
        title: "Expedición parcial",
        message: "La carga solo expedirá los palets incluidos; no completará todos los pedidos asociados.",
        details: `${pendingByOrder}\nLos pedidos permanecerán parcialmente expedidos hasta preparar otra carga con el resto.`,
        confirmLabel: "Confirmar expedición parcial",
        tone: "warning",
      }))) return;
    }
    const now = new Date().toISOString();
    const events: Movement[] = pallets.map((pallet) => ({ id: makeId("mov"), date: now, kind: "EXPEDICIÓN", palletId: pallet.id, orderId: pallet.orderId, summary: `Expedido en ${load.code} · posición ${load.palletIds.indexOf(pallet.id) + 1}` }));
    const closeEvent: Movement = { id: makeId("mov"), date: now, kind: "CIERRE_CARGA", palletId: pallets[0].id, summary: `${load.code} cerrada · ${pallets.length} palets · ${kg(totalWeight)}` };
    setData((current) => ({ ...current, pallets: current.pallets.map((pallet) => load.palletIds.includes(pallet.id) ? { ...pallet, status: "EXPEDIDO", statusBeforeLoad: undefined } : pallet), loads: current.loads.map((item) => item.id === load.id ? { ...item, status: "CERRADA", closedAt: now, loadingCompletedAt: now } : item), movements: [closeEvent, ...events, ...current.movements], audit: [{ id: makeId("audit"), at: now, actorId: current.settings.currentUserId, action: "CIERRE_EXPEDICION", entity: "load", entityId: load.id, summary: `${load.code} expedida con ${pallets.length} palets · ${kg(totalWeight)}` }, ...current.audit] }));
    notify(`${load.code} cerrada. Palets expedidos y trazabilidad guardada.`);
  };

  const addArticle = (draft: Omit<Article, "id">, id?: string) => {
    if (data.articles.some((item) => item.sku.toLowerCase() === draft.sku.toLowerCase() && item.id !== id)) return notify("Ya existe un artículo con ese SKU.", "warning");
    const item = { ...draft, id: id ?? makeId("art") };
    setData((current) => ({ ...current, articles: id ? current.articles.map((article) => article.id === id ? item : article) : [item, ...current.articles] })); setModal(null); notify(id ? "Artículo actualizado." : "Artículo guardado para futuros pedidos.");
  };
  const addCustomer = (draft: Omit<Customer, "id">, id?: string) => {
    if (data.customers.some((item) => item.code.toLowerCase() === draft.code.toLowerCase() && item.id !== id)) return notify("Ya existe un cliente con ese código.", "warning");
    const item = { ...draft, id: id ?? makeId("cli") };
    setData((current) => ({ ...current, customers: id ? current.customers.map((customer) => customer.id === id ? item : customer) : [item, ...current.customers] })); setModal(null); notify(id ? "Cliente actualizado." : "Cliente guardado para futuros pedidos.");
  };
  const addCarrier = (draft: Omit<Carrier, "id">, id?: string) => { const item = { ...draft, id: id ?? makeId("carrier") }; setData((current) => ({ ...current, carriers: id ? current.carriers.map((carrier) => carrier.id === id ? item : carrier) : [item, ...current.carriers] })); setModal(null); notify(id ? "Transportista actualizado." : "Transportista guardado."); };
  const addVehicle = (draft: { carrierId: string; plate: string; maxWeightKg: number }) => { if (data.vehicles.some((vehicle) => vehicle.plate.toLowerCase() === draft.plate.toLowerCase())) return notify("Esa matrícula ya está registrada.", "warning"); setData((current) => ({ ...current, vehicles: [{ ...draft, id: makeId("vehicle") }, ...current.vehicles] })); setModal(null); notify("Vehículo guardado para las salidas."); };
  const addPalletType = (draft: Omit<PalletType, "id">, id?: string) => { const item = { ...draft, id: id ?? makeId("type") }; setData((current) => ({ ...current, palletTypes: id ? current.palletTypes.map((type) => type.id === id ? item : type) : [item, ...current.palletTypes] })); setModal(null); notify(id ? "Tipo de palet actualizado." : "Tipo de palet guardado."); };

  const deleteArticle = async (item: Article) => {
    const used = data.orders.some((order) => order.lines.some((line) => line.articleId === item.id)) || data.pallets.some((pallet) => pallet.lines.some((line) => line.articleId === item.id));
    if (used) return notify("Este artículo ya tiene historial. Desactívalo en lugar de borrarlo.", "warning");
    if (await askConfirmation({ title: "Eliminar artículo", message: `¿Quieres eliminar ${item.sku} · ${item.name}?`, details: "Esta acción no se puede deshacer.", confirmLabel: "Eliminar artículo", tone: "danger" })) {
      setData((current) => ({ ...current, articles: current.articles.filter((article) => article.id !== item.id) }));
    }
  };
  const deleteCustomer = async (item: Customer) => {
    if (data.orders.some((order) => order.customerId === item.id) || data.pallets.some((pallet) => pallet.customerId === item.id)) return notify("Este cliente está vinculado a pedidos o palets y no se puede eliminar.", "warning");
    if (await askConfirmation({ title: "Eliminar cliente", message: `¿Quieres eliminar a ${item.name}?`, details: "Esta acción no se puede deshacer.", confirmLabel: "Eliminar cliente", tone: "danger" })) {
      setData((current) => ({ ...current, customers: current.customers.filter((customer) => customer.id !== item.id) }));
    }
  };
  const handleImport = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importData(file);
      if (!(await askConfirmation({ title: "Restaurar copia de seguridad", message: "La copia seleccionada sustituirá todos los datos guardados en este navegador.", details: "Exporta primero una copia actual si quieres poder recuperar los datos que ya tienes.", confirmLabel: "Sustituir datos", tone: "warning" }))) return;
      setData(imported);
      notify("Copia de seguridad restaurada.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo leer el archivo.", "error");
    }
  };
  const handleExport = async () => {
    const result = await exportData(data);
    if (result === "saved") notify("Copia guardada en la ubicación elegida.");
    else if (result === "downloaded") notify("Copia descargada. Búscala en Archivos o Descargas.");
  };

  const title = NAV.find((item) => item.id === view)?.label ?? "Inicio";
  const readyOrders = data.orders.filter((order) => !["Expedido"].includes(orderStatus(order, data).label));
  const pendingBoxes = readyOrders.reduce((sum, order) => sum + order.lines.reduce((subtotal, line) => subtotal + Math.max(0, line.boxes - progressForLine(line, data.pallets, order.id)), 0), 0);
  const dueOrders = [...readyOrders].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)).slice(0, 5);
  const dashboard = <>
    <PageTitle eyebrow="VISTA GENERAL · OPERACIONES" title="Control de expedición" description="Pedidos, palets y salidas de un vistazo." actions={<><button className="button secondary" aria-label="Nuevo palet" title="Nuevo palet" onClick={() => openPalletModal()}><Package size={16} /> Nuevo palet</button><button className="button primary" aria-label="Preparar salida" title="Preparar salida" onClick={() => setModal({ kind: "load" })}><Plus size={16} /> Preparar salida</button></>} />
    <div className="metric-grid"><Metric label="Pedidos activos" value={readyOrders.length.toString().padStart(2, "0")} detail="Pendientes de expedir" icon={FileText} accent="coral" /><Metric label="Cajas por preparar" value={num(pendingBoxes)} detail="En pedidos abiertos" icon={Boxes} accent="blue" /><Metric label="Palets en cámara" value={num(data.pallets.filter((pallet) => ["DISPONIBLE", "RESERVADO"].includes(pallet.status)).length)} detail={`${num(data.pallets.filter((pallet) => pallet.status === "DISPONIBLE").length)} disponibles · ${num(data.pallets.filter((pallet) => pallet.status === "RESERVADO").length)} reservados`} icon={Package} accent="green" /><Metric label="Salidas preparadas" value={num(data.loads.filter((load) => load.status === "BORRADOR").length)} detail={`${num(data.loads.filter((load) => load.status === "CERRADA").length)} expedidas históricamente`} icon={Truck} accent="violet" /></div>
    <div className="dashboard-grid"><section className="panel orders-panel"><div className="panel-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Pedidos próximos</h2></div><button className="text-button" onClick={() => setView("pedidos")}>Ver todos <ArrowRight size={15} /></button></div>
      {dueOrders.length ? <div className="dashboard-order-list">{dueOrders.map((order) => { const status = orderStatus(order, data); const customer = data.customers.find((item) => item.id === order.customerId); const total = order.lines.reduce((sum, line) => sum + line.boxes, 0); const assigned = order.lines.reduce((sum, line) => sum + progressForLine(line, data.pallets, order.id), 0); const due = relativeDate(order.deliveryDate); return <button className="dashboard-order" key={order.id} onClick={() => setModal({ kind: "order-detail", id: order.id })}><div className="order-marker" /><div className="order-main"><div className="order-id-row"><strong>{order.id}</strong><Status label={status.label} tone={status.tone} />{order.priority !== "Normal" && <span className={`priority ${order.priority.toLowerCase()}`}>{order.priority}</span>}</div><span>{customer?.name ?? "Cliente no disponible"} · {order.lines.length} artículos</span><div className="order-progress-row"><Progress value={status.percent} /><small>{num(assigned)} / {num(total)} cajas</small></div></div><div className={`due-date ${due === "Hoy" || due.startsWith("Hace") ? "due-now" : ""}`}><CalendarDays size={14} />{due}<small>{dateText(order.deliveryDate)}</small></div><ChevronRight size={17} className="row-chevron" /></button>; })}</div> : <EmptyState icon={FileText} title="Sin pedidos pendientes" detail="Crea un pedido para iniciar la preparación." action={<button className="button primary" onClick={() => setModal({ kind: "order" })}>Crear pedido</button>} />}
      <div className="panel-foot"><span><span className="live-dot" /> Datos guardados en este equipo</span><span>{saved ? "Sincronizado" : "Guardando…"}</span></div>
    </section><aside className="panel side-panel"><div className="panel-heading"><div><div className="eyebrow">EN PLANTA</div><h2>Actividad reciente</h2></div><Activity size={17} className="muted-icon" /></div>
      <div className="activity-list">{data.movements.slice(0, 5).map((event) => { const pallet = data.pallets.find((item) => item.id === event.palletId); return <div className="activity-item" key={event.id}><div className={`activity-icon ${event.kind === "EXPEDICIÓN" ? "activity-blue" : event.kind === "EXTRACCIÓN" ? "activity-amber" : ""}`}>{event.kind === "EXPEDICIÓN" ? <Truck size={14} /> : event.kind === "EXTRACCIÓN" ? <ArrowDown size={14} /> : <Package size={14} />}</div><div><strong>{movementLabels[event.kind]}</strong><span>{pallet?.code ?? "Palet"} · {event.summary}</span><small>{dateTimeText(event.date)}</small></div></div>; })}{!data.movements.length && <p className="muted-copy">Las operaciones aparecerán aquí.</p>}</div>
      <div className="trace-note"><ShieldCheck size={17} /><div><strong>Trazabilidad activa</strong><span>Cada caja conserva su lote desde el palet de origen hasta la expedición.</span></div></div>
    </aside></div>
    <div className="quick-actions"><div><div className="eyebrow">ACCESOS RÁPIDOS</div><strong>¿Qué necesitas hacer?</strong></div><button onClick={() => setModal({ kind: "order" })}><FileText size={17} /><span>Crear pedido</span><ChevronRight size={15} /></button><button onClick={() => openPalletModal()}><Package size={17} /><span>Confeccionar palet</span><ChevronRight size={15} /></button><button onClick={() => setView("palets")}><Barcode size={17} /><span>Buscar un palet</span><ChevronRight size={15} /></button><button onClick={() => setView("operario")}><ScanLine size={17} /><span>Modo operario</span><ChevronRight size={15} /></button></div>
  </>;

  const ordersPage = <>
    <PageTitle eyebrow="VENTAS · PREPARACIÓN" title="Pedidos" description="Controla cantidades, fechas de entrega y progreso de preparación." actions={<button className="button primary" onClick={() => setModal({ kind: "order" })}><Plus size={16} /> Nuevo pedido</button>} />
    <div className="table-toolbar"><div className="table-count"><strong>{data.orders.length}</strong> pedidos en total</div><div className="toolbar-filters"><span className="filter-label"><span className="live-dot" /> {readyOrders.length} por servir</span></div></div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Pedido</th><th>Cliente / entrega</th><th>Fecha</th><th>Preparación</th><th>Artículos</th><th>Estado</th><th></th></tr></thead><tbody>{data.orders.filter((order) => searchMatch(`${order.id} ${order.reference} ${customerName(data, order.customerId)}`)).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)).map((order) => { const status = orderStatus(order, data); const total = orderBoxes(order); const assigned = order.lines.reduce((sum, line) => sum + progressForLine(line, data.pallets, order.id), 0); const customer = data.customers.find((item) => item.id === order.customerId); return <tr key={order.id} className="clickable-row" onClick={() => setModal({ kind: "order-detail", id: order.id })}><td><span className="primary-code">{order.id}</span>{order.reference && <small className="cell-sub">Ref. {order.reference}</small>}</td><td><strong>{customer?.name ?? "—"}</strong><small className="cell-sub">{order.deliveryAddress}</small></td><td><span className={`delivery-date ${relativeDate(order.deliveryDate) === "Hoy" ? "due-now" : ""}`}>{dateText(order.deliveryDate)}</span><small className="cell-sub">{relativeDate(order.deliveryDate)}</small></td><td><div className="table-progress"><Progress value={status.percent} /><small>{num(assigned)} / {num(total)} cajas</small></div></td><td>{order.lines.length} referencias</td><td><Status label={status.label} tone={status.tone} /></td><td><button className="icon-button" aria-label="Abrir pedido" onClick={(event) => { event.stopPropagation(); setModal({ kind: "order-detail", id: order.id }); }}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table>{!data.orders.length && <EmptyState icon={FileText} title="Todavía no hay pedidos" detail="Crea el primer pedido y empieza a asignar palets." action={<button className="button primary" onClick={() => setModal({ kind: "order" })}>Crear pedido</button>} />}{data.orders.length > 0 && !data.orders.some((order) => searchMatch(`${order.id} ${order.reference} ${customerName(data, order.customerId)}`)) && <EmptyState icon={Search} title="No hay resultados" detail="Prueba con otro número o cliente." />}</div>
    <div className="bottom-hint"><ShieldCheck size={16} /> Las cajas asignadas a palets se descuentan automáticamente del pendiente de cada pedido.</div>
  </>;

  const visiblePallets = data.pallets.filter((pallet) => (palletFilter === "Todos" || pallet.status === palletFilter) && searchMatch(`${pallet.code} ${pallet.lines.map((line) => `${articleName(data, line.articleId)} ${line.lot}`).join(" ")} ${customerName(data, data.orders.find((order) => order.id === pallet.orderId)?.customerId ?? pallet.customerId)} ${pallet.location}`)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const palletsPage = <>
    <PageTitle eyebrow="ALMACÉN · UNIDADES LOGÍSTICAS" title="Palets" description="Cada palet conserva su contenido, lote, destino y etiqueta vigente." actions={<button className="button primary" onClick={() => openPalletModal()}><Plus size={16} /> Confeccionar palet</button>} />
    <div className="pallet-summary-strip"><div><Package size={18} /><strong>{num(data.pallets.filter((item) => item.status !== "EXPEDIDO" && item.status !== "AGOTADO").length)}</strong><span>palets en planta</span></div><i /><div><span className="state-dot available" /><strong>{num(data.pallets.filter((item) => item.status === "DISPONIBLE").length)}</strong><span>disponibles</span></div><i /><div><span className="state-dot reserved" /><strong>{num(data.pallets.filter((item) => item.status === "RESERVADO").length)}</strong><span>reservados a pedido</span></div><i /><div><LayersIcon /><strong>{num(data.pallets.filter(palletIsMixed).length)}</strong><span>mixtos</span></div></div>
    <div className="table-toolbar pallet-toolbar"><div className="filter-pills">{["Todos", "DISPONIBLE", "RESERVADO", "EN_CARGA", "EXPEDIDO", "BLOQUEADO", "AGOTADO"].map((filter) => <button key={filter} className={palletFilter === filter ? "selected" : ""} onClick={() => setPalletFilter(filter)}>{filter === "Todos" ? "Todos" : filter === "DISPONIBLE" ? "Disponibles" : filter === "RESERVADO" ? "Reservados" : filter === "EN_CARGA" ? "En carga" : filter === "EXPEDIDO" ? "Expedidos" : filter === "BLOQUEADO" ? "Bloqueados" : "Agotados"}</button>)}</div><span className="table-count">{visiblePallets.length} palets</span></div>
    {visiblePallets.length ? <div className="pallet-grid">{visiblePallets.map((pallet) => { const order = data.orders.find((item) => item.id === pallet.orderId); const type = data.palletTypes.find((item) => item.id === pallet.typeId); const status = PALLET_STATUS_META[pallet.status]; return <article className="pallet-card" key={pallet.id}><div className="pallet-card-top"><span className="pallet-icon"><Package size={20} /></span><div className="pallet-card-id"><strong>{pallet.code}</strong><small>{type?.name ?? "Palet"}{order ? ` · Pedido ${String(pallet.orderPalletNo ?? 1).padStart(2, "0")}` : ""}</small></div><button className="icon-button" onClick={() => setModal({ kind: "pallet-detail", id: pallet.id })} aria-label="Opciones de palet"><MoreHorizontal size={18} /></button></div><div className="pallet-card-tags"><Status label={status.label} tone={status.tone} />{palletIsMixed(pallet) && <span className="mixed-tag">MIXTO</span>}<span className="revision-tag">REV {String(pallet.labelRevision).padStart(2, "0")}</span></div><div className="pallet-card-content">{pallet.lines.slice(0, 3).map((line) => <div className="pallet-card-line" key={line.id}><span>{data.articles.find((item) => item.id === line.articleId)?.name ?? "Artículo"}</span><strong>{num(line.boxes)} cajas</strong></div>)}{pallet.lines.length > 3 && <small className="cell-sub">+{pallet.lines.length - 3} referencias más</small>}{!pallet.lines.length && <small className="cell-sub">Sin cajas disponibles</small>}</div><div className="pallet-card-destination"><MapPin size={13} /><span>{order ? `${order.id} · ${customerName(data, order.customerId)}` : customerName(data, pallet.customerId)}</span></div><div className="pallet-fill"><div className="pallet-fill-row"><strong>{num(sumBoxes(pallet.lines))} {boxUnit(pallet)}</strong><span>{kg(palletWeight(pallet, data))} bruto</span></div></div><div className="pallet-card-footer"><span><MapPin size={12} />{pallet.location}</span><span className="mono">SSCC {pallet.sscc ? ssccHuman(pallet.sscc) : "—"}</span><button className="text-button" onClick={() => setModal({ kind: "label", id: pallet.id })}><Printer size={14} /> Etiqueta</button></div></article>; })}</div> : <EmptyState icon={Package} title="No hay palets con este filtro" detail="Cambia el filtro o confecciona un palet nuevo." action={<button className="button primary" onClick={() => openPalletModal()}>Confeccionar palet</button>} />}
    <div className="bottom-hint"><Barcode size={16} /> Imprime la etiqueta al terminar cada confección. Si extraes cajas, el sistema incrementa la revisión del palet de origen.</div>
  </>;

  const loadsPage = <>
    <PageTitle eyebrow="LOGÍSTICA · EXPEDICIONES" title="Cargas" description="Prepara el orden de entrada al camión y genera el packing list." actions={<button className="button primary" onClick={() => setModal({ kind: "load" })}><Plus size={16} /> Nueva carga</button>} />
    {!selectedLoadId || !activeLoad ? <>
      <div className="table-toolbar"><div className="table-count"><strong>{data.loads.length}</strong> cargas registradas</div><div className="toolbar-filters"><span className="filter-label"><span className="load-status-dot" /> {data.loads.filter((load) => load.status === "BORRADOR").length} en preparación</span></div></div>
      {data.loads.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Carga</th><th>Destino / pedidos</th><th>Salida prevista</th><th>Palets</th><th>Peso</th><th>Estado</th><th></th></tr></thead><tbody>{data.loads.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((load) => { const pallets = load.palletIds.map((id) => data.pallets.find((pallet) => pallet.id === id)).filter((item): item is Pallet => Boolean(item)); const orders = [...new Set(pallets.map((pallet) => pallet.orderId).filter(Boolean))]; return <tr key={load.id} className="clickable-row" onClick={() => setSelectedLoadId(load.id)}><td><span className="primary-code">{load.code}</span><small className="cell-sub">{load.dock || "Sin muelle"}</small></td><td><strong>{orders.length ? `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}` : "Carga manual"}</strong><small className="cell-sub">{orders.map((id) => customerName(data, data.orders.find((order) => order.id === id)?.customerId)).filter((value, index, array) => array.indexOf(value) === index).join(", ") || "Stock de cajas"}</small></td><td>{dateTimeText(load.departureAt)}</td><td>{num(pallets.length)}</td><td>{kg(loadWeight(pallets, data))}</td><td><Status label={load.status === "CERRADA" ? "Expedida" : "En preparación"} tone={load.status === "CERRADA" ? "green" : "orange"} /></td><td><button className="icon-button" aria-label="Abrir carga" onClick={(event) => { event.stopPropagation(); setSelectedLoadId(load.id); }}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div> : <EmptyState icon={Truck} title="Sin cargas todavía" detail="Crea una salida y carga un pedido completo o selecciona palets manualmente." action={<button className="button primary" onClick={() => setModal({ kind: "load" })}>Preparar primera carga</button>} />}
      <div className="bottom-hint"><FileText size={16} /> Cada carga genera un packing list con la secuencia de palets y el peso por bulto.</div>
    </> : <LoadWorkspace data={data} load={activeLoad} allDraftIds={allDraftPalletIds} manualPalletId={manualPalletId} setManualPalletId={setManualPalletId} onBack={() => setSelectedLoadId(null)} onAddPallet={(id) => addPalletsToLoad(activeLoad.id, [id])} onAddOrder={(orderId) => addPalletsToLoad(activeLoad.id, data.pallets.filter((pallet) => pallet.orderId === orderId).map((pallet) => pallet.id))} onRemove={(palletId) => removePalletFromLoad(activeLoad.id, palletId)} onMove={(index, offset) => movePallet(activeLoad.id, index, offset)} onClose={() => closeLoad(activeLoad)} onUpdate={(patch) => updateLoad(activeLoad.id, patch)} onEdit={() => setModal({ kind: "load-edit", id: activeLoad.id })} onDelete={() => deleteLoad(activeLoad)} onPacking={() => setModal({ kind: "packing", id: activeLoad.id })} onPallet={(id) => setModal({ kind: "pallet-detail", id })} />}
  </>;

  const masterTabs = ["Artículos", "Clientes", "Transporte", "Tipos de palet", "Datos y copias"];
  const mastersPage = <>
    <PageTitle eyebrow="CONFIGURACIÓN OPERATIVA" title="Maestros" description="Guarda una vez los artículos y datos que reutilizas en cada operación." actions={undefined} />
    <div className="master-tabs">{masterTabs.map((tab) => <button key={tab} className={masterTab === tab ? "active" : ""} onClick={() => setMasterTab(tab)}>{tab === "Artículos" ? <Boxes size={15} /> : tab === "Clientes" ? <Users size={15} /> : tab === "Transporte" ? <Truck size={15} /> : tab === "Tipos de palet" ? <Package size={15} /> : <ShieldCheck size={15} />}{tab}</button>)}</div>
    {masterTab === "Artículos" && <><div className="master-intro"><div><h2>Catálogo de artículos</h2><p>Formato, contenido por unidad, unidades por caja y cajas estándar por palet.</p></div><button className="button primary" onClick={() => setModal({ kind: "article" })}><Plus size={16} /> Nuevo artículo</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>SKU / artículo</th><th>Familia</th><th>Formato / contenido</th><th>Unidades / caja</th><th>Cajas estándar / palet</th><th>Peso caja</th><th>GTIN</th><th></th></tr></thead><tbody>{data.articles.map((item) => <tr key={item.id}><td><span className="sku-chip">{item.sku}</span><strong className="article-name">{item.name}</strong></td><td>{item.family}</td><td>{item.format} · {item.packSize}</td><td>{num(item.unitsPerBox)}</td><td>{num(item.boxesPerPallet)}</td><td>{kg(item.netKgPerBox)}</td><td><span className="mono muted-copy">{item.gtin || "—"}</span></td><td><button className="icon-button" title="Editar" onClick={() => setModal({ kind: "article", id: item.id })}><Pencil size={15} /></button><button className="icon-button danger-text" title="Eliminar" onClick={() => deleteArticle(item)}><X size={15} /></button></td></tr>)}</tbody></table>{!data.articles.length && <EmptyState icon={Boxes} title="Añade un artículo" detail="Configura bricks, botellas, cubos, cajas y equivalencias." action={<button className="button primary" onClick={() => setModal({ kind: "article" })}>Crear artículo</button>} />}</div></>}
    {masterTab === "Clientes" && <><div className="master-intro"><div><h2>Clientes y destinos</h2><p>Direcciones y notas de entrega disponibles al crear cada pedido.</p></div><button className="button primary" onClick={() => setModal({ kind: "customer" })}><Plus size={16} /> Nuevo cliente</button></div><div className="client-card-grid">{data.customers.map((item) => <article className="client-card" key={item.id}><div className="client-card-head"><span className="client-avatar">{item.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><button className="icon-button" onClick={() => setModal({ kind: "customer", id: item.id })}><Pencil size={15} /></button></div><strong>{item.name}</strong><span className="mono muted-copy">{item.code}</span><div className="client-address"><MapPin size={14} />{item.address}, {item.city}</div>{item.contact && <div className="client-contact">{item.contact}</div>}{item.notes && <div className="client-note">{item.notes}</div>}<button className="text-button danger-text" onClick={() => deleteCustomer(item)}>Quitar cliente <X size={14} /></button></article>)}{!data.customers.length && <EmptyState icon={Users} title="Añade el primer cliente" detail="Se guardará para tus próximos pedidos." action={<button className="button primary" onClick={() => setModal({ kind: "customer" })}>Crear cliente</button>} />}</div></>}
    {masterTab === "Transporte" && <><div className="master-intro"><div><h2>Transportistas y vehículos</h2><p>Asocia matrículas y capacidades para validar el peso de cada salida.</p></div><div className="master-actions"><button className="button secondary" onClick={() => setModal({ kind: "vehicle" })}><Plus size={15} /> Añadir vehículo</button><button className="button primary" onClick={() => setModal({ kind: "carrier" })}><Plus size={15} /> Transportista</button></div></div><div className="transport-grid">{data.carriers.map((carrier) => <article className="transport-card" key={carrier.id}><div className="transport-card-head"><span className="transport-icon"><Truck size={18} /></span><button className="icon-button" onClick={() => setModal({ kind: "carrier", id: carrier.id })}><Pencil size={15} /></button></div><strong>{carrier.name}</strong><span>{carrier.contact || "Sin teléfono"}</span><div className="vehicle-list">{data.vehicles.filter((vehicle) => vehicle.carrierId === carrier.id).map((vehicle) => <div key={vehicle.id}><span className="mono">{vehicle.plate}</span><span>{num(vehicle.maxWeightKg)} kg</span></div>)}</div></article>)}{!data.carriers.length && <EmptyState icon={Truck} title="Sin transportistas" detail="Puedes añadirlos ahora o más adelante." action={<button className="button primary" onClick={() => setModal({ kind: "carrier" })}>Añadir transportista</button>} />}</div></>}
    {masterTab === "Tipos de palet" && <><div className="master-intro"><div><h2>Tipos de palet</h2><p>Configura el tipo físico, la tara y el peso bruto máximo.</p></div><button className="button primary" onClick={() => setModal({ kind: "pallet-type" })}><Plus size={16} /> Nuevo tipo</button></div><div className="type-card-grid">{data.palletTypes.map((item) => <article className="type-card" key={item.id}><div className="type-icon"><Package size={20} /></div><div className="type-card-name"><strong>{item.name}</strong><span>Formato reutilizable en confección</span></div><div className="type-specs"><div><span>Peso máximo</span><b>{num(item.maxWeightKg)} kg</b></div><div><span>Tara</span><b>{num(item.tareKg, 1)} kg</b></div></div><button className="text-button" onClick={() => setModal({ kind: "pallet-type", id: item.id })}><Pencil size={14} /> Editar tipo</button></article>)}{!data.palletTypes.length && <EmptyState icon={Package} title="Añade un tipo de palet" detail="Define nombre, peso máximo y tara." action={<button className="button primary" onClick={() => setModal({ kind: "pallet-type" })}>Añadir tipo</button>} />}</div></>}
    {masterTab === "Datos y copias" && <div className="backup-stack"><div className="backup-panel"><div className="backup-icon"><ShieldCheck size={22} /></div><div className="backup-copy"><h2>Datos guardados en este navegador</h2><p>El trabajo diario se guarda aquí. Las copias incluyen la trazabilidad y la configuración profesional de SalsaLog.</p><div className="backup-meta"><span><CheckCircle2 size={14} /> Almacenamiento local activo · esquema v11</span><span>{num(data.articles.length)} artículos · {num(data.orders.length)} pedidos · {num(data.pallets.length)} palets · {num(data.audit.length)} auditorías</span></div></div><div className="backup-actions"><button className="button secondary" onClick={() => { void handleExport(); }}><Download size={16} /> Guardar copia</button><label className="button secondary file-button"><Upload size={16} /> Restaurar copia<input type="file" accept="application/json,.json" onChange={(event) => { void handleImport(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div></div><div className="backup-panel"><div className="backup-icon"><Barcode size={22} /></div><div className="backup-copy"><h2>Identificación GS1 / SSCC</h2><p>Los nuevos palets reciben un SSCC histórico de 18 dígitos. Configura aquí el prefijo de empresa antes de usarlo en producción.</p><div className="backup-meta"><span>Prefijo actual: <strong className="mono">{data.settings.companyPrefix}</strong></span><span>Extensión: <strong className="mono">{data.settings.ssccExtension}</strong></span></div></div><div className="backup-actions"><button className="button secondary" onClick={() => { const prefix = window.prompt("Prefijo GS1 de empresa (hasta 9 dígitos)", data.settings.companyPrefix); if (prefix === null) return; const clean = prefix.replace(/\D/g, "").slice(0,9); if (!clean) return notify("El prefijo GS1 no es válido.", "warning"); setData(current => ({...current, settings: {...current.settings, companyPrefix: clean}})); notify("Prefijo GS1 actualizado. Los SSCC existentes no cambian."); }}>Configurar GS1</button></div></div><div className="backup-panel"><div className="backup-icon"><Activity size={22} /></div><div className="backup-copy"><h2>Auditoría</h2><p>Registro inmutable a nivel de aplicación de las expediciones cerradas y futuras operaciones críticas.</p><div className="operator-list">{data.audit.slice(0,6).map(event => <div className="operator-row" key={event.id}><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.summary}</span></div><span className="mono">{dateTimeText(event.at)}</span></div>)}{!data.audit.length && <p className="muted-copy">Todavía no hay eventos de auditoría.</p>}</div></div></div></div>}
  </>;

  const operatorPage = <OperatorWorkspace data={data} onOpenPallet={(id) => setModal({ kind: "pallet-detail", id })} onPreparePallet={() => openPalletModal()} onLoad={() => setModal({ kind: "load" })} onGoPallets={() => setView("palets")} />;
  const controlPage = <ControlPage data={data} setData={setData} notify={notify} onOpenPallet={(id) => setModal({ kind: "pallet-detail", id })} scanOpen={scanOpen} setScanOpen={setScanOpen} />;
  const inventoryPage = <InventoryPage data={data} setData={setData} notify={notify} />;
  const productionPage = <ProductionPage data={data} setData={setData} notify={notify} />;
  const qualityPage = <QualityPage data={data} setData={setData} notify={notify} />;
  const traceabilityPage = <TraceabilityPage data={data} />;
  const fabricationPage = <FabricationPage data={data} setData={setData} notify={notify} />;
  const selectedPage = view === "inicio" ? dashboard : view === "operario" ? operatorPage : view === "pedidos" ? ordersPage : view === "palets" ? palletsPage : view === "inventario" ? inventoryPage : view === "planificacion" ? <PlanningPage data={data} setData={setData} notify={notify} /> : view === "produccion" ? productionPage : view === "fabricacion" ? fabricationPage : view === "calidad" ? qualityPage : view === "cargas" ? loadsPage : view === "trazabilidad" ? traceabilityPage : view === "control" ? controlPage : mastersPage;

  const modalRender = () => {
    if (!modal) return null;
    const close = () => setModal(null);
    if (modal.kind === "order") { const editing = modal.id ? data.orders.find((item) => item.id === modal.id) : undefined; return <Modal title={editing ? `Editar ${editing.id}` : "Nuevo pedido"} eyebrow={editing ? "PEDIDOS · EDICIÓN" : "PEDIDOS · ALTA"} onClose={close}><OrderForm data={data} initial={editing} onCancel={close} onSubmit={(draft) => saveOrder(draft, editing?.id)} /></Modal>; }
    if (modal.kind === "pallet-edit") { const editing = data.pallets.find((item) => item.id === modal.id); return editing ? <Modal title={`Editar ${editing.code}`} eyebrow="ALMACÉN · EDICIÓN DE PALET" onClose={close} size="wide"><PalletEditForm data={data} pallet={editing} onCancel={() => setModal({ kind: "pallet-detail", id: editing.id })} onSubmit={(changes) => savePalletEdit(editing, changes)} /></Modal> : null; }
    if (modal.kind === "pallet") return <Modal title="Confeccionar palet" eyebrow="ALMACÉN · NUEVA UNIDAD LOGÍSTICA" onClose={close} size="wide"><PalletForm data={data} defaultOrderId={modal.orderId} onCancel={close} onSubmit={savePallet} onConfirm={askConfirmation} /></Modal>;
    if (modal.kind === "extract") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title="Extraer cajas" eyebrow="STOCK · REEMPAQUE" onClose={close} size="wide"><ExtractForm data={data} pallet={pallet} onCancel={close} onSubmit={(result) => saveExtraction(pallet.id, result)} /></Modal> : null; }
    if (modal.kind === "load-edit") { const editing = data.loads.find((item) => item.id === modal.id); return editing && editing.status === "BORRADOR" ? <Modal title={`Editar ${editing.code}`} eyebrow="EXPEDICIÓN · EDICIÓN DE CARGA" onClose={close}><LoadEditForm data={data} load={editing} onCancel={close} onSubmit={(patch) => { updateLoad(editing.id, patch); setModal(null); notify(`${editing.code} actualizada.`); }} /></Modal> : null; }
    if (modal.kind === "load") return <Modal title="Preparar salida" eyebrow="EXPEDICIÓN · NUEVA CARGA" onClose={close}><LoadForm data={data} onCancel={close} onSubmit={saveLoad} /></Modal>;
    if (modal.kind === "article") { const item = data.articles.find((article) => article.id === modal.id); return <Modal title={item ? "Editar artículo" : "Nuevo artículo"} eyebrow="MAESTROS · CATÁLOGO" onClose={close}><ArticleForm initial={item} onCancel={close} onSubmit={(draft) => addArticle(draft, item?.id)} /></Modal>; }
    if (modal.kind === "customer") { const item = data.customers.find((customer) => customer.id === modal.id); return <Modal title={item ? "Editar cliente" : "Nuevo cliente"} eyebrow="MAESTROS · CLIENTES" onClose={close}><CustomerForm initial={item} onCancel={close} onSubmit={(draft) => addCustomer(draft, item?.id)} /></Modal>; }
    if (modal.kind === "carrier") { const item = data.carriers.find((carrier) => carrier.id === modal.id); return <Modal title={item ? "Editar transportista" : "Nuevo transportista"} eyebrow="MAESTROS · TRANSPORTE" onClose={close}><CarrierForm initial={item} onCancel={close} onSubmit={(draft) => addCarrier(draft, item?.id)} /></Modal>; }
    if (modal.kind === "vehicle") return <Modal title="Añadir vehículo" eyebrow="MAESTROS · TRANSPORTE" onClose={close}><VehicleForm data={data} onCancel={close} onSubmit={addVehicle} /></Modal>;
    if (modal.kind === "pallet-type") { const item = data.palletTypes.find((type) => type.id === modal.id); return <Modal title={item ? "Editar tipo de palet" : "Nuevo tipo de palet"} eyebrow="MAESTROS · EMBALAJES" onClose={close}><PalletTypeForm initial={item} onCancel={close} onSubmit={(draft) => addPalletType(draft, item?.id)} /></Modal>; }
    if (modal.kind === "label") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title="Etiqueta logística" eyebrow={`PALET · ${pallet.code}`} onClose={close} size="print"><div className="print-actions"><span>Revisión {String(pallet.labelRevision).padStart(2, "0")} · Etiqueta lista para impresión</span><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Imprimir etiqueta</button></div><PalletLabel pallet={pallet} data={data} /><div className="print-bottom-hint"><ShieldCheck size={15} /> Si cambias la cantidad de cajas, la etiqueta de origen incrementa su revisión automáticamente.</div></Modal> : null; }
    if (modal.kind === "packing") { const load = data.loads.find((item) => item.id === modal.id); return load ? <Modal title="Packing list" eyebrow={`CARGA · ${load.code}`} onClose={close} size="print"><div className="print-actions"><span>Lista de carga · {load.palletIds.length} palets</span><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Imprimir packing list</button></div><PackingList load={load} data={data} /><div className="print-bottom-hint"><FileText size={15} /> Incluye la secuencia, los pedidos, lotes y peso bruto por palet.</div></Modal> : null; }
    if (modal.kind === "pallet-detail") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title={pallet.code} eyebrow="FICHA DE PALET" onClose={close} size="wide"><PalletDetail data={data} pallet={pallet} onLabel={() => setModal({ kind: "label", id: pallet.id })} onExtract={() => setModal({ kind: "extract", id: pallet.id })} onEdit={() => setModal({ kind: "pallet-edit", id: pallet.id })} onDelete={() => deletePallet(pallet)} movements={data.movements.filter((event) => event.palletId === pallet.id || event.relatedPalletId === pallet.id)} /></Modal> : null; }
    if (modal.kind === "order-detail") { const order = data.orders.find((item) => item.id === modal.id); return order ? <Modal title={order.id} eyebrow="FICHA DE PEDIDO" onClose={close} size="wide"><OrderDetail data={data} order={order} onPrepare={() => { setModal({ kind: "pallet", orderId: order.id }); }} onLoad={() => { setModal({ kind: "load" }); }} onEdit={() => setModal({ kind: "order", id: order.id })} onDelete={() => deleteOrder(order)} /></Modal> : null; }
    return null;
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <div className="sidebar-brand"><Logo /><button className="mobile-nav-close icon-button" onClick={() => setMobileNav(false)} aria-label="Cerrar menú"><X size={18} /></button></div>
      <div className="workspace-label">FÁBRICA · CÓRDOBA</div>
      <nav className="main-nav" aria-label="Navegación principal">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileNav(false); if (id !== "cargas") setSelectedLoadId(null); }}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === "pedidos" && readyOrders.length > 0 && <span className="nav-count">{readyOrders.length}</span>}{id === "cargas" && data.loads.some((load) => load.status === "BORRADOR") && <span className="nav-live" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><div className="help-badge"><ShieldCheck size={16} /></div><div><strong>Trazabilidad</strong><span>Lote a expedición</span></div><span className="secure-dot" /></div><button className="sidebar-foot" onClick={() => { setView("maestros"); setMasterTab("Datos y copias"); }}><div className="avatar">OP</div><div><strong>Operaciones</strong><span>Almacén · Córdoba</span></div><MoreHorizontal size={18} /></button></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Cerrar navegación" />}
    <main className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)} aria-label="Abrir menú"><span className="menu-bars">☰</span></button><div className="breadcrumb"><span>Operaciones</span><ChevronRight size={14} /><strong>{selectedLoadId && view === "cargas" ? "Detalle de carga" : title}</strong></div><span className="topbar-separator" /><div className="plant-indicator"><span className="live-dot" /> Planta activa</div></div><div className="topbar-right"><label className="global-search"><Search size={16} /><input aria-label="Buscar" placeholder="Buscar pedido, palet…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label><span className="saved-state"><span className={saved ? "save-check" : "save-pulse"}>{saved ? <Check size={11} /> : <Clock3 size={11} />}</span>{saved ? "Guardado" : "Guardando"}</span><button className="top-icon" title="Avisos operativos" onClick={() => setView("pedidos")}><Bell size={17} />{readyOrders.some((order) => relativeDate(order.deliveryDate) === "Hoy") && <i />}</button><div className="top-avatar">OP</div></div></header>
      <div className="content-area">{(installPrompt || showChromeInstallHint) && <div className="install-hint" role="status"><span>{installPrompt ? "Instala SalsaLog en este dispositivo para abrirla como una app." : "Chrome: abre ⋮ → Instalar aplicación (en ordenador: Enviar, guardar y compartir → Instalar página como aplicación). Comprueba que has abierto la web por HTTPS."}</span><div className="install-hint-actions">{installPrompt ? <button className="button small secondary" onClick={() => { void installApp(); }}><Download size={14} /> Instalar app</button> : <button className="text-button" onClick={() => setShowChromeInstallHint(false)}>Entendido <X size={13} /></button>}</div></div>}{showIosInstallHint && <div className="install-hint" role="status"><span>En iPhone/iPad: toca Compartir y elige «Añadir a pantalla de inicio».</span><button className="text-button" onClick={() => setShowIosInstallHint(false)}>Entendido <X size={13} /></button></div>}{selectedPage}</div><footer className="app-footer"><span><Logo /> <small>Control de expedición alimentaria</small></span><span>Versión 15 · Food & Sauce <i /> {new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</span></footer>
    </main>
    {toast && <div className={`toast ${toast.type}`} role="status"><span className="toast-icon">{toast.type === "error" ? <AlertTriangle size={16} /> : toast.type === "warning" ? <AlertTriangle size={16} /> : <CheckCircle2 size={17} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    {modalRender()}
    <ConfirmDialog options={confirmation} onResolve={resolveConfirmation} />
  </div>;

  function LayersIcon() { return <span className="stacked-icon"><Boxes size={16} /></span>; }
  function PalletDetail({ pallet, data, onLabel, onExtract, onEdit, onDelete, movements }: { pallet: Pallet; data: AppData; onLabel: () => void; onExtract: () => void; onEdit: () => void; onDelete: () => void; movements: Movement[] }) {
    const order = data.orders.find((item) => item.id === pallet.orderId); const type = data.palletTypes.find((item) => item.id === pallet.typeId);
    const canExtract = pallet.status === "DISPONIBLE" && pallet.lines.some((line) => line.boxes > 0) && !allDraftPalletIds.includes(pallet.id);
    const status = PALLET_STATUS_META[pallet.status];
    return <><div className="detail-hero"><div className="detail-hero-icon"><Package size={22} /></div><div className="detail-hero-copy"><strong>{pallet.code}</strong><span>{type?.name} · {pallet.location}</span>{order && <small className="order-seq-detail">Orden {String(pallet.orderPalletNo ?? 1).padStart(2, "0")} del pedido {order.id}</small>}</div><Status label={status.label} tone={status.tone} /><span className="revision-tag">REV {String(pallet.labelRevision).padStart(2, "0")}</span></div>
      <div className="detail-actions"><button className="button secondary" onClick={onLabel}><Printer size={15} /> Ver etiqueta</button>{canExtract && <button className="button primary" onClick={onExtract}><ArrowDown size={15} /> Extraer cajas</button>}{(pallet.status === "DISPONIBLE" || pallet.status === "RESERVADO") && <button className="button secondary" onClick={onEdit}><Pencil size={15} /> Editar</button>}<button className="button secondary danger-text" onClick={onDelete}><Trash2 size={15} /> Eliminar</button></div>
      <div className="detail-stats"><div><span>{pallet.stockKind === "bricks" ? "BRICKS" : "CAJAS"}</span><strong>{num(sumBoxes(pallet.lines))}</strong></div><div><span>UNIDADES</span><strong>{num(sumUnits(pallet.lines, data))}</strong></div><div><span>PESO BRUTO</span><strong>{kg(palletWeight(pallet, data))}</strong></div><div><span>DESTINO</span><strong>{order?.id ?? customerName(data, pallet.customerId)}</strong></div></div>
      <div className="detail-section"><div className="section-heading"><h3>Contenido y trazabilidad</h3>{palletIsMixed(pallet) && <span className="mixed-tag">PALET MIXTO</span>}</div><div className="detail-lines">{pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="detail-line" key={line.id}><div className="detail-line-symbol"><Boxes size={16} /></div><div className="detail-line-main"><strong>{article?.sku} · {article?.name}</strong><span>{line.format ?? article?.format} {line.packSize ?? article?.packSize} · {line.unitsPerBox ?? article?.unitsPerBox} unidades / caja</span><small>Lote <b>{line.lot}</b> · Caducidad {dateText(line.expiry)}{line.sourcePalletId && <span> · Procede de {data.pallets.find((item) => item.id === line.sourcePalletId)?.code ?? "palet origen"}</span>}</small></div><div className="detail-line-qty"><strong>{num(line.boxes)}</strong><span>cajas</span></div><div className="detail-line-qty units"><strong>{num(line.boxes * (line.unitsPerBox ?? article?.unitsPerBox ?? 0))}</strong><span>unidades</span></div></div>; })}{!pallet.lines.length && <p className="muted-copy">Sin cajas disponibles en este palet.</p>}</div></div>
      <div className="detail-section movement-section"><div className="section-heading"><h3>Historial de movimientos</h3><span className="muted-copy">{movements.length} eventos</span></div>{movements.slice().reverse().map((event) => <div className="movement-row" key={event.id}><span className="movement-marker" /><div><strong>{movementLabels[event.kind]}</strong><span>{event.summary}</span></div><small>{dateTimeText(event.date)}</small></div>)}{!movements.length && <p className="muted-copy">Sin movimientos registrados.</p>}</div>
    </>;
  }
  function OrderDetail({ order, data, onPrepare, onLoad, onEdit, onDelete }: { order: Order; data: AppData; onPrepare: () => void; onLoad: () => void; onEdit: () => void; onDelete: () => void }) {
    const status = orderStatus(order, data); const customer = data.customers.find((item) => item.id === order.customerId); const related = data.pallets.filter((pallet) => pallet.orderId === order.id);
    return <><div className="order-detail-head"><div className="detail-hero-icon"><FileText size={21} /></div><div className="detail-hero-copy"><strong>{customer?.name ?? "Cliente"}</strong><span>{order.reference ? `Referencia ${order.reference} · ` : ""}{order.deliveryAddress}</span><small><CalendarDays size={13} /> Entrega {dateText(order.deliveryDate)} · {relativeDate(order.deliveryDate)}</small></div><Status label={status.label} tone={status.tone} /></div>
      <div className="order-progress-card"><div><span>{status.label === "Expedición parcial" || status.label === "Expedido" ? "PROGRESO DE EXPEDICIÓN" : "PREPARACIÓN DEL PEDIDO"}</span><strong>{status.percent}%</strong></div><Progress value={status.percent} /><small>{status.label === "Expedición parcial" || status.label === "Expedido" ? "El avance refleja las cajas de este pedido que ya salieron." : "Las cajas se cuentan desde palets reservados o expedidos para este pedido."}</small></div>
      <div className="detail-section"><div className="section-heading"><h3>Líneas de pedido</h3><span className="muted-copy">{order.lines.length} referencias</span></div><div className="order-line-list">{order.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); const assigned = progressForLine(line, data.pallets, order.id); const remaining = Math.max(0, line.boxes - assigned); return <div className="order-detail-line" key={line.articleId}><div className="detail-line-symbol"><Boxes size={16} /></div><div className="order-detail-line-main"><strong>{article?.sku} · {article?.name}</strong><span>{article?.format} {article?.packSize} · {line.boxes * (article?.unitsPerBox ?? 0)} unidades solicitadas</span><Progress value={line.boxes ? (assigned / line.boxes) * 100 : 0} /></div><div className="order-qty"><strong>{num(assigned)} <small>/ {num(line.boxes)}</small></strong><span>cajas asignadas</span></div><div className={`remaining-boxes ${remaining ? "pending" : "complete"}`}>{remaining ? `${num(remaining)} pendientes` : "Completo"}</div></div>; })}</div></div>
      <div className="detail-section"><div className="section-heading"><h3>Palets asignados</h3><span className="muted-copy">{related.length} palets · lotes y caducidades</span></div>{related.length ? <div className="related-pallet-list">{related.map((pallet) => <div key={pallet.id}><Package size={15} /><strong>{pallet.code} · Orden {String(pallet.orderPalletNo ?? 1).padStart(2, "0")}</strong><span className="pallet-traceability">{pallet.lines.length ? pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return `${line.boxes} cajas · ${article?.name ?? "Artículo"} · ${line.format ?? article?.format ?? "—"} ${line.packSize ?? article?.packSize ?? ""} · ${line.unitsPerBox ?? article?.unitsPerBox ?? 0} uds/caja · Lote ${line.lot || "—"} · Cad. ${dateText(line.expiry)}`; }).join(" / ") : "Sin cajas actuales"}</span><Status label={PALLET_STATUS_META[pallet.status].label} tone={PALLET_STATUS_META[pallet.status].tone} /></div>)}</div> : <p className="muted-copy">Todavía no hay palets asignados a este pedido.</p>}</div>
      {order.notes && <div className="order-note-box"><span>NOTAS DE ENTREGA</span><p>{order.notes}</p></div>}<div className="detail-actions"><button className="button secondary danger-text" onClick={onDelete}><Trash2 size={15} /> Eliminar</button><button className="button secondary" onClick={onEdit}><Pencil size={15} /> Editar</button><button className="button secondary" onClick={onLoad}><Truck size={15} /> Preparar salida</button><button className="button primary" onClick={onPrepare}><Package size={15} /> Confeccionar palet</button></div>
    </>;
  }
}

function OperatorWorkspace({ data, onOpenPallet, onPreparePallet, onLoad, onGoPallets }: { data: AppData; onOpenPallet: (id: string) => void; onPreparePallet: () => void; onLoad: () => void; onGoPallets: () => void }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Pallet | null>(null);
  const [message, setMessage] = useState("");
  const alerts = expiryAlerts(data.pallets);
  const available = data.pallets.filter((p) => ["DISPONIBLE", "RESERVADO"].includes(p.status) && p.lines.length > 0);
  const scan = () => {
    const value = code.trim().toLowerCase();
    if (!value) return;
    const pallet = data.pallets.find((item) => item.code.toLowerCase() === value || item.id.toLowerCase() === value);
    if (pallet) { setResult(pallet); setMessage(""); onOpenPallet(pallet.id); }
    else { setResult(null); setMessage("No se ha encontrado ese palet. Puedes probar de nuevo o abrir el buscador de palets."); }
  };
  const fefo = fefoPallets(available).slice(0, 6);
  return <div className="operator-page">
    <PageTitle eyebrow="ALMACÉN · MODO OPERARIO" title="Terminal de almacén" description="Acciones rápidas para trabajar desde móvil o tablet." actions={<button className="button secondary" onClick={onGoPallets}><Package size={16} /> Ver palets</button>} />
    <section className="operator-scan panel"><div className="operator-scan-copy"><div className="operator-icon"><ScanLine size={25} /></div><div><div className="eyebrow">LECTURA RÁPIDA</div><h2>Escanear o introducir palet</h2><p>Un lector Bluetooth funciona como teclado: escanea y pulsa Buscar.</p></div></div><div className="operator-scan-form"><input autoFocus inputMode="search" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") scan(); }} placeholder="PAL-00001" aria-label="Código de palet" /><button className="button primary" onClick={scan}><ScanLine size={17} /> Buscar</button></div>{message && <div className="operator-message"><AlertTriangle size={16} />{message}</div>}{result && <button className="operator-result" onClick={() => onOpenPallet(result.id)}><div><strong>{result.code}</strong><span>{result.location} · {result.lines.reduce((sum, line) => sum + line.boxes, 0)} cajas</span></div><ChevronRight size={18} /></button>}</section>
    <div className="operator-actions"><button className="operator-action primary" onClick={onPreparePallet}><Package size={25} /><strong>Confeccionar palet</strong><span>Crear y etiquetar</span></button><button className="operator-action" onClick={onLoad}><Truck size={25} /><strong>Preparar carga</strong><span>Ir al muelle</span></button><button className="operator-action" onClick={onGoPallets}><Search size={25} /><strong>Buscar palet</strong><span>Por código, lote o ubicación</span></button></div>
    <div className="operator-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">FEFO</div><h2>Primero sale lo que antes caduca</h2></div><ShieldCheck size={17} className="muted-icon" /></div><div className="operator-list">{fefo.length ? fefo.map((pallet, index) => { const soon = pallet.lines.filter((line) => line.boxes > 0).sort((a,b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"))[0]; return <button key={pallet.id} className="operator-row" onClick={() => onOpenPallet(pallet.id)}><span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span><div><strong>{pallet.code}</strong><span>{pallet.location} · {sumBoxes(pallet.lines)} {boxUnit(pallet)}</span></div><div className={`expiry-chip ${expiryLevel(soon?.expiry)}`}>{soon?.expiry ? dateText(soon.expiry) : "Sin fecha"}</div></button> }) : <p className="muted-copy">No hay palets disponibles para recomendar.</p>}</div></section><section className="panel"><div className="panel-heading"><div><div className="eyebrow">CONTROL DE CADUCIDADES</div><h2>Alertas</h2></div><span className="nav-count">{alerts.length}</span></div>{alerts.length ? <div className="operator-list">{alerts.slice(0, 8).map((alert) => <button key={`${alert.palletId}-${alert.lot}`} className="operator-row" onClick={() => onOpenPallet(alert.palletId)}><div className={`expiry-dot ${alert.level}`} /><div><strong>{alert.palletCode}</strong><span>{articleName(data, alert.articleId)} · Lote {alert.lot || "—"} · {alert.boxes} cajas</span></div><div className={`expiry-chip ${alert.level}`}>{alert.expiry ? dateText(alert.expiry) : "Sin fecha"}</div></button>)}</div> : <div className="operator-ok"><CheckCircle2 size={20} /><strong>Sin alertas de caducidad</strong><span>El stock está dentro de los márgenes configurados.</span></div>}</section></div>
  </div>;
}

function LoadWorkspace({ data, load, allDraftIds, manualPalletId, setManualPalletId, onBack, onAddPallet, onAddOrder, onRemove, onMove, onClose, onUpdate, onEdit, onDelete, onPacking, onPallet }: { data: AppData; load: Load; allDraftIds: string[]; manualPalletId: string; setManualPalletId: (id: string) => void; onBack: () => void; onAddPallet: (id: string) => void; onAddOrder: (id: string) => void; onRemove: (id: string) => void; onMove: (index: number, offset: number) => void; onClose: () => void; onUpdate: (patch: Partial<Load>) => void; onEdit: () => void; onDelete: () => void; onPacking: () => void; onPallet: (id: string) => void }) {
  const pallets = load.palletIds.map((id) => data.pallets.find((pallet) => pallet.id === id)).filter((item): item is Pallet => Boolean(item));
  const orders = data.orders.filter((order) => data.pallets.some((pallet) => pallet.orderId === order.id && ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0));
  const occupiedElsewhere = data.loads.filter((item) => item.status === "BORRADOR" && item.id !== load.id).flatMap((item) => item.palletIds);
  const manualOptions = data.pallets.filter((pallet) => ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0 && !allDraftIds.includes(pallet.id) && !occupiedElsewhere.includes(pallet.id) && !load.palletIds.includes(pallet.id));
  const carrier = data.carriers.find((item) => item.id === load.carrierId); const vehicle = data.vehicles.find((item) => item.id === load.vehicleId);
  const closed = load.status === "CERRADA";
  return <><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Todas las cargas</button><div className="load-workspace-head"><div><div className="eyebrow">{closed ? "HISTÓRICO DE EXPEDICIÓN" : "CARGA EN PREPARACIÓN"}</div><h2>{load.code}</h2><div className="load-head-meta"><span><Truck size={14} />{carrier?.name ?? "Transportista sin asignar"}{vehicle ? ` · ${vehicle.plate}` : ""}</span><span><MapPin size={14} />{load.dock || "Sin muelle"}</span><span><CalendarDays size={14} />{dateTimeText(load.departureAt)}</span></div></div><div className="page-actions">{!closed && <><button className="button secondary" onClick={onEdit}><Pencil size={15} /> Editar</button><button className="button secondary danger-text" onClick={onDelete}><Trash2 size={15} /> Eliminar</button></>}<Status label={closed ? "Expedida" : "Borrador"} tone={closed ? "green" : "orange"} /></div></div>
    <div className="load-summary-cards"><div><span>PALETS EN CARGA</span><strong>{num(pallets.length)}</strong></div><div><span>CAJAS TOTALES</span><strong>{num(pallets.reduce((sum, pallet) => sum + sumBoxes(pallet.lines), 0))}</strong></div><div><span>PESO BRUTO</span><strong>{kg(loadWeight(pallets, data))}</strong></div><div><span>ORDEN DE CARGA</span><strong className="sequence-summary">{pallets.length ? `${num(pallets.length)} posiciones` : "Sin definir"}</strong></div></div>
    {(() => { const validation = validateLoad(pallets, data, vehicle?.maxWeightKg); const capacity = loadCapacityPercent(pallets, data, vehicle?.maxWeightKg); return <div className="load-validation-panel"><div><div className="eyebrow">CONTROL DE EXPEDICIÓN</div><strong>{validation.ok ? "Carga lista para validar" : "Revisión necesaria"}</strong><span>{vehicle ? `${kg(loadWeight(pallets, data))} de ${kg(vehicle.maxWeightKg)} · ${capacity ?? 0}% de capacidad` : "Asigna un vehículo para controlar capacidad."}</span></div><div className="load-validation-status">{validation.errors.length ? <Status label={`${validation.errors.length} error${validation.errors.length === 1 ? "" : "es"}`} tone="red" /> : <Status label="Sin errores" tone="green" />}{validation.warnings.length > 0 && <Status label={`${validation.warnings.length} aviso${validation.warnings.length === 1 ? "" : "s"}`} tone="orange" />}</div></div>; })()}
    {!closed && <div className="load-controls-panel"><div><label>Precinto</label><input value={load.seal ?? ""} onChange={(e) => onUpdate({ seal: e.target.value.trim() || undefined })} placeholder="Nº de precinto" /></div><div><label>Temperatura (°C)</label><input type="number" step="0.1" value={load.temperatureC ?? ""} onChange={(e) => onUpdate({ temperatureC: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="—" /></div><button className="button secondary" onClick={() => onUpdate({ loadingStartedAt: load.loadingStartedAt ?? new Date().toISOString() })}>{load.loadingStartedAt ? `Carga iniciada ${dateTimeText(load.loadingStartedAt)}` : "Iniciar carga"}</button></div>}
    {!closed && <div className="add-to-load-panel"><div className="add-load-heading"><div><strong>Añadir palets</strong><span>Los palets se cargarán según el orden que definas abajo.</span></div><span className="load-step">PASO 1</span></div><div className="add-load-controls"><div className="add-load-control"><label>Pedido completo</label><div className="control-row"><select id={`order-for-${load.id}`} defaultValue=""><option value="">Seleccionar pedido…</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {customerName(data, order.customerId)}</option>)}</select><button className="button secondary" onClick={() => { const select = document.getElementById(`order-for-${load.id}`) as HTMLSelectElement | null; if (select?.value) onAddOrder(select.value); }}>{<Plus size={15} />} Cargar pedido</button></div></div><div className="add-load-control"><label>Palet manual</label><div className="control-row"><select value={manualPalletId} onChange={(event) => setManualPalletId(event.target.value)}><option value="">Seleccionar palet disponible…</option>{manualOptions.map((pallet) => <option key={pallet.id} value={pallet.id}>{pallet.code} · {pallet.lines.map((line) => `${line.boxes} × ${articleName(data, line.articleId)}`).join(" + ")}</option>)}</select><button className="button secondary" disabled={!manualPalletId} onClick={() => { onAddPallet(manualPalletId); setManualPalletId(""); }}><Plus size={15} /> Añadir palet</button></div></div></div></div>}
    <div className="load-list-panel"><div className="load-list-header"><div><span className="eyebrow">PASO 2 · SECUENCIA DE CARGA</span><h3>Palets del camión</h3><p>Posición 01 entra primero al camión.</p></div><button className="button secondary" onClick={onPacking}><FileText size={15} /> Ver packing list</button></div>
      {pallets.length ? <div className="load-pallet-list">{pallets.map((pallet, index) => { const order = data.orders.find((item) => item.id === pallet.orderId); return <div className="load-pallet-row" key={pallet.id}><div className="sequence-badge">{String(index + 1).padStart(2, "0")}</div><div className="load-pallet-main"><button className="pallet-code-button" onClick={() => onPallet(pallet.id)}>{pallet.code}</button><span>{order ? `${order.id} · ${customerName(data, order.customerId)}` : customerName(data, pallet.customerId)}</span><small>{pallet.lines.map((line) => `${line.boxes} × ${articleName(data, line.articleId)}${palletIsMixed(pallet) ? ` · ${line.lot}` : ""}`).join("  /  ")}</small></div><div className="load-pallet-metrics"><strong>{num(sumBoxes(pallet.lines))} <small>cajas</small></strong><span>{kg(palletWeight(pallet, data))}</span></div>{!closed && <div className="sequence-actions"><button className="icon-button" aria-label="Subir palet" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={15} /></button><button className="icon-button" aria-label="Bajar palet" disabled={index === pallets.length - 1} onClick={() => onMove(index, 1)}><ArrowDown size={15} /></button><button className="icon-button danger-text" aria-label="Quitar palet de la carga" onClick={() => onRemove(pallet.id)}><X size={15} /></button></div>}</div>; })}</div> : <EmptyState icon={Truck} title="Todavía no hay palets" detail="Carga todos los palets de un pedido o elige unidades manualmente." />}
      {!closed && <div className="load-footer-actions"><span><ShieldCheck size={15} /> Antes de cerrar, revisa el orden y el peso total.</span><button className="button primary" disabled={!pallets.length} onClick={onClose}><CheckCircle2 size={16} /> Cerrar carga y expedir</button></div>}{closed && <div className="load-closed-notice"><CheckCircle2 size={18} /><div><strong>Carga expedida</strong><span>Cerrada el {dateTimeText(load.closedAt)} · se conservó el historial de movimientos.</span></div></div>}
    </div>
    {load.notes && <div className="bottom-hint"><FileText size={15} />{load.notes}</div>}
  </>;
}
