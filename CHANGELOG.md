# Changelog

## v15 · Cierre operativo Food & Sauce

- Recepción de compras vinculada a necesidades MRP.
- Recepciones entran automáticamente en CUARENTENA.
- Registro de lote proveedor, lote interno y caducidad desde la recepción de compra.
- Reservas FEFO se reducen al registrar consumos reales.
- Validación de fases antes de cerrar una orden de fabricación.
- Validación de PCC/pesadas antes de liberar.
- Alta automática de palets de producto terminado + SSCC al liberar calidad.
- Movimiento de fabricación y auditoría automática al liberar.
- Esquema local v15 y migración desde versiones anteriores.

# CHANGELOG

## v11.1 · Fabricación Food & Sauce
- Nuevo espacio **Fabricación** para seguir el flujo de planta por lote.
- Fases: preparación, pesaje, mezcla, cocción, enfriamiento, control, envasado, paletizado y liberación.
- Pesadas reales por materia prima y lote, con tolerancia y desviaciones.
- Los pesajes generan consumos trazables dentro de la orden de fabricación.
- Perfil automático de alérgenos a partir de la receta y materias primas.
- Registro de PCC/APPCC con límites, resultado y acción correctiva.
- Control de materiales de packaging por orden.
- Migración automática de órdenes v10 al nuevo esquema.

## v11 · Food & Sauce Traceability

- Nuevo módulo transversal **Trazabilidad**.
- Búsqueda por lote de materia prima, lote de fabricación, palet, SSCC y carga.
- Trazabilidad hacia atrás: materia prima → fabricación → palets → expedición.
- Trazabilidad hacia delante: lote de materia prima → órdenes → producto terminado → expediciones.
- Consulta específica de palet: contenido, pedido, cliente y cargas.
- Consulta específica de expedición: palets, transporte, muelle, precinto y clientes.
- Migración del esquema local de datos a v11 con compatibilidad con copias v10 y anteriores.
- Interfaz responsive para escritorio, tablet y móvil.

## v7.0.0 — Inventario alimentario
- Nuevo módulo Inventario.
- Maestro de materias primas.
- Recepción de lotes con lote interno/proveedor.
- Caducidad, ubicación y estados Liberado/Cuarentena/Bloqueado.
- Ordenación FEFO y alertas de caducidad.
- Migración automática desde v6 y anteriores.

# Changelog

## 1.0.0

- Consolidación de las fases de robustez, almacén, expedición y profesionalización.
- Modo Operario y FEFO.
- Ubicaciones, cargas, muelles y validaciones de expedición.
- Trazabilidad, incidencias, auditoría y SSCC/GS1.
- Escaneo por cámara y cola offline local.
- Preparación para despliegue como PWA mediante GitHub Pages.
