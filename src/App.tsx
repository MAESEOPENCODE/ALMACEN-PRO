import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Barcode, Bell,
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Download, FileText,
  LayoutDashboard, MapPin, MoreHorizontal, Package, Pencil, Plus, Printer, ScanLine,
  Search, Settings2, ShieldCheck, Truck, Upload, Users, X, Boxes,
} from "lucide-react";
import type { AppData, Article, Carrier, Customer, Incident, Load, Movement, Order, Pallet, PalletLine, PalletStatus, PalletType, ViewName } from "./types";
import { exportData, importData, readData, writeData } from "./data/repository";
import { articleName, boxesForArticle, customerName, expiryAlerts, expiryLevel, fefoPallets, loadWeight, loadCapacityPercent, validateLoad, netWeight, orderBoxes, orderStatus, palletIsMixed, palletWeight, progressForLine, sumBoxes, sumUnits } from "./utils/calculations";
import { makeId, nextDocument } from "./utils/ids";
import { makeSscc, ssccHuman } from "./utils/gs1";
import { Barcode as BarcodeView } from "./components/Barcode";
import { ArticleForm, CarrierForm, CustomerForm, ExtractForm, LoadForm, OrderForm, PalletForm, PalletTypeForm, VehicleForm } from "./components/Forms";
import { ConfirmDialog, type ConfirmOptions } from "./components/ConfirmDialog";
import { clearInstallPrompt, getInstallPrompt, subscribeInstallPrompt, type InstallPromptEvent } from "./pwaInstall";

const NAV: { id: ViewName; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard },
  { id: "operario", label: "Operario", icon: ScanLine },
  { id: "pedidos", label: "Pedidos", icon: FileText },
  { id: "palets", label: "Palets", icon: Package },
  { id: "cargas", label: "Cargas", icon: Truck },
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
const today = () => new Date().toISOString().slice(0, 10);
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
    <div className="label-destination"><div className="label-overline">DESTINO</div><strong>{customerName(data, customerId)}</strong><span>{order ? `Pedido ${order.id}${order.reference ? ` · Ref. ${order.reference}` : ""}` : "Stock de cajas"}</span></div>
    <div className="label-lines"><div className="label-lines-head"><span>ARTÍCULO / LOTE</span><span>CAJAS</span></div>{pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="label-line" key={line.id}><div><strong>{article?.sku} · {article?.name}</strong><span>Lote {line.lot} · Cad. {dateText(line.expiry)}</span><small>{line.boxes * (line.unitsPerBox ?? article?.unitsPerBox ?? 0)} uds · {line.format ?? article?.format} {line.packSize ?? article?.packSize} · {line.unitsPerBox ?? article?.unitsPerBox} uds/caja</small></div><b>{num(line.boxes)}</b></div>; })}</div>
    <div className="label-summary"><div><span>CAJAS</span><b>{num(sumBoxes(pallet.lines))}</b></div><div><span>UNIDADES</span><b>{num(sumUnits(pallet.lines, data))}</b></div><div><span>PESO BRUTO</span><b>{kg(palletWeight(pallet, data))}</b></div></div>
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

function ControlPage({ data, setData, notify, onOpenPallet }: { data: AppData; setData: React.Dispatch<React.SetStateAction<AppData>>; notify: (message: string, type?: ToastState["type"]) => void; onOpenPallet: (id: string) => void }) {
  const [trace, setTrace] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
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
      <section className="panel control-trace"><div className="panel-heading"><div><div className="eyebrow">TRAZABILIDAD</div><h2>Buscar palet, SSCC, pedido o carga</h2></div><Barcode size={18} className="muted-icon"/></div><div className="trace-search"><input value={trace} onChange={e => setTrace(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pallet) onOpenPallet(pallet.id); }} placeholder="PAL-00001 · 00… · PED-00001 · CAR-00001"/><button className="button secondary" onClick={() => setScanOpen(true)}><ScanLine size={16}/></button></div>{pallet && <div className="trace-result"><div><strong>{pallet.code}</strong><span>{pallet.location} · {sumBoxes(pallet.lines)} cajas · {kg(palletWeight(pallet, data))}</span><span>SSCC · <b className="mono">{pallet.sscc ?? "—"}</b></span></div><button className="button secondary" onClick={() => onOpenPallet(pallet.id)}>Abrir palet</button></div>}{(load || order) && <div className="trace-result"><div><strong>{load ? load.code : order?.id}</strong><span>{load ? `${load.palletIds.length} palets · ${dateTimeText(load.departureAt)}` : `${customerName(data, order!.customerId)} · ${dateText(order!.deliveryDate)}`}</span></div></div>}{pallet && <div className="trace-timeline">{movements.slice().reverse().map(event => <div key={event.id}><span className="timeline-dot"/><div><strong>{movementLabels[event.kind]}</strong><span>{event.summary}</span><small>{dateTimeText(event.date)}</small></div></div>)}{relatedLoads.map(l => <div key={`load-${l.id}`}><span className="timeline-dot"/><div><strong>{l.status === "CERRADA" ? "Expedición" : "Carga preparada"}</strong><span>{l.code} · {l.dock || "Sin muelle"}</span><small>{dateTimeText(l.closedAt ?? l.createdAt)}</small></div></div>)}</div>}</section>
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
    if (existingId) setData((current) => ({ ...current, orders: current.orders.map((order) => order.id === existingId ? { ...order, ...cleanDraft } : order) }));
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
    const pallet: Pallet = { ...draft, id, code: nextDocument("PAL", data.pallets.map((item) => item.code)), createdAt: new Date().toISOString(), orderPalletNo: draft.orderId ? Math.max(0, ...data.pallets.filter((item) => item.orderId === draft.orderId).map((item) => item.orderPalletNo ?? 0)) + 1 : undefined, labelRevision: 1, sscc: makeSscc(data.settings.companyPrefix, data.pallets.length + 1, data.settings.ssccExtension) };
    const movement: Movement = { id: makeId("mov"), date: new Date().toISOString(), kind: "FABRICACIÓN", palletId: id, orderId: pallet.orderId, summary: pallet.orderId ? "Palet confeccionado y reservado para pedido" : "Palet confeccionado y añadido a stock" };
    setData((current) => ({ ...current, pallets: [pallet, ...current.pallets], movements: [movement, ...current.movements] }));
    setModal({ kind: "label", id }); notify(`${pallet.code} creado · revisión 01. Etiqueta lista para imprimir.`);
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
      target = { id: targetId, code: nextDocument("PAL", data.pallets.map((item) => item.code)), createdAt: new Date().toISOString(), typeId: source.typeId, location: result.location, orderId: targetOrderId, customerId: targetOrderId ? order?.customerId : undefined, orderPalletNo: nextOrderPalletNo, status: targetOrderId ? "RESERVADO" : "DISPONIBLE", labelRevision: 1, sscc: makeSscc(data.settings.companyPrefix, data.pallets.length + 1, data.settings.ssccExtension), notes: "Palet mixto por consolidación de cajas", lines: [] };
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
    {visiblePallets.length ? <div className="pallet-grid">{visiblePallets.map((pallet) => { const order = data.orders.find((item) => item.id === pallet.orderId); const type = data.palletTypes.find((item) => item.id === pallet.typeId); const status = PALLET_STATUS_META[pallet.status]; return <article className="pallet-card" key={pallet.id}><div className="pallet-card-top"><span className="pallet-icon"><Package size={20} /></span><div className="pallet-card-id"><strong>{pallet.code}</strong><small>{type?.name ?? "Palet"}{order ? ` · Pedido ${String(pallet.orderPalletNo ?? 1).padStart(2, "0")}` : ""}</small></div><button className="icon-button" onClick={() => setModal({ kind: "pallet-detail", id: pallet.id })} aria-label="Opciones de palet"><MoreHorizontal size={18} /></button></div><div className="pallet-card-tags"><Status label={status.label} tone={status.tone} />{palletIsMixed(pallet) && <span className="mixed-tag">MIXTO</span>}<span className="revision-tag">REV {String(pallet.labelRevision).padStart(2, "0")}</span></div><div className="pallet-card-content">{pallet.lines.slice(0, 3).map((line) => <div className="pallet-card-line" key={line.id}><span>{data.articles.find((item) => item.id === line.articleId)?.name ?? "Artículo"}</span><strong>{num(line.boxes)} cajas</strong></div>)}{pallet.lines.length > 3 && <small className="cell-sub">+{pallet.lines.length - 3} referencias más</small>}{!pallet.lines.length && <small className="cell-sub">Sin cajas disponibles</small>}</div><div className="pallet-card-destination"><MapPin size={13} /><span>{order ? `${order.id} · ${customerName(data, order.customerId)}` : customerName(data, pallet.customerId)}</span></div><div className="pallet-fill"><div className="pallet-fill-row"><strong>{num(sumBoxes(pallet.lines))} cajas</strong><span>{kg(palletWeight(pallet, data))} bruto</span></div></div><div className="pallet-card-footer"><span><MapPin size={12} />{pallet.location}</span><span className="mono">SSCC {pallet.sscc ? ssccHuman(pallet.sscc) : "—"}</span><button className="text-button" onClick={() => setModal({ kind: "label", id: pallet.id })}><Printer size={14} /> Etiqueta</button></div></article>; })}</div> : <EmptyState icon={Package} title="No hay palets con este filtro" detail="Cambia el filtro o confecciona un palet nuevo." action={<button className="button primary" onClick={() => openPalletModal()}>Confeccionar palet</button>} />}
    <div className="bottom-hint"><Barcode size={16} /> Imprime la etiqueta al terminar cada confección. Si extraes cajas, el sistema incrementa la revisión del palet de origen.</div>
  </>;

  const loadsPage = <>
    <PageTitle eyebrow="LOGÍSTICA · EXPEDICIONES" title="Cargas" description="Prepara el orden de entrada al camión y genera el packing list." actions={<button className="button primary" onClick={() => setModal({ kind: "load" })}><Plus size={16} /> Nueva carga</button>} />
    {!selectedLoadId || !activeLoad ? <>
      <div className="table-toolbar"><div className="table-count"><strong>{data.loads.length}</strong> cargas registradas</div><div className="toolbar-filters"><span className="filter-label"><span className="load-status-dot" /> {data.loads.filter((load) => load.status === "BORRADOR").length} en preparación</span></div></div>
      {data.loads.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Carga</th><th>Destino / pedidos</th><th>Salida prevista</th><th>Palets</th><th>Peso</th><th>Estado</th><th></th></tr></thead><tbody>{data.loads.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((load) => { const pallets = load.palletIds.map((id) => data.pallets.find((pallet) => pallet.id === id)).filter((item): item is Pallet => Boolean(item)); const orders = [...new Set(pallets.map((pallet) => pallet.orderId).filter(Boolean))]; return <tr key={load.id} className="clickable-row" onClick={() => setSelectedLoadId(load.id)}><td><span className="primary-code">{load.code}</span><small className="cell-sub">{load.dock || "Sin muelle"}</small></td><td><strong>{orders.length ? `${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}` : "Carga manual"}</strong><small className="cell-sub">{orders.map((id) => customerName(data, data.orders.find((order) => order.id === id)?.customerId)).filter((value, index, array) => array.indexOf(value) === index).join(", ") || "Stock de cajas"}</small></td><td>{dateTimeText(load.departureAt)}</td><td>{num(pallets.length)}</td><td>{kg(loadWeight(pallets, data))}</td><td><Status label={load.status === "CERRADA" ? "Expedida" : "En preparación"} tone={load.status === "CERRADA" ? "green" : "orange"} /></td><td><button className="icon-button" aria-label="Abrir carga" onClick={(event) => { event.stopPropagation(); setSelectedLoadId(load.id); }}><ChevronRight size={17} /></button></td></tr>; })}</tbody></table></div> : <EmptyState icon={Truck} title="Sin cargas todavía" detail="Crea una salida y carga un pedido completo o selecciona palets manualmente." action={<button className="button primary" onClick={() => setModal({ kind: "load" })}>Preparar primera carga</button>} />}
      <div className="bottom-hint"><FileText size={16} /> Cada carga genera un packing list con la secuencia de palets y el peso por bulto.</div>
    </> : <LoadWorkspace data={data} load={activeLoad} allDraftIds={allDraftPalletIds} manualPalletId={manualPalletId} setManualPalletId={setManualPalletId} onBack={() => setSelectedLoadId(null)} onAddPallet={(id) => addPalletsToLoad(activeLoad.id, [id])} onAddOrder={(orderId) => addPalletsToLoad(activeLoad.id, data.pallets.filter((pallet) => pallet.orderId === orderId).map((pallet) => pallet.id))} onRemove={(palletId) => removePalletFromLoad(activeLoad.id, palletId)} onMove={(index, offset) => movePallet(activeLoad.id, index, offset)} onClose={() => closeLoad(activeLoad)} onUpdate={(patch) => updateLoad(activeLoad.id, patch)} onPacking={() => setModal({ kind: "packing", id: activeLoad.id })} onPallet={(id) => setModal({ kind: "pallet-detail", id })} />}
  </>;

  const masterTabs = ["Artículos", "Clientes", "Transporte", "Tipos de palet", "Datos y copias"];
  const mastersPage = <>
    <PageTitle eyebrow="CONFIGURACIÓN OPERATIVA" title="Maestros" description="Guarda una vez los artículos y datos que reutilizas en cada operación." actions={undefined} />
    <div className="master-tabs">{masterTabs.map((tab) => <button key={tab} className={masterTab === tab ? "active" : ""} onClick={() => setMasterTab(tab)}>{tab === "Artículos" ? <Boxes size={15} /> : tab === "Clientes" ? <Users size={15} /> : tab === "Transporte" ? <Truck size={15} /> : tab === "Tipos de palet" ? <Package size={15} /> : <ShieldCheck size={15} />}{tab}</button>)}</div>
    {masterTab === "Artículos" && <><div className="master-intro"><div><h2>Catálogo de artículos</h2><p>Formato, contenido por unidad, unidades por caja y cajas estándar por palet.</p></div><button className="button primary" onClick={() => setModal({ kind: "article" })}><Plus size={16} /> Nuevo artículo</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>SKU / artículo</th><th>Familia</th><th>Formato / contenido</th><th>Unidades / caja</th><th>Cajas estándar / palet</th><th>Peso caja</th><th>GTIN</th><th></th></tr></thead><tbody>{data.articles.map((item) => <tr key={item.id}><td><span className="sku-chip">{item.sku}</span><strong className="article-name">{item.name}</strong></td><td>{item.family}</td><td>{item.format} · {item.packSize}</td><td>{num(item.unitsPerBox)}</td><td>{num(item.boxesPerPallet)}</td><td>{kg(item.netKgPerBox)}</td><td><span className="mono muted-copy">{item.gtin || "—"}</span></td><td><button className="icon-button" title="Editar" onClick={() => setModal({ kind: "article", id: item.id })}><Pencil size={15} /></button><button className="icon-button danger-text" title="Eliminar" onClick={() => deleteArticle(item)}><X size={15} /></button></td></tr>)}</tbody></table>{!data.articles.length && <EmptyState icon={Boxes} title="Añade un artículo" detail="Configura bricks, botellas, cubos, cajas y equivalencias." action={<button className="button primary" onClick={() => setModal({ kind: "article" })}>Crear artículo</button>} />}</div></>}
    {masterTab === "Clientes" && <><div className="master-intro"><div><h2>Clientes y destinos</h2><p>Direcciones y notas de entrega disponibles al crear cada pedido.</p></div><button className="button primary" onClick={() => setModal({ kind: "customer" })}><Plus size={16} /> Nuevo cliente</button></div><div className="client-card-grid">{data.customers.map((item) => <article className="client-card" key={item.id}><div className="client-card-head"><span className="client-avatar">{item.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><button className="icon-button" onClick={() => setModal({ kind: "customer", id: item.id })}><Pencil size={15} /></button></div><strong>{item.name}</strong><span className="mono muted-copy">{item.code}</span><div className="client-address"><MapPin size={14} />{item.address}, {item.city}</div>{item.contact && <div className="client-contact">{item.contact}</div>}{item.notes && <div className="client-note">{item.notes}</div>}<button className="text-button danger-text" onClick={() => deleteCustomer(item)}>Quitar cliente <X size={14} /></button></article>)}{!data.customers.length && <EmptyState icon={Users} title="Añade el primer cliente" detail="Se guardará para tus próximos pedidos." action={<button className="button primary" onClick={() => setModal({ kind: "customer" })}>Crear cliente</button>} />}</div></>}
    {masterTab === "Transporte" && <><div className="master-intro"><div><h2>Transportistas y vehículos</h2><p>Asocia matrículas y capacidades para validar el peso de cada salida.</p></div><div className="master-actions"><button className="button secondary" onClick={() => setModal({ kind: "vehicle" })}><Plus size={15} /> Añadir vehículo</button><button className="button primary" onClick={() => setModal({ kind: "carrier" })}><Plus size={15} /> Transportista</button></div></div><div className="transport-grid">{data.carriers.map((carrier) => <article className="transport-card" key={carrier.id}><div className="transport-card-head"><span className="transport-icon"><Truck size={18} /></span><button className="icon-button" onClick={() => setModal({ kind: "carrier", id: carrier.id })}><Pencil size={15} /></button></div><strong>{carrier.name}</strong><span>{carrier.contact || "Sin teléfono"}</span><div className="vehicle-list">{data.vehicles.filter((vehicle) => vehicle.carrierId === carrier.id).map((vehicle) => <div key={vehicle.id}><span className="mono">{vehicle.plate}</span><span>{num(vehicle.maxWeightKg)} kg</span></div>)}</div></article>)}{!data.carriers.length && <EmptyState icon={Truck} title="Sin transportistas" detail="Puedes añadirlos ahora o más adelante." action={<button className="button primary" onClick={() => setModal({ kind: "carrier" })}>Añadir transportista</button>} />}</div></>}
    {masterTab === "Tipos de palet" && <><div className="master-intro"><div><h2>Tipos de palet</h2><p>Configura el tipo físico, la tara y el peso bruto máximo.</p></div><button className="button primary" onClick={() => setModal({ kind: "pallet-type" })}><Plus size={16} /> Nuevo tipo</button></div><div className="type-card-grid">{data.palletTypes.map((item) => <article className="type-card" key={item.id}><div className="type-icon"><Package size={20} /></div><div className="type-card-name"><strong>{item.name}</strong><span>Formato reutilizable en confección</span></div><div className="type-specs"><div><span>Peso máximo</span><b>{num(item.maxWeightKg)} kg</b></div><div><span>Tara</span><b>{num(item.tareKg, 1)} kg</b></div></div><button className="text-button" onClick={() => setModal({ kind: "pallet-type", id: item.id })}><Pencil size={14} /> Editar tipo</button></article>)}{!data.palletTypes.length && <EmptyState icon={Package} title="Añade un tipo de palet" detail="Define nombre, peso máximo y tara." action={<button className="button primary" onClick={() => setModal({ kind: "pallet-type" })}>Añadir tipo</button>} />}</div></>}
    {masterTab === "Datos y copias" && <div className="backup-stack"><div className="backup-panel"><div className="backup-icon"><ShieldCheck size={22} /></div><div className="backup-copy"><h2>Datos guardados en este navegador</h2><p>El trabajo diario se guarda aquí. Las copias incluyen la trazabilidad y la configuración profesional de SalsaLog.</p><div className="backup-meta"><span><CheckCircle2 size={14} /> Almacenamiento local activo · esquema v5</span><span>{num(data.articles.length)} artículos · {num(data.orders.length)} pedidos · {num(data.pallets.length)} palets · {num(data.audit.length)} auditorías</span></div></div><div className="backup-actions"><button className="button secondary" onClick={() => { void handleExport(); }}><Download size={16} /> Guardar copia</button><label className="button secondary file-button"><Upload size={16} /> Restaurar copia<input type="file" accept="application/json,.json" onChange={(event) => { void handleImport(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div></div><div className="backup-panel"><div className="backup-icon"><Barcode size={22} /></div><div className="backup-copy"><h2>Identificación GS1 / SSCC</h2><p>Los nuevos palets reciben un SSCC histórico de 18 dígitos. Configura aquí el prefijo de empresa antes de usarlo en producción.</p><div className="backup-meta"><span>Prefijo actual: <strong className="mono">{data.settings.companyPrefix}</strong></span><span>Extensión: <strong className="mono">{data.settings.ssccExtension}</strong></span></div></div><div className="backup-actions"><button className="button secondary" onClick={() => { const prefix = window.prompt("Prefijo GS1 de empresa (hasta 9 dígitos)", data.settings.companyPrefix); if (prefix === null) return; const clean = prefix.replace(/\D/g, "").slice(0,9); if (!clean) return notify("El prefijo GS1 no es válido.", "warning"); setData(current => ({...current, settings: {...current.settings, companyPrefix: clean}})); notify("Prefijo GS1 actualizado. Los SSCC existentes no cambian."); }}>Configurar GS1</button></div></div><div className="backup-panel"><div className="backup-icon"><Activity size={22} /></div><div className="backup-copy"><h2>Auditoría</h2><p>Registro inmutable a nivel de aplicación de las expediciones cerradas y futuras operaciones críticas.</p><div className="operator-list">{data.audit.slice(0,6).map(event => <div className="operator-row" key={event.id}><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.summary}</span></div><span className="mono">{dateTimeText(event.at)}</span></div>)}{!data.audit.length && <p className="muted-copy">Todavía no hay eventos de auditoría.</p>}</div></div></div></div>}
  </>;

  const operatorPage = <OperatorWorkspace data={data} onOpenPallet={(id) => setModal({ kind: "pallet-detail", id })} onPreparePallet={() => openPalletModal()} onLoad={() => setModal({ kind: "load" })} onGoPallets={() => setView("palets")} />;
  const controlPage = <ControlPage data={data} setData={setData} notify={notify} onOpenPallet={(id) => setModal({ kind: "pallet-detail", id })} />;
  const selectedPage = view === "inicio" ? dashboard : view === "operario" ? operatorPage : view === "pedidos" ? ordersPage : view === "palets" ? palletsPage : view === "cargas" ? loadsPage : view === "control" ? controlPage : mastersPage;

  const modalRender = () => {
    if (!modal) return null;
    const close = () => setModal(null);
    if (modal.kind === "order") return <Modal title="Nuevo pedido" eyebrow="PEDIDOS · ALTA" onClose={close}><OrderForm data={data} onCancel={close} onSubmit={(draft) => saveOrder(draft)} /></Modal>;
    if (modal.kind === "pallet") return <Modal title="Confeccionar palet" eyebrow="ALMACÉN · NUEVA UNIDAD LOGÍSTICA" onClose={close} size="wide"><PalletForm data={data} defaultOrderId={modal.orderId} onCancel={close} onSubmit={savePallet} onConfirm={askConfirmation} /></Modal>;
    if (modal.kind === "extract") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title="Extraer cajas" eyebrow="STOCK · REEMPAQUE" onClose={close} size="wide"><ExtractForm data={data} pallet={pallet} onCancel={close} onSubmit={(result) => saveExtraction(pallet.id, result)} /></Modal> : null; }
    if (modal.kind === "load") return <Modal title="Preparar salida" eyebrow="EXPEDICIÓN · NUEVA CARGA" onClose={close}><LoadForm data={data} onCancel={close} onSubmit={saveLoad} /></Modal>;
    if (modal.kind === "article") { const item = data.articles.find((article) => article.id === modal.id); return <Modal title={item ? "Editar artículo" : "Nuevo artículo"} eyebrow="MAESTROS · CATÁLOGO" onClose={close}><ArticleForm initial={item} onCancel={close} onSubmit={(draft) => addArticle(draft, item?.id)} /></Modal>; }
    if (modal.kind === "customer") { const item = data.customers.find((customer) => customer.id === modal.id); return <Modal title={item ? "Editar cliente" : "Nuevo cliente"} eyebrow="MAESTROS · CLIENTES" onClose={close}><CustomerForm initial={item} onCancel={close} onSubmit={(draft) => addCustomer(draft, item?.id)} /></Modal>; }
    if (modal.kind === "carrier") { const item = data.carriers.find((carrier) => carrier.id === modal.id); return <Modal title={item ? "Editar transportista" : "Nuevo transportista"} eyebrow="MAESTROS · TRANSPORTE" onClose={close}><CarrierForm initial={item} onCancel={close} onSubmit={(draft) => addCarrier(draft, item?.id)} /></Modal>; }
    if (modal.kind === "vehicle") return <Modal title="Añadir vehículo" eyebrow="MAESTROS · TRANSPORTE" onClose={close}><VehicleForm data={data} onCancel={close} onSubmit={addVehicle} /></Modal>;
    if (modal.kind === "pallet-type") { const item = data.palletTypes.find((type) => type.id === modal.id); return <Modal title={item ? "Editar tipo de palet" : "Nuevo tipo de palet"} eyebrow="MAESTROS · EMBALAJES" onClose={close}><PalletTypeForm initial={item} onCancel={close} onSubmit={(draft) => addPalletType(draft, item?.id)} /></Modal>; }
    if (modal.kind === "label") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title="Etiqueta logística" eyebrow={`PALET · ${pallet.code}`} onClose={close} size="print"><div className="print-actions"><span>Revisión {String(pallet.labelRevision).padStart(2, "0")} · Etiqueta lista para impresión</span><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Imprimir etiqueta</button></div><PalletLabel pallet={pallet} data={data} /><div className="print-bottom-hint"><ShieldCheck size={15} /> Si cambias la cantidad de cajas, la etiqueta de origen incrementa su revisión automáticamente.</div></Modal> : null; }
    if (modal.kind === "packing") { const load = data.loads.find((item) => item.id === modal.id); return load ? <Modal title="Packing list" eyebrow={`CARGA · ${load.code}`} onClose={close} size="print"><div className="print-actions"><span>Lista de carga · {load.palletIds.length} palets</span><button className="button primary" onClick={() => window.print()}><Printer size={16} /> Imprimir packing list</button></div><PackingList load={load} data={data} /><div className="print-bottom-hint"><FileText size={15} /> Incluye la secuencia, los pedidos, lotes y peso bruto por palet.</div></Modal> : null; }
    if (modal.kind === "pallet-detail") { const pallet = data.pallets.find((item) => item.id === modal.id); return pallet ? <Modal title={pallet.code} eyebrow="FICHA DE PALET" onClose={close} size="wide"><PalletDetail data={data} pallet={pallet} onLabel={() => setModal({ kind: "label", id: pallet.id })} onExtract={() => setModal({ kind: "extract", id: pallet.id })} movements={data.movements.filter((event) => event.palletId === pallet.id || event.relatedPalletId === pallet.id)} /></Modal> : null; }
    if (modal.kind === "order-detail") { const order = data.orders.find((item) => item.id === modal.id); return order ? <Modal title={order.id} eyebrow="FICHA DE PEDIDO" onClose={close} size="wide"><OrderDetail data={data} order={order} onPrepare={() => { setModal({ kind: "pallet", orderId: order.id }); }} onLoad={() => { setModal({ kind: "load" }); }} /></Modal> : null; }
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
      <div className="content-area">{(installPrompt || showChromeInstallHint) && <div className="install-hint" role="status"><span>{installPrompt ? "Instala SalsaLog en este dispositivo para abrirla como una app." : "Chrome: abre ⋮ → Instalar aplicación (en ordenador: Enviar, guardar y compartir → Instalar página como aplicación). Comprueba que has abierto la web por HTTPS."}</span><div className="install-hint-actions">{installPrompt ? <button className="button small secondary" onClick={() => { void installApp(); }}><Download size={14} /> Instalar app</button> : <button className="text-button" onClick={() => setShowChromeInstallHint(false)}>Entendido <X size={13} /></button>}</div></div>}{showIosInstallHint && <div className="install-hint" role="status"><span>En iPhone/iPad: toca Compartir y elige «Añadir a pantalla de inicio».</span><button className="text-button" onClick={() => setShowIosInstallHint(false)}>Entendido <X size={13} /></button></div>}{selectedPage}</div><footer className="app-footer"><span><Logo /> <small>Control de expedición alimentaria</small></span><span>Versión 1.0 <i /> {new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</span></footer>
    </main>
    {toast && <div className={`toast ${toast.type}`} role="status"><span className="toast-icon">{toast.type === "error" ? <AlertTriangle size={16} /> : toast.type === "warning" ? <AlertTriangle size={16} /> : <CheckCircle2 size={17} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    {modalRender()}
    <ConfirmDialog options={confirmation} onResolve={resolveConfirmation} />
  </div>;

  function LayersIcon() { return <span className="stacked-icon"><Boxes size={16} /></span>; }
  function RotateIcon() { return <span className="rotate-glyph">↻</span>; }
  function PalletDetail({ pallet, data, onLabel, onExtract, movements }: { pallet: Pallet; data: AppData; onLabel: () => void; onExtract: () => void; movements: Movement[] }) {
    const order = data.orders.find((item) => item.id === pallet.orderId); const type = data.palletTypes.find((item) => item.id === pallet.typeId);
    const canExtract = pallet.status === "DISPONIBLE" && pallet.lines.some((line) => line.boxes > 0) && !allDraftPalletIds.includes(pallet.id);
    const status = PALLET_STATUS_META[pallet.status];
    return <><div className="detail-hero"><div className="detail-hero-icon"><Package size={22} /></div><div className="detail-hero-copy"><strong>{pallet.code}</strong><span>{type?.name} · {pallet.location}</span>{order && <small className="order-seq-detail">Orden {String(pallet.orderPalletNo ?? 1).padStart(2, "0")} del pedido {order.id}</small>}</div><Status label={status.label} tone={status.tone} /><span className="revision-tag">REV {String(pallet.labelRevision).padStart(2, "0")}</span></div>
      <div className="detail-actions"><button className="button secondary" onClick={onLabel}><Printer size={15} /> Ver etiqueta</button>{canExtract && <button className="button primary" onClick={onExtract}><ArrowDown size={15} /> Extraer cajas</button>}</div>
      <div className="detail-stats"><div><span>CAJAS</span><strong>{num(sumBoxes(pallet.lines))}</strong></div><div><span>UNIDADES</span><strong>{num(sumUnits(pallet.lines, data))}</strong></div><div><span>PESO BRUTO</span><strong>{kg(palletWeight(pallet, data))}</strong></div><div><span>DESTINO</span><strong>{order?.id ?? customerName(data, pallet.customerId)}</strong></div></div>
      <div className="detail-section"><div className="section-heading"><h3>Contenido y trazabilidad</h3>{palletIsMixed(pallet) && <span className="mixed-tag">PALET MIXTO</span>}</div><div className="detail-lines">{pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="detail-line" key={line.id}><div className="detail-line-symbol"><Boxes size={16} /></div><div className="detail-line-main"><strong>{article?.sku} · {article?.name}</strong><span>{line.format ?? article?.format} {line.packSize ?? article?.packSize} · {line.unitsPerBox ?? article?.unitsPerBox} unidades / caja</span><small>Lote <b>{line.lot}</b> · Caducidad {dateText(line.expiry)}{line.sourcePalletId && <span> · Procede de {data.pallets.find((item) => item.id === line.sourcePalletId)?.code ?? "palet origen"}</span>}</small></div><div className="detail-line-qty"><strong>{num(line.boxes)}</strong><span>cajas</span></div><div className="detail-line-qty units"><strong>{num(line.boxes * (line.unitsPerBox ?? article?.unitsPerBox ?? 0))}</strong><span>unidades</span></div></div>; })}{!pallet.lines.length && <p className="muted-copy">Sin cajas disponibles en este palet.</p>}</div></div>
      <div className="detail-section movement-section"><div className="section-heading"><h3>Historial de movimientos</h3><span className="muted-copy">{movements.length} eventos</span></div>{movements.slice().reverse().map((event) => <div className="movement-row" key={event.id}><span className="movement-marker" /><div><strong>{movementLabels[event.kind]}</strong><span>{event.summary}</span></div><small>{dateTimeText(event.date)}</small></div>)}{!movements.length && <p className="muted-copy">Sin movimientos registrados.</p>}</div>
    </>;
  }
  function OrderDetail({ order, data, onPrepare, onLoad }: { order: Order; data: AppData; onPrepare: () => void; onLoad: () => void }) {
    const status = orderStatus(order, data); const customer = data.customers.find((item) => item.id === order.customerId); const related = data.pallets.filter((pallet) => pallet.orderId === order.id);
    return <><div className="order-detail-head"><div className="detail-hero-icon"><FileText size={21} /></div><div className="detail-hero-copy"><strong>{customer?.name ?? "Cliente"}</strong><span>{order.reference ? `Referencia ${order.reference} · ` : ""}{order.deliveryAddress}</span><small><CalendarDays size={13} /> Entrega {dateText(order.deliveryDate)} · {relativeDate(order.deliveryDate)}</small></div><Status label={status.label} tone={status.tone} /></div>
      <div className="order-progress-card"><div><span>{status.label === "Expedición parcial" || status.label === "Expedido" ? "PROGRESO DE EXPEDICIÓN" : "PREPARACIÓN DEL PEDIDO"}</span><strong>{status.percent}%</strong></div><Progress value={status.percent} /><small>{status.label === "Expedición parcial" || status.label === "Expedido" ? "El avance refleja las cajas de este pedido que ya salieron." : "Las cajas se cuentan desde palets reservados o expedidos para este pedido."}</small></div>
      <div className="detail-section"><div className="section-heading"><h3>Líneas de pedido</h3><span className="muted-copy">{order.lines.length} referencias</span></div><div className="order-line-list">{order.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); const assigned = progressForLine(line, data.pallets, order.id); const remaining = Math.max(0, line.boxes - assigned); return <div className="order-detail-line" key={line.articleId}><div className="detail-line-symbol"><Boxes size={16} /></div><div className="order-detail-line-main"><strong>{article?.sku} · {article?.name}</strong><span>{article?.format} {article?.packSize} · {line.boxes * (article?.unitsPerBox ?? 0)} unidades solicitadas</span><Progress value={line.boxes ? (assigned / line.boxes) * 100 : 0} /></div><div className="order-qty"><strong>{num(assigned)} <small>/ {num(line.boxes)}</small></strong><span>cajas asignadas</span></div><div className={`remaining-boxes ${remaining ? "pending" : "complete"}`}>{remaining ? `${num(remaining)} pendientes` : "Completo"}</div></div>; })}</div></div>
      <div className="detail-section"><div className="section-heading"><h3>Palets asignados</h3><span className="muted-copy">{related.length} palets · lotes y caducidades</span></div>{related.length ? <div className="related-pallet-list">{related.map((pallet) => <div key={pallet.id}><Package size={15} /><strong>{pallet.code} · Orden {String(pallet.orderPalletNo ?? 1).padStart(2, "0")}</strong><span className="pallet-traceability">{pallet.lines.length ? pallet.lines.map((line) => { const article = data.articles.find((item) => item.id === line.articleId); return `${line.boxes} cajas · ${article?.name ?? "Artículo"} · ${line.format ?? article?.format ?? "—"} ${line.packSize ?? article?.packSize ?? ""} · ${line.unitsPerBox ?? article?.unitsPerBox ?? 0} uds/caja · Lote ${line.lot || "—"} · Cad. ${dateText(line.expiry)}`; }).join(" / ") : "Sin cajas actuales"}</span><Status label={PALLET_STATUS_META[pallet.status].label} tone={PALLET_STATUS_META[pallet.status].tone} /></div>)}</div> : <p className="muted-copy">Todavía no hay palets asignados a este pedido.</p>}</div>
      {order.notes && <div className="order-note-box"><span>NOTAS DE ENTREGA</span><p>{order.notes}</p></div>}<div className="detail-actions"><button className="button secondary" onClick={onLoad}><Truck size={15} /> Preparar salida</button><button className="button primary" onClick={onPrepare}><Package size={15} /> Confeccionar palet</button></div>
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
    <div className="operator-grid"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">FEFO</div><h2>Primero sale lo que antes caduca</h2></div><ShieldCheck size={17} className="muted-icon" /></div><div className="operator-list">{fefo.length ? fefo.map((pallet, index) => { const soon = pallet.lines.filter((line) => line.boxes > 0).sort((a,b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"))[0]; return <button key={pallet.id} className="operator-row" onClick={() => onOpenPallet(pallet.id)}><span className="sequence-badge">{String(index + 1).padStart(2, "0")}</span><div><strong>{pallet.code}</strong><span>{pallet.location} · {sumBoxes(pallet.lines)} cajas</span></div><div className={`expiry-chip ${expiryLevel(soon?.expiry)}`}>{soon?.expiry ? dateText(soon.expiry) : "Sin fecha"}</div></button> }) : <p className="muted-copy">No hay palets disponibles para recomendar.</p>}</div></section><section className="panel"><div className="panel-heading"><div><div className="eyebrow">CONTROL DE CADUCIDADES</div><h2>Alertas</h2></div><span className="nav-count">{alerts.length}</span></div>{alerts.length ? <div className="operator-list">{alerts.slice(0, 8).map((alert) => <button key={`${alert.palletId}-${alert.lot}`} className="operator-row" onClick={() => onOpenPallet(alert.palletId)}><div className={`expiry-dot ${alert.level}`} /><div><strong>{alert.palletCode}</strong><span>{articleName(data, alert.articleId)} · Lote {alert.lot || "—"} · {alert.boxes} cajas</span></div><div className={`expiry-chip ${alert.level}`}>{alert.expiry ? dateText(alert.expiry) : "Sin fecha"}</div></button>)}</div> : <div className="operator-ok"><CheckCircle2 size={20} /><strong>Sin alertas de caducidad</strong><span>El stock está dentro de los márgenes configurados.</span></div>}</section></div>
  </div>;
}

function LoadWorkspace({ data, load, allDraftIds, manualPalletId, setManualPalletId, onBack, onAddPallet, onAddOrder, onRemove, onMove, onClose, onPacking, onPallet }: { data: AppData; load: Load; allDraftIds: string[]; manualPalletId: string; setManualPalletId: (id: string) => void; onBack: () => void; onAddPallet: (id: string) => void; onAddOrder: (id: string) => void; onRemove: (id: string) => void; onMove: (index: number, offset: number) => void; onClose: () => void; onUpdate: (patch: Partial<Load>) => void; onPacking: () => void; onPallet: (id: string) => void }) {
  const pallets = load.palletIds.map((id) => data.pallets.find((pallet) => pallet.id === id)).filter((item): item is Pallet => Boolean(item));
  const orders = data.orders.filter((order) => data.pallets.some((pallet) => pallet.orderId === order.id && ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0));
  const occupiedElsewhere = data.loads.filter((item) => item.status === "BORRADOR" && item.id !== load.id).flatMap((item) => item.palletIds);
  const manualOptions = data.pallets.filter((pallet) => ["DISPONIBLE", "RESERVADO"].includes(pallet.status) && pallet.lines.length > 0 && !allDraftIds.includes(pallet.id) && !occupiedElsewhere.includes(pallet.id) && !load.palletIds.includes(pallet.id));
  const carrier = data.carriers.find((item) => item.id === load.carrierId); const vehicle = data.vehicles.find((item) => item.id === load.vehicleId);
  const closed = load.status === "CERRADA";
  return <><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Todas las cargas</button><div className="load-workspace-head"><div><div className="eyebrow">{closed ? "HISTÓRICO DE EXPEDICIÓN" : "CARGA EN PREPARACIÓN"}</div><h2>{load.code}</h2><div className="load-head-meta"><span><Truck size={14} />{carrier?.name ?? "Transportista sin asignar"}{vehicle ? ` · ${vehicle.plate}` : ""}</span><span><MapPin size={14} />{load.dock || "Sin muelle"}</span><span><CalendarDays size={14} />{dateTimeText(load.departureAt)}</span></div></div><Status label={closed ? "Expedida" : "Borrador"} tone={closed ? "green" : "orange"} /></div>
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
