export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPromptListener = (event: InstallPromptEvent | null) => void;

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<InstallPromptListener>();

function publishPrompt() {
  for (const listener of listeners) listener(deferredPrompt);
}

// Este módulo se evalúa al importar App, antes de que React monte la interfaz.
// Chrome puede emitir beforeinstallprompt muy pronto; conservarlo aquí evita perderlo.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    publishPrompt();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    publishPrompt();
  });
}

export function getInstallPrompt() {
  return deferredPrompt;
}

export function subscribeInstallPrompt(listener: InstallPromptListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearInstallPrompt() {
  deferredPrompt = null;
  publishPrompt();
}
