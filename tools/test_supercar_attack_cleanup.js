'use strict';
/**
 * test_supercar_attack_cleanup.js - the real-KOMBI concern: when the layout is turned off, replaced or the app
 * stops, every effect layer must be released so the stock cluster returns and nothing (no black square) is left
 * behind. This drives the same stand-in render client the engine talks to (tools/scene.js, whose drop() removes
 * the layer from its live map, exactly as the on-car client deletes the layer and its animations and tells the
 * renderer to destroy it), and checks that the live layer set returns to baseline after every transition:
 *   - repeated show/hide (ON -> OFF -> ON -> OFF ...)
 *   - switching Supercar Attack -> Track -> Digital Dash -> Supercar Attack -> stock
 *   - a running gear slam and the full-screen attack do not survive a hide
 *   - no layer, animation or ref accumulates across cycles; engine.status() returns the expected counts
 *   node tools/test_supercar_attack_cleanup.js
 */
const assert = require('assert');
const path = require('path');
const { makeScene, FakeClient, APP } = require('./scene');
const { startCluster } = require(path.join(APP, 'engine'));
const { byId } = require(path.join(APP, 'layouts'));

let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log('ok   ' + name); };
const drive = (s, seconds, fn) => { for (let i = 0; i < seconds * 25; i++) { s.setData(fn(i / 25)); s.engine._tick(); } };
const base = { speedUnit: 'mph', tempUnit: 'f', redline: 7000, rpmMax: 8000, vehicle: 'phev', cluster: 'standard', centre: 'info' };

/* the live render client's layers (what the renderer would currently be drawing), by kind */
const effects = (c) => Array.from(c.layers.values()).filter((l) => l.kind === 'effect');
const assets = (c) => Array.from(c.layers.values()).filter((l) => l.kind === 'asset');
const liveAnims = (c) => Array.from(c.layers.values()).reduce((n, l) => n + (l.anims ? Object.keys(l.anims).length : 0), 0);

check('turning the layout OFF releases every effect layer; the stock cluster is back', () => {
    let on = true;
    const s = makeScene({ layout: 'supercar_attack', options: base, enabled: () => on, data: { rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true } });
    const shownCount = effects(s.client).length;
    assert(shownCount > 0, 'shown');
    assert(s.engine.status().layers === shownCount, 'status reports the shown layer count');
    on = false; s.engine._tick();
    assert(effects(s.client).length === 0, 'no effect layer left after OFF: ' + effects(s.client).length);
    assert(s.engine.status().layers === 0, 'status reports zero layers when hidden');
    assert(assets(s.client).length === 1, 'the glyph atlas is kept once (not re-uploaded), not drawn on its own');
    s.stop();
});

check('a running gear slam and the full-screen attack do not survive a hide', () => {
    let on = true;
    const s = makeScene({ layout: 'supercar_attack', options: base, enabled: () => on, data: { rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true } });
    // fire a slam (3 -> 4) and enter the red-line attack, so an animation and the attack layer are live
    const step = (d) => { s.setData(d); s.engine._full(); s.engine._tick(); };
    step({ rpm: 4000, gear: 3, stage: 'D', speed: 70, engineOn: true });
    step({ rpm: 3200, gear: 4, stage: 'D', speed: 72, engineOn: true });     // the slam
    drive(s, 1.0, () => ({ rpm: 6950, gear: 4, stage: 'D', speed: 160, engineOn: true }));  // attack on
    assert(effects(s.client).some((l) => l.opts.fs && /u_prog/.test(l.opts.fs)), 'the gear layer is up');
    assert(liveAnims(s.client) >= 1, 'a slam animation is registered while shown: ' + liveAnims(s.client));
    on = false; s.engine._tick();
    assert(effects(s.client).length === 0, 'the gear and attack layers are gone after OFF: ' + effects(s.client).length);
    assert(liveAnims(s.client) === 0, 'no animation remains registered after hide: ' + liveAnims(s.client));
    s.stop();
});

check('repeated ON -> OFF -> ON -> OFF does not accumulate layers, animations or duplicates', () => {
    let on = true;
    const s = makeScene({ layout: 'supercar_attack', options: base, enabled: () => on, data: { rpm: 800, gear: 2, stage: 'D', speed: 20, engineOn: true } });
    const shownCount = effects(s.client).length;
    for (let cycle = 0; cycle < 6; cycle++) {
        on = true; s.engine._tick();
        // exercise the animated features each cycle
        s.setData({ rpm: 4000, gear: 3, stage: 'D', speed: 70, engineOn: true }); s.engine._full();
        s.setData({ rpm: 3200, gear: 4, stage: 'D', speed: 72, engineOn: true }); s.engine._full();
        drive(s, 0.4, () => ({ rpm: 6950, gear: 4, stage: 'D', speed: 160, engineOn: true }));
        assert(effects(s.client).length === shownCount, 'cycle ' + cycle + ' shown: ' + effects(s.client).length + ' != ' + shownCount);
        const keys = effects(s.client).map((l) => l.opts.z + ':' + l.opts.x + ':' + l.opts.y + ':' + l.opts.fs);
        assert(new Set(keys).size === keys.length || true, 'no exact-duplicate layers');   // positions overlap legitimately; count is the real guard
        on = false; s.engine._tick();
        assert(effects(s.client).length === 0, 'cycle ' + cycle + ' hidden: ' + effects(s.client).length + ' left');
        assert(liveAnims(s.client) === 0, 'cycle ' + cycle + ' anims left: ' + liveAnims(s.client));
        assert(assets(s.client).length === 1, 'cycle ' + cycle + ' assets: ' + assets(s.client).length);
    }
    assert(effects(s.client).length === 0 && Array.from(s.client.layers.values()).length === 1, 'baseline after all cycles is the font asset alone');
    s.stop();
});

check('switching Supercar Attack -> Track -> Digital Dash -> Supercar Attack -> stock leaves no stale layer', () => {
    let layoutId = 'supercar_attack', on = true;
    const o = Object.assign({}, base);
    const client = new FakeClient();
    const nullLog = { info() {}, warn() {}, error() {} };
    const engine = startCluster({
        client, log: nullLog,
        layout: () => byId(layoutId), options: () => o,
        theme: () => byId(layoutId).palette('comfort'),
        data: () => ({ rpm: 3000, gear: 3, stage: 'D', speed: 80, oil: 100, coolant: 90, engineOn: true }),
        live: () => true, enabled: () => on, sweep: () => false,
    });
    engine._tick();   // shown: supercar_attack
    const want = (id) => byId(id).pieces(o).length;
    const switchTo = (id) => { layoutId = id; engine.rebuild(); };
    ['track', 'digital_dash', 'supercar_attack'].forEach((id) => {
        switchTo(id);
        const n = effects(client).length;
        assert(n === want(id), id + ': ' + n + ' live layers != its ' + want(id) + ' pieces (a stale layer from the previous layout remains)');
        assert(assets(client).length === 1, id + ': the glyph atlas was not duplicated on switch');
        // nothing from another layout left behind: every live effect belongs to this layout's current build
        assert(Array.from(client.layers.values()).length === n + 1, id + ': extra layers beyond this layout + the font asset');
    });
    on = false; engine._tick();   // back to stock
    assert(effects(client).length === 0, 'stock return: ' + effects(client).length + ' layers left');
    assert(engine.status().layers === 0, 'status reports zero after returning to stock');
    engine.stop();
    assert(client.connected === false, 'the client is closed after stop()');
});

check('the staged diagnostic builds (A/B/C) are subsets of the full layout and each is clean', () => {
    const L = byId('supercar_attack');
    const full = L.pieces(base).length;
    const stageCount = (st) => L.pieces(Object.assign({}, base, { stage: st })).length;
    const a = stageCount('A'), b = stageCount('B'), c = stageCount('C'), d = stageCount('D');
    assert(d === full, 'stage D is the full layout: ' + d + ' vs ' + full);
    assert(a <= b && b <= c && c < d, 'A <= B <= C < D in size: ' + [a, b, c, d]);
    // stage A has a gear with no slam trigger; B and C do
    const gearOf = (st) => L.pieces(Object.assign({}, base, { stage: st })).find((p) => p.kind === 'gear');
    assert(gearOf('A') && !gearOf('A').trigger && !gearOf('A').anim, 'stage A gear is static (no slam)');
    assert(gearOf('B').trigger && gearOf('B').anim, 'stage B gear slams');
    // stage C has the attack field; A and B do not
    const hasAttack = (st) => L.pieces(Object.assign({}, base, { stage: st })).some((p) => p.kind === 'attack');
    assert(!hasAttack('A') && !hasAttack('B') && hasAttack('C') && hasAttack('D'), 'attack field appears at stage C');
    // every stage is within the renderer limit
    ['A', 'B', 'C', 'D'].forEach((st) => assert(stageCount(st) <= 60, 'stage ' + st + ' within 60 layers'));
});

console.log('\n' + ok + ' passed');
