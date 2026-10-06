import { useState } from "react";
import type { AppData, Article, Carrier, Customer, Load, Order, OrderLine, Pallet, PalletLine, PalletType } from "../types";
import { netWeight } from "../utils/calculations";
import { makeId } from "../utils/ids";
import type { ConfirmOptions } from "./ConfirmDialog";

const localDate = (offset = 0) => { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); };
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
const Actions = ({ onCancel, label = "Guardar" }: { onCancel: () => void; label?: string }) => <div className="form-actions"><button className="button secondary" type="button" onClick={onCancel}>Cancelar</button><button className="button primary" type="submit">{label}</button></div>;

export function OrderForm({ data, initial, onCancel, onSubmit }: { data: AppData; initial?: Order; onCancel: () => void; onSubmit: (order: Omit<Order, "id" | "createdAt">) => void }) {
  const [customerId, setCustomerId] = useState(initial?.customerId ?? data.customers[0]?.id ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [deliveryDate, setDeliveryDate] = useState(initial?.deliveryDate ?? localDate(2));
  const [deliveryAddress, setDeliveryAddress] = useState(initial?.deliveryAddress ?? (data.customers[0] ? `${data.customers[0].address}${data.customers[0].city ? ` · ${data.customers[0].city}` : ""}` : ""));
  const [priority, setPriority] = useState<Order["priority"]>(initial?.priority ?? "Normal");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<OrderLine[]>(initial?.lines ?? (data.articles[0] ? [{ articleId: data.articles[0].id, boxes: 1 }] : []));
  const customer = data.customers.find((item) => item.id === customerId);
  const addLine = () => setLines((items) => [...items, { articleId: data.articles.find((article) => article.active && !items.some((line) => line.articleId === article.id))?.id ?? "", boxes: 1 }]);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ reference: reference.trim(), customerId, deliveryDate, deliveryAddress, priority, notes: notes.trim(), lines: lines.filter((line) => line.articleId && line.boxes > 0) }); }}>
    <div className="form-grid">
      <Field label="Cliente"><select required value={customerId} onChange={(event) => { const id = event.target.value; setCustomerId(id); const selected = data.customers.find((item) => item.id === id); setDeliveryAddress(selected ? `${selected.address}${selected.city ? ` · ${selected.city}` : ""}` : ""); }}><option value="">Seleccionar cliente</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Referencia del cliente"><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ej. OC-88371" /></Field>
      <Field label="Fecha de entrega"><input type="date" required value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></Field>
      <Field label="Prioridad"><select value={priority} onChange={(event) => setPriority(event.target.value as Order["priority"])}><option>Normal</option><option>Alta</option><option>Urgente</option></select></Field>
      <Field label="Dirección de entrega"><input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder={customer?.address ?? "Dirección"} /></Field>
      <Field label="Indicaciones"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Muelle, horario, temperatura…" /></Field>
    </div>
    <div className="line-editor-head"><div><strong>Artículos del pedido</strong><span> Cantidades en cajas</span></div><button className="button small secondary" type="button" onClick={addLine}>+ Añadir línea</button></div>
    <div className="line-editor">
      {lines.map((line, index) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="line-editor-row" key={index}>
        <select required value={line.articleId} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, articleId: event.target.value } : item))}><option value="">Seleccionar artículo</option>{data.articles.filter((item) => item.active && (item.id === line.articleId || !lines.some((other, otherIndex) => otherIndex !== index && other.articleId === item.id))).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
        <input aria-label="Cajas pedidas" type="number" min="1" step="1" required value={line.boxes} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, boxes: Number(event.target.value) } : item))} />
        <span className="line-equivalent">{article ? `${line.boxes * article.unitsPerBox} uds · ${line.boxes * article.netKgPerBox} kg` : "—"}</span>
        <button className="icon-button danger-text" aria-label="Quitar línea" type="button" onClick={() => setLines((items) => items.filter((_, at) => at !== index))} disabled={lines.length <= 1}>×</button>
      </div>; })}
    </div>
    {!data.articles.length && <p className="form-warning">Añade primero artículos desde Maestros.</p>}
    <Actions onCancel={onCancel} label={initial ? "Guardar cambios" : "Crear pedido"} />
  </form>;
}

type PalletDraft = Omit<Pallet, "id" | "code" | "createdAt" | "labelRevision">;
export function PalletForm({ data, onCancel, onSubmit, onConfirm, defaultOrderId }: { data: AppData; onCancel: () => void; onSubmit: (pallet: PalletDraft) => void | Promise<void>; onConfirm: (options: ConfirmOptions) => Promise<boolean>; defaultOrderId?: string }) {
  const [assignment, setAssignment] = useState<"stock" | "bricks" | "order" | "customer">(defaultOrderId ? "order" : "stock");
  const [orderId, setOrderId] = useState(defaultOrderId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [typeId, setTypeId] = useState(data.palletTypes[0]?.id ?? "");
  const [location, setLocation] = useState("Cámara · A-01");
  const [notes, setNotes] = useState("");
  const makeLine = (selectedArticleId?: string): Omit<PalletLine, "id"> => {
    const article = selectedArticleId === undefined ? data.articles.find((item) => item.active) : data.articles.find((item) => item.id === selectedArticleId);
    return { articleId: article?.id ?? selectedArticleId ?? "", format: article?.format ?? "", packSize: article?.packSize ?? "", unitsPerBox: article?.unitsPerBox ?? 1, netKgPerBox: article?.netKgPerBox ?? 0, lot: "", expiry: "", boxes: 1 };
  };
  const [lines, setLines] = useState<Omit<PalletLine, "id">[]>(() => [makeLine()]);
  const addLine = () => setLines((items) => [...items, makeLine()]);
  const changeArticle = (index: number, articleId: string) => {
    const defaults = makeLine(articleId);
    setLines((items) => items.map((item, at) => at === index ? { ...item, articleId: defaults.articleId, format: defaults.format, packSize: defaults.packSize, unitsPerBox: defaults.unitsPerBox, netKgPerBox: defaults.netKgPerBox } : item));
  };
  const bricksMode = assignment === "bricks";
  const toUnits = (line: Omit<PalletLine, "id">) => ({ ...line, unitsPerBox: 1, netKgPerBox: Number(line.netKgPerBox) > 0 && (line.unitsPerBox ?? 0) > 0 ? Number(line.netKgPerBox) / (line.unitsPerBox as number) : 0 });
  const totalBoxes = lines.reduce((sum, line) => sum + line.boxes, 0);
  const kg = netWeight((bricksMode ? lines.map(toUnits) : lines).map((line) => ({ ...line, id: "" })), data) + (data.palletTypes.find((item) => item.id === typeId)?.tareKg ?? 0);
  const palletType = data.palletTypes.find((item) => item.id === typeId);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!lines.length || lines.some((line) => !line.articleId || !line.format?.trim() || !line.packSize?.trim() || !line.unitsPerBox || line.unitsPerBox <= 0 || !line.lot.trim() || !line.expiry || line.boxes <= 0)) return;
    if (palletType && kg > palletType.maxWeightKg && !(await onConfirm({
      title: "El palet supera el peso máximo",
      message: "El peso bruto estimado supera el límite configurado para este tipo de palet.",
      details: `Peso estimado: ${kg.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kg · máximo: ${palletType.maxWeightKg.toLocaleString("es-ES")} kg.`,
      confirmLabel: "Guardar igualmente",
      tone: "warning",
    }))) return;
    const selectedOrder = data.orders.find((order) => order.id === orderId);
    const resolvedCustomer = assignment === "order" ? selectedOrder?.customerId : assignment === "customer" ? customerId : "";
    await onSubmit({ typeId, location: location.trim(), orderId: assignment === "order" ? orderId : undefined, customerId: resolvedCustomer || undefined, status: assignment === "stock" || assignment === "bricks" ? "DISPONIBLE" : "RESERVADO", stockKind: bricksMode ? "bricks" : undefined, notes: notes.trim(), lines: lines.map((raw) => bricksMode ? toUnits(raw) : raw).map((line) => ({ ...line, id: makeId("lin"), format: line.format!.trim(), packSize: line.packSize!.trim(), unitsPerBox: line.unitsPerBox!, netKgPerBox: Number(line.netKgPerBox) > 0 ? Number(line.netKgPerBox) : 0, lot: line.lot.trim() })) });
  };
  return <form onSubmit={submit}>
    <div className="form-grid">
      <Field label="Destino del palet"><select value={assignment} onChange={(event) => setAssignment(event.target.value as typeof assignment)}><option value="stock">Stock de cajas</option><option value="bricks">Stock de bricks (unidades sueltas)</option><option value="order">Asignar a un pedido</option><option value="customer">Reservar para un cliente</option></select></Field>
      {assignment === "order" && <Field label="Pedido"><select required value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Selecciona pedido</option>{data.orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {data.customers.find((item) => item.id === order.customerId)?.name}</option>)}</select></Field>}
      {assignment === "customer" && <Field label="Cliente"><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Selecciona cliente</option>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      <Field label="Tipo de palet"><select required value={typeId} onChange={(event) => setTypeId(event.target.value)}>{data.palletTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Ubicación"><input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Cámara · A-01" /></Field>
      <Field label="Observaciones"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Identificación de línea, turno…" /></Field>
    </div>
    <div className="line-editor-head"><div><strong>Contenido del palet</strong><span> Puedes combinar artículos y lotes</span></div><button className="button small secondary" type="button" onClick={addLine}>+ Añadir artículo</button></div>
    <datalist id="pallet-format-options"><option value="Brick" /><option value="Botella" /><option value="Cubo" /><option value="Tarro" /><option value="Bolsa" /><option value="Otro" /></datalist>
    <div className="line-editor pallet-lines">{lines.map((line, index) => <div className="pallet-line-row" key={index}>
      <div className="pallet-line-product">
        <Field label="Artículo"><select required value={line.articleId} onChange={(event) => changeArticle(index, event.target.value)}><option value="">Selecciona artículo</option>{data.articles.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></Field>
        <Field label="Formato"><input required list="pallet-format-options" value={line.format ?? ""} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, format: event.target.value } : item))} placeholder="Brick / Botella / Cubo" /></Field>
        <Field label="Contenido por unidad"><input required value={line.packSize ?? ""} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, packSize: event.target.value } : item))} placeholder="1 L · 500 ml" /></Field>
        {!bricksMode && <Field label="Unidades por caja"><input required type="number" min="1" step="1" value={line.unitsPerBox ?? 1} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, unitsPerBox: Number(event.target.value) } : item))} /></Field>}
      </div>
      <div className="pallet-line-trace">
        <Field label="Lote"><input required value={line.lot} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, lot: event.target.value } : item))} placeholder="Lote" /></Field>
        <Field label="Caducidad"><input required type="date" value={line.expiry} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, expiry: event.target.value } : item))} /></Field>
        <Field label={bricksMode ? "Bricks (unidades)" : "Cajas"}><input required type="number" min="1" step="1" value={line.boxes} onChange={(event) => setLines((items) => items.map((item, at) => at === index ? { ...item, boxes: Number(event.target.value) } : item))} /></Field>
        <button className="icon-button danger-text" type="button" aria-label="Quitar línea" disabled={lines.length <= 1} onClick={() => setLines((items) => items.filter((_, at) => at !== index))}>×</button>
      </div>
    </div>)}</div>
    <div className="capacity-note"><span>{bricksMode ? `${totalBoxes} bricks sueltos en este palet` : `${totalBoxes} cajas · ${lines.reduce((sum, line) => sum + line.boxes * (line.unitsPerBox ?? 0), 0)} unidades en este palet`}</span><span>{kg.toFixed(1)} kg brutos · máximo {palletType?.maxWeightKg ?? 0} kg</span></div>
    <Actions onCancel={onCancel} label="Crear palet y etiqueta" />
  </form>;
}

export function PalletEditForm({ data, pallet, onCancel, onSubmit }: { data: AppData; pallet: Pallet; onCancel: () => void; onSubmit: (changes: { typeId: string; location: string; notes: string; lines: PalletLine[] }) => void }) {
  const [typeId, setTypeId] = useState(pallet.typeId);
  const [location, setLocation] = useState(pallet.location);
  const [notes, setNotes] = useState(pallet.notes ?? "");
  const [lines, setLines] = useState<PalletLine[]>(pallet.lines);
  const locations = data.locations.includes(location) ? data.locations : [location, ...data.locations];
  const update = (index: number, patch: Partial<PalletLine>) => setLines((items) => items.map((item, at) => at === index ? { ...item, ...patch } : item));
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ typeId, location, notes, lines: lines.filter((line) => line.boxes > 0) }); }}>
    <div className="form-grid">
      <Field label="Tipo de palet"><select value={typeId} onChange={(event) => setTypeId(event.target.value)}>{data.palletTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Ubicación"><select value={location} onChange={(event) => setLocation(event.target.value)}>{locations.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
      <Field label="Notas"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones del palet" /></Field>
    </div>
    <div className="line-editor-head"><div><strong>Contenido del palet</strong><span> Lote, caducidad y cajas</span></div></div>
    <div className="pallet-lines">
      {lines.map((line, index) => { const article = data.articles.find((item) => item.id === line.articleId); return <div className="pallet-line-row" key={line.id}>
        <strong>{article ? `${article.sku} · ${article.name}` : "Artículo"}</strong>
        <input aria-label="Lote" required value={line.lot} onChange={(event) => update(index, { lot: event.target.value })} placeholder="Lote" />
        <input aria-label="Caducidad" type="date" value={line.expiry ?? ""} onChange={(event) => update(index, { expiry: event.target.value })} />
        <input aria-label="Cajas" type="number" min="1" step="1" required value={line.boxes} onChange={(event) => update(index, { boxes: Number(event.target.value) })} />
        <button className="icon-button danger-text" aria-label="Quitar línea" type="button" onClick={() => setLines((items) => items.filter((_, at) => at !== index))} disabled={lines.length <= 1}>×</button>
      </div>; })}
    </div>
    <p className="subtle-note">Si cambias lote, caducidad o cajas, la etiqueta sube de revisión y hay que volver a imprimirla.</p>
    <Actions onCancel={onCancel} label="Guardar cambios" />
  </form>;
}

export function ExtractForm({ data, pallet, onCancel, onSubmit }: { data: AppData; pallet: Pallet; onCancel: () => void; onSubmit: (result: { lineId: string; boxes: number; targetPalletId: string; orderId: string; location: string }) => void }) {
  const [lineId, setLineId] = useState(pallet.lines.find((line) => line.boxes > 0)?.id ?? "");
  const [boxes, setBoxes] = useState(1);
  const [targetPalletId, setTargetPalletId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [location, setLocation] = useState("Zona de consolidación");
  const line = pallet.lines.find((item) => item.id === lineId);
  const article = line && data.articles.find((item) => item.id === line.articleId);
  const candidates = data.pallets.filter((item) => item.id !== pallet.id && ["DISPONIBLE", "RESERVADO"].includes(item.status) && item.lines.length > 0);
  return <form onSubmit={(event) => { event.preventDefault(); if (line && boxes > 0 && boxes <= line.boxes) onSubmit({ lineId, boxes, targetPalletId, orderId, location }); }}>
    <div className="source-summary"><span className="source-icon">↗</span><div><strong>{pallet.code}</strong><span>{data.customers.find((item) => item.id === pallet.customerId)?.name ?? "Stock de cajas"} · origen de las cajas</span></div></div>
    <div className="form-grid">
      <Field label="Artículo y lote"><select value={lineId} onChange={(event) => { setLineId(event.target.value); setBoxes(1); }}>{pallet.lines.filter((item) => item.boxes > 0).map((item) => <option key={item.id} value={item.id}>{data.articles.find((articleItem) => articleItem.id === item.articleId)?.name} · {item.lot} · {item.boxes} cajas</option>)}</select></Field>
      <Field label="Cajas a extraer" hint={line ? `Disponible en origen: ${line.boxes} cajas` : ""}><input type="number" min="1" max={line?.boxes ?? 1} step="1" value={boxes} onChange={(event) => setBoxes(Number(event.target.value))} /></Field>
      <Field label="Palet de destino"><select value={targetPalletId} onChange={(event) => setTargetPalletId(event.target.value)}><option value="">Crear nuevo palet mixto</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.lines.reduce((sum, current) => sum + current.boxes, 0)} cajas · {item.location}</option>)}</select></Field>
      <Field label="Asignar consolidación a pedido"><select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Sin asignar · stock de cajas</option>{data.orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {data.customers.find((item) => item.id === order.customerId)?.name}</option>)}</select></Field>
      {!targetPalletId && <Field label="Ubicación del nuevo palet"><input required value={location} onChange={(event) => setLocation(event.target.value)} /></Field>}
    </div>
    {line && article && <div className="extract-impact"><strong>{boxes} cajas</strong><span>≈ {boxes * (line.unitsPerBox ?? article.unitsPerBox)} unidades · {line.format ?? article.format} {line.packSize ?? article.packSize} · {article.name}</span><span>Etiqueta de origen: revisión {pallet.labelRevision} → {pallet.labelRevision + 1}</span></div>}
    <p className="subtle-note">El lote y la caducidad viajan con las cajas. Se conservará el vínculo entre ambos palets.</p>
    <Actions onCancel={onCancel} label="Extraer y actualizar etiquetas" />
  </form>;
}

export function LoadForm({ data, onCancel, onSubmit }: { data: AppData; onCancel: () => void; onSubmit: (draft: { orderId: string; carrierId: string; vehicleId: string; dock: string; departureAt: string; notes: string }) => void }) {
  const [orderId, setOrderId] = useState("");
  const [carrierId, setCarrierId] = useState(data.carriers[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState("");
  const [dock, setDock] = useState("Muelle 1");
  const [departureAt, setDepartureAt] = useState(`${localDate()}T08:00`);
  const [notes, setNotes] = useState("");
  const vehicles = data.vehicles.filter((vehicle) => !carrierId || vehicle.carrierId === carrierId);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ orderId, carrierId, vehicleId, dock: dock.trim(), departureAt, notes: notes.trim() }); }}>
    <div className="form-intro"><span className="intro-icon">↗</span><div><strong>¿Cómo quieres preparar esta salida?</strong><p>Selecciona un pedido para cargar todos sus palets disponibles o deja el campo vacío y añade palets manualmente.</p></div></div>
    <div className="form-grid">
      <Field label="Pedido (opcional)"><select value={orderId} onChange={(event) => setOrderId(event.target.value)}><option value="">Carga manual / varios pedidos</option>{data.orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {data.customers.find((item) => item.id === order.customerId)?.name}</option>)}</select></Field>
      <Field label="Transportista"><select value={carrierId} onChange={(event) => { setCarrierId(event.target.value); setVehicleId(""); }}><option value="">Seleccionar transportista</option>{data.carriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Matrícula"><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Seleccionar vehículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.maxWeightKg.toLocaleString("es-ES")} kg</option>)}</select></Field>
      <Field label="Muelle"><input value={dock} onChange={(event) => setDock(event.target.value)} /></Field>
      <Field label="Salida prevista"><input type="datetime-local" required value={departureAt} onChange={(event) => setDepartureAt(event.target.value)} /></Field>
      <Field label="Observaciones"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para la carga" /></Field>
    </div>
    <Actions onCancel={onCancel} label="Crear carga" />
  </form>;
}

export function LoadEditForm({ data, load, onCancel, onSubmit }: { data: AppData; load: Load; onCancel: () => void; onSubmit: (patch: { carrierId?: string; vehicleId?: string; dock: string; departureAt: string; notes: string }) => void }) {
  const [carrierId, setCarrierId] = useState(load.carrierId ?? "");
  const [vehicleId, setVehicleId] = useState(load.vehicleId ?? "");
  const [dock, setDock] = useState(load.dock ?? "");
  const [departureAt, setDepartureAt] = useState(load.departureAt);
  const [notes, setNotes] = useState(load.notes ?? "");
  const vehicles = data.vehicles.filter((vehicle) => !carrierId || vehicle.carrierId === carrierId);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ carrierId: carrierId || undefined, vehicleId: vehicleId || undefined, dock: dock.trim(), departureAt, notes: notes.trim() }); }}>
    <div className="form-grid">
      <Field label="Transportista"><select value={carrierId} onChange={(event) => { setCarrierId(event.target.value); setVehicleId(""); }}><option value="">Seleccionar transportista</option>{data.carriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Matrícula"><select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Seleccionar vehículo</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.maxWeightKg.toLocaleString("es-ES")} kg</option>)}</select></Field>
      <Field label="Muelle"><input value={dock} onChange={(event) => setDock(event.target.value)} /></Field>
      <Field label="Salida prevista"><input type="datetime-local" required value={departureAt} onChange={(event) => setDepartureAt(event.target.value)} /></Field>
      <Field label="Observaciones"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para la carga" /></Field>
    </div>
    <Actions onCancel={onCancel} label="Guardar cambios" />
  </form>;
}

export function ArticleForm({ initial, onCancel, onSubmit }: { initial?: Article; onCancel: () => void; onSubmit: (article: Omit<Article, "id">) => void }) {
  const [sku, setSku] = useState(initial?.sku ?? ""); const [name, setName] = useState(initial?.name ?? ""); const [family, setFamily] = useState(initial?.family ?? "Gazpachos");
  const [format, setFormat] = useState(initial?.format ?? "Brick"); const [packSize, setPackSize] = useState(initial?.packSize ?? "1 L"); const [unitsPerBox, setUnitsPerBox] = useState(initial?.unitsPerBox ?? 6);
  const [boxesPerPallet, setBoxesPerPallet] = useState(initial?.boxesPerPallet ?? 64); const [netKgPerBox, setNetKgPerBox] = useState(initial?.netKgPerBox ?? 6.4); const [gtin, setGtin] = useState(initial?.gtin ?? "");
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ sku: sku.trim().toUpperCase(), name: name.trim(), family: family.trim(), format, packSize: packSize.trim(), unitsPerBox, boxesPerPallet, netKgPerBox, gtin: gtin.trim(), active: initial?.active ?? true }); }}>
    <div className="form-grid">
      <Field label="SKU"><input required value={sku} onChange={(event) => setSku(event.target.value)} placeholder="GAZ-1L" /></Field>
      <Field label="Nombre del artículo"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Gazpacho andaluz" /></Field>
      <Field label="Familia"><input required list="families" value={family} onChange={(event) => setFamily(event.target.value)} /><datalist id="families"><option>Gazpachos</option><option>Salmorejos</option><option>Salsas</option></datalist></Field>
      <Field label="Formato"><select value={format} onChange={(event) => setFormat(event.target.value)}><option>Brick</option><option>Botella</option><option>Cubo</option><option>Tarro</option><option>Bolsa</option><option>Otro</option></select></Field>
      <Field label="Contenido por unidad"><input required value={packSize} onChange={(event) => setPackSize(event.target.value)} placeholder="1 L · 500 ml · 2 kg" /></Field>
      <Field label="Unidades por caja"><input required type="number" min="1" step="1" value={unitsPerBox} onChange={(event) => setUnitsPerBox(Number(event.target.value))} /></Field>
      <Field label="Cajas por palet estándar"><input required type="number" min="1" step="1" value={boxesPerPallet} onChange={(event) => setBoxesPerPallet(Number(event.target.value))} /></Field>
      <Field label="Peso neto de la caja (kg)"><input required type="number" min="0.01" step="0.01" value={netKgPerBox} onChange={(event) => setNetKgPerBox(Number(event.target.value))} /></Field>
      <Field label="GTIN (opcional)"><input value={gtin} onChange={(event) => setGtin(event.target.value)} placeholder="Código de producto" /></Field>
    </div>
    <div className="form-note">Cada caja contiene {unitsPerBox} envases · {boxesPerPallet} cajas por palet completo · {Number((netKgPerBox * boxesPerPallet).toFixed(1))} kg netos</div>
    <Actions onCancel={onCancel} label={initial ? "Guardar cambios" : "Guardar artículo"} />
  </form>;
}

export function CustomerForm({ initial, onCancel, onSubmit }: { initial?: Customer; onCancel: () => void; onSubmit: (customer: Omit<Customer, "id">) => void }) {
  const [code, setCode] = useState(initial?.code ?? ""); const [name, setName] = useState(initial?.name ?? ""); const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? ""); const [contact, setContact] = useState(initial?.contact ?? ""); const [notes, setNotes] = useState(initial?.notes ?? "");
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ code: code.trim().toUpperCase(), name: name.trim(), address: address.trim(), city: city.trim(), contact: contact.trim(), notes: notes.trim() }); }}><div className="form-grid">
    <Field label="Código cliente"><input required value={code} onChange={(event) => setCode(event.target.value)} placeholder="C-0100" /></Field><Field label="Nombre comercial"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
    <Field label="Dirección"><input required value={address} onChange={(event) => setAddress(event.target.value)} /></Field><Field label="Ciudad"><input required value={city} onChange={(event) => setCity(event.target.value)} /></Field>
    <Field label="Contacto / teléfono"><input value={contact} onChange={(event) => setContact(event.target.value)} /></Field><Field label="Indicaciones de entrega"><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Muelle, horario, llamada previa…" /></Field>
  </div><Actions onCancel={onCancel} label={initial ? "Guardar cambios" : "Guardar cliente"} /></form>;
}

export function CarrierForm({ initial, onCancel, onSubmit }: { initial?: Carrier; onCancel: () => void; onSubmit: (carrier: Omit<Carrier, "id">) => void }) {
  const [name, setName] = useState(initial?.name ?? ""); const [contact, setContact] = useState(initial?.contact ?? "");
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ name: name.trim(), contact: contact.trim() }); }}><div className="form-grid"><Field label="Transportista"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre de empresa" /></Field><Field label="Teléfono / contacto"><input value={contact} onChange={(event) => setContact(event.target.value)} /></Field></div><Actions onCancel={onCancel} label={initial ? "Guardar cambios" : "Guardar transportista"} /></form>;
}

export function VehicleForm({ data, onCancel, onSubmit }: { data: AppData; onCancel: () => void; onSubmit: (vehicle: { carrierId: string; plate: string; maxWeightKg: number }) => void }) {
  const [carrierId, setCarrierId] = useState(data.carriers[0]?.id ?? ""); const [plate, setPlate] = useState(""); const [maxWeightKg, setMaxWeightKg] = useState(24000);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ carrierId, plate: plate.trim().toUpperCase(), maxWeightKg }); }}><div className="form-grid"><Field label="Transportista"><select required value={carrierId} onChange={(event) => setCarrierId(event.target.value)}>{data.carriers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Matrícula"><input required value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="1234 ABC" /></Field><Field label="Carga máxima (kg)"><input required type="number" min="1" value={maxWeightKg} onChange={(event) => setMaxWeightKg(Number(event.target.value))} /></Field></div>{!data.carriers.length && <p className="form-warning">Crea primero un transportista.</p>}<Actions onCancel={onCancel} label="Guardar vehículo" /></form>;
}

export function PalletTypeForm({ initial, onCancel, onSubmit }: { initial?: PalletType; onCancel: () => void; onSubmit: (item: Omit<PalletType, "id">) => void }) {
  const [name, setName] = useState(initial?.name ?? ""); const [tareKg, setTareKg] = useState(initial?.tareKg ?? 25); const [maxWeightKg, setMaxWeightKg] = useState(initial?.maxWeightKg ?? 1000);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit({ name: name.trim(), tareKg, maxWeightKg }); }}><div className="form-grid"><Field label="Nombre"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Europalet · 120 × 80" /></Field><Field label="Tara (kg)"><input type="number" min="0" step="0.5" value={tareKg} onChange={(event) => setTareKg(Number(event.target.value))} /></Field><Field label="Peso bruto máximo (kg)"><input required type="number" min="1" value={maxWeightKg} onChange={(event) => setMaxWeightKg(Number(event.target.value))} /></Field></div><div className="form-note">El número real de cajas se introduce al confeccionar cada palet.</div><Actions onCancel={onCancel} label={initial ? "Guardar cambios" : "Guardar tipo de palet"} /></form>;
}
