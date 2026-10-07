# Ejecutar ALMACEN-PRO en local

ALMACEN-PRO es una aplicación React + Vite. No se debe abrir `index.html` con doble clic (`file://`), porque los módulos ES y el service worker requieren un servidor local.

## Opción recomendada

1. Instala Node.js 22 o superior.
2. Instala pnpm 11.25.0:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
```

3. En la carpeta del proyecto:

```bash
pnpm install
pnpm dev
```

4. Abre:

`http://localhost:3000/ALMACEN-PRO/`

También puedes usar:

```bash
pnpm start
```

## Producción local

```bash
pnpm install
pnpm build
pnpm preview
```

Después abre `http://localhost:3000/ALMACEN-PRO/`.

> Nota: `file://.../index.html` no es un modo soportado para ejecutar la PWA completa. Para probar PWA, service worker y caché offline usa `pnpm dev` o `pnpm preview`.
