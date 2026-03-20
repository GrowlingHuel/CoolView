import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { HistoryEntry, Config } from "../types";

interface HistoryProps {
  config: Config;
  isBottom: boolean;
  onClose: () => void;
}

export function History({ config, onClose }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    invoke<HistoryEntry[]>("get_history").then(setEntries).catch(console.error);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgb(14,14,20)", padding: "12px 14px", color: "white", overflowY: "auto" }}>
      {/* Draggable Header */}
      <div 
        style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, cursor: "grab" }}
        onMouseDown={(e) => { if ((e.target as HTMLElement).tagName.toLowerCase() !== "button") getCurrentWebviewWindow().startDragging(); }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", opacity: 0.5 }}>📊 History</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {entries.slice(-20).reverse().map((e, i) => (
          <div key={i} style={{ borderBottom: '1px solid #333', padding: '4px 0', fontSize: 11 }}>
            {e.timestamp.split('T')[1]} - CPU: {e.cpu}° {e.gpu ? `/ GPU: ${e.gpu}°` : ''}
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "4px 12px", background: "#508cff", border: "none", color: "white", borderRadius: 4, cursor: "pointer" }}>Back</button>
      </div>
    </div>
  );
}
