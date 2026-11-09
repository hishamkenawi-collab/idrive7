'use strict';
/**
 * layout_supercar_attack.js - "Supercar Attack": a modern exotic/supercar cluster. A predominantly black screen
 * with a giant central gear as the dominant element, a wide segmented rev bar and a row of sequential shift
 * LEDs across the top, big speed on the left, oil/coolant and boost/torque kept compact, and a full-screen
 * "attack" takeover at the red line. BMW M influence, an original design (no other maker's graphics).
 *
 * Two signature features, both drawn by the cluster's GPU with nothing sent per frame:
 *  - the gear-change animation: on an up/downshift the new gear slams in oversized, overshoots and settles with
 *    an orange impact glow (~230 ms). The engine keyframes it on the cluster's own clock (engine.js
 *    trigger/anim -> the 'gear' shader's u_prog); P/R/N never trigger it.
 *  - the red-line attack: approaching -> amber bar and filling LEDs; shift zone -> red bar, flashing LEDs, the
 *    gear pulses red; full red line -> the whole panel becomes a premium black-red attack field (one 'attack'
 *    shader layer) with SHIFT under the gear. Hysteresis (enter ~98%, exit ~93% of the configured red line)
 *    keeps it from flickering. The red line is read from Settings (rpmScale(o): redline / rpmMax), never fixed.
 */
const C = require('./layout_common');

const PALETTES = {
    comfort: { accent: '#dfe8f2', mode: 'COMFORT' },
    sport: { accent: '#ff3326', mode: 'SPORT' },
    efficient: { accent: '#35e08a', mode: 'EFFICIENT' },
};
const BASE = {
    bg: '#000000', text: '#ffffff', dim: '#8a93a0', track: '#15181d', red: '#ff2a1f', amber: '#ffab00',
    rpm0: '#e6edf5', rpm1: '#ff9f1a', num: '#ffffff', tip: '#ffffff', impact: '#ff6a00',
    tileTop: '#101216', tileBottom: '#070809', tileEdge: '#242a31', off: '#181b20', green: '#39e07a', yellow: '#ffc400',
    ev: '#4ab4ff', regen: '#3ddc84',
    deep: '#1a0604', edge: '#ff2414', glowc: '#ff5a32',   // the attack field
};
const pal = (lookId) => Object.assign({}, BASE, PALETTES[lookId] || PALETTES.comfort);

const white = (t) => ({ color: [t.text, 1], glow: [t.accent, 0.1] });
const lbl = (t) => ({ color: [t.dim, 1], glow: [t.accent, 0] });
const acc = (t) => ({ color: [t.accent, 1], glow: [t.accent, 0.3] });

/* ---------- the red-line attack: three stages, with hysteresis ---------- */
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

/* ---------- the gear: the dominant element, and its change animation ---------- */
/** Just what the giant gear shows: P / R / N, or the forward gear number (the drive programme is a line below). */
function gearBig(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
    if (d.gear === -1) return 'R';
    return C.isNum(d.gear) && d.gear > 0 ? String(d.gear) : '-';
}
/** The value the engine watches to fire the slam animation: the forward gear, or null for P/R/N/reverse (so
 * engaging or leaving drive never slams it; only a shift between two numbered gears does). */
function gearNum(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N' || d.gear === -1) return null;
    return C.isNum(d.gear) && d.gear > 0 ? d.gear : null;
}
/** Under the gear: the drive programme, or SHIFT at the full red line. */
const progShift = (d, t) => (atk.on ? 'SHIFT' : C.modeText(d, t));

/* ---------- pieces ---------- */
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
function rpmBar(o, x, y, w, h) {
    const r = C.rpmScale(o);
    return {
        key: 'rpmBar', kind: 'band', x, y, w, h, z: 15,
        params: { u_geo: [7, h / 2, 0, Math.max(6, h - 8)], u_span: [0, 0, Math.round(r.max * 4), 0.3], u_marks: [0, 0, 0, 0], u_red: [r.red / r.max], u_soft: [0] },
        colors: (t) => ({ track: t.track, fill0: t.rpm0, fill1: t.amber, redc: t.red, tip: t.text, tick: t.dim, num: t.num }),
        value: (d) => (C.isNum(d.rpm) && d.engineOn !== false ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true,
    };
}
const rpmNums = (o, x, y, w, h) => {
    const n = C.rpmScale(o).max, s = [];
    for (let i = 0; i <= n; i++) s.push(i);
    return C.text('rpmNums', x, y, w, h, s.join('    '), lbl, { tracking: 0.9 });
};
/** The giant animated gear. */
function gear(x, y, w, h) {
    return {
        key: 'gear', kind: 'gear', x, y, w, h, text: gearBig, align: 0.5,
        trigger: gearNum, anim: { name: 'u_prog', keys: '0:0 230:1' },
        params: { u_prog: [1], u_pulse: [0] },
        // premium, not "huge text": a soft neutral halo in normal driving (never the look's accent, so Sport's red
        // does not bleed onto the gear), a deliberate red glow only in the red-line attack.
        colors: (t, d) => ({ color: [atk.on || gearBig(d) === 'R' ? t.red : t.text, 1], glow: [atk.on ? t.red : t.text, atk.on ? 0.3 : 0.07], impact: t.impact }),
        dyn: () => ({ u_pulse: [atk.on ? 1 : 0] }),
    };
}
const attackField = (o) => ({
    key: 'bgAttack', kind: 'attack', x: 0, y: 0, w: 1920, h: 720,
    params: {}, colors: (t) => ({ deep: t.deep, edge: t.edge, glowc: t.glowc }),
    value: (d) => attackLevel(o, d), max: 1,
});
/** A compact tile: card, label, value (used by the map/stock safe fallbacks). */
function tile(key, x, y, w, h, label, value, colours) {
    return [
        { key: key + 'Card', kind: 'panel', x, y, w, h, params: { u_box: [10, 1.5, 0.3, 1] }, colors: (t) => ({ top: t.tileTop, bottom: t.tileBottom, border: t.tileEdge }) },
        C.text(key + 'Lbl', x + 12, y + 8, w - 24, 16, label, lbl, { align: 0, tracking: 0.1 }),
        C.text(key, x + 12, y + 28, w - 24, h - 40, value, colours || white, { align: 0 }),
    ];
}

/* ---------- the full-screen hero pieces ---------- */
/** The arched rev bar (band arc mode, the same shader the dial layouts use): the signature sweep across the
 * top, 0..n numbered, segmented, filling with rpm and turning red from the configured red line. The arc's
 * centre sits far below the glass so the visible part is a shallow, wide sweep; the numerals are drawn just
 * inside the arc so they clear the camera-cowl notch at the top middle of the real cluster. */
function arcBar(o, cx, cy, R, T, half) {
    const r = C.rpmScale(o);
    const px = 110, py = 58, pw = 1700, ph = 320;                 // the piece covers the visible top of the arc
    return {
        key: 'rpmBar', kind: 'band', x: px, y: py, w: pw, h: ph, z: 6,
        params: { u_geo: [cx - px, cy - py, R, T], u_span: [-half, half, Math.round(r.max * 4), 0.36],
            u_marks: [r.max, 1, 34, -46], u_red: [r.red / r.max], u_soft: [0] },
        // in the red-line attack the whole bar reads red (fill and track), so the top of the cluster goes red too
        colors: (t) => (atk.on
            ? { track: '#3a0908', fill0: t.red, fill1: '#ff6a2a', redc: t.red, tip: '#ffd0b0', tick: t.red, num: t.red }
            : { track: t.track, fill0: t.rpm0, fill1: t.amber, redc: t.red, tip: t.text, tick: t.dim, num: t.num }),
        value: (d) => (C.isNum(d.rpm) && d.engineOn !== false ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true,
    };
}
/** An angular chevron bracket framing the gear (chev shader): dir -1 = "<", +1 = ">". Neutral white, swelling
 * red in the attack. */
const chevron = (key, x, y, w, h, dir) => ({
    key, kind: 'chev', x, y, w, h, params: { u_dir: [dir] },
    colors: (t) => ({ color: [atk.on ? t.red : t.text, atk.on ? 1 : 0.9] }),
    dyn: () => ({ u_hot: [atk.on ? 1 : 0] }),
});
/** A borderless performance readout: a short accent tick, a prominent value, a small label under it - no card.
 * align 0 left, 1 right. The tick is orange normally, red in the attack. */
function readout(key, x, y, w, label, value, align, vcol) {
    const tickX = align === 1 ? x + w - 64 : x;
    return [
        { key: key + 'Ln', kind: 'flat', x: tickX, y, w: 64, h: 3, colors: (t) => ({ color: [atk.on ? t.red : t.impact, 1] }) },
        C.text(key, x, y + 11, w, 46, value, vcol || white, { align }),
        C.text(key + 'L', x, y + 60, w, 15, label, lbl, { align, tracking: 0.14 }),
    ];
}

/* the engine passes options as the second argument to value(); attackField reads it. For every other value()
 * the second argument is ignored. */
const engine = (o) => C.engineFocus(o);
const boostNum = (o) => (d) => (engine(o) ? C.timingText(d) : d.engineOn === false ? 'OFF' : C.isNum(d.boostActual) ? (o.speedUnit === 'kmh' ? d.boostActual.toFixed(2) : (d.boostActual * 14.5038).toFixed(1)) : '--');
const powerNum = (o) => (d) => (engine(o) ? (C.isNum(d.torque) ? String(Math.round(d.torque)) : '--') : C.isNum(d.kw) ? String(Math.round(d.kw)) : '--');

module.exports = {
    id: 'supercar_attack',
    title: 'Supercar Attack',
    palette: pal,
    gearText: gearBig,

    pieces(o) {
        const eng = engine(o);
        const boostLbl = eng ? (o.speedUnit === 'kmh' ? 'BOOST BAR' : 'BOOST PSI') : 'BOOST';
        const powerLbl = eng ? 'TORQUE NM' : 'POWER KW';

        if (o.centre === 'map') {
            // safe fallback: the map window (416-1504, 120-600) left clear; shift LEDs over the strip below it,
            // the gear and speed in the left column, the tiles in the right column clear of the boxes. No
            // full-screen attack over the map.
            const bot = C.MAP.y + C.MAP.h;
            return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat(
                [shiftLights(o, 600, bot + 8, 720, 32, 15)],
                [gear(60, 196, 330, 180), C.text('progShift', 60, 380, 330, 28, progShift, acc, { tracking: 0.1 })],
                [C.text('speedDigits', 60, 428, 300, 86, (d) => C.speedText(o, d), white, { align: 0 }),
                    C.text('speedUnit', 60, 516, 300, 26, C.speedUnit(o), lbl, { align: 0 })],
                tile('oil', 1600, 150, 150, 96, 'OIL', (d) => C.tempText(o, d.oil)),
                tile('coolant', 1600, 470, 150, 96, 'COOLANT', (d) => C.tempText(o, d.coolant)),
                tile('power', 1760, 470, 150, 96, powerLbl, powerNum(o)),
                tile('boost', 1760, 576, 150, 96, boostLbl, boostNum(o)),
            );
        }
        if (o.centre === 'stock') {
            // the stock centre (x 566-1104) left alone: the gear and speed in the left column, the tiles in the
            // right column above and below the gear box.
            return [C.flat('bg', 0, 0, 566, 720, 'bg'), C.flat('bgR', 1104, 0, 816, 720, 'bg')].concat(
                [shiftLights(o, 150, 152, 400, 22, 12), rpmBar(o, 150, 178, 400, 16)],
                [gear(60, 214, 260, 200), C.text('progShift', 60, 420, 260, 30, progShift, acc, { tracking: 0.1 })],
                [C.text('speedDigits', 330, 240, 210, 110, (d) => C.speedText(o, d), white), C.text('speedUnit', 330, 356, 210, 26, C.speedUnit(o), lbl)],
                tile('oil', 1130, 150, 170, 100, 'OIL', (d) => C.tempText(o, d.oil)),
                tile('coolant', 1312, 150, 170, 100, 'COOLANT', (d) => C.tempText(o, d.coolant)),
                tile('boost', 1130, 470, 170, 110, boostLbl, boostNum(o)),
                tile('power', 1312, 470, 170, 110, powerLbl, powerNum(o)),
            );
        }

        // full screen (info) - the priority, rebuilt toward the M-concept reference: a shallow ARCHED rev bar
        // (0..n) sweeping across the top, a dominant CENTRE GEAR framed by angular chevrons with a quiet drive-
        // mode line under it, big speed on the left, and borderless performance readouts (oil/coolant left,
        // boost + torque/power right) tied together by thin accent ticks - no cards. The arc is sized to the real
        // glass: its crown clears the camera-cowl notch and its ends stop short of the KOMBI's gear bracket.
        const gearP = gear(730, 240, 460, 272);                       // centred on 960, the hero
        const chevL = chevron('chevL', 566, 292, 88, 168, -1);        // < framing the gear
        const chevR = chevron('chevR', 1266, 292, 88, 168, 1);        // >
        const progP = C.text('progShift', 680, 520, 560, 26, progShift,
            (t, d) => ({ color: [atk.on ? t.red : t.dim, 1], glow: [atk.on ? t.red : t.accent, atk.on ? 0.3 : 0] }), { tracking: 0.14 });
        const speedP = [C.text('speedDigits', 72, 252, 420, 166, (d) => C.speedText(o, d), white, { align: 0 }),
            C.text('speedUnit', 74, 426, 420, 26, C.speedUnit(o), lbl, { align: 0, tracking: 0.12 })];
        const arc = arcBar(o, 960, 1650, 1500, 20, 16.5);             // centre x, centre y (below glass), radius, thickness, half-sweep°
        const centre = [arc, gearP, chevL, chevR, progP].concat(speedP);

        /* Staged on-car diagnostic mode (development only). Production never sets a stage: app.json exposes no
         * such setting and the Store build passes none, so STAGE is 'D' and the list below is the full layout.
         * SUPERCAR_STAGE=A|B|C (env) or o.stage brings features up one at a time so a black-square on the real
         * cluster can be pinned to the feature that introduced it. See INSTALL_supercar_attack.md.
         *   A: black background + speed + arched rev bar + gear framed by chevrons, a STATIC gear (no slam)
         *   B: A + the gear slam animation
         *   C: B + the full-screen red-line attack field
         *   D: the full layout (A..C + the oil/coolant and boost/power readouts, range and outside temp) */
        const STAGE = String(o.stage || (typeof process !== 'undefined' && process.env && process.env.SUPERCAR_STAGE) || 'D').toUpperCase();
        if (STAGE !== 'D') {
            if (STAGE === 'A') { delete gearP.trigger; delete gearP.anim; }   // a static gear: no keyframe is ever fired
            const bg = C.flat('bg', 0, 0, 1920, 720, 'bg');
            return STAGE === 'C' ? [bg, attackField(o)].concat(centre) : [bg].concat(centre);
        }

        return [C.flat('bg', 0, 0, 1920, 720, 'bg'), attackField(o)].concat(
            centre,
            readout('oil', 78, 488, 180, 'OIL', (d) => C.tempText(o, d.oil), 0),
            readout('coolant', 300, 488, 190, 'COOLANT', (d) => C.tempText(o, d.coolant), 0),
            readout('boost', 1668, 316, 232, boostLbl, boostNum(o), 1),
            readout('power', 1668, 452, 232, powerLbl, powerNum(o), 1),
            [C.text('frange', 78, 636, 340, 24, (d) => C.distText(o, d.frange) + '  RANGE', white, { align: 0 }),
                C.text('outside', 1600, 636, 316, 24, (d) => C.outsideText(o, d.outside), lbl, { align: 1 })],
        );
    },
};
