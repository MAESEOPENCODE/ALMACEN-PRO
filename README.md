# ALMACEN-PRO · ALMACEN-PRO · SalsaLog · Operaciones

PWA de operaciones para almacén y expedición: pedidos, confección y ubicación de palets, FEFO, cargas, expediciones, trazabilidad, incidencias, etiquetas y SSCC/GS1.

## Repositorio

Repositorio objetivo: **ALMACEN-PRO**.

## Estado

**Versión:** 1.0.0 · **Esquema local:** v6

La aplicación funciona en navegador y puede instalarse como PWA. Actualmente los datos operativos se almacenan localmente en el dispositivo; la sincronización multiusuario con servidor queda preparada como siguiente etapa y no está simulada.

## Funcionalidades

- Pedidos y líneas de producto.
- Confección y consolidación de palets.
- Snapshot histórico de datos críticos del palet, incluido peso por caja.
- Ubicaciones de almacén.
- FEFO y alertas de caducidad.
- Modo Operario para móvil/tablet.
- Escaneo por cámara y compatibilidad con lectores Bluetooth que actúan como teclado.
- Preparación y control de cargas.
- Muelles, capacidad, temperatura y precinto.
- Validaciones antes de cerrar una expedición.
- Packing list.
- Trazabilidad por palet, SSCC, pedido y carga.
- Incidencias operativas.
- Auditoría y roles preparados.
- SSCC y representación GS1/AI (00) para identificación logística.
- Indicador offline y cola local de operaciones pendientes.
- Copias de seguridad/restauración mediante JSON.

## Requisitos

- Node.js 22+
- pnpm 11.25+

## Desarrollo local

```bash
pnpm install
pnpm dev
```

## Compilación

```bash
pnpm build
```

El resultado se genera en `dist/`.

## GitHub Pages

El repositorio incluye un workflow de GitHub Actions en `.github/workflows/deploy-pages.yml`.

1. Crea un repositorio vacío en GitHub.
2. Sube el contenido de este proyecto a la rama `main`.
3. En **Settings → Pages**, selecciona **GitHub Actions** como fuente.
4. Haz un push a `main`.
5. GitHub Actions instalará dependencias, ejecutará el build y publicará `dist/`.

La aplicación usa rutas relativas (`base: "./"`), por lo que puede publicarse también como subruta de GitHub Pages.

## Datos y privacidad

Los datos de negocio se guardan en el almacenamiento local del navegador. No se envían a un servidor en esta versión. No incluyas en GitHub copias JSON de datos reales, credenciales, API keys ni información personal.

## PWA y offline

La PWA incluye manifest, iconos y service worker. HTTPS es necesario para la instalación y el funcionamiento normal del service worker en producción. El modo offline permite continuar con operaciones locales y mantener una cola para futuras sincronizaciones.

## Estructura

```text
src/
├── App.tsx
├── components/
├── data/
├── utils/
├── main.tsx
├── pwaInstall.ts
├── styles.css
└── types.ts
public/
├── manifest.webmanifest
├── sw.js
└── icon-*.png
.github/workflows/
├── ci.yml
└── deploy-pages.yml
```

## Política de cambios

No se deben mezclar credenciales, datos de producción o backups reales con el código fuente. Los cambios de esquema de datos deben mantener una migración explícita para no romper instalaciones existentes.

## Próxima etapa

Backend central, autenticación real, sincronización multi-dispositivo, resolución de conflictos y copias de seguridad del servidor.


## Ejecución local

Consulta [docs/LOCAL.md](docs/LOCAL.md). La aplicación debe ejecutarse con Vite; no abras `index.html` directamente con `file://`.


## GitHub Pages

Repositorio recomendado: `ALMACEN-PRO`. El proyecto ya está configurado para publicarse como Project Site en `/ALMACEN-PRO/`.

Tras activar **Settings → Pages → GitHub Actions** y hacer push a `main`, GitHub Actions generará y publicará la aplicación automáticamente.
