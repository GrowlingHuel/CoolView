# CoolView — Project TLDR

## What It Is
A cross-platform desktop temperature HUD built with **Tauri 2 + Rust + React + TypeScript**.
Displays CPU/GPU/motherboard temps as a floating transparent overlay on the desktop.
MIT licensed. Repo: github.com/HyperArkStudios/CoolView
Ko-fi: ko-fi.com/hyperarkstudios

## Current Architecture (branch: two-window)
- **main window**: HUD only. Transparent, ~240×64px, no decorations, always-on-top.
  Shows temp readings floating over desktop. Draggable.
- **panel window**: Pre-created hidden at startup. Shown for Settings or History.
  NOT transparent. Positioned above/below HUD based on screen position.
  Uses URL hash routing: `index.html#settings` or `index.html#history`
- Panel navigates in-place via `eval("window.location.hash = ...")` — avoids
  GTK window lifecycle operations which cause crashes

## Key Files
- `src-tauri/src/lib.rs` — Rust backend (commands, poll loop, tray, window management)
- `src-tauri/src/main.rs` — Entry point, calls XInitThreads() on Linux
- `src/App.tsx` — Hash routing, HUD vs panel window detection
- `src/components/HUD.tsx` — Temp display, drag, unit toggle
- `src/components/Settings.tsx` — Config panel
- `src/components/History.tsx` — 24h graph + table
- `src-tauri/capabilities/default.json` — MUST include "panel" in windows array
- `src-tauri/tauri.conf.json` — Window config
- `GHOST_BUG_DEBUG_LOG.md` — Full history of compositor ghost bug
- `DEVELOPMENT_LOG.md` — Architecture decisions and rules

## Features Working ✓
- Frosted-glass HUD with CPU/GPU/MB temps, colour-coded by threshold
- Adaptive polling (base → 20s above 70°C → 10s above 80°C)
- Sustained warning system with configurable threshold + duration
- °C/°F toggle, sparkline, always-on-top option
- Settings panel: all thresholds, display, sensor toggles, position, autolaunch
- History panel: 24h graph + table, CSV export path shown
- System tray (show/hide, quit)
- HUD drag via startDragging()
- Config persists to ~/.config/com.coolview.app/config.toml

## CRITICAL RULES — DO NOT VIOLATE
1. ALL GTK window operations from background threads MUST use app.run_on_main_thread()
   This includes: set_always_on_top, set_focus, set_position, WebviewWindowBuilder::build()
   Violating this causes incremental GDK state corruption → X11 BadImplementation crash
2. Do NOT use on_window_event — causes immediate X11 crash
3. Do NOT use set_background_color — causes white or black rectangles
4. Do NOT use always_on_top(true) or skip_taskbar(true) on panel window — causes crash
5. w.emit() targets one window only — use app.emit() for cross-window events
6. Panel window MUST be listed in capabilities/default.json windows array
7. useState init from prop only runs once — use useEffect to sync with async data
8. XInitThreads() must be called in main.rs before anything else on Linux
9. Panel uses hide()/show() NOT close()/build() — pre-created at startup, never destroyed
10. Always update DEVELOPMENT_LOG.md and GHOST_BUG_DEBUG_LOG.md before any CC session

## Current Open Bugs

### 1. Panel not reopening after user closes it (BLOCKER)
Pre-created panel window is destroyed when user clicks ✕ (close()).
After that, open_panel can't find it and buttons do nothing.
Fix: change all close() calls in Settings/History to invoke a Rust command
"hide_panel" which calls window.hide() instead of window.close().

### 2. Panel shows OS title bar (cosmetic)
decorations(false) was removed from panel window during crash debugging.
Needs to go back on the pre-created window in setup(), not at runtime.

### 3. HUD ghost (partially fixed)
background: "rgba(0,0,0,0.001)" + will-change:transform + translateZ(0)
on content container helps. Clears within ~30s. Still on first render.

### 4. Excessive whitespace in panel window (cosmetic)
Panel window is too large for content. Needs size tuning.

## What Was Just Tried (don't repeat these)
- XInitThreads() in main.rs with #[link(name = "X11")] — compiled, helped
- Pre-created panel window in setup() via run_on_main_thread — correct approach
- Panel navigates via eval() instead of close/reopen — correct approach
- All GTK ops wrapped in run_on_main_thread — correct and necessary
- decorations(false) removed from panel — was attempted fix, should go back
- on_window_event — ALWAYS CRASHES, never use
- set_background_color — causes rectangles, never use
- sleep() as synchronization — insufficient, causes race conditions

## Immediate Next Steps
1. Add hide_panel Rust command: gets "panel" window, calls .hide()
2. Change onClose in Settings.tsx and History.tsx to invoke("hide_panel")
3. Restore decorations(false) on pre-created panel in setup()
4. Test 5+ minutes — if stable, commit + tag v0.1.3-alpha
