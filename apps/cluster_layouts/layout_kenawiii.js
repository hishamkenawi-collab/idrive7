'use strict';
/**
 * Kenawiii — real-car-first composition.
 *
 * Goals:
 *  - one coherent cockpit silhouette, not floating cards;
 *  - live COMFORT / SPORT / SPORT INDIVIDUAL colour states;
 *  - dominant centre gear + thick segmented RPM sweep;
 *  - deliberately avoids every KOMBI-owned hole documented in layout_common.js;
 *  - plain black base so the KOMBI's unavoidable dark gear/eDrive boxes visually disappear into the layout;
 *  - no graphics below the centre tell-tale strip.
 */
const C = require('./layout_common');

const BASE = {
    bg: '#000000', text: '#ffffff', dim: '#7c8795', track: '#11151a',
    silver: '#dbe5ef', red: '#ff2a1f', amber: '#ff9f18', green: '#39e07a', yellow: '#ffc400', off: '#171a1f',
    deep: '#160403', edge: '#ff2414', glowc: '#ff5738', impact: '#ff6a00',
};
const pal = () => Object.assign({}, BASE, { accent: '#58c8ff', mode: 'COMFORT' });

const atk = { on: false };
function redFrac(o, d) {
    const red = C.rpmScale(o).red * 1000;
    return C.isNum(d.rpm) && d.engineOn !== false && red > 0 ? d.rpm / red : 0;
}
function attackLevel(o, d) {
    const f = redFrac(o, d);
    if (atk.on && f < 0.93) atk.on = false;
    else if (!atk.on && f >= 0.98) atk.on = true;
    return atk.on ? 1 : 0;
}

function modeLevel(d) {
    const m = String((d && (d.driveMode || d.mode)) || '').toUpperCase();
    if (/INDIVIDUAL|SPORT\s*\+|SPORT\+/.test(m)) return 2;
    if (/SPORT|MANUAL|^S$|^M$/.test(m)) return 1;
    if (/ECO|EFFICIENT/.test(m)) return -1;
    return 0;
}
function modeName(d) {
    const m = String((d && d.driveMode) || '').toUpperCase();
    if (/INDIVIDUAL/.test(m)) return 'SPORT INDIVIDUAL';
    if (/SPORT\s*\+|SPORT\+/.test(m)) return 'SPORT+';
    if (/SPORT/.test(m) || d.mode === 'S' || d.mode === 'M') return 'SPORT';
    if (/ECO|EFFICIENT/.test(m)) return 'EFFICIENT';
    return 'COMFORT';
}
function accent(d) {
    if (atk.on) return '#ff2414';
    const l = modeLevel(d);
    if (l >= 2) return '#ff2f16';
    if (l === 1) return '#ff4b35';
    if (l < 0) return '#39df8a';
    return '#58c8ff';
}
function accentSoft(d) {
    const l = modeLevel(d);
    if (atk.on) return '#ff6a45';
    if (l >= 2) return '#ff7358';
    if (l === 1) return '#ff9a54';
    if (l < 0) return '#84f0b8';
    return '#b6e9ff';
}
const white = (t) => ({ color: [t.text, 1], glow: [t.text, 0.05] });
const dim = (t) => ({ color: [t.dim, 1], glow: [t.text, 0] });

function gearBig(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N') return d.stage;
    if (d.gear === -1) return 'R';
    return C.isNum(d.gear) && d.gear > 0 ? String(d.gear) : '-';
}
function gearNum(d) {
    if (d.stage === 'P' || d.stage === 'R' || d.stage === 'N' || d.gear === -1) return null;
    return C.isNum(d.gear) && d.gear > 0 ? d.gear : null;
}
const progText = (d) => (atk.on ? 'SHIFT' : modeName(d));

function attackField(o) {
    return {
        key: 'bgAttack', kind: 'attack', x: 0, y: 0, w: 1920, h: 640,
        colors: (t) => ({ deep: t.deep, edge: t.edge, glowc: t.glowc }),
        value: (d) => attackLevel(o, d), max: 1,
    };
}

function gear(x, y, w, h) {
    return {
        key: 'gear', kind: 'gear', x, y, w, h, text: gearBig, align: 0.5,
        trigger: gearNum, anim: { name: 'u_prog', keys: '0:0 230:1' },
        params: { u_prog: [1], u_pulse: [0] },
        colors: (t, d) => ({
            color: [atk.on || gearBig(d) === 'R' ? t.red : t.text, 1],
            glow: [atk.on ? t.red : accent(d), atk.on ? 0.36 : 0.13],
            impact: t.impact,
        }),
        dyn: () => ({ u_pulse: [atk.on ? 1 : 0] }),
    };
}

function chevron(key, x, y, w, h, dir) {
    return {
        key, kind: 'chev', x, y, w, h, params: { u_dir: [dir] },
        colors: (t, d) => ({ color: [atk.on ? t.red : accent(d), atk.on ? 1 : 0.92] }),
        dyn: () => ({ u_hot: [atk.on ? 1 : 0] }),
    };
}

const FRAME_SEGS = [
    [70, 270, 300, 190], [70, 270, 88, 520], [88, 520, 390, 560], [390, 560, 620, 610],
    [620, 610, 1300, 610], [1300, 610, 1668, 560], [1668, 560, 1882, 520], [1882, 520, 1900, 300],
    [1900, 300, 1680, 250], [300, 190, 545, 190], [1375, 190, 1680, 250], [545, 190, 650, 230],
];
function frame() {
    const p = { u_nseg: [FRAME_SEGS.length] };
    FRAME_SEGS.forEach((s, i) => { p['u_s' + i] = s; });
    return {
        key: 'bgFrame', kind: 'frame', x: 0, y: 0, w: 1920, h: 640, params: p,
        colors: (t, d) => ({ color: [atk.on ? t.red : accent(d), atk.on ? 1 : 0.9] }),
        dyn: () => ({ u_hot: [atk.on ? 1 : 0] }),
    };
}

function rpmArc(o) {
    const r = C.rpmScale(o);
    return {
        key: 'rpmBar', kind: 'band', x: 320, y: 120, w: 1080, h: 190, z: 5,
        params: {
            u_geo: [640, 1140, 1010, 34],
            u_span: [-17.5, 17.5, Math.round(r.max * 4), 0.30],
            u_marks: [r.max, 1, 29, -48], u_red: [r.red / r.max], u_soft: [0],
        },
        colors: (t, d) => {
            const a = accent(d), s = accentSoft(d), sport = modeLevel(d) >= 1;
            return atk.on
                ? { track: '#350706', fill0: t.red, fill1: '#ff6a35', redc: t.red, tip: '#ffd0c0', tick: t.red, num: t.red }
                : { track: '#10151b', fill0: sport ? '#ffe9dd' : '#eaf7ff', fill1: sport ? s : a, redc: t.red, tip: '#ffffff', tick: '#8997a5', num: '#f4f7fa' };
        },
        value: (d) => (C.isNum(d.rpm) && d.engineOn !== false ? d.rpm / 1000 / r.max : 0), max: 1, sweep: true,
    };
}

function shiftLights(o) {
    const red = C.rpmScale(o).red * 1000, from = red * 0.84, at = red * 0.985;
    return {
        key: 'shift', kind: 'leds', x: 585, y: 205, w: 720, h: 24, max: 1, z: 14,
        value: (d) => (C.isNum(d.rpm) ? Math.max(0, Math.min(1, (d.rpm - from) / (at - from))) : 0),
        params: { u_count: [14], u_soft: [0], u_shape: [1] },
        dyn: (d) => ({ u_flash: [C.isNum(d.rpm) && d.rpm >= at ? 1 : 0] }),
        colors: (t) => ({ off: '#14171b', green: t.green, yellow: t.yellow, red: t.red }),
    };
}

function readout(key, x, y, w, label, value, align) {
    const lineX = align === 1 ? x + w - 78 : x;
    return [
        { key: key + 'Accent', kind: 'flat', x: lineX, y, w: 78, h: 4, colors: (t, d) => ({ color: [accent(d), 1] }) },
        C.text(key, x, y + 12, w, 48, value, white, { align }),
        C.text(key + 'Lbl', x, y + 63, w, 16, label, dim, { align, tracking: 0.14 }),
    ];
}

function mMark(y) {
    return [
        { key: 'mBlue' + y, kind: 'flat', x: 884, y, w: 24, h: 7, colors: () => ({ color: ['#37a8ff', 1] }) },
        { key: 'mNavy' + y, kind: 'flat', x: 912, y, w: 24, h: 7, colors: () => ({ color: ['#1768c7', 1] }) },
        { key: 'mRed' + y, kind: 'flat', x: 940, y, w: 24, h: 7, colors: () => ({ color: ['#ef3340', 1] }) },
        C.text('mText' + y, 972, y - 12, 64, 30, 'M', white, { align: 0 }),
    ];
}

function mapFallback(o) {
    const bot = C.MAP.y + C.MAP.h;
    return C.aroundMap().map((r, i) => C.flat('bg' + i, r.x, r.y, r.w, r.h, 'bg')).concat([
        gear(80, 210, 300, 190),
        C.text('speedDigits', 80, 430, 260, 90, (d) => C.speedText(o, d), white, { align: 0 }),
        C.text('speedUnit', 80, 525, 260, 24, C.speedUnit(o), dim, { align: 0 }),
        shiftLights(o),
        C.text('mapMode', 1520, bot + 20, 360, 26, progText, (t, d) => ({ color: [accent(d), 1], glow: [accent(d), 0.1] }), { align: 1 }),
    ]);
}

module.exports = {
    id: 'kenawiii', title: 'Kenawiii', palette: pal, gearText: gearBig,
    pieces(o) {
        if (o.centre === 'map') return mapFallback(o);
        if (o.centre === 'stock') return mapFallback(Object.assign({}, o, { centre: 'map' }));

        const eng = C.engineFocus(o);
        const boostV = (d) => C.boostText(o, d);
        const powerV = eng ? (d) => C.torqueText(d) : (d) => C.kwText(d);
        const powerLbl = eng ? 'TORQUE' : 'POWER';

        const list = [
            C.flat('bg', 0, 0, 1920, 640, 'bg'),
            C.flat('bgLeftFoot', 0, 640, 560, 80, 'bg'),
            C.flat('bgRightFoot', 1520, 640, 400, 80, 'bg'),
            attackField(o), frame(), rpmArc(o), shiftLights(o),
            gear(700, 250, 520, 270),
            chevron('chevL', 590, 306, 94, 154, -1),
            chevron('chevR', 1236, 306, 94, 154, 1),
            C.text('progShift', 680, 515, 560, 34, progText,
                (t, d) => ({ color: [atk.on ? t.red : accent(d), 1], glow: [atk.on ? t.red : accent(d), atk.on ? 0.32 : 0.08] }),
                { tracking: 0.13 }),
            C.text('speedDigits', 170, 270, 360, 142, (d) => C.speedText(o, d), white, { align: 0 }),
            C.text('speedUnit', 174, 414, 250, 24, C.speedUnit(o), dim, { align: 0, tracking: 0.12 }),
        ];

        list.push.apply(list, readout('oil', 105, 452, 165, 'OIL', (d) => C.tempText(o, d.oil), 0));
        list.push.apply(list, readout('coolant', 300, 452, 190, 'COOLANT', (d) => C.tempText(o, d.coolant), 0));
        list.push.apply(list, readout('boost', 1680, 300, 215, 'BOOST', boostV, 1));
        list.push.apply(list, readout('power', 1680, 448, 215, powerLbl, powerV, 1));

        list.push(
            C.text('range', 105, 606, 340, 24, (d) => C.distText(o, d.frange) + '  RANGE', white, { align: 0 }),
            C.text('outside', 1655, 606, 160, 24, (d) => C.outsideText(o, d.outside), dim, { align: 1 }),
            C.text('clock', 1820, 606, 80, 24, C.clock, white, { align: 1 })
        );
        list.push.apply(list, mMark(618));
        return list;
    },
};
