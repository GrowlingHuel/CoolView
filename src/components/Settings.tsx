import { useState } from "react";
import { Config } from "../types";

interface SettingsProps {
  config: Config;
  isBottom: boolean;
  onSave: (config: Config) => void;
  onClose: () => void;
  onOpenHistory: () => void;
}

const inputStyle: React.CSSProperties = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "rgba(220,220,230,0.9)", fontSize: 12, padding: "3px 7px", width: 64 };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 };
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 12, marginBottom: 7 };

export function Settings({ config, onSave, onClose, onOpenHistory }: SettingsProps) {
  const [draft, setDraft] = useState<Config>(JSON.parse(JSON.stringify(config)));

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgb(14, 14, 20)", padding: "12px 14px", color: "white", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", opacity: 0.5 }}>⚙ Settings</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }}>✕</button>
      </div>

      <span style={sectionLabel}>Warning</span>
      <div style={rowStyle}><span>Temp threshold</span><input type="number" style={inputStyle} value={draft.thresholds.warning_temp} onChange={e => setDraft({...draft, thresholds: {...draft.thresholds, warning_temp: +e.target.value}})} /></div>
      <div style={rowStyle}><span>Poll interval</span><input type="number" style={inputStyle} value={draft.thresholds.poll_interval_seconds} onChange={e => setDraft({...draft, thresholds: {...draft.thresholds, poll_interval_seconds: +e.target.value}})} /></div>

      <span style={sectionLabel}>Display</span>
      <label style={{ display: "flex", gap: 7, marginBottom: 7 }}><input type="checkbox" checked={draft.display.always_on_top} onChange={e => setDraft({...draft, display: {...draft.display, always_on_top: e.target.checked}})} /> Always on top</label>
      <label style={{ display: "flex", gap: 7, marginBottom: 7 }}><input type="checkbox" checked={draft.display.show_sparkline} onChange={e => setDraft({...draft, display: {...draft.display, show_sparkline: e.target.checked}})} /> Show sparkline</label>
      <div style={rowStyle}><span>Position</span>
        <select style={{ ...inputStyle, width: 112 }} value={draft.display.position} onChange={e => setDraft({...draft, display: {...draft.display, position: e.target.value as any}})}>
          <option value="top-right">Top right</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option>
        </select>
      </div>

      <span style={sectionLabel}>Sensors</span>
      {["cpu", "gpu", "motherboard"].map(s => (
        <label key={s} style={{ display: "flex", gap: 7, marginBottom: 5 }}><input type="checkbox" checked={(draft.monitor as any)[s]} onChange={e => setDraft({...draft, monitor: {...draft.monitor, [s]: e.target.checked}})} /> {s.toUpperCase()}</label>
      ))}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onOpenHistory} style={{ marginRight: "auto" }}>History</button>
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => onSave(draft)} style={{ background: "#508cff" }}>Save</button>
      </div>
    </div>
  );
}
