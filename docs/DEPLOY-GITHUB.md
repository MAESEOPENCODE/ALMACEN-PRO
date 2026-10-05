# Despliegue de ALMACEN-PRO en GitHub Pages

## 1. Crear repositorio

Crea un repositorio nuevo y vacío. Por ejemplo:

`ALMACEN-PRO`

No es necesario crear README, `.gitignore` ni licencia desde la interfaz porque ya están incluidos en el proyecto.

## 2. Primer push

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "feat: ALMACEN-PRO v1.0.0"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

## 3. Activar Pages

En GitHub:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Después de cada push a `main`, el workflow `Deploy ALMACEN-PRO to GitHub Pages` generará y publicará la aplicación.

## 4. Comprobar el despliegue

En **Actions** debe aparecer un workflow verde. En **Settings → Pages** GitHub mostrará la URL pública.

## 5. Instalar como PWA

Abre la URL pública mediante HTTPS en Chrome Android y utiliza **Instalar aplicación**. En iPhone/iPad utiliza **Compartir → Añadir a pantalla de inicio**.

## Importante

GitHub Pages sirve el frontend. No proporciona una base de datos ni sincronización entre dispositivos. En esta versión SalsaLog conserva los datos localmente en cada dispositivo.


## ALMACEN-PRO en GitHub Pages

El proyecto está configurado como GitHub Pages de tipo **Project Site** con base `/ALMACEN-PRO/`.

1. Crea el repositorio exactamente como `ALMACEN-PRO`.
2. Sube el contenido del proyecto a la rama `main` (no el ZIP dentro del repositorio).
3. En **Settings → Pages → Build and deployment**, selecciona **GitHub Actions**.
4. Haz push a `main` o ejecuta manualmente `Deploy ALMACEN-PRO to GitHub Pages` desde Actions.
5. La aplicación quedará en `https://TU-USUARIO.github.io/ALMACEN-PRO/`.

El workflow instala las dependencias con `pnpm install --frozen-lockfile`, ejecuta `pnpm build` y publica `dist/`.
