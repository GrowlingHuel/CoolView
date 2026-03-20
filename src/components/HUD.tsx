import { useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { Config, TempPayload } from "../types";
import { Sparkline } from "./Sparkline";

interface HUDProps {
  temps: TempPayload | null;
  config: Config;
  isWarning: boolean;
  isBottom: boolean;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}

function toDisplay(celsius: number | null | undefined, unit: "C" | "F"): string {
  if (celsius == null) return "—";
  const val = unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
  return `${Math.round(val)}°`;
}

const textOutline = ["-1px -1px 0 #000", " 1px -1px 0 #000", "-1px  1px 0 #000", " 1px  1px 0 #000", "-2px  0   0 #000", " 2px  0   0 #000", " 0   -2px 0 #000", " 0    2px 0 #000"].join(", ");
const warningOutline = ["-1px -1px 0 #800", " 1px -1px 0 #800", "-1px  1px 0 #800", " 1px  1px 0 #800", "-2px  0   0 #800", " 2px  0   0 #800", " 0   -2px 0 #800", " 0    2px 0 #800"].join(", ");

function tempColor(c: number | null | undefined): string {
  if (c == null) return "#ffffff";
  if (c >= 85) return "#ff6b6b";
  if (c >= 70) return "#ffd93d";
  return "#ffffff";
}

export function HUD({ temps, config, isWarning, isBottom, onOpenSettings, onOpenHistory }: HUDProps) {
  const [hovered, setHovered] = useState(false);
  const { unit, show_sparkline } = config.display;

  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", textShadow: textOutline, lineHeight: 1, marginBottom: 1 };
  const valueStyle = (c: number | null | undefined): React.CSSProperties => ({ fontSize: 22, fontWeight: 800, color: tempColor(c), textShadow: isWarning ? warningOutline : textOutline, lineHeight: 1, letterSpacing: "-0.02em" });

  return (
    <div style={{ position: "absolute", inset: 0, background: "transparent", pointerEvents: "none" }}>
      <div style={{ position: "absolute", ...(isBottom ? { bottom: 8 } : { top: 8 }), right: 10, display: "flex", flexDirection: isBottom ? "column-reverse" : "column", alignItems: "flex-end", gap: 3, pointerEvents: "all", cursor: "grab" }}
           onMouseDown={(e) => { if(e.button === 0) getCurrentWebviewWindow().startDragging(); }}
           onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        
        {isWarning && <div className="animate-pulse-warning" style={{ fontSize: 11, fontWeight: 800, color: "#ff4444", textShadow: warningOutline, textTransform: "uppercase" }}>⚠ TEMPS TOO HIGH</div>}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          {config.monitor.cpu && (
            <div style={{ textAlign: "center" }}><div style={labelStyle}>CPU</div><span style={valueStyle(temps?.cpu)}>{toDisplay(temps?.cpu, unit)}</span></div>
          )}
          {config.monitor.gpu && temps?.gpu != null && (
            <><span style={{ color: "rgba(255,255,255,0.3)", textShadow: textOutline, fontSize: 18 }}>/</span>
            <div style={{ textAlign: "center" }}><div style={labelStyle}>GPU</div><span style={valueStyle(temps.gpu)}>{toDisplay(temps.gpu, unit)}</span></div></>
          )}
          {config.monitor.motherboard && temps?.motherboard != null && (
            <><span style={{ color: "rgba(255,255,255,0.3)", textShadow: textOutline, fontSize: 18 }}>/</span>
            <div style={{ textAlign: "center" }}><div style={labelStyle}>MB</div><span style={valueStyle(temps.motherboard)}>{toDisplay(temps.motherboard, unit)}</span></div></>
          )}
        </div>
        {show_sparkline && temps && temps.history.length >= 2 && <Sparkline data={temps.history} warningThreshold={config.thresholds.warning_temp} width={130} height={20} />}
      </div>

      <div style={{ position: "absolute", ...(isBottom ? { bottom: 8 } : { top: 8 }), left: 8, display: "flex", gap: 4, pointerEvents: "all", opacity: hovered ? 1 : 0.6 }}>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "white", textShadow: textOutline }} onClick={onOpenHistory}>≡</button>
        <button style={{ background: "none", border: "none", cursor: "pointer", color: "white", textShadow: textOutline }} onClick={onOpenSettings}>⚙</button>
      </div>
    </div>
  );
}
