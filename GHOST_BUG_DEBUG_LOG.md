# CoolView — Ghost Rendering Bug Debug Log

## Environment
- OS: Ubuntu 22.04, X11 (not Wayland)
- WebKit2GTK: 2.50.4
- Tauri: 2.x
- Window: 280×500px, `transparent: true`, `decorations: false`
- Display server: X11, GTK compositor

## The Bug
When Settings or History panel is open, clicking the ✕ close button (or Cancel,
Back, Save, Escape) causes BOTH the panel AND the HUD temperature text to be
visible simultaneously. The panel should disappear and only the transparent HUD
should remain.

The ghost text appears in the TOP-RIGHT area of the window — exactly where the
HUD temperature readings are positioned.

## Architecture
- Window is always 280×500px transparent
- `App.tsx` uses a `view` state: `"hud" | "settings" | "history"`
- HUD renders ONLY when `{view === "hud" && <HUD/>}`
- Settings/History render ONLY when their respective view is active
- React state is confirmed correct — HUD is NOT mounted when panels are open

## What We Know For Certain
1. The ghost is X11 compositor retaining previous frame pixels
2. The ghost appears specifically on BUTTON CLICK inside the panel
3. The ghost text is from BEFORE the panel opened (old HUD frame)
4. React state is correct — this is a rendering/compositor timing issue
5. The ghost appears in the top-right corner where HUD text lives

---

## Attempted Fixes & Results

### CSS Fixes (all failed)

**1. `isolation: "isolate"` on panel containers**
- Rationale: Create new stacking/compositing context
- Result: No change

**2. `borderRadius: 0` on panels (removed border-radius)**
- Rationale: border-radius corners were alpha=0 pixels leaking through
- Result: Partially helped but ghost persisted

**3. `inset: 0` on panels with fully opaque background**
- Rationale: Cover entire window with opaque pixels
- Result: No change — ghost still appears on button click

**4. `will-change: transform` on panels**
- Rationale: Promote to own compositor layer
- Result: No change

**5. `zIndex` layering**
- Rationale: Ensure panels render above HUD
- Result: No change — HUD is unmounted anyway

**6. `background: view !== "hud" ? "rgb(14,14,20)" : "transparent"` on root div**
- Rationale: Force opaque background when panels open
- Result: No change — ghost still appears

**7. Removing `background-color` from `html, body, #root`**
- Result: No change

---

### Rust/Tauri Fixes (caused new problems)

**8. `set_background_color(Some(Color(0,0,0,255)))` on panel open**
- Rationale: Make WebKit's ARGB surface opaque, prevent alpha=0 retention
- Result: FIXED the ghost BUT caused solid BLACK rectangle when closing panel

**9. `set_background_color(None)` on panel close (to restore transparency)**
- Rationale: Restore transparent state after fix #8
- Result: Caused solid WHITE rectangle instead of transparent
- Root cause: `None` in wry means "skip the call entirely" → WebKit falls back
  to browser default white, not transparency

**10. Removed `set_background_color` entirely**
- Rationale: Return to original working state, fix CSS instead
- Result: White rectangle gone, but ghost returned

---

### React Fixes

**11. `flushSync` on all close/cancel handlers**
- Rationale: React 18 uses MessageChannel (macrotask) for render commits.
  WebKit's rendering cycle fires BEFORE the macrotask, so it sees the OLD DOM
  (panel still mounted) and does a dirty-rect paint. `flushSync` forces
  synchronous DOM commit before WebKit's render cycle.
- CC diagnosis: "Click → setView queued (macrotask) → JS returns → WebKit
  renders OLD DOM → dirty-rect paint → macrotask fires → React re-renders"
- Result: **NO CHANGE** — ghost still appears despite flushSync

---

## CC Diagnoses (in order)

### CC Attempt 1
"borderRadius corners create alpha=0 pixels. WebKit partial repaint on button
click doesn't redraw those corners. X11 compositor shows stale HUD pixels
through them."
→ Fix: Remove borderRadius. Partially helped, not sufficient.

### CC Attempt 2  
"`set_background_color(None)` doesn't mean transparent — it means skip the call.
Use `None` to restore = WebKit defaults to white."
→ Fix: Remove set_background_color entirely, fix at CSS level instead.

### CC Attempt 3
"React 18 macrotask scheduler gap: WebKit renders before React commits new DOM.
flushSync forces synchronous commit."
→ Fix: flushSync on all handlers. Did NOT work despite being logically sound.

---

## Current State of Files

### App.tsx
```tsx
// HUD only renders when view === "hud"
{view === "hud" && <HUD ... />}
{view === "settings" && <Settings ... />}
{view === "history" && <History ... />}
// Root div:
<div style={{ width: "100%", height: "100%", position: "relative", 
  background: view !== "hud" ? "rgb(14,14,20)" : "transparent" }}>
```

### Settings.tsx / History.tsx panel style
```tsx
position: "absolute",
inset: 0,
background: "rgb(14, 14, 20)",  // fully opaque
// NO borderRadius on outer container
// will-change: "transform"  (added by CC, may or may not be present)
```

### index.css
```css
html, body, #root {
  background: transparent;
  overflow: hidden;
}
```

### tauri.conf.json
```json
"transparent": true,
"decorations": false,
"width": 280,
"height": 500
```

### lib.rs
- NO `set_background_color` calls anywhere
- Window positioned via `position_window()` using `saturating_add/sub`

---

## Key Observations
1. The ghost is triggered specifically by BUTTON CLICKS inside the panel
2. Mouse moves and other interactions do NOT trigger the ghost
3. The ghost shows up in top-right corner (where HUD text is)
4. flushSync did not help — the timing theory may be wrong
5. The app worked perfectly BEFORE any compositor fixes were attempted
6. Original working state: no set_background_color, had borderRadius on panels

## Hypothesis for Next Attempt
The dirty-rect issue may not be React scheduling at all. GTK button press events
cause an immediate GDK_BUTTON_PRESS expose event that redraws the button widget
BEFORE any JS runs. This native GTK repaint may be happening at a lower level
than React/JS can intercept. The fix may need to be at the GTK/native level —
either suppressing the native button repaint or forcing a full window invalidation
at the GTK level before the button press is processed.

---

## What Actually Needs To Happen
Force a **full window invalidation** at the GTK/X11 level when a button inside
a panel is clicked. This must happen BEFORE or SYNCHRONOUSLY WITH the GTK button
press expose event — not after JS runs. CSS and React timing cannot achieve this.

---

## Update — Two-Window Architecture (latest)

### Approach
Moved Settings and History into a separate panel window created on demand.
Panel window is `transparent: false` — eliminates panel ghost entirely.
HUD remains in main transparent window.

### HUD Ghost — Current State
Ghost persists on the HUD window (transparent: true, 240×64px).
Shows old temp values under new ones on every update.
Persists for 90-120 seconds.

**What helped partially:**
- `willChange: "transform"` + `transform: "translateZ(0)"` on temp container div
- Ghost still appears but may clear faster in some cases

**What did NOT help:**
- flushSync on state updates
- borderRadius removal
- set_background_color (causes white rectangle — see earlier entries)
- Window height reduction
- overflow: hidden on container

**Current hypothesis:**
`startDragging()` in Settings/History header may be interfering with GTK's
window freeze/thaw cycle, causing `gdk_window_thaw_toplevel_updates` assertion
failure. This in turn may be causing the X11 BadImplementation crash AND
disrupting the compositor repaint cycle that causes ghosts.

**Not yet tried:**
- Removing startDragging() from panel windows entirely
- Making HUD window non-transparent with CSS background matching desktop colour
- Full window invalidation via JS on every temp update

---

## X11 BadImplementation Crash (NEW BUG)

**Error:** `BadImplementation (server does not implement operation)`
**request_code:** 20 = `ChangeWindowAttributes`
**Preceding warning:** `gdk_window_thaw_toplevel_updates: assertion 'window->update_and_descendants_freeze_count > 0' failed`

**Trigger:** Clicking Settings button after extended use. Serial number grows
over time (1545 → 7040 → 21545) indicating accumulation of state.

**What was tried:**
- Removed `decorations(false)` from panel — crash persisted
- Removed `always_on_top(true)` from panel — crash persisted  
- Removed `skip_taskbar(true)` from panel — crash persisted
- Used `on_window_event` + `sync_channel` for panel close — caused immediate crash
- 150ms and 300ms sleep between close and reopen — insufficient

**Strong hypothesis:**
`startDragging()` called from panel window header calls `XGrabPointer`.
This interferes with GTK's internal window freeze/thaw reference counting.
After enough open/close cycles the counter goes negative, causing the
assertion failure on the next `ChangeWindowAttributes` call.

**Recommended fix to try:**
Remove `startDragging()` from Settings.tsx and History.tsx entirely.
Panel windows should not be draggable — they spawn adjacent to HUD.

---

## Update — startDragging hypothesis DISPROVED

**Date:** Latest session

**What was tried:** Removed `startDragging()` from HUD.tsx entirely.
**Result:** Crash still happened on first Settings click, serial 2745.
**Conclusion:** `startDragging()` is NOT the cause of the crash.

## Revised Understanding of Crash

**Key observation:** `gdk_window_thaw_toplevel_updates` warning fires at
APP STARTUP, before any user interaction. Crash follows ~11 seconds later
on first Settings click.

**This means:** The freeze counter is corrupted DURING STARTUP, not during
user interaction. Something in Tauri's `setup()` or initial window creation
is calling freeze without a matching thaw.

**Suspects (not yet investigated):**
- `TrayIconBuilder::build()` during setup
- `position_window()` calling `set_position()` on startup
- `set_always_on_top()` on main window during setup
- Interaction between `transparent: true` main window and non-transparent
  panel window creation
- The `always_on_top: true` config in tauri.conf.json itself

**Not yet tried:**
- Removing tray icon build from setup
- Removing set_always_on_top call from setup
- Removing position_window call from setup
- Setting always_on_top: false in tauri.conf.json

---

## CRASH ROOT CAUSE FOUND — position_window() in setup()

**Date:** Latest CC session (9m 17s analysis)

**Root cause:** `position_window()` called synchronously in `setup()` BEFORE
the GTK event loop starts. The call chain:
`position_window()` → `current_monitor()` + `outer_size()` + `set_position()`
triggers GTK's internal resize/layout machinery on a transparent,
decorations-less, always-on-top window that hasn't been fully realized yet.
This calls `gdk_window_thaw_toplevel_updates` on a GDK window whose freeze
counter is already 0 — corrupting it to -1.

The redundant `set_always_on_top(true)` call in setup() (tauri.conf.json
already sets alwaysOnTop: true) compounds the problem.

**Why crash is 11s later:** Corruption happens at startup. Nothing triggers
the crash surface until the first `WebviewWindowBuilder::build()` call (panel
creation), which issues `ChangeWindowAttributes`. The corrupted GDK state
causes X server to return `BadImplementation`.

**Why other suspects are innocent:**
- TrayIconBuilder::build() — doesn't interact with any window's GDK state
- always_on_top: true in tauri.conf.json — just a window hint, not the cause
- transparent: true + always_on_top: true combination — not the cause alone

**The fix:** Defer window operations until after GTK event loop starts.
Use `thread::spawn` + `run_on_main_thread` with 100ms delay to guarantee
operations post to the event loop queue AFTER window realization:

```rust
std::thread::spawn(move || {
    std::thread::sleep(std::time::Duration::from_millis(100));
    let handle2 = handle.clone();
    let _ = handle.run_on_main_thread(move || {
        if let Some(w) = handle2.get_webview_window("main") {
            let _ = w.set_always_on_top(init_aot);
            position_window(&w, &init_pos);
        }
    });
});
```

**Key insight:** `run_on_main_thread` called from setup() (main thread) may
run synchronously. Called from a background thread, it's guaranteed to post
to the GTK event loop queue and run after window realization.

**Status:** Fix implemented by CC. Needs testing.

---

## Update — position_window fix partially worked

**Fix applied:** Deferred `position_window()` and `set_always_on_top()` to
post-GTK-event-loop via `thread::spawn` + `run_on_main_thread` with 100ms delay.

**CC bug:** The deferred init block was accidentally placed INSIDE the poll loop,
calling `set_always_on_top` + `position_window` on every poll cycle. Removed.

**Result after fix:**
- `gdk_window_thaw_toplevel_updates` warning NO LONGER appears at startup ✓
- Crash still happens at ~2 minutes, serial 26998
- No preceding warning before crash this time
- This means a DIFFERENT source of crash exists, previously masked

**New crash characteristics:**
- No startup warning
- Happens after ~2 minutes of use
- Triggered by: close panel → reopen panel
- Serial 26998 suggests accumulated state from repeated operations

**Current unknowns:**
- What is now calling `ChangeWindowAttributes` (opcode 20) that fails?
- Is it the `set_always_on_top()` calls in the poll loop warning/clear handlers?
- Is it the `set_config` command calling `set_always_on_top` + `position_window`?
- Is it the panel window's `eval()` navigation triggering something?

**HUD drag broken:** `startDragging()` was removed to test crash hypothesis.
Needs to be restored OR replaced with safe alternative.

---

## CRASH ROOT CAUSE FULLY IDENTIFIED — GTK thread safety

**Final root cause:** GTK is not thread-safe. ALL GTK operations must run on
the GTK main thread. Two offenders were calling GTK operations from worker
threads:

1. **`set_config` command** — Tauri command handlers run on a worker thread
   pool, not the GTK main thread. Was calling `w.set_always_on_top()` +
   `position_window()` directly. Every settings save = one corruption hit.

2. **Poll loop warning/clear handlers** — Running in `std::thread::spawn`,
   was calling `w.set_always_on_top()` + `w.set_focus()` directly from
   background thread.

After enough corruptions (~2 min of use), the next `WebviewWindowBuilder::build()`
issued `ChangeWindowAttributes` and X11 returned `BadImplementation`.

**Fix:** All GTK operations now dispatched through `app.run_on_main_thread()`
which queues them to run on the GTK main thread via the event loop.

**RULE TO NEVER VIOLATE:** Any Tauri window operation (`set_always_on_top`,
`set_focus`, `set_position`, `build()`) called from a background thread or
command handler MUST be wrapped in `app.run_on_main_thread(|| { ... })`.

**Other fixes in same CC session:**
- `startDragging()` restored to HUD.tsx (was not the crash cause)
- TypeScript build error fixed: `currentMonitor()` is standalone from
  `@tauri-apps/api/window`, not a method on `WebviewWindow`

**Status:** Testing required.
