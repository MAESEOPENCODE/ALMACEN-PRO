import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "warning" | "danger";
};

type Props = {
  options: ConfirmOptions | null;
  onResolve: (accepted: boolean) => void;
};

export function ConfirmDialog({ options, onResolve }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!options) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve(false);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [options, onResolve]);

  if (!options) return null;
  const tone = options.tone ?? "warning";

  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onResolve(false);
    }}>
      <section
        ref={dialogRef}
        className={`confirm-card ${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className={`confirm-mark ${tone}`} aria-hidden="true"><AlertTriangle size={20} /></div>
        <div className="confirm-copy">
          <div className="confirm-brand">SALSALOG · OPERACIONES</div>
          <h2 id="confirm-title">{options.title}</h2>
          <p id="confirm-message">{options.message}</p>
          {options.details && <div className="confirm-details">{options.details}</div>}
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} className="button secondary" onClick={() => onResolve(false)}>
            {options.cancelLabel ?? "Cancelar"}
          </button>
          <button className={`button ${tone === "danger" ? "confirm-danger" : "primary"}`} onClick={() => onResolve(true)}>
            {options.confirmLabel ?? "Continuar"}
          </button>
        </div>
      </section>
    </div>
  );
}
