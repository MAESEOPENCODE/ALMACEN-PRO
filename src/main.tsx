import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  const wasAlreadyControlled = Boolean(navigator.serviceWorker.controller);
  let reloadedForUpdate = false;

  // Recarga a la versión nueva, pero sin tirar lo que el usuario esté escribiendo en ese momento.
  const reloadWhenIdle = () => {
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
      window.setTimeout(reloadWhenIdle, 3000);
      return;
    }
    window.location.reload();
  };

  if (wasAlreadyControlled) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      reloadWhenIdle();
    });
  }

  const registerAndCheckForUpdates = async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        updateViaCache: "none",
      });
      const checkForUpdate = () => { registration.update().catch(() => { /* sin red: se reintenta luego */ }); };
      checkForUpdate();
      // Una PWA puede pasar días abierta o en segundo plano: se busca versión nueva al volver a ella,
      // al recuperar la conexión y cada 5 minutos.
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
      window.addEventListener("online", checkForUpdate);
      window.setInterval(checkForUpdate, 5 * 60 * 1000);
    } catch {
      // La app sigue funcionando online si el navegador no admite o bloquea el SW.
    }
  };

  if (document.readyState === "complete") {
    void registerAndCheckForUpdates();
  } else {
    window.addEventListener("load", () => void registerAndCheckForUpdates(), { once: true });
  }
}
