# Installing the "Supercar Attack" cluster layout

A layout for the **Cluster Layouts** app (`apps/cluster_layouts`). It draws on the
physical 12.3" instrument cluster through the cluster render service. Nothing here
flashes, roots or writes to any ECU — it only draws layers on the KOMBI panel and
is removed the moment it is turned off.

Previews to inspect first: [`docs/supercar_attack/`](docs/supercar_attack/) —
`normal.png`, `approaching_redline.png`, `redline_attack.png`, `gear_slam_3_to_4.png`.

## 1. Build and install (on the head unit)

The MGU **Store builds on the head unit with the unit's own SDK** — the proprietary
`oap-sdk/` is extracted from *your* MGU and is never committed, so the package is
built on the unit, not on a PC.

1. Put this repository on the head unit (or `scp` it across) as you do for the
   other Cluster Layouts updates.
2. Extract the unit's SDK once if you have not: `node kit/tools/extract_sdk.js`
   (writes `oap-sdk/`).
3. Build the app package: `python3 kit/tools/build.py cluster_layouts`.
4. Install the built package through the **MGU Store** the same way you install
   any Cluster Layouts update.

No new resource is added — "Supercar Attack" is one more layout inside the existing
Cluster Layouts app (`app.json`, `layouts.js`).

## 2. Select the layout

**Settings → Cluster Layouts → Layout → "Supercar Attack".**
The default layout is unchanged; nothing switches until you pick it.

## 3. First test — PARKED, staged A → B → C → D

> **The first on-car test must be done parked, engine running, transmission in P.**
> Do not drive with this layout until every reading and warning light has been
> confirmed correct against the stock cluster.

We bring the layout up one feature at a time so that if a black square (or any
artifact) appears, it can be pinned to the exact feature that caused it. The stage
is set with an **environment variable on the app** (`SUPERCAR_STAGE`); production
sets none, so the normal Store install is always the full layout.

| Stage | `SUPERCAR_STAGE` | What is drawn |
|------|------------------|----------------|
| A | `A` | black background, speed, arched rev bar, gear framed by chevrons, **static gear** (no slam, no attack) |
| B | `B` | stage A **+ the gear-change slam animation** |
| C | `C` | stage B **+ the full-screen red-line attack field** |
| D | unset | the full layout (adds oil/coolant and boost/power readouts, range, outside temp) |

For each stage, in order A → B → C → D:

1. Set `SUPERCAR_STAGE` for the app (or leave it unset for D), restart the app so
   the layout rebuilds, and select Supercar Attack.
2. Watch the cluster for ~30 s parked. Blip the throttle to exercise the rev bar
   (B and C: shift between gears to see the slam; C: reach the red line to see the
   attack takeover — **parked, do not rev to the limiter aggressively**).
3. **Turn the layout off** (next step) and confirm the stock cluster returns
   **with no leftover black square or panel**. Then move to the next stage.

If a black square appears at a stage, stop there and capture the logs (section 5).
The stage that introduced it is the culprit.

## 4. Returning to stock immediately

Any of these hands the panel straight back to the stock BMW cluster:

- **Settings → Cluster Layouts → turn "Show on the cluster" OFF**, or
- pick a different layout, or
- stop the Cluster Layouts app.

Returning to stock is expected to be **immediate**. A black rectangle that lingers
and only clears after a while is the symptom we are watching for — if you see it,
note which stage and capture the logs below.

## 5. If a black square appears — what to capture

Run the app once with diagnostics on: set **`CLUSTER_DIAG=1`** in the app's
environment and restart. This adds (only on show/hide, never per frame):

- `diag: hiding N layers (refs …); font asset K kept, target handed back` — sent
  the instant the layout is turned off.
- `diag: renderer status after hide: …` — the renderer's **own** report of what it
  is still drawing, right after the hide.

Capture / photograph, for the stage where it happened:

1. The **QR / USB diagnostic log** covering the moment you turned the layout off
   (it contains the two `diag:` lines and the `panel … : …` target line).
2. A **photo of the cluster** showing the black square, and roughly how long it
   stayed before clearing.
3. Whether it also happens with an **existing** layout (e.g. Track) at the same
   stage of turning off — this tells us if it is specific to Supercar Attack or a
   general renderer-return behavior.

The `diag: renderer status after hide` line is the key: if it still lists a layer
on the panel after the hide, the renderer did not drop it; if it lists none but a
square is still on screen, the square is a renderer-side redraw lag, not a layer we
left behind.

## 6. Safety

- First test parked only; confirm all readings and warnings before driving.
- This layout does not alter, bypass or disable any vehicle function, warning or
  safety mechanism — it only replaces how the cluster is drawn, and the stock
  cluster returns whenever it is turned off.
