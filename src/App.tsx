import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { HUD } from "./components/HUD";
import { Settings } from "./components/Settings";
import { History } from "./components/History";
import { Config, TempPayload } from "./types";

const DEFAULT_CONFIG: Config = {
  display: { show_sparkline: false, always_on_top: true, position: "top-right", unit: "C", launch_at_login: false },
  thresholds: { warning_temp: 85, warning_duration_seconds: 180, poll_interval_seconds: 30 },
  monitor: { cpu: true, gpu: true, motherboard: true },
};

// Determine which view this window should show from the URL hash
const view = window.location.hash.replace('#', '') || 'hud';

// Mark body so CSS can target panel windows specifically
if (view !== 'hud') {
  document.body.classList.add('panel-window');
}

export default function App() {
  const [temps,    setTemps]    = useState<TempPayload | null>(null);
  const [config,   setConfig]   = useState<Config>(DEFAULT_CONFIG);
  const [isWarning,setIsWarning]= useState(false);
  const [isBottom, setIsBottom] = useState(false);

  useEffect(() => {
    invoke<Config>("get_config").then(setConfig).catch(console.error);
  }, []);

  // Position HUD in top-right on first launch, accounting for screen size
  useEffect(() => {
    if (view !== "hud") return;
    async function positionHUD() {
      try {
        const { getCurrentWindow, currentMonitor } = await import("@tauri-apps/api/window");
        const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        const monitor = await currentMonitor();
        if (!monitor) return;
        const size = await win.outerSize();
        const pad = Math.round(12 * monitor.scaleFactor);
        const x = monitor.size.width - size.width - pad;
        const y = pad;
        await win.setPosition(new PhysicalPosition(x, y));
      } catch (_) {}
    }
    positionHUD();
  }, []);

  useEffect(() => {
    async function checkPos() {
      const [mon, pos] = await Promise.all([currentMonitor(), getCurrentWindow().outerPosition()]);
      if (mon) setIsBottom(pos.y > mon.size.height / 2);
    }
    checkPos().catch(console.error);
  }, []);

  useEffect(() => {
    function onConfigChanged() {
      invoke<Config>("get_config").then(setConfig).catch(console.error);
    }
    window.addEventListener("coolview:config-changed", onConfigChanged);
    // Also listen for Tauri event from panel window saving config
    const unlisten = listen("config-updated", () => {
      invoke<Config>("get_config").then(setConfig).catch(console.error);
    });
    return () => {
      window.removeEventListener("coolview:config-changed", onConfigChanged);
      unlisten.then(f => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<TempPayload>("temp-update", (e) => {
      setTemps(e.payload);
      setIsWarning(e.payload.is_warning);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  const handleSaveConfig = useCallback(async (newConfig: Config) => {
    await invoke("set_config", { newConfig });
    setConfig(newConfig);
    await invoke("hide_panel");
  }, []);

  // ── HUD window ──────────────────────────────────────────────────────────────
  if (view === "hud") {
    return (
      <HUD
        temps={temps}
        config={config}
        isWarning={isWarning}
        isBottom={isBottom}
        onOpenSettings={() => invoke("open_panel", { label: "settings" })}
        onOpenHistory={() => invoke("open_panel", { label: "history" })}
      />
    );
  }

  // ── Panel window (settings or history) ─────────────────────────────────────
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      background: "rgb(14,14,20)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {view === "settings" && (
        <Settings
          config={config}
          isBottom={false}
          onSave={handleSaveConfig}
          onClose={() => invoke("hide_panel")}
          onOpenHistory={() => {
            window.location.hash = 'history';
            window.location.reload();
          }}
        />
      )}
      {view === "history" && (
        <History
          config={config}
          isBottom={false}
          onClose={() => invoke("hide_panel")}
          onOpenSettings={() => {
            window.location.hash = "settings";
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
