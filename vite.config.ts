import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: https://<usuario>.github.io/ALMACEN-PRO/
export default defineConfig({
  base: "/ALMACEN-PRO/",
  plugins: [react()],
});
