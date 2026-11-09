'use strict';
/**
 * test_supercar_reference.js - the Supercar Reference layout (its own layout, next to Supercar Attack): that it is
 * registered and selectable, stays within the renderer's limits and clear of the KOMBI's boxes, keeps every
 * background above the stock strip (BG_BOTTOM), animates a shift only between two numbered gears, enters, holds
 * and leaves the red-line attack with hysteresis, leaves nothing behind when it is hidden or switched, and that the
 * Settings > Black-square diagnostics switch reaches the engine. Supercar Attack has its own tests and is not changed.
 *   node tools/test_supercar_reference.js
 */
const assert = require('assert');
const path = require('path');
const { makeScene, FakeClient, APP } = require('./scene');
const { LAYOUTS, byId } = require(path.join(APP, 'layouts'));
const { startCluster } = require(path.join(APP, 'engine'));
const { clashes } = require('./clearance');
const SH = require(path.join(APP, 'shaders'));

const ID = 'supercar_reference';
const nullLog = { info() {}, warn() {}, error() {} };
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const drive = (s, seconds, fn) => { for (let i = 0; i < seconds * 25; i++) { s.setData(fn(i / 25)); s.engine._tick(); } };
const base = { speedUnit: 'mph', tempUnit: 'f', redline: 7000, rpmMax: 8000, vehicle: 'phev', cluster: 'standard', centre: 'info' };
/* the eased value of a piece (bgAttack, the rev bar) after driving */
const valueOf = (s, key) => (s.engine._pieces().find((p) => p.key === key) || {}).value;
const anims = (s) => s.client.log.filter((m) => m.op === 'animate' && m.name === 'u_prog');
/* the live render client's layers, by kind */
const effects = (c) => Array.from(c.layers.values()).filter((l) => l.kind === 'effect');
const assets = (c) => Array.from(c.layers.values()).filter((l) => l.kind === 'asset');
const liveAnims = (c) => Array.from(c.layers.values()).reduce((n, l) => n + (l.anims ? Object.keys(l.anims).length : 0), 0);
/* settle the module-level attack state to off before a hysteresis test */
const cool = (s) => drive(s, 0.6, () => ({ rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true }));
/* every centre, vehicle and cluster variant the layout is built for */
const VARIANTS = [];
['info', 'map', 'stock'].forEach((centre) => ['phev', 'ice'].forEach((vehicle) => ['standard', 'm'].forEach((cluster) => {
    VARIANTS.push({ name: centre + '/' + vehicle + '/' + cluster, o: Object.assign({}, base, { centre, vehicle, cluster }) });
})));
const isBackground = (p) => /^bg/.test(p.key) || p.kind === 'attack' || p.kind === 'frame' || p.kind === 'panel';

check('registered: its own layout, selectable in app.json, with the diagnostics switch on by default', () => {
    assert(byId(ID).id === ID, 'byId');
    assert(LAYOUTS.some((L) => L.id === ID), 'in LAYOUTS');
    assert(byId(ID).title === 'Supercar Reference', 'title');
    const app = require(path.join(APP, 'app.json'));
    const choice = app.settings.find((s) => s.key === 'layout').options.map((o) => o[0]);
    assert(choice.indexOf(ID) >= 0, 'app.json layout choice');
    assert(choice.indexOf('supercar_attack') >= 0, 'Supercar Attack is still a choice (not overwritten)');
    const diag = app.settings.find((s) => s.key === 'diag');
    assert(diag && diag.default === 'on' && diag.options.map((o) => o[0]).join(',') === 'off,on', 'the diagnostics setting: ' + JSON.stringify(diag));
});

check('within the renderer limits and no duplicate piece keys, every centre/vehicle/cluster', () => {
    const L = byId(ID);
    VARIANTS.forEach(({ name, o }) => {
        const ps = L.pieces(o);
        assert(ps.length <= 60, name + ': ' + ps.length + ' pieces (limit 60)');
        const keys = ps.map((p) => p.key), dup = keys.filter((k, i) => keys.indexOf(k) !== i);
        assert(!dup.length, name + ' duplicate keys: ' + dup);
        const bad = ps.map((p) => [p.key, clashes(p, o)]).filter(([, c]) => c.length).map(([k, c]) => k + ' ' + c.join(','));
        assert(!bad.length, name + ' clashes: ' + bad.join('; '));
    });
});

check('no background, frame or wash reaches below BG_BOTTOM (the stock strip stays the stock\'s), every variant', () => {
    const L = byId(ID), limit = L.BG_BOTTOM;
    assert(limit === 636, 'BG_BOTTOM is 636: ' + limit);
    VARIANTS.forEach(({ name, o }) => {
        L.pieces(o).filter(isBackground).forEach((p) => {
            assert(p.y + p.h <= limit, name + ': ' + p.key + ' (' + p.kind + ') ends at ' + (p.y + p.h));
        });
    });
});

check('the info layout keeps text, bars and icons above the warning lights (TEXT_BOTTOM)', () => {
    const L = byId(ID);
    VARIANTS.filter((v) => v.o.centre === 'info').forEach(({ name, o }) => {
        L.pieces(o).filter((p) => ['text', 'band', 'icon', 'chev', 'gear', 'leds'].indexOf(p.kind) >= 0).forEach((p) => {
            assert(p.y + p.h <= L.TEXT_BOTTOM, name + ': ' + p.key + ' ends at ' + (p.y + p.h));
        });
    });
});

check('the rev arc is two layers (lit part, red zone), each larger than its arc so no glow edge shows', () => {
    const arcs = byId(ID).pieces(base).filter((p) => p.kind === 'band' && p.params.u_geo[2] > 0);
    assert(arcs.length === 2, 'lit part and red zone: ' + arcs.length);
    arcs.forEach((a) => {
        const g = a.params.u_geo, cx = a.x + g[0], cy = a.y + g[1], R = g[2], T = g[3];
        const [a0, a1] = a.params.u_span;
        const xs = [a0, a1].map((d) => cx + (R + T) * Math.sin(d * Math.PI / 180));
        const ys = [a0, a1].map((d) => cy - (R + T) * Math.cos(d * Math.PI / 180)).concat([cy - (R + T)]);
        const margin = 40;
        assert(a.x <= Math.min(...xs) - margin, 'left margin: ' + a.key);
        assert(a.x + a.w >= Math.max(...xs) + margin, 'right margin: ' + a.key);
        assert(a.y <= Math.min(...ys) - margin, 'top margin: ' + a.key + ' ' + a.y + ' vs ' + Math.min(...ys));
        assert(a.y + a.h >= Math.max(...ys) + margin, 'bottom margin: ' + a.key + ' ' + (a.y + a.h) + ' vs ' + Math.max(...ys));
    });
});

check('the full-screen attack is one wash, cut at BG_BOTTOM', () => {
    const atk = byId(ID).pieces(base).find((p) => p.kind === 'attack');
    assert(atk && atk.key === 'bgAttack', 'bgAttack present');
    assert(atk.x === 0 && atk.y === 0 && atk.w === 1920 && atk.h === 636, 'full width, to 636: ' + [atk.x, atk.y, atk.w, atk.h]);
});

check('the configured red line is respected, not a fixed value', () => {
    // red line 6000: 5900 rpm (98%) must trigger the attack
    let s = makeScene({ layout: ID, options: Object.assign({}, base, { redline: 6000 }), data: {} });
    drive(s, 1.2, () => ({ rpm: 5900, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'attack on at 98% of a 6000 red line: ' + valueOf(s, 'bgAttack'));
    s.stop();
    // red line 8000: the same 5900 rpm (74%) must NOT trigger it
    s = makeScene({ layout: ID, options: Object.assign({}, base, { redline: 8000 }), data: {} });
    cool(s);
    drive(s, 1.2, () => ({ rpm: 5900, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'attack off at 74% of an 8000 red line: ' + valueOf(s, 'bgAttack'));
    s.stop();
});

check('invalid rpm is handled safely (no crash, nothing lit)', () => {
    const s = makeScene({ layout: ID, options: base, data: {} });
    // what the layout receives for an invalid reading (providers.js drops the raw 65535 sentinel): missing or NaN
    drive(s, 0.5, () => ({ rpm: undefined, gear: 3, stage: 'D', speed: 60, engineOn: true }));
    drive(s, 0.5, () => ({ rpm: NaN, gear: 3, stage: 'D', speed: 60 }));
    drive(s, 0.5, () => ({ gear: 3, stage: 'D', speed: 60 }));   // no rpm field at all
    assert((valueOf(s, 'bgAttack') || 0) < 0.1 && (valueOf(s, 'rpmBar') || 0) < 0.1, 'nothing lit on bad rpm');
    s.stop();
});

/* the trigger fires inside update(), which the engine runs at 30 Hz of real time; _full() forces one update now
 * so the discrete gear-change events are deterministic in a fast test loop (values/easing run every tick). */
const step = (s, d) => { s.setData(d); s.engine._full(); };

check('invalid / non-drive gear does not trigger the slam animation', () => {
    const s = makeScene({ layout: ID, options: base, data: {} });
    step(s, { rpm: 1500, gear: 3, stage: 'D', speed: 40, engineOn: true });
    s.client.reset();
    step(s, { rpm: 900, stage: 'P', gear: 0, speed: 0 });       // D3 -> P
    step(s, { rpm: 900, stage: 'R', gear: -1, speed: 0 });      // P -> R
    step(s, { rpm: 900, stage: 'N', gear: 0, speed: 0 });       // R -> N
    step(s, { rpm: 1200, gear: undefined, stage: 'D', speed: 20 }); // N -> missing gear
    step(s, { rpm: 1500, gear: 2, stage: 'D', speed: 30 });     // across an invalid: still no slam
    assert(anims(s).length === 0, 'no slam across P/R/N/invalid: ' + anims(s).length);
    s.stop();
});

check('an upshift 3 -> 4 triggers the slam, once, and a steady gear does not', () => {
    const s = makeScene({ layout: ID, options: base, data: {} });
    step(s, { rpm: 4000, gear: 3, stage: 'D', speed: 70, engineOn: true });
    s.client.reset();
    step(s, { rpm: 3200, gear: 4, stage: 'D', speed: 72, engineOn: true });   // the shift
    assert(anims(s).length === 1, 'exactly one slam on 3->4: ' + anims(s).length);
    assert(anims(s)[0].keys === '0:0 230:1' && anims(s)[0].loop === false, 'one-shot u_prog keyframe');
    s.client.reset();
    step(s, { rpm: 3400, gear: 4, stage: 'D', speed: 75, engineOn: true });   // steady: no slam
    step(s, { rpm: 3600, gear: 4, stage: 'D', speed: 78, engineOn: true });
    assert(anims(s).length === 0, 'no slam while the gear holds: ' + anims(s).length);
    s.client.reset();
    step(s, { rpm: 5200, gear: 3, stage: 'D', speed: 70, engineOn: true });  // a downshift 4 -> 3 also slams
    assert(anims(s).length === 1, 'a downshift slams too: ' + anims(s).length);
    s.stop();
});

check('the red-line attack enters, holds through hysteresis, and exits when rpm drops', () => {
    const red = 7000;
    const s = makeScene({ layout: ID, options: Object.assign({}, base, { redline: red }), data: {} });
    cool(s);
    assert(valueOf(s, 'bgAttack') < 0.1, 'off at idle');
    drive(s, 0.8, () => ({ rpm: red * 0.95, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'still off at 95% climbing: ' + valueOf(s, 'bgAttack'));
    drive(s, 0.8, () => ({ rpm: red * 0.99, gear: 4, stage: 'D', speed: 160, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'on at 99%: ' + valueOf(s, 'bgAttack'));
    drive(s, 0.8, () => ({ rpm: red * 0.95, gear: 4, stage: 'D', speed: 155, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'holds at 95% after being on (hysteresis): ' + valueOf(s, 'bgAttack'));
    drive(s, 1.0, () => ({ rpm: red * 0.90, gear: 5, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'off after dropping below 93%: ' + valueOf(s, 'bgAttack'));
    s.stop();
});

check('SHIFT shows under the gear only at the full red line', () => {
    const s = makeScene({ layout: ID, options: base, data: {} });
    cool(s);
    const texts = () => s.engine._pieces().map((p) => p.text).filter((x) => x != null);
    assert(texts().indexOf('SHIFT') < 0, 'no SHIFT below the red line');
    drive(s, 1.0, () => ({ rpm: 7000 * 0.99, gear: 4, stage: 'D', speed: 160, engineOn: true }));
    s.engine._full();   // the attack state is set in values(); force the text update that the 30 Hz throttle may skip
    assert(texts().indexOf('SHIFT') >= 0, 'SHIFT at the red line');
    s.stop();
});

check('turning it OFF releases every layer and repeated ON/OFF accumulates nothing', () => {
    let on = true;
    const s = makeScene({ layout: ID, options: base, enabled: () => on, data: { rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true } });
    const shownCount = effects(s.client).length;
    assert(shownCount > 0 && s.engine.status().layers === shownCount, 'shown: ' + shownCount);
    for (let cycle = 0; cycle < 4; cycle++) {
        on = true; s.engine._tick();
        s.setData({ rpm: 4000, gear: 3, stage: 'D', speed: 70, engineOn: true }); s.engine._full();
        s.setData({ rpm: 3200, gear: 4, stage: 'D', speed: 72, engineOn: true }); s.engine._full();
        drive(s, 0.4, () => ({ rpm: 6950, gear: 4, stage: 'D', speed: 160, engineOn: true }));
        assert(effects(s.client).length === shownCount, 'cycle ' + cycle + ' shown: ' + effects(s.client).length + ' != ' + shownCount);
        on = false; s.engine._tick();
        assert(effects(s.client).length === 0 && liveAnims(s.client) === 0, 'cycle ' + cycle + ' hidden: ' + effects(s.client).length + ' layers, ' + liveAnims(s.client) + ' anims');
        assert(assets(s.client).length === 1, 'cycle ' + cycle + ' assets: ' + assets(s.client).length);
    }
    assert(s.engine.status().layers === 0, 'status reports zero after the last OFF');
    s.stop();
});

check('switching Reference -> Track -> Digital Dash -> Reference -> stock leaves no stale layer', () => {
    let layoutId = ID, on = true;
    const o = Object.assign({}, base);
    const client = new FakeClient();
    const engine = startCluster({
        client, log: nullLog,
        layout: () => byId(layoutId), options: () => o,
        theme: () => byId(layoutId).palette('comfort'),
        data: () => ({ rpm: 3000, gear: 3, stage: 'D', speed: 80, oil: 100, coolant: 90, engineOn: true }),
        live: () => true, enabled: () => on, sweep: () => false,
    });
    engine._tick();
    const want = (id) => byId(id).pieces(o).length;
    const switchTo = (id) => { layoutId = id; engine.rebuild(); };
    [ 'track', 'digital_dash', ID ].forEach((id) => {
        switchTo(id);
        const n = effects(client).length;
        assert(n === want(id), id + ': ' + n + ' live layers != its ' + want(id) + ' pieces (a stale layer remains)');
        assert(assets(client).length === 1, id + ': the glyph atlas was not duplicated on switch');
        assert(Array.from(client.layers.values()).length === n + 1, id + ': extra layers beyond this layout + the font asset');
    });
    on = false; engine._tick();
    assert(effects(client).length === 0, 'stock return: ' + effects(client).length + ' layers left');
    engine.stop();
    assert(client.connected === false, 'the client is closed after stop()');
});

check('the staged diagnostic builds (A/B/C) are subsets of the full layout and each is clean', () => {
    const L = byId(ID);
    const full = L.pieces(base).length;
    const stageCount = (st) => L.pieces(Object.assign({}, base, { stage: st })).length;
    const a = stageCount('A'), b = stageCount('B'), c = stageCount('C'), d = stageCount('D');
    assert(d === full, 'stage D is the full layout: ' + d + ' vs ' + full);
    assert(a <= b && b <= c && c < d, 'A <= B <= C < D in size: ' + [a, b, c, d]);
    const gearOf = (st) => L.pieces(Object.assign({}, base, { stage: st })).find((p) => p.kind === 'gear');
    assert(gearOf('A') && !gearOf('A').trigger && !gearOf('A').anim, 'stage A gear is static (no slam)');
    assert(gearOf('B').trigger && gearOf('B').anim, 'stage B gear slams');
    const hasAttack = (st) => L.pieces(Object.assign({}, base, { stage: st })).some((p) => p.kind === 'attack');
    assert(!hasAttack('A') && !hasAttack('B') && hasAttack('C') && hasAttack('D'), 'attack field appears at stage C');
    ['A', 'B', 'C', 'D'].forEach((st) => assert(stageCount(st) <= 60, 'stage ' + st + ' within 60 layers'));
});

check('Settings > Black-square diagnostics: on logs the show (slot table), the hide and the drops; off logs nothing', () => {
    const run = (diag) => {
        const lines = [];
        const log = { info: (m) => lines.push(String(m)), warn() {}, error() {} };
        let on = true;
        const client = new FakeClient();
        const engine = startCluster({
            client, log, layout: () => byId(ID), options: () => Object.assign({}, base, { diag }),
            theme: () => byId(ID).palette('comfort'),
            data: () => ({ rpm: 3000, gear: 3, stage: 'D', speed: 80, oil: 100, coolant: 90, engineOn: true }),
            live: () => true, enabled: () => on, sweep: () => false,
        });
        engine._tick();
        client.emit('status', 'targets: panel shown\nslot 0x203 status 2: 0x1000400 class 0 map 1\nslot 0x105 status 1: 0x1000310 class 0 map 1');
        on = false; engine._tick();
        client.emit('status', 'slot 0x203 status 0: free');
        engine.stop();
        return lines.filter((l) => /^diag/.test(l));
    };
    const onLines = run(true), offLines = run(false);
    assert(offLines.length === 0, 'off logs nothing: ' + offLines.join(' / '));
    assert(onLines.some((l) => /^diag show: slot table .*0x203 status 2/.test(l)), 'the show logs the slot table: ' + onLines.join(' / '));
    assert(onLines.some((l) => /^diag t0: HIDE/.test(l)), 'the hide is logged: ' + onLines.join(' / '));
    assert(onLines.some((l) => /drop ops sent/.test(l)), 'the drop ops are logged');
});

check('the seven original layouts do not use the supercar kinds (the shared shaders unchanged)', () => {
    // the original layouts only: Supercar Attack uses these kinds itself, and Kenawiii (its own file, its own owner)
    // is not part of this change
    const ORIGINAL = ['analog_sport', 'digital_round', 'modern_wide', 'digital_dash', 'freedom', 'retro', 'track'];
    LAYOUTS.filter((L) => ORIGINAL.indexOf(L.id) >= 0).forEach((L) => {
        const kinds = new Set();
        ['info', 'map', 'stock'].forEach((centre) => L.pieces(Object.assign({}, base, { centre })).forEach((p) => kinds.add(p.kind)));
        assert(!kinds.has('gear') && !kinds.has('attack'), L.id + ' must not use the new kinds');
    });
    assert(SH.GEAR_FS && SH.ATTACK_FS && SH.TEXT_FS.indexOf('u_prog') < 0, 'TEXT_FS not changed for the gear');
});

console.log('\n' + ok + ' passed');
