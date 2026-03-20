import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HistoryEntry, Config } from "../types";

interface HistoryProps {
  config: Config;
  onClose: () => void;
}

export function History({ config, onClose }: HistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    invoke<HistoryEntry[]>("get_history").then(setEntries);
  }, []);

  return (
    <div style={{ padding: 20, color: 'white' }}>
      <h3>📊 History</h3>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {entries.slice(-10).map((e, i) => (
          <div key={i} style={{ borderBottom: '1px solid #333', padding: '4px 0' }}>
            {e.timestamp.split('T')[1]} - CPU: {e.cpu}°
          </div>
        ))}
      </div>
      <button onClick={onClose} style={{ marginTop: 20 }}>Back</button>
    </div>
  );
}
