import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = { value: string; compact?: boolean };

export function Barcode({ value, compact = false }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svg.current) return;
    JsBarcode(svg.current, value, { format: "CODE128", lineColor: "#17221d", width: compact ? 1.2 : 1.6, height: compact ? 30 : 42, displayValue: true, font: "IBM Plex Mono", fontSize: compact ? 9 : 11, margin: 0, textMargin: 4 });
  }, [value, compact]);
  return <svg ref={svg} aria-label={`Código de barras ${value}`} />;
}
