import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

  const wasAlreadyControlled = Boolean(navigator.serviceWorker.controller);
  let reloadedForUpdate = false;

  if (wasAlreadyControlled) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    }, { once: true });
  }

  const registerAndCheckForUpdates = async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        updateViaCache: "none",
      });
      await registration.update();
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
