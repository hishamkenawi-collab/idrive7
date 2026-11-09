'use strict';
/**
 * test_supercar_attack.js - the Supercar Attack layout: that it is registered, stays within the renderer's
 * limits and clear of the KOMBI's boxes, respects the configured red line, animates a shift only between two
 * numbered gears, and enters/holds/leaves the red-line attack with hysteresis. The existing layouts and the
 * shared text shader are left untouched.
 *   node tools/test_supercar_attack.js
 */
const assert = require('assert');
const path = require('path');
const { makeScene, APP } = require('./scene');
const { LAYOUTS, byId } = require(path.join(APP, 'layouts'));
const { clashes } = require('./clearance');
const SH = require(path.join(APP, 'shaders'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const drive = (s, seconds, fn) => { for (let i = 0; i < seconds * 25; i++) { s.setData(fn(i / 25)); s.engine._tick(); } };
const base = { speedUnit: 'mph', tempUnit: 'f', redline: 7000, rpmMax: 8000, vehicle: 'phev', cluster: 'standard', centre: 'info' };
/* the eased value of a piece (bgAttack, the rev bar) after driving */
const valueOf = (s, key) => (s.engine._pieces().find((p) => p.key === key) || {}).value;
const anims = (s) => s.client.log.filter((m) => m.op === 'animate' && m.name === 'u_prog');
/* settle the module-level attack state (one per active layout) to off before a hysteresis test */
const cool = (s) => drive(s, 0.6, () => ({ rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true }));

check('registered in layouts and app.json', () => {
    assert(byId('supercar_attack').id === 'supercar_attack', 'byId');
    assert(LAYOUTS.some((L) => L.id === 'supercar_attack'), 'in LAYOUTS');
    const app = require(path.join(APP, 'app.json'));
    const choice = app.settings.find((s) => s.key === 'layout').options.map((o) => o[0]);
    assert(choice.indexOf('supercar_attack') >= 0, 'app.json layout choice');
    assert(byId('supercar_attack').title === 'Supercar Attack');
});

check('within the renderer limits and no duplicate piece keys, every centre/vehicle/cluster', () => {
    const L = byId('supercar_attack');
    ['info', 'map', 'stock'].forEach((centre) => ['phev', 'ice'].forEach((vehicle) => ['standard', 'm'].forEach((cluster) => {
        const o = Object.assign({}, base, { centre, vehicle, cluster });
        const ps = L.pieces(o);
        assert(ps.length <= 60, centre + '/' + vehicle + '/' + cluster + ': ' + ps.length + ' pieces (limit 60)');
        const keys = ps.map((p) => p.key), dup = keys.filter((k, i) => keys.indexOf(k) !== i);
        assert(!dup.length, 'duplicate keys: ' + dup);
        const bad = ps.map((p) => [p.key, clashes(p, o)]).filter(([, c]) => c.length).map(([k, c]) => k + ' ' + c.join(','));
        assert(!bad.length, centre + '/' + vehicle + '/' + cluster + ' clashes: ' + bad.join('; '));
    })));
});

check('the full-screen attack is one background layer (clearance-exempt, over the whole panel)', () => {
    const atk = byId('supercar_attack').pieces(base).find((p) => p.kind === 'attack');
    assert(atk && atk.key === 'bgAttack', 'bgAttack present');
    assert(atk.x === 0 && atk.y === 0 && atk.w === 1920 && atk.h === 720, 'full screen');
});

check('the configured red line is respected, not a fixed value', () => {
    // red line 6000: 5900 rpm (98%) must trigger the attack
    let s = makeScene({ layout: 'supercar_attack', options: Object.assign({}, base, { redline: 6000 }), data: {} });
    drive(s, 1.2, () => ({ rpm: 5900, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'attack on at 98% of a 6000 red line: ' + valueOf(s, 'bgAttack'));
    s.stop();
    // red line 8000: the same 5900 rpm (74%) must NOT trigger it
    s = makeScene({ layout: 'supercar_attack', options: Object.assign({}, base, { redline: 8000 }), data: {} });
    cool(s);
    drive(s, 1.2, () => ({ rpm: 5900, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'attack off at 74% of an 8000 red line: ' + valueOf(s, 'bgAttack'));
    s.stop();
});

check('invalid rpm is handled safely (no crash, nothing lit)', () => {
    const s = makeScene({ layout: 'supercar_attack', options: base, data: {} });
    // what the layout actually receives for an invalid reading (providers.js drops the raw 65535 sentinel): missing or NaN
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
    const s = makeScene({ layout: 'supercar_attack', options: base, data: {} });
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
    const s = makeScene({ layout: 'supercar_attack', options: base, data: {} });
    step(s, { rpm: 4000, gear: 3, stage: 'D', speed: 70, engineOn: true });
    s.client.reset();
    step(s, { rpm: 3200, gear: 4, stage: 'D', speed: 72, engineOn: true });   // the shift
    assert(anims(s).length === 1, 'exactly one slam on 3->4: ' + anims(s).length);
    assert(anims(s)[0].keys === '0:0 230:1' && anims(s)[0].loop === false, 'one-shot u_prog keyframe');
    s.client.reset();
    step(s, { rpm: 3400, gear: 4, stage: 'D', speed: 75, engineOn: true });   // steady: no slam
    step(s, { rpm: 3600, gear: 4, stage: 'D', speed: 78, engineOn: true });
    assert(anims(s).length === 0, 'no slam while the gear holds: ' + anims(s).length);
    // a downshift 4 -> 3 also slams
    s.client.reset();
    step(s, { rpm: 5200, gear: 3, stage: 'D', speed: 70, engineOn: true });
    assert(anims(s).length === 1, 'a downshift slams too: ' + anims(s).length);
    s.stop();
});

check('the red-line attack enters, holds through hysteresis, and exits when rpm drops', () => {
    const red = 7000;
    const s = makeScene({ layout: 'supercar_attack', options: Object.assign({}, base, { redline: red }), data: {} });
    cool(s);
    assert(valueOf(s, 'bgAttack') < 0.1, 'off at idle');
    // climb to ~95% (just below the 98% enter): must NOT enter from below
    drive(s, 0.8, () => ({ rpm: red * 0.95, gear: 4, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'still off at 95% climbing: ' + valueOf(s, 'bgAttack'));
    // hit 99%: enter
    drive(s, 0.8, () => ({ rpm: red * 0.99, gear: 4, stage: 'D', speed: 160, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'on at 99%: ' + valueOf(s, 'bgAttack'));
    // fall back to 95% (between exit 93% and enter 98%): must HOLD (hysteresis, no flicker)
    drive(s, 0.8, () => ({ rpm: red * 0.95, gear: 4, stage: 'D', speed: 155, engineOn: true }));
    assert(valueOf(s, 'bgAttack') > 0.6, 'holds at 95% after being on (hysteresis): ' + valueOf(s, 'bgAttack'));
    // drop below 93%: exit
    drive(s, 1.0, () => ({ rpm: red * 0.90, gear: 5, stage: 'D', speed: 150, engineOn: true }));
    assert(valueOf(s, 'bgAttack') < 0.1, 'off after dropping below 93%: ' + valueOf(s, 'bgAttack'));
    s.stop();
});

check('SHIFT shows under the gear only at the full red line', () => {
    const s = makeScene({ layout: 'supercar_attack', options: base, data: {} });
    cool(s);
    const texts = () => s.engine._pieces().map((p) => p.text).filter((x) => x != null);
    assert(texts().indexOf('SHIFT') < 0, 'no SHIFT below the red line');
    drive(s, 1.0, () => ({ rpm: 7000 * 0.99, gear: 4, stage: 'D', speed: 160, engineOn: true }));
    s.engine._full();   // the attack state is set in values(); force the text update that the 30 Hz throttle may skip in a fast loop
    assert(texts().indexOf('SHIFT') >= 0, 'SHIFT at the red line');
    s.stop();
});

check('existing layouts are untouched (none use the new kinds; the shared text shader is unchanged)', () => {
    LAYOUTS.filter((L) => ['analog_sport', 'digital_round', 'modern_wide', 'digital_dash', 'freedom', 'retro', 'track'].indexOf(L.id) >= 0).forEach((L) => {
        const kinds = new Set();
        ['info', 'map', 'stock'].forEach((centre) => L.pieces(Object.assign({}, base, { centre })).forEach((p) => kinds.add(p.kind)));
        assert(!kinds.has('gear') && !kinds.has('attack'), L.id + ' must not use the new kinds');
    });
    // the gear kind is its own shader; the text shader was not repurposed
    assert(SH.GEAR_FS && SH.ATTACK_FS && SH.TEXT_FS.indexOf('u_prog') < 0, 'TEXT_FS not changed for the gear');
});

console.log('\n' + ok + ' passed');
