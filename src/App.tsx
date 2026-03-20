import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { HUD } from "./components/HUD";
import { Settings } from "./components/Settings";
import { History } from "./components/History";
import { Config, TempPayload } from "./types";

const DEFAULT_CONFIG: Config = {
  display: { show_sparkline: false, always_on_top: true, position: "top-right", unit: "C", launch_at_login: false },
  thresholds: { warning_temp: 85, warning_duration_seconds: 180, poll_interval_seconds: 30 },
  monitor: { cpu: true, gpu: true, motherboard: true },
};

export default function App() {
  const [temps, setTemps] = useState<TempPayload | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [isBottom, setIsBottom] = useState(false);
  const [view] = useState(() => window.location.hash.replace('#', '') || 'hud');

  async function checkPosition() {
    const win = getCurrentWebviewWindow();
    const [mon, pos] = await Promise.all([win.currentMonitor(), win.outerPosition()]);
    if (mon) setIsBottom(pos.y > mon.size.height / 2);
  }

  useEffect(() => { checkPosition().catch(console.error); }, []);
  useEffect(() => { invoke<Config>("get_config").then(setConfig).catch(console.error); }, []);

  useEffect(() => {
    const unlisten = listen<TempPayload>("temp-update", (e) => setTemps(e.payload));
    return () => { unlisten.then(f => f()); };
  }, []);

  if (view === "hud") {
    return (
      <HUD
        temps={temps} config={config} isWarning={temps?.is_warning || false} isBottom={isBottom}
        onOpenSettings={() => invoke("open_panel", { label: "settings" })}
        onOpenHistory={() => invoke("open_panel", { label: "history" })}
      />
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {view === "settings" && (
        <Settings
          config={config} isBottom={isBottom}
          onSave={async (newConfig) => { await invoke("set_config", { newConfig }); getCurrentWebviewWindow().close(); }}
          onClose={() => getCurrentWebviewWindow().close()}
          onOpenHistory={() => invoke("open_panel", { label: "history" })}
        />
      )}
      {view === "history" && (
        <History config={config} isBottom={isBottom} onClose={() => getCurrentWebviewWindow().close()} />
      )}
    </div>
  );
}
