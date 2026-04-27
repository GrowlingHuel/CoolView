# CoolView 🌡️

A lightweight, cross-platform desktop temperature HUD. Sits quietly in the corner of your screen showing CPU/GPU/motherboard temps. Jumps to your attention if things get dangerously hot.

![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Floating HUD** — unobtrusive dark pill overlay in the corner of your screen
- **Sustained warning system** — alerts you only when temps stay high, not on brief spikes
- **Force-to-top on warning** — you will not miss it
- **Toggleable sparkline** — mini temperature history graph
- **24-hour history** — graph and table of recent temps, exportable as CSV
- **Configurable** — thresholds, intervals, sensors, position and display all adjustable
- **Click-through** — the transparent area around the HUD doesn't block your desktop
- **Tiny footprint** — ~10MB binary, minimal CPU/RAM usage

## Install

### Linux
Download the `.deb` or `.tar.gz` from [Releases](../../releases).

```bash
sudo dpkg -i coolview_*_amd64.deb
```

**Requires:** `lm-sensors` for full hardware coverage:
```bash
sudo apt install lm-sensors && sudo sensors-detect
```

> **GPU temperatures** require kernel ≥ 6.12 for Intel integrated graphics, or discrete AMD/Nvidia GPU drivers.

### macOS
Download the `.dmg` from [Releases](../../releases).

> ⚠️ The app is unsigned. macOS will show a Gatekeeper warning. To open: right-click → Open → Open anyway.

### Windows
Download the `.exe` installer from [Releases](../../releases).

> ⚠️ Windows SmartScreen may warn about an unknown publisher. Click "More info" → "Run anyway".

## Usage

CoolView starts as a small dark pill in the corner of your screen showing live temperatures.

- **Click ≡** to open History (24-hour graph and table)
- **Click ⚙** to open Settings
- **Click °C/°F** to toggle temperature units
- **Drag** the pill to reposition it anywhere on screen
- **Warning state** triggers when temps stay above your threshold — the pill turns red and forces itself to the front
- **System tray** — right-click the tray icon to show/hide or quit

## Configuration

Open Settings (⚙) to configure:

| Setting | Description |
|---------|-------------|
| Temp threshold | Temperature that triggers a warning (°C) |
| Duration | How long temps must stay high before warning |
| Base poll interval | How often to read sensors (adapts automatically when hot) |
| Always on top | Keep HUD above all other windows |
| Show sparkline | Mini graph below the temperature readings |
| Launch at login | Start CoolView automatically on login |
| Position | Which corner to start in |
| CPU/GPU/MB | Toggle individual sensors on or off |

Config file location:
- **Linux:** `~/.config/com.coolview.app/config.toml`
- **macOS:** `~/Library/Application Support/com.coolview.app/config.toml`
- **Windows:** `%APPDATA%\com.coolview.app\config.toml`

## Building from Source

**Prerequisites:**
- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`

```bash
git clone https://github.com/HyperArkStudios/CoolView
cd CoolView
npm install
npm run tauri dev     # development
npm run tauri build   # production build
```

**Linux dev note:** Add to `~/.bashrc`:
```bash
export WEBKIT_DISABLE_DMABUF_RENDERER=1
```

## Known Limitations

- **Linux/X11:** Window appears as ~226×228px in alt-tab due to GTK minimum window size. The transparent area is click-through (uses X11 XShape extension).
- **GPU temp on Linux:** Requires kernel ≥ 6.12 for Intel integrated graphics.
- **HUD position resets** on restart — drag it to your preferred position after launch.

## Support the Project

CoolView is free, open source, and always will be. If it's useful:

- ⭐ Star the repo
- ☕ [Buy me a coffee](https://ko-fi.com/hyperarkstudios)

## License

MIT — see [LICENSE](LICENSE)
