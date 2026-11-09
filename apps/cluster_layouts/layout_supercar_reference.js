'use strict';
/**
 * layout_supercar_reference.js - "Supercar Reference", rebuilt from the three-state reference (COMFORT, SPORT, SHIFT).
 *
 * The reference picture is this 1920x720 layout squeezed to 1672x311 per state, so its coordinates map back by
 * x * 1920/1672 and y * 720/311 and the glyphs keep their natural proportions. The positions in GEO and READ are
 * that measured mapping, moved only where a KOMBI box is drawn over the panel (see KEEP CLEAR).
 *
 * The drawing: a black panel; a cool-white angular housing with glow lines at the outer lobes (blue in Comfort,
 * red in Sport and SHIFT); the rev arc across the top with 0-8 on one row under the camera cowl, the red zone
 * always red; the giant gear with a chevron either side and the drive mode under it; big speed on the left;
 * temperature and boost/torque readouts with bars; fuel range, outside temperature and the clock along the bottom.
 * Nothing is sent per frame: each piece is a shader layer the cluster's GPU runs, and the gear slam is a one-shot
 * keyframe the renderer plays (engine.js trigger/anim).
 *
 * KEEP CLEAR. The KOMBI draws its own dark boxes over a layout that is up: the gear readout, the eDrive readout and,
 * on an M car, two more (layout_common.js). Nothing of ours is put under them. Backgrounds stop at BG_BOTTOM,
 * because the reports of black squares name the area below ~640 px; this is a precaution, not a measured cause.
 * Text stops above the warning lights (TELLTALES, y 652). tools/test_supercar_attack.js checks both.
 */
const C = require('./layout_common');

const BG_BOTTOM = 636;      // no background (black, wash, frame, glow) goes below this line
const TEXT_BOTTOM = 650;    // nothing of ours goes into the warning-light strip (TELLTALES starts at 652)

const PALETTES = {
    comfort: { accent: '#dfe8f2', mode: 'COMFORT' },
    sport: { accent: '#ff3326', mode: 'SPORT' },
    efficient: { accent: '#35e08a', mode: 'EFFICIENT' },
};
const BASE = {
    bg: '#000000', text: '#ffffff', dim: '#8a93a0', track: '#15181d', red: '#ff2a1f', amber: '#ffab00',
    rpm0: '#e6edf5', rpm1: '#ff9f1a', num: '#ffffff', tip: '#ffffff', impact: '#ff6a00',
    frame: '#c6d0dd', silver: '#cdd6e2',
    tileTop: '#101216', tileBottom: '#070809', tileEdge: '#242a31', off: '#181b20', green: '#39e07a', yellow: '#ffc400',
    ev: '#4ab4ff', regen: '#3ddc84',
    /* the red-line wash: dim at the edges, so the SHIFT state reads as a black panel with red glow, not a red field */
    deep: '#050101', edge: '#4d0905', glowc: '#b41c0e',
};
const pal = (lookId) => Object.assign({}, BASE, PALETTES[lookId] || PALETTES.comfort);

/* The three states of the reference, with colours sampled from the picture (the brightest pixels of each
 * element). SPORT+ / INDIVIDUAL is the SPORT family with the red pushed harder. */
const MODES = {
    comfort: { label: '#7fd8f0', labelGlow: ['#2aa8ff', 0.35], frame: '#c9d4e0', frameA: 0.85, lobe: '#1494e8', lobeHot: 0.7,
        chev: '#5a6e82', chevHot: 0.1, arc: ['#f5fbff', '#cfe3f5'], track: '#0c1a27', redc: '#e4241e', bar: '#f2f8ff',
        gearGlow: '#ffffff', gearA: 0.07 },
    sport: { label: '#fcf4f3', labelGlow: ['#ff3a2a', 0.6], frame: '#e6e8ee', frameA: 0.85, lobe: '#e0170f', lobeHot: 0.9,
        chev: '#d03030', chevHot: 0.35, arc: ['#f5c41a', '#f59a1a'], track: '#14100b', redc: '#e01e1e', bar: '#e01a10',
        gearGlow: '#ff7a1a', gearA: 0.15 },
    sportplus: { label: '#ffffff', labelGlow: ['#ff2a1a', 0.9], frame: '#f0e4e4', frameA: 0.9, lobe: '#ff1a10', lobeHot: 1,
        chev: '#e02a22', chevHot: 0.6, arc: ['#ffb020', '#ff5a1a'], track: '#170806', redc: '#ff1a10', bar: '#ff1a10',
        gearGlow: '#ff4a1a', gearA: 0.2 },
    shift: { label: '#ff3a2a', labelGlow: ['#ff1a10', 0.9], frame: '#ff3322', frameA: 1, lobe: '#ff1a10', lobeHot: 1,
        chev: '#ff2a1f', chevHot: 1, arc: ['#f0302a', '#ff4a2a'], track: '#2a0605', redc: '#ff1a10', bar: '#f20a04',
        gearGlow: '#ff2a1f', gearA: 0.35 },
};
const NUM_RED = '#e4241e';
const WHITE = '#ffffff', UNIT = '#c9d1db', REV_LABEL = '#a7b0bc';

const lbl = (t) => ({ color: [t.dim, 1], glow: [t.accent, 0] });
const white = (t) => ({ color: [t.text, 1], glow: [t.accent, 0.1] });

/* ---------- the drive mode (live from the car) and the red-line attack ---------- */
/** 0 Comfort, 1 Sport, 2 Sport+ / Individual, from the car's own drive-mode name. */
function driveLvl(d) {
    const m = String((d && (d.driveMode || d.mode)) || '').toUpperCase();
    if (/INDIVIDUAL|SPORT\s*\+|SPORT\+/.test(m)) return 2;
    if (/SPORT|MANUAL|^S$|^M$/.test(m)) return 1;
    return 0;
}
const atk = { on: false };
/** 0..1 of the configured red line (rpmScale: red is in thousands). 0 when the engine is off. */
function redFrac(o, d) {
    const red = C.rpmScale(o).red * 1000;
    return C.isNum(d.rpm) && d.engineOn !== false && red > 0 ? d.rpm / red : 0;
}
/** The full-attack level, 0 or 1, with hysteresis so it does not flicker at the threshold (enter 98%, exit 93%). */
function attackLevel(o, d) {
    const f = redFrac(o, d);
    if (atk.on && f < 0.93) atk.on = false;
    else if (!atk.on && f >= 0.98) atk.on = true;
    return atk.on ? 1 : 0;
}
/** The state's colours: the attack overrides the drive mode; otherwise the live drive mode decides. */
const modeOf = (d) => (atk.on ? MODES.shift : [MODES.comfort, MODES.sport, MODES.sportplus][driveLvl(d)]);

/* ---------- the gear and its change animation ---------- */
/** What the giant gear shows: P / R / N, or the forward gear number. */
function gearBig(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
    if (d.gear === -1) return 'R';
    return C.isNum(d.gear) && d.gear > 0 ? String(d.gear) : '-';
}
/** The value the engine watches to fire the slam: the forward gear, or null for P/R/N/reverse, so only a shift
 * between two numbered gears slams. */
function gearNum(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N' || d.gear === -1) return null;
    return C.isNum(d.gear) && d.gear > 0 ? d.gear : null;
}
/** Under the gear: the drive mode, or SHIFT at the full red line. */
const progShift = (d, t) => (atk.on ? 'SHIFT' : C.modeText(d, t));
/** The mode line's colour: the state's label colour and glow. */
const modeColour = (t, d) => ({ color: [modeOf(d).label, 1], glow: modeOf(d).labelGlow });

/* ---------- the reference, in panel pixels (1920x720) ---------- */
const GEO = {
    /* the central housing: a closed angular hexagon; its top edge is under the camera cowl */
    hex: [[379, 232], [494, 97], [1286, 97], [1407, 232], [1309, 614], [482, 614]],
    /* the housing brackets: round the temperatures (left), and round the boost/torque (right, clear of the gear box:
     * the readouts sit between the gear box and this bracket) */
    bracketL: [[218, 273], [161, 398], [218, 537]],
    bracketR: [[1842, 262], [1886, 392], [1842, 542]],
    /* the glow lines at the outer lobes */
    lobeL: [[150, 430], [137, 520], [175, 636]],
    lobeR: [[1914, 300], [1909, 420], [1897, 540], [1872, 636]],
    /* the rev arc: a band of the arc shader, centred far below the glass, sweeping from the low left end (0) up
     * over the crown to the right end (8). Radius and thickness are fitted to the reference's bar edges. */
    /* the layer is larger than the arc by a margin: the band's glow fades inside it, so no edge of the layer shows */
    arc: { cx: 1008, cy: 2533, R: 2336, T: 40, a0: -14.1, a1: 11.2, px: 300, py: 90, pw: 1320, ph: 260 },
    /* numerals 1-8 on one row above the bar, 0 at the arc's start; the row starts under the camera cowl's edge */
    numRow: { y: 128, h: 44, x1: 629, step: 110.3 },
    zero: { x: 367, y: 224, w: 50, h: 44 },
    /* the gear digit (centre x 960) and its chevrons; an M car's own centre boxes sit there, so it moves down */
    gear: { std: [760, 236, 400, 290], m: [760, 402, 400, 180] },
    chevL: { std: [756, 319, 80, 218], m: [756, 402, 80, 160] },
    chevR: { std: [1066, 322, 80, 218], m: [1066, 402, 80, 160] },
    mode: { std: [830, 518, 260, 62], m: [830, 580, 260, 52] },
    speed: [487, 311, 190, 156],
    speedUnit: [678, 420, 100, 40],
    revLabel: [1220, 282, 154, 24],
};
/* the readouts: value, unit, a bar under it, an icon; the right side sits clear of the KOMBI's gear box (x > 1662) */
const READ = {
    coolant: { v: [278, 268, 96, 56], u: [372, 292, 46, 30], bar: [230, 338, 150, 14], icon: [218, 268, 34, 50, 0] },
    oil: { v: [278, 420, 96, 56], u: [372, 444, 46, 30], bar: [230, 500, 150, 14], icon: [218, 420, 34, 50, 1] },
    boost: { v: [1676, 268, 100, 52], u: [1778, 290, 50, 28], bar: [1676, 352, 142, 14] },
    power: { v: [1676, 414, 100, 52], u: [1778, 436, 50, 28], bar: [1676, 500, 142, 14] },
};
/* the bottom row, above the warning lights */
const BOTTOM = {
    fuelIcon: [288, 596, 30, 44, 4],
    fuel: [330, 598, 110, 40], fuelU: [392, 614, 50, 28],
    temp: [1417, 598, 110, 40], tempU: [1508, 612, 40, 28],
    time: [1573, 598, 90, 40],
};

/* ---------- helpers ---------- */
/** Consecutive segments of a polyline (x0,y0,x1,y1 in panel px), closed back to the first point when asked. */
const segs = (pts, closed) => pts.slice(1).map((p, i) => [pts[i][0], pts[i][1], p[0], p[1]])
    .concat(closed ? [[pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]]] : []);
/** A background rectangle, cut at BG_BOTTOM (never drawn over the static strip below). */
const bgRect = (key, x, y, w, h) => C.flat(key, x, y, w, Math.max(0, Math.min(h, BG_BOTTOM - y)), 'bg');
/** The number of a readout ('480 Nm' -> '480'). */
const split = (s) => { const t = String(s); const i = t.indexOf(' '); return i < 0 ? t : t.slice(0, i); };
const tempUnit = (o) => (o.tempUnit === 'c' ? '°C' : '°F');
const tempValue = (o, c) => (C.isNum(c) ? String(Math.round(C.tempIn(o, c))) : '--');
const vcol = () => () => ({ color: [WHITE, 1], glow: [WHITE, 0.1] });
const ucol = () => () => ({ color: [UNIT, 1] });
const speedColour = () => () => ({ color: [WHITE, 1], glow: [WHITE, 0.12] });
const barCol = (t, d) => { const m = modeOf(d); return { track: '#1b222c', fill0: m.bar, fill1: m.bar, redc: m.redc, tip: m.bar, tick: '#05070a' }; };

/** One angular line layer (the frame shader): segments in panel px, a colour and a glow that follows `hot`. */
function lines(key, list, colour, hot) {
    const p = { u_nseg: [list.length] };
    list.forEach((s, i) => { p['u_s' + i] = s; });
    return { key, kind: 'frame', x: 0, y: 0, w: 1920, h: BG_BOTTOM, params: p,
        colors: (t, d) => { const [hex, a] = colour(modeOf(d)); return { color: [hex, a] }; },
        dyn: (d) => ({ u_hot: [hot(modeOf(d))] }) };
}
/** The rev arc in two pieces on one arc: the lit part up to the red line (its fill follows the rpm), and the red
 * zone beyond it, always red (the reference shows 7 and 8 red at every rpm). Both are the band shader in arc mode. */
function arcBars(o) {
    const r = C.rpmScale(o), A = GEO.arc;
    /* the red zone starts about half a numeral step before the red numeral (the reference's place for it), so the
     * angle comes from x on the numeral row, not from the linear rpm scale */
    const xRed = GEO.numRow.x1 + (r.red - 1) * GEO.numRow.step - 0.56 * GEO.numRow.step;
    const aRed = Math.asin(Math.max(-1, Math.min(1, (xRed - A.cx) / A.R))) * 180 / Math.PI;
    const nAll = Math.round(r.max * 4), nLit = Math.max(1, Math.round(nAll * (aRed - A.a0) / (A.a1 - A.a0)));
    const geo = [A.cx - A.px, A.cy - A.py, A.R, A.T];
    const lit = {
        key: 'rpmBar', kind: 'band', x: A.px, y: A.py, w: A.pw, h: A.ph, z: 6,
        params: { u_geo: geo, u_span: [A.a0, aRed, nLit, 0.36], u_marks: [0, 0, 0, 0], u_red: [2], u_soft: [0] },
        colors: (t, d) => { const m = modeOf(d); return { track: m.track, fill0: m.arc[0], fill1: m.arc[1], redc: m.redc, tip: WHITE, tick: '#05070a', num: WHITE }; },
        value: (d) => (C.isNum(d.rpm) && d.engineOn !== false ? Math.min(1, d.rpm / 1000 / r.red) : 0), max: 1, sweep: true,
    };
    const zone = {
        key: 'rpmRed', kind: 'band', x: A.px, y: A.py, w: A.pw, h: A.ph, z: 6,
        params: { u_geo: geo, u_span: [aRed, A.a1, nAll - nLit, 0.36], u_marks: [0, 0, 0, 0], u_red: [0], u_soft: [0] },
        colors: (t, d) => { const m = modeOf(d); return { track: m.redc, fill0: m.redc, fill1: m.redc, redc: m.redc, tip: m.redc, tick: '#05070a', num: WHITE }; },
        value: () => 1, max: 1, sweep: false,
    };
    return [lit, zone];
}
/** The numerals: 0 at the arc's start, 1..n on one row; the red zone's numbers are red. */
function numerals(o) {
    const r = C.rpmScale(o), out = [];
    const col = (i) => () => ({ color: [i >= r.red ? NUM_RED : '#f4f4f6', 1], glow: [WHITE, 0.08] });
    out.push(C.text('num0', GEO.zero.x, GEO.zero.y, GEO.zero.w, GEO.zero.h, '0', col(0), { align: 0.5 }));
    for (let i = 1; i <= r.max; i++) {
        const cx = GEO.numRow.x1 + (i - 1) * GEO.numRow.step;
        out.push(C.text('num' + i, Math.round(cx - 30), GEO.numRow.y, 60, GEO.numRow.h, String(i), col(i), { align: 0.5 }));
    }
    return out;
}
/** The rev bar as a straight segmented bar (the fallback layouts). */
function rpmBar(o, x, y, w, h) {
    const r = C.rpmScale(o);
    return {
        key: 'rpmBar', kind: 'band', x, y, w, h, z: 15,
        params: { u_geo: [7, h / 2, 0, Math.max(6, h - 8)], u_span: [0, 0, Math.round(r.max * 4), 0.3], u_marks: [0, 0, 0, 0], u_red: [r.red / r.max], u_soft: [0] },
        colors: (t) => ({ track: t.track, fill0: t.rpm0, fill1: t.amber, redc: t.red, tip: t.text, tick: t.dim, num: t.num }),
        value: (d) => (C.isNum(d.rpm) && d.engineOn !== false ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true,
    };
}
/** The shift lights (a row of LEDs over the strip). */
function shiftLights(o, x, y, w, h, count) {
    const red = C.rpmScale(o).red * 1000, from = red * 0.86, at = red * 0.985;
    return {
        key: 'shift', kind: 'leds', x, y, w, h, max: 1, z: 15,
        value: (d) => (C.isNum(d.rpm) ? Math.max(0, Math.min(1, (d.rpm - from) / (at - from))) : 0),
        params: { u_count: [count], u_soft: [0], u_shape: [1] },
        dyn: (d) => ({ u_flash: [C.isNum(d.rpm) && d.rpm >= at ? 1 : 0] }),
        colors: (t) => ({ off: t.off, green: t.green, yellow: t.yellow, red: t.red }),
    };
}
/** The giant gear: white, with the state's glow (red in the attack); R reads red. The slam is a keyframe the
 * renderer plays on an up/downshift. */
function gear(x, y, w, h) {
    return { key: 'gear', kind: 'gear', x, y, w, h, text: gearBig, align: 0.5,
        trigger: gearNum, anim: { name: 'u_prog', keys: '0:0 230:1' },
        params: { u_prog: [1], u_pulse: [0] },
        colors: (t, d) => { const m = modeOf(d); const reverse = gearBig(d) === 'R';
            return { color: [reverse ? t.red : WHITE, 1], glow: [m.gearGlow, m.gearA], impact: t.impact }; },
        dyn: () => ({ u_pulse: [atk.on ? 1 : 0] }) };
}
/** An angular chevron bracket framing the gear (chev shader): dir -1 '<', +1 '>'. */
function chevron(key, x, y, w, h, dir) {
    return { key, kind: 'chev', x, y, w, h, params: { u_dir: [dir] },
        colors: (t, d) => ({ color: [modeOf(d).chev, 0.95] }),
        dyn: (d) => ({ u_hot: [modeOf(d).chevHot] }) };
}
/** The full-screen red-line wash: one clearance-exempt layer, cut at BG_BOTTOM. */
const attackField = (o) => ({
    key: 'bgAttack', kind: 'attack', x: 0, y: 0, w: 1920, h: BG_BOTTOM,
    params: {}, colors: (t) => ({ deep: t.deep, edge: t.edge, glowc: t.glowc }),
    value: (d) => attackLevel(o, d), max: 1,
});
/** A borderless tile (the fallback layouts): a card, a label and a value. */
function tile(key, x, y, w, h, label, value, colours) {
    return [
        { key: key + 'Card', kind: 'panel', x, y, w, h, params: { u_box: [10, 1.5, 0.3, 1] }, colors: (t) => ({ top: t.tileTop, bottom: t.tileBottom, border: t.tileEdge }) },
        C.text(key + 'Lbl', x + 12, y + 8, w - 24, 16, label, lbl, { align: 0, tracking: 0.1 }),
        C.text(key, x + 12, y + 28, w - 24, h - 40, value, colours || white, { align: 0 }),
    ];
}
/** An icon from the icon shader (0 coolant, 1 oil, 4 fuel) at x, y, w, h. */
const icon = (key, x, y, w, h, id) => ({ key, kind: 'icon', x, y, w, h, params: { u_icon: [id], u_line: [0] },
    colors: () => ({ color: [WHITE, 0.92] }) });
/** A readout: a value, its unit, a bar under it and an optional icon. */
function readout(key, r, valueFn, unitTxt, barFn, withIcon) {
    const out = [C.text(key, r.v[0], r.v[1], r.v[2], r.v[3], valueFn, vcol(), { align: 0 }),
        C.text(key + 'U', r.u[0], r.u[1], r.u[2], r.u[3], unitTxt, ucol(), { align: 0 })];
    if (r.bar) out.push(C.bar(key + 'Bar', r.bar[0], r.bar[1], r.bar[2], r.bar[3], barFn, barCol, 18));
    if (withIcon && r.icon) out.push(icon(key + 'Icon', r.icon[0], r.icon[1], r.icon[2], r.icon[3], r.icon[4]));
    return out;
}

module.exports = {
    id: 'supercar_reference',
    title: 'Supercar Reference',
    palette: pal,
    gearText: gearBig,
    /* the speed is digits only (no dial), as in the reference: the engine test checks the text, not a dial value */
    speedAsText: true,
    BG_BOTTOM, TEXT_BOTTOM,

    pieces(o) {
        const eng = C.engineFocus(o);
        const boostUnit = o.speedUnit === 'kmh' ? 'bar' : 'psi';
        const powerUnit = eng ? 'Nm' : 'kW';
        const powerValue = (d) => (eng ? split(C.torqueText(d)) : split(C.kwText(d)));
        const boostValue = (d) => split(C.boostText(o, d));
        const boostBar = (d) => C.boostFrac(d);
        const torqueBar = (d) => C.focus.torqueFrac(d);

        if (o.centre === 'map') {
            // safe fallback: the map window (416-1504, 120-600) left clear; shift LEDs over the strip below it,
            // the gear and speed in the left column, the tiles in the right column clear of the boxes. No
            // full-screen attack over the map.
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => bgRect('bg' + i, r.x, r.y, r.w, r.h)).concat(
                [shiftLights(o, 600, bot + 8, 720, 26, 15)],
                [gear(60, 196, 330, 180), C.text('progShift', 60, 380, 330, 28, progShift, modeColour, { tracking: 0.1 })],
                [C.text('speedDigits', 60, 428, 300, 86, (d) => C.speedText(o, d), white, { align: 0 }),
                    C.text('speedUnit', 60, 516, 300, 26, C.speedUnit(o), lbl, { align: 0 })],
                tile('oil', 1600, 150, 150, 96, 'OIL', (d) => C.tempText(o, d.oil)),
                tile('coolant', 1600, 470, 150, 96, 'COOLANT', (d) => C.tempText(o, d.coolant)),
                tile('power', 1760, 470, 150, 96, eng ? 'TORQUE NM' : 'POWER KW', powerValue),
                tile('boost', 1760, 540, 150, 96, boostUnit === 'bar' ? 'BOOST BAR' : 'BOOST PSI', boostValue),
            );
        }
        if (o.centre === 'stock') {
            // the stock centre (x 566-1104) left alone: the gear and speed in the left column, the readouts in the
            // right column above and below the gear box.
            return [bgRect('bg', 0, 0, 566, 720), bgRect('bgR', 1104, 0, 816, 720)].concat(
                [shiftLights(o, 150, 152, 400, 22, 12), rpmBar(o, 150, 178, 400, 16)],
                [gear(60, 214, 260, 200), C.text('progShift', 60, 420, 260, 30, progShift, modeColour, { tracking: 0.1 })],
                [C.text('speedDigits', 330, 240, 210, 110, (d) => C.speedText(o, d), speedColour()), C.text('speedUnit', 330, 356, 210, 26, C.speedUnit(o), ucol())],
                readout('coolant', READ.coolant, (d) => tempValue(o, d.coolant), tempUnit(o), (d) => C.tempFrac(d.coolant), true),
                readout('oil', READ.oil, (d) => tempValue(o, d.oil), tempUnit(o), (d) => C.tempFrac(d.oil), true),
                readout('boost', READ.boost, boostValue, boostUnit, boostBar, false),
                readout('power', READ.power, powerValue, powerUnit, torqueBar, false),
            );
        }

        // full screen (info): the reference, rebuilt in place (see the header)
        const m = C.mCar(o);
        const at = (b) => (m && b.m ? b.m : b.std);
        const gearP = gear(...at(GEO.gear));
        const frame = lines('bgFrame', segs(GEO.hex, true).concat(segs(GEO.bracketL), segs(GEO.bracketR)),
            (s) => [s.frame, s.frameA], (s) => (s === MODES.shift ? 1 : 0.2));
        const lobes = lines('bgLobes', segs(GEO.lobeL).concat(segs(GEO.lobeR)),
            (s) => [s.lobe, 1], (s) => s.lobeHot);
        const modeP = C.text('progShift', ...at(GEO.mode), progShift, modeColour, { tracking: 0.14 });
        const revLabel = C.text('revLabel', ...GEO.revLabel, '1/min x1000', () => ({ color: [REV_LABEL, 1] }), { align: 1 });
        const speedP = [C.text('speedDigits', ...GEO.speed, (d) => C.speedText(o, d), speedColour(), { align: 0 }),
            C.text('speedUnit', ...GEO.speedUnit, C.speedUnit(o), ucol(), { align: 0 })];
        const chevL = chevron('chevL', ...at(GEO.chevL), -1);
        const chevR = chevron('chevR', ...at(GEO.chevR), 1);
        const centre = [frame, lobes].concat(arcBars(o), [gearP, chevL, chevR, modeP, revLabel], numerals(o), speedP);

        /* Staged on-car diagnostic mode (development only). Production never sets a stage: the Store build passes
         * none, so STAGE is 'D' and the list below is the full layout. SUPERCAR_STAGE=A|B|C (env) or o.stage
         * brings features up one at a time so a black square on the real cluster can be pinned to the feature that
         * introduced it. See INSTALL_supercar_reference.md.
         *   A: black background + the centre, a STATIC gear (no slam)
         *   B: A + the gear slam animation
         *   C: B + the full-screen red-line attack wash
         *   D: the full layout (A..C + the readouts, bars and the bottom row) */
        const STAGE = String(o.stage || (typeof process !== 'undefined' && process.env && process.env.SUPERCAR_STAGE) || 'D').toUpperCase();
        if (STAGE !== 'D') {
            if (STAGE === 'A') { delete gearP.trigger; delete gearP.anim; }   // a static gear: no keyframe is ever fired
            const bg = bgRect('bg', 0, 0, 1920, 720);
            return STAGE === 'C' ? [bg, attackField(o)].concat(centre) : [bg].concat(centre);
        }

        return [bgRect('bg', 0, 0, 1920, 720), attackField(o)].concat(
            centre,
            readout('coolant', READ.coolant, (d) => tempValue(o, d.coolant), tempUnit(o), (d) => C.tempFrac(d.coolant), true),
            readout('oil', READ.oil, (d) => tempValue(o, d.oil), tempUnit(o), (d) => C.tempFrac(d.oil), true),
            readout('boost', READ.boost, boostValue, boostUnit, boostBar, false),
            readout('power', READ.power, powerValue, powerUnit, torqueBar, false),
            [icon('fuelIcon', ...BOTTOM.fuelIcon),
                C.text('fuel', ...BOTTOM.fuel, (d) => split(C.distText(o, d.frange)), vcol(), { align: 0 }),
                C.text('fuelU', ...BOTTOM.fuelU, o.speedUnit === 'kmh' ? 'km' : 'mi', ucol(), { align: 0 }),
                C.text('temp', ...BOTTOM.temp,
                    (d) => (C.isNum(d.outside) ? (C.tempIn(o, d.outside) >= 0 ? '+' : '') + C.tempIn(o, d.outside).toFixed(1) : '--'), vcol(), { align: 0 }),
                C.text('tempU', ...BOTTOM.tempU, tempUnit(o), ucol(), { align: 0 }),
                C.text('time', ...BOTTOM.time, () => C.clock(), vcol(), { align: 0 })],
        );
    },
};
