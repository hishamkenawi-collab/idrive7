# Installing the "Supercar Reference" cluster layout

Supercar Reference is a separate layout inside **Cluster Layouts 0.14.0**. It is the three-state reconstruction
(COMFORT, SPORT, SHIFT) of the reference picture. **Supercar Attack (0.13.4) is unchanged** and stays selectable.

Previews to compare with the reference: [`docs/supercar_reference/`](docs/supercar_reference/) — `normal.png`,
`sport.png`, `sport_individual.png`, `approaching_redline.png`, `redline_attack.png`, `gear_slam_3_to_4.png`.

## 1. Update from MGU Store

Update **Cluster Layouts** to **0.14.0** from MGU Store, as for any Cluster Layouts update. The store builds it on the
head unit with the unit's own SDK, as before.

## 2. Select the layout

**Settings → Cluster Layouts → Layout → "Supercar Reference".** Nothing switches until you pick it.

## 3. Black-square diagnostics (Settings)

**Settings → Cluster Layouts → Black-square diagnostics (lines in Logs)**. It is **On** by default; **Off** stops the
lines. They go to the app's Logs (QR / USB). They appear only when the layout shows and hides, never per frame:

- `diag show: slot table as the renderer reports it: slot 0x203 ... | slot 0x105 ...` — once per show: what the
  renderer reports in each slot.
- `diag t0: HIDE at wall ...` and `... all N drop ops sent ...` — the layers dropped at the hide.
- `diag +...ms: renderer status after hide ...` — the renderer's own status right after the hide.
- `diag +...ms: slot table 3.5 s after the hide ...` — whether our panel is still mapped after the release.
- `diag +...ms: target 'panel' ... (this is the stock-reclaim event)` — the moment the renderer hands the panel back.

`CLUSTER_DIAG=1` in the app's environment still works as a development override.

## 4. First test: parked

- Engine running, transmission in P. Do not drive with the layout until every reading and warning light matches the
  stock cluster.
- Show the layout, watch for about 30 s, blip the throttle, then turn it off.
- If a square stays after the stock comes back: note the time and where it is, then capture the Logs for that moment
  (QR / USB) and send them with a photo of the square.

## 5. Status: the black squares are not solved

What the code and the renderer source show, and what they do not:

- The KOMBI draws its own dark boxes over a running layout: the gear readout, the eDrive readout and, on an M car,
  two more in the centre (`apps/cluster_layouts/layout_common.js`). Nothing of this layout is placed under them.
- The CarPlay "guide hold" in cluster-render (slots 0x105 and 0x103) holds only the stock CarPlay maneuver box, and
  only while the map is shown. It does not cover the panel, the gear readout or the eDrive box, and it never hides
  warnings. Source: `robertnisipeanu/idrive-apps`, `native/cluster-render/cluster-render.conf` ("guide hold") and
  `README.md`, at commit `4d49c18`.
- The backgrounds of this layout stop at y = 636 (`BG_BOTTOM`), as a precaution against the squares reported below
  about 640 px. That is not verified on the car.
- Upstream reports, with no fix yet: `eroobeeroo/idrive7-cluster-info` issue 3 and `hexlay/idrive7-custom-apps`
  issue 2.
