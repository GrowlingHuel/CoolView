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

## Attempt 4 — set_background_color(opaque) + eval force-repaint on close

### Diagnosis
The GTK "native widget expose" hypothesis was incorrect. WebKit renders ALL HTML
elements itself — there are no native GTK widgets inside the WebView. A `<div>`
and a `<button>` use the same event path.

The real mechanism: WebKit's dirty-rect repaint pipeline first CLEARS the dirty
region to the current "clear colour" (transparent by default on ARGB windows),
then paints DOM content on top. The clear-to-transparent step briefly leaves
alpha=0 pixels in the backing surface. The X11 compositor reads those transparent
pixels and composites them against stale HUD content in the backing surface
behind them — producing the ghost.

set_background_color(opaque) fixed this because it made the clear step opaque,
so there was never a transparent intermediate frame.

The rectangle on close was caused by: set_background_color does NOT immediately
repaint the existing opaque pixels — it only changes the clear colour for FUTURE
dirty-rect paints. With no new dirty rects after the close transition, the stale
opaque pixels remained until something covered them.

### Fix
Two-part:
1. **Open**: set_background_color(Some(Color(0,0,0,255))) via useEffect after
   view changes to panel. Opaque clear colour eliminates transparent intermediate
   frames during any button click → no ghost.
2. **Close**: set_background_color(Some(Color(0,0,0,0))) AND eval() to inject
   `opacity:0.9999` on `<html>`. This promotes the page to a GPU compositing
   layer, forcing WebKit to re-composite the full backing surface from scratch
   using the new transparent clear colour — clearing all stale opaque pixels.
   The rAF callback removes the opacity immediately after.

   Critically: close handlers now AWAIT the invoke before calling setView("hud"),
   so the background is already transparent when React's DOM commit generates
   dirty rects. Those rects are then painted with transparent clear colour.

### Status: UNTESTED
