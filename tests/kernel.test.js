import test from 'node:test';
import assert from 'node:assert/strict';
import { V, M, Camera, intersectTriangle } from '../src/math.js';
import { Mesh, Primitives, parseOBJ, exportOBJ, triangulateFace } from '../src/mesh.js';
import { Scene, SceneNode, History, makeDemo } from '../src/scene.js';
function near(a, b, epsilon = 1e-5) { assert.ok(Math.abs(a - b) < epsilon, `${a} ≉ ${b}`); }
function nearVector(a, b, epsilon = 1e-5) { a.forEach((v, i) => near(v, b[i], epsilon)); }
function volume(mesh) { return mesh.bake().triangles.reduce((sum, t) => { const [a, b, c] = t.ids.map(i => mesh.vertices[i]); return sum + V.dot(a, V.cross(b, c)) / 6; }, 0); }
test('matrix composition and inverse round-trip 500 transforms', () => {
    let seed = 171;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 500; i++) {
        const p = [random() * 20, random() * 20, random() * 20], r = [random() * 360, random() * 360, random() * 360], s = [random() + .3, random() + .3, random() + .3], m = M.compose(p, r, s), v = [random(), random(), random()];
        nearVector(M.point(M.inverse(m), M.point(m, v)), v, 1e-4);
    }
});
test('hierarchical matrix multiplication preserves composition order', () => { const a = M.compose([1, 0, 0], [0, 0, 90], [1, 1, 1]), b = M.compose([2, 0, 0], [0, 0, 0], [1, 1, 1]); nearVector(M.point(M.mul(a, b), [0, 0, 0]), [1, 2, 0]); });
test('normal inverse transpose preserves tangent orthogonality', () => { const m = M.compose([1, 2, 3], [15, 31, 17], [2, 3, 4]), normal = M.transpose(M.inverse(m)); near(V.dot(M.vector(normal, [0, 1, 0]), M.vector(m, [1, 0, 0])), 0); });
test('perspective camera project-to-ray round trip', () => { const c = new Camera(); c.update(1280, 720); const p = [.2, 1.7, -.5], screen = c.project(p), ray = c.ray(screen[0], screen[1]); near(V.len(V.cross(V.sub(p, ray.origin), ray.direction)), 0, 1e-4); });
test('orthographic camera keeps rays parallel', () => { const c = new Camera(); c.preset('front'); c.update(1000, 700); nearVector(c.ray(100, 300).direction, c.ray(900, 600).direction); });
test('cube has coherent winding and unit volume', () => { const c = Primitives.cube(); assert.equal(c.vertices.length, 8); assert.equal(c.faces.length, 6); assert.equal(c.bake().count, 36); near(volume(c), 1); });
test('all closed primitives have outward winding', () => { for (const name of ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'roundedBox'])
    assert.ok(volume(Primitives[name]()) > 0, name); });
test('Catmull–Clark cube topology: 26/24 then 98/96', () => { const c = Primitives.cube(); c.subdivide(); assert.equal(c.vertices.length, 26); assert.equal(c.faces.length, 24); c.subdivide(); assert.equal(c.vertices.length, 98); assert.equal(c.faces.length, 96); assert.ok(c.vertices.every(v => v.every(Number.isFinite))); });
test('Catmull–Clark boundary rule is stable on an open plane', () => { const c = Primitives.plane(); c.subdivide(); assert.equal(c.faces.length, 4); assert.equal(c.vertices.length, 9); assert.ok(c.vertices.every(v => v[1] === 0)); nearVector(c.vertices[0], [-.75, 0, -.75]); });
test('extrusion adds side walls, preserves outward winding and volume', () => { const c = Primitives.cube(); const caps = c.extrude([3], .5); assert.equal(c.vertices.length, 12); assert.equal(c.faces.length, 10); assert.equal(caps.length, 1); near(volume(c), 1.5); });
test('mirroring preserves outward winding', () => { const c = Primitives.cube(); c.mirror(0); assert.equal(c.vertices.length, 16); assert.equal(c.faces.length, 12); near(volume(c), 2); });
test('mesh clone is structurally independent', () => { const a = Primitives.cube(), b = a.clone(); b.vertices[0][0] = 123; b.faces[0][0] = 4; assert.notEqual(a.vertices[0][0], 123); assert.notEqual(a.faces[0][0], 4); });
test('revision invalidates render data and BVH', () => { const c = Primitives.cube(), b = c.bake(); c.buildBVH(); c.touch(); assert.equal(c.cache, null); assert.equal(c.bvh, null); assert.notEqual(c.bake(), b); });
test('BVH gives same nearest hit as brute force', () => { const m = Primitives.sphere(16, 12); for (let i = 0; i < 80; i++) {
    const angle = i * .23, origin = [Math.sin(angle) * 3, (i % 7 - 3) * .12, Math.cos(angle) * 3], direction = V.norm(V.mul(origin, -1)), ray = { origin, direction };
    const actual = m.intersect(ray);
    const distances = m.bake().triangles.map(t => intersectTriangle(origin, direction, ...t.ids.map(v => m.vertices[v]))).filter(v => v !== null);
    assert.ok(actual);
    near(actual.distance, Math.min(...distances));
} });
test('concave simple n-gon ear clipping conserves polygon area', () => { const v = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [1, 1, 0], [0, 2, 0]], face = [0, 1, 2, 3, 4], t = triangulateFace(face, v); assert.equal(t.length, 3); const area = t.reduce((sum, f) => sum + V.len(V.cross(V.sub(v[f[1]], v[f[0]]), V.sub(v[f[2]], v[f[0]]))) / 2, 0); near(area, 3); });
test('OBJ supports negative indices and ignores texture/normal tokens', () => { const m = parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3/1/1 -2/2/1 -1/3/1'); assert.deepEqual(m.faces, [[0, 1, 2]]); });
test('OBJ rejects out-of-range indices and nonfinite vertices', () => { assert.throws(() => parseOBJ('v 0 0 0\nf 1 2 3')); assert.throws(() => parseOBJ('v NaN 0 0')); });
test('OBJ export bakes world transforms', () => { const s = new Scene(), n = s.add(new SceneNode('cube', Primitives.cube())); n.position = [3, 4, 5]; s.update(); const m = parseOBJ(exportOBJ(s.nodes)); nearVector(m.vertices[0], [2.5, 3.5, 4.5]); });
test('scene hierarchy propagates visibility and transforms', () => { const s = new Scene(), g = s.add(new SceneNode('group')), n = s.add(new SceneNode('cube', Primitives.cube())); g.position = [1, 2, 3]; n.parent = g.id; n.position = [3, 2, 1]; s.update(); nearVector(M.point(n.world, [0, 0, 0]), [4, 4, 4]); g.visible = false; s.update(); assert.equal(n.effectiveVisible, false); });
test('scene picking returns nearest visible unlocked geometry', () => { const s = new Scene(), a = s.add(new SceneNode('a', Primitives.cube())), b = s.add(new SceneNode('b', Primitives.cube())); a.position = [0, 0, 2]; const ray = { origin: [0, 0, 5], direction: [0, 0, -1] }; assert.equal(s.pick(ray).node, a); a.visible = false; assert.equal(s.pick(ray).node, b); b.locked = true; assert.equal(s.pick(ray), null); });
test('scene JSON round trip preserves shared mesh identity and animation', () => { const s = makeDemo(new Scene()), serialized = s.serialize(), other = new Scene(); other.load(JSON.parse(JSON.stringify(serialized))); assert.deepEqual(other.serialize(), serialized); assert.equal(other.nodes.length, 49); assert.equal(other.nodes.find(n => n.name === 'Head / outer shell').mesh, other.nodes.find(n => n.name === 'Torso / ceramic shell').mesh); });
test('scene loader rejects cycles and duplicate IDs before replacing document', () => { const s = makeDemo(new Scene()), data = s.serialize(), first = data.nodes[0]; first.parent = first.id; const other = new Scene(); assert.throws(() => other.load(data), /cycle/); assert.equal(other.nodes.length, 0); const data2 = s.serialize(); data2.nodes[1].id = data2.nodes[0].id; assert.throws(() => other.load(data2), /Duplicate/); });
test('scene loader ignores prototype injection and sanitizes environment', () => { const s = new Scene(); s.add(new SceneNode('a', Primitives.cube())); const data = s.serialize(); data.nodes[0] = JSON.parse(JSON.stringify(data.nodes[0]).replace('{', '{"__proto__":{"polluted":true},')); data.environment.exposure = 'not a number'; const copy = new Scene(); copy.load(data); assert.equal(copy.nodes[0].polluted, undefined); assert.ok(copy.nodes[0] instanceof SceneNode); assert.ok(Number.isFinite(copy.environment.exposure)); });
test('linear, smoothstep and held animation evaluate correctly', () => { const n = new SceneNode('animated'); n.setKey(1, 'linear'); n.position = [10, 0, 0]; n.setKey(11); near(n.evaluated(6).p[0], 5); n.keys[0].interpolation = 'smooth'; near(n.evaluated(3.5).p[0], 1.5625); n.keys[0].interpolation = 'step'; near(n.evaluated(10).p[0], 0); near(n.evaluated(11).p[0], 10); });
test('key replacement keeps sorted unique frame keys', () => { const n = new SceneNode('animated'); n.setKey(15); n.setKey(1); n.position = [2, 0, 0]; n.setKey(15); assert.equal(n.keys.length, 2); assert.deepEqual(n.keys.map(k => k.frame), [1, 15]); near(n.keys[1].p[0], 2); });
test('undo/redo coalesces transactions and clears redo after a new edit', () => { const s = new Scene(), n = s.add(new SceneNode('cube', Primitives.cube())), h = new History(s); h.run('move', () => n.position[0] = 5); h.undo(); near(s.nodes[0].position[0], 0); h.redo(); near(s.nodes[0].position[0], 5); h.undo(); h.run('move again', () => s.nodes[0].position[0] = 3); assert.equal(h.future.length, 0); });
test('failed mutations roll back atomically', () => { const s = makeDemo(new Scene()), h = new History(s), before = JSON.stringify(s.serialize()); assert.throws(() => h.run('bad edit', () => { s.nodes[0].name = 'incorrect'; throw Error('failed'); })); assert.equal(JSON.stringify(s.serialize()), before); assert.equal(h.past.length, 0); });
test('deleting a selected group removes descendants', () => { const s = makeDemo(new Scene()), robot = s.nodes.find(n => n.name === 'PIP-07 / survey unit'); s.select(robot.id); s.removeSelected(); assert.equal(s.nodes.length, 3); assert.equal(s.selection.size, 0); });

// Imported IDs are inserted into data attributes, and must remain canonical identifiers.
test('scene loader rejects markup-bearing node identifiers', () => {
    const scene = new Scene(); scene.add(new SceneNode('safe name', Primitives.cube()));
    const data = scene.serialize(); data.nodes[0].id = 'n1\" onclick=\"alert(1)';
    assert.throws(() => new Scene().load(data), /invalid scene node ID/);
});
