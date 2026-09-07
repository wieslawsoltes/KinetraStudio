import { V, M, clamp } from './math.js';
import { Mesh, Primitives } from './mesh.js';
let serial = 0;
export const PALETTE = {
    porcelain: { name: 'Ceramic · frost', color: '#c3d6d4', metallic: .12, roughness: .29, emission: 0 },
    teal: { name: 'Anodized · sea glass', color: '#409f91', metallic: .55, roughness: .3, emission: 0 },
    graphite: { name: 'Carbon · graphite', color: '#242e37', metallic: .55, roughness: .35, emission: 0 },
    titanium: { name: 'Brushed · titanium', color: '#768892', metallic: .86, roughness: .27, emission: 0 },
    orange: { name: 'Signal · amber', color: '#e6a457', metallic: .32, roughness: .35, emission: 0 },
    glow: { name: 'Optical · cyan', color: '#71f8e4', metallic: .3, roughness: .14, emission: 2 },
    blue: { name: 'Polymer · cobalt', color: '#537bb2', metallic: .3, roughness: .35, emission: 0 },
    pink: { name: 'Enamel · coral', color: '#c86676', metallic: .2, roughness: .32, emission: 0 }
};
export class SceneNode {
    constructor(name, mesh = null, material = PALETTE.porcelain) { this.id = 'n' + (++serial); this.name = name; this.mesh = mesh; this.material = { ...material }; this.position = [0, 0, 0]; this.rotation = [0, 0, 0]; this.scale = [1, 1, 1]; this.parent = null; this.visible = true; this.locked = false; this.keys = []; this.world = M.identity(); this.normal = M.identity(); this.history = []; }
    evaluated(frame) { const base = { p: this.position, r: this.rotation, s: this.scale }; if (!this.keys.length)
        return base; let a = this.keys[0], b = this.keys[this.keys.length - 1]; if (frame <= a.frame)
        return a; if (frame >= b.frame)
        return b; for (let i = 0; i < this.keys.length - 1; i++)
        if (frame >= this.keys[i].frame && frame <= this.keys[i + 1].frame) {
            a = this.keys[i];
            b = this.keys[i + 1];
            break;
        } let t = (frame - a.frame) / (b.frame - a.frame); if (a.interpolation === 'step')
        t = 0;
    else if (a.interpolation !== 'linear')
        t = t * t * (3 - 2 * t); return { p: V.lerp(a.p, b.p, t), r: V.lerp(a.r, b.r, t), s: V.lerp(a.s, b.s, t) }; }
    setKey(frame, interpolation = 'smooth') { const k = { frame: Math.round(frame), p: this.position.slice(), r: this.rotation.slice(), s: this.scale.slice(), interpolation }, i = this.keys.findIndex(k => k.frame === Math.round(frame)); if (i < 0)
        this.keys.push(k);
    else
        this.keys[i] = k; this.keys.sort((a, b) => a.frame - b.frame); }
}
export class Scene {
    constructor() { this.nodes = []; this.selection = new Set(); this.frame = 1; this.start = 1; this.end = 120; this.fps = 24; this.name = 'PIP-07 · Survey companion'; this.environment = { exposure: 1.15, ambient: .38, shadows: true, grid: true }; this.revision = 0; }
    add(n) { this.nodes.push(n); this.revision++; return n; }
    get(id) { return this.nodes.find(n => n.id === id); }
    get selected() { return this.nodes.filter(n => this.selection.has(n.id)); }
    get active() { return this.get([...this.selection].at(-1)); }
    update() { const done = new Set(), visiting = new Set(), byId = new Map(this.nodes.map(n => [n.id, n])); const evalNode = n => { if (done.has(n.id))
        return; if (visiting.has(n.id))
        throw Error('Scene graph cycle'); visiting.add(n.id); const t = n.evaluated(this.frame), local = M.compose(t.p, t.r, t.s), parent = byId.get(n.parent); if (parent) {
        evalNode(parent);
        n.world = M.mul(parent.world, local);
        n.effectiveVisible = n.visible && parent.effectiveVisible;
    }
    else {
        n.world = local;
        n.effectiveVisible = n.visible;
    } n.normal = M.transpose(M.inverse(n.world)); visiting.delete(n.id); done.add(n.id); }; this.nodes.forEach(evalNode); }
    select(id, add = false) { if (!add)
        this.selection.clear(); if (id) {
        if (add && this.selection.has(id))
            this.selection.delete(id);
        else
            this.selection.add(id);
    } }
    removeSelected() { const ids = new Set(this.selection); let changed = true; while (changed) {
        changed = false;
        for (const n of this.nodes)
            if (ids.has(n.parent) && !ids.has(n.id)) {
                ids.add(n.id);
                changed = true;
            }
    } this.nodes = this.nodes.filter(n => !ids.has(n.id)); this.selection.clear(); this.revision++; }
    pick(ray) { this.update(); let best = null; for (const n of this.nodes) {
        if (!n.mesh || !n.effectiveVisible || n.locked)
            continue;
        const inv = M.inverse(n.world), local = { origin: M.point(inv, ray.origin), direction: V.norm(M.vector(inv, ray.direction)) }, hit = n.mesh.intersect(local);
        if (hit) {
            const p = M.point(n.world, hit.point), d = V.len(V.sub(p, ray.origin));
            if (!best || d < best.distance)
                best = { node: n, face: hit.face, distance: d, point: p };
        }
    } return best; }
    bounds(nodes = this.nodes) { this.update(); const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (const n of nodes)
        if (n.mesh && n.effectiveVisible)
            for (const v of n.mesh.vertices) {
                const p = M.point(n.world, v);
                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], p[k]);
                    max[k] = Math.max(max[k], p[k]);
                }
            } return min[0] === Infinity ? { min: [-1, -1, -1], max: [1, 1, 1] } : { min, max }; }
    serialize() { const meshes = [], map = new Map(); return { format: 'kinetra-scene', version: 1, name: this.name, frame: this.frame, start: this.start, end: this.end, fps: this.fps, environment: this.environment, selection: [...this.selection], nodes: this.nodes.map(n => { let mesh = null; if (n.mesh) {
            if (!map.has(n.mesh)) {
                map.set(n.mesh, meshes.length);
                meshes.push(n.mesh.toJSON());
            }
            mesh = map.get(n.mesh);
        } return { id: n.id, name: n.name, mesh, material: n.material, position: n.position, rotation: n.rotation, scale: n.scale, parent: n.parent, visible: n.visible, locked: n.locked, keys: n.keys, history: n.history }; }), meshes }; }
    load(j) { if (j.format !== 'kinetra-scene' || j.version !== 1 || !Array.isArray(j.nodes) || j.nodes.length > 10000 || !Array.isArray(j.meshes))
        throw Error('Not a supported Kinetra scene.'); const meshes = j.meshes.map(Mesh.fromJSON), ids = new Set(); const nodes = j.nodes.map(v => { if (typeof v.id !== 'string' || !/^n[1-9][0-9]{0,11}$/.test(v.id) || ids.has(v.id))
        throw Error('Duplicate or invalid scene node ID.'); ids.add(v.id); for (const k of ['position', 'rotation', 'scale'])
        if (!Array.isArray(v[k]) || v[k].length !== 3 || v[k].some(x => !Number.isFinite(x)))
            throw Error('Invalid transform.'); if (v.scale.some(x => Math.abs(x) < .00001))
        throw Error('Degenerate scale.'); if (v.mesh !== null && (!Number.isInteger(v.mesh) || !meshes[v.mesh]))
        throw Error('Invalid mesh reference.'); if (!v.material || !/^#[0-9a-f]{6}$/i.test(v.material.color))
        throw Error('Invalid material color.'); for (const k of ['metallic', 'roughness', 'emission'])
        if (!Number.isFinite(v.material[k]))
            throw Error('Invalid material parameter.'); const keys = Array.isArray(v.keys) ? v.keys : []; for (const key of keys) {
        if (!Number.isFinite(key.frame))
            throw Error('Invalid animation frame.');
        for (const prop of ['p', 'r', 's'])
            if (!Array.isArray(key[prop]) || key[prop].length !== 3 || key[prop].some(x => !Number.isFinite(x)))
                throw Error('Invalid keyframe.');
        if (key.s.some(x => Math.abs(x) < .00001))
            throw Error('Degenerate keyframe scale.');
    } const n = new SceneNode(String(v.name).slice(0, 128), v.mesh === null ? null : meshes[v.mesh], v.material); Object.assign(n, { id: v.id, name: String(v.name).slice(0, 128), position: v.position.slice(), rotation: v.rotation.slice(), scale: v.scale.slice(), parent: v.parent ?? null, visible: v.visible !== false, locked: !!v.locked, material: { name: String(v.material.name || 'Standard surface').slice(0, 128), color: v.material.color, metallic: clamp(v.material.metallic, 0, 1), roughness: clamp(v.material.roughness, .07, 1), emission: clamp(v.material.emission, 0, 100) }, keys: keys.map(k => ({ frame: k.frame, p: k.p.slice(), r: k.r.slice(), s: k.s.slice(), interpolation: ['linear', 'step', 'smooth'].includes(k.interpolation) ? k.interpolation : 'smooth' })).sort((a, b) => a.frame - b.frame), history: Array.isArray(v.history) ? v.history.slice(-100).map(h => ({ name: String(h.name || 'Operation').slice(0, 128), detail: String(h.detail || '').slice(0, 256) })) : [] }); return n; }); for (const n of nodes) {
        let p = n, visited = new Set();
        while (p) {
            if (visited.has(p.id))
                throw Error('Scene hierarchy cycle.');
            visited.add(p.id);
            if (p.parent && !ids.has(p.parent))
                throw Error('Missing parent node.');
            p = nodes.find(n => n.id === p.parent);
        }
    } this.nodes = nodes; this.name = String(j.name || 'Untitled').slice(0, 128); this.frame = clamp(Number(j.frame) || 1, 1, 100000); this.start = clamp(Number(j.start) || 1, 1, 100000); this.end = clamp(Number(j.end) || 120, this.start + 1, 100000); this.fps = clamp(Number(j.fps) || 24, 1, 120); const env = j.environment || {}; this.environment = { exposure: Number.isFinite(env.exposure) ? clamp(env.exposure, .01, 100) : 1.15, ambient: Number.isFinite(env.ambient) ? clamp(env.ambient, 0, 10) : .38, shadows: env.shadows !== false, grid: env.grid !== false }; this.selection = new Set((j.selection || []).filter(id => ids.has(id))); serial = Math.max(serial, ...nodes.map(n => parseInt(n.id.slice(1), 10) || 0)); this.revision++; this.update(); }
}
/** Atomic snapshots, redo truncation, bounded memory, and drag coalescing. */
export class History {
    constructor(scene, onChange = () => { }) { this.scene = scene; this.onChange = onChange; this.past = []; this.future = []; this.maxBytes = 28 * 1024 * 1024; }
    begin() { this.pending = JSON.stringify(this.scene.serialize()); }
    commit(label) { if (!this.pending)
        return; const after = JSON.stringify(this.scene.serialize()); if (after !== this.pending) {
        this.past.push({ label, before: this.pending, after });
        this.future = [];
        let bytes = this.past.reduce((s, h) => s + (h.before.length + h.after.length) * 2, 0);
        while (this.past.length > 1 && (bytes > this.maxBytes || this.past.length > 40)) {
            const h = this.past.shift();
            bytes -= (h.before.length + h.after.length) * 2;
        }
    } this.pending = null; this.onChange(); }
    run(label, fn) { this.begin(); const before = this.pending; try {
        fn();
        this.scene.revision++;
    }
    catch (e) {
        this.scene.load(JSON.parse(before));
        this.pending = null;
        this.onChange();
        throw e;
    } this.commit(label); }
    undo() { const h = this.past.pop(); if (h) {
        this.scene.load(JSON.parse(h.before));
        this.future.push(h);
        this.onChange();
    } return h?.label; }
    redo() { const h = this.future.pop(); if (h) {
        this.scene.load(JSON.parse(h.after));
        this.past.push(h);
        this.onChange();
    } return h?.label; }
}
export function makeDemo(scene) {
    scene.nodes = [];
    scene.selection.clear();
    scene.frame = 1;
    scene.name = 'PIP-07 · Survey companion';
    const meshes = { box: Primitives.roundedBox(), sphere: Primitives.sphere(), cylinder: Primitives.cylinder(48), torus: Primitives.torus() };
    const group = (name, parent) => { const n = scene.add(new SceneNode(name)); n.parent = parent?.id || null; return n; };
    const stage = group('STAGE'), robot = group('PIP-07 / survey unit');
    const add = (name, type, p, s, mat, r = [0, 0, 0], parent = robot) => { const n = scene.add(new SceneNode(name, meshes[type], PALETTE[mat])); Object.assign(n, { position: p, scale: s, rotation: r, parent: parent?.id || null, history: [{ name: 'poly' + type[0].toUpperCase() + type.slice(1), detail: 'Primitive source' }] }); return n; };
    add('Display plinth', 'cylinder', [0, .07, 0], [4.1, .14, 4.1], 'graphite', [0, 0, 0], stage);
    const trace = add('Plinth / light trace', 'torus', [0, .144, 0], [3.87, .3, 3.87], 'teal', [0, 0, 0], stage);
    trace.mesh = Primitives.torus(96, 8, .5, .008);
    const body = add('Torso / ceramic shell', 'box', [0, 1.95, 0], [1.68, 1.6, 1.15], 'porcelain');
    add('Waist / flexible collar', 'cylinder', [0, 1.22, 0], [1.1, .36, .85], 'graphite');
    add('Chest / front panel', 'box', [0, 1.82, .57], [1.28, .58, .08], 'teal');
    add('Chest / service strip', 'box', [-.40, 1.70, .63], [.35, .06, .035], 'orange');
    for (let i = 0; i < 3; i++)
        add('Charge indicator ' + (i + 1), 'box', [.23 + i * .12, 1.72, .63], [.06, .05, .025], 'glow');
    add('Camera / alloy rim', 'cylinder', [0, 2.27, .60], [.72, .20, .72], 'titanium', [90, 0, 0]);
    add('Camera / black housing', 'cylinder', [0, 2.27, .715], [.57, .10, .57], 'graphite', [90, 0, 0]);
    add('Camera / optical ring', 'torus', [0, 2.27, .78], [.40, .23, .40], 'glow', [90, 0, 0]);
    add('Camera / lens', 'sphere', [0, 2.27, .79], [.31, .31, .12], 'blue');
    const head = group('HEAD / gimbal', robot);
    head.position = [0, 2.83, 0];
    add('Neck / rotary joint', 'cylinder', [0, -.13, 0], [.63, .38, .63], 'graphite', [0, 0, 0], head);
    add('Head / outer shell', 'box', [0, .42, 0], [1.59, .94, 1.15], 'porcelain', [0, 0, 0], head);
    add('Visor / glass panel', 'box', [0, .45, .57], [1.32, .58, .09], 'graphite', [0, 0, 0], head);
    for (const side of [-1, 1]) {
        add('Optical sensor ' + (side < 0 ? 'L' : 'R'), 'sphere', [side * .31, .49, .636], [.245, .245, .12], 'glow', [0, 0, 0], head);
        add('Temple / accent ' + side, 'cylinder', [side * .81, .44, 0], [.33, .06, .33], 'orange', [0, 0, 90], head);
    }
    add('Antenna / mast', 'cylinder', [-.43, 1.06, -.12], [.047, .55, .047], 'titanium', [0, 0, -12], head);
    add('Antenna / emitter', 'sphere', [-.49, 1.35, -.12], [.13, .13, .13], 'glow', [0, 0, 0], head);
    for (const side of [-1, 1]) {
        const suffix = side < 0 ? 'L' : 'R';
        add('Shoulder / socket ' + suffix, 'sphere', [side * .95, 2.44, 0], [.54, .54, .54], 'graphite');
        add('Shoulder / guard ' + suffix, 'box', [side * 1.17, 2.31, 0], [.53, .66, .65], 'teal', [0, 0, side * 12]);
        add('Arm / piston ' + suffix, 'cylinder', [side * 1.28, 1.78, .025], [.26, .67, .26], 'titanium', [0, 0, side * 9]);
        add('Wrist / joint ' + suffix, 'sphere', [side * 1.34, 1.46, .05], [.35, .35, .35], 'graphite');
        add('Gripper / palm ' + suffix, 'box', [side * 1.37, 1.24, .08], [.43, .40, .46], 'porcelain', [0, 0, side * 8]);
        for (const z of [-.10, .26])
            add('Gripper / digit ' + suffix + z, 'box', [side * 1.37, 1.01, z], [.16, .25, .12], 'graphite');
        add('Hip / joint ' + suffix, 'sphere', [side * .49, 1.0, 0], [.50, .50, .5], 'graphite');
        add('Leg / armor ' + suffix, 'box', [side * .53, .68, .015], [.56, .64, .6], 'porcelain');
        add('Leg / stripe ' + suffix, 'box', [side * .53, .72, .321], [.37, .14, .05], 'orange');
        add('Foot / sole ' + suffix, 'box', [side * .55, .27, .13], [.79, .25, 1.13], 'graphite');
        add('Foot / upper ' + suffix, 'box', [side * .55, .42, .18], [.72, .27, 1.01], 'teal');
    }
    for (const [frame, y] of [[1, -10], [30, 13], [60, 0], [90, -15], [120, -10]]) {
        head.rotation = [0, y, 0];
        head.setKey(frame);
    }
    head.rotation = [0, -10, 0];
    scene.selection.add(body.id);
    scene.update();
    return scene;
}
