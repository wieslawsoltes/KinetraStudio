import { V, M, intersectTriangle, intersectBox } from './math.js';
/** Triangulate simple planar n-gons, including concave faces, without changing topology. */
export function triangulateFace(face, vertices) {
    if (face.length === 3)
        return [face.slice()];
    let normal = [0, 0, 0];
    for (let i = 0; i < face.length; i++) {
        const a = vertices[face[i]], b = vertices[face[(i + 1) % face.length]];
        normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
        normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
        normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))), axes = [0, 1, 2].filter(i => i !== drop), points = face.map(i => axes.map(k => vertices[i][k]));
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
    }
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]), sign = area >= 0 ? 1 : -1;
    const remaining = face.map((_, i) => i), out = [];
    // Convex polygons use the fast fan path. Degenerate polygons retain a deterministic fan.
    let convex = true;
    for (let i = 0; i < points.length; i++)
        if (cross(points[(i + points.length - 1) % points.length], points[i], points[(i + 1) % points.length]) * sign < -1e-10) {
            convex = false;
            break;
        }
    if (convex)
        return face.slice(1, -1).map((_, i) => [face[0], face[i + 1], face[i + 2]]);
    let guard = face.length * face.length;
    while (remaining.length > 3 && guard-- > 0) {
        let clipped = false;
        for (let i = 0; i < remaining.length; i++) {
            const ia = remaining[(i + remaining.length - 1) % remaining.length], ib = remaining[i], ic = remaining[(i + 1) % remaining.length], a = points[ia], b = points[ib], c = points[ic];
            if (cross(a, b, c) * sign <= 1e-10)
                continue;
            const contains = remaining.some(j => j !== ia && j !== ib && j !== ic && cross(a, b, points[j]) * sign >= -1e-10 && cross(b, c, points[j]) * sign >= -1e-10 && cross(c, a, points[j]) * sign >= -1e-10);
            if (contains)
                continue;
            out.push([face[ia], face[ib], face[ic]]);
            remaining.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) {
            throw Error('Cannot triangulate a self-intersecting or degenerate polygon.');
        }
    }
    if (remaining.length === 3)
        out.push(remaining.map(i => face[i]));
    return out;
}
let meshSerial = 0;
/** Polygon mesh with revisioned render data and an object-space triangle BVH. */
export class Mesh {
    constructor(vertices = [], faces = [], smooth = false) { this.id = ++meshSerial; this.vertices = vertices; this.faces = faces; this.smooth = smooth; this.revision = 1; this.cache = null; }
    touch() { this.revision++; this.cache = null; this.bvh = null; }
    clone() { return new Mesh(this.vertices.map(v => v.slice()), this.faces.map(f => f.slice()), this.smooth); }
    faceNormal(f) { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) {
        const a = this.vertices[f[i]], b = this.vertices[f[(i + 1) % f.length]];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]);
        n[1] += (a[2] - b[2]) * (a[0] + b[0]);
        n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    } return V.norm(n); }
    bake() { if (this.cache)
        return this.cache; const data = [], lines = [], tris = [], edges = new Set(), norms = this.vertices.map(() => [0, 0, 0]); if (this.smooth)
        for (const f of this.faces) {
            const n = this.faceNormal(f);
            for (const i of f)
                norms[i] = V.add(norms[i], n);
        } for (let fi = 0; fi < this.faces.length; fi++) {
        const f = this.faces[fi], n = this.faceNormal(f);
        for (const ids of triangulateFace(f, this.vertices)) {
            tris.push({ ids, face: fi });
            for (const i of ids)
                data.push(...this.vertices[i], ...(this.smooth ? V.norm(norms[i]) : n));
        }
        for (let k = 0; k < f.length; k++) {
            const a = f[k], b = f[(k + 1) % f.length], key = a < b ? `${a}:${b}` : `${b}:${a}`;
            if (!edges.has(key)) {
                edges.add(key);
                lines.push(...this.vertices[a], 0, 0, 0, ...this.vertices[b], 0, 0, 0);
            }
        }
    } this.cache = { data: new Float32Array(data), lines: new Float32Array(lines), triangles: tris, count: data.length / 6, lineCount: lines.length / 6 }; return this.cache; }
    buildBVH() { const triangles = this.bake().triangles; const bounds = items => { const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (const t of items)
        for (const i of t.ids)
            for (let k = 0; k < 3; k++) {
                min[k] = Math.min(min[k], this.vertices[i][k]);
                max[k] = Math.max(max[k], this.vertices[i][k]);
            } return { min, max }; }; const build = (items, depth = 0) => { const b = bounds(items); if (items.length <= 10 || depth > 30)
        return { ...b, items }; const ext = V.sub(b.max, b.min), axis = ext.indexOf(Math.max(...ext)); items.sort((a, b) => a.ids.reduce((s, i) => s + this.vertices[i][axis], 0) - b.ids.reduce((s, i) => s + this.vertices[i][axis], 0)); const half = items.length >> 1; return { ...b, left: build(items.slice(0, half), depth + 1), right: build(items.slice(half), depth + 1) }; }; this.bvh = build(triangles.slice()); }
    intersect(ray) { if (!this.bvh)
        this.buildBVH(); let best = null; const visit = node => { if (!intersectBox(ray.origin, ray.direction, node.min, node.max))
        return; if (node.items) {
        for (const t of node.items) {
            const d = intersectTriangle(ray.origin, ray.direction, ...t.ids.map(i => this.vertices[i]));
            if (d !== null && (!best || d < best.distance))
                best = { distance: d, face: t.face, point: V.add(ray.origin, V.mul(ray.direction, d)) };
        }
    }
    else {
        visit(node.left);
        visit(node.right);
    } }; if (this.faces.length)
        visit(this.bvh); return best; }
    extrude(indices, amount = .3) { const selected = new Set(indices), newFaces = []; const out = []; this.faces.forEach((f, fi) => { if (!selected.has(fi)) {
        out.push(f);
        return;
    } const n = this.faceNormal(f), ids = f.map(i => { this.vertices.push(V.add(this.vertices[i], V.mul(n, amount))); return this.vertices.length - 1; }); for (let k = 0; k < f.length; k++) {
        let j = (k + 1) % f.length;
        out.push([f[k], f[j], ids[j], ids[k]]);
    } newFaces.push(out.length); out.push(ids); }); this.faces = out; this.touch(); return newFaces; }
    subdivide() { if (this.faces.length > 60000)
        throw Error('Subdivision safety limit: 60,000 polygons.'); const old = this.vertices, facePoints = this.faces.map(f => V.mul(f.reduce((s, i) => V.add(s, old[i]), [0, 0, 0]), 1 / f.length)), edges = new Map(), adj = old.map(() => ({ faces: [], edges: [] })); this.faces.forEach((f, fi) => { for (let k = 0; k < f.length; k++) {
        const a = f[k], b = f[(k + 1) % f.length], key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!edges.has(key))
            edges.set(key, { a, b, faces: [], key });
        edges.get(key).faces.push(fi);
        adj[a].faces.push(fi);
    } }); for (const e of edges.values()) {
        adj[e.a].edges.push(e);
        adj[e.b].edges.push(e);
    } const verts = old.map((p, i) => { const a = adj[i], boundary = a.edges.filter(e => e.faces.length === 1); if (boundary.length === 2)
        return V.add(V.mul(p, .75), V.mul(boundary.reduce((s, e) => V.add(s, old[e.a === i ? e.b : e.a]), [0, 0, 0]), .125)); const n = a.faces.length; if (!n)
        return p.slice(); const F = V.mul(a.faces.reduce((s, f) => V.add(s, facePoints[f]), [0, 0, 0]), 1 / n), R = V.mul(a.edges.reduce((s, e) => V.add(s, V.mul(V.add(old[e.a], old[e.b]), .5)), [0, 0, 0]), 1 / a.edges.length); return V.mul(V.add(V.add(F, V.mul(R, 2)), V.mul(p, n - 3)), 1 / n); }); for (const e of edges.values()) {
        e.index = verts.length;
        verts.push(e.faces.length === 2 ? V.mul(V.add(V.add(old[e.a], old[e.b]), V.add(facePoints[e.faces[0]], facePoints[e.faces[1]])), .25) : V.mul(V.add(old[e.a], old[e.b]), .5));
    } const fpIndex = facePoints.map(p => { verts.push(p); return verts.length - 1; }), faces = []; this.faces.forEach((f, fi) => { for (let k = 0; k < f.length; k++) {
        const p = f[(k + f.length - 1) % f.length], a = f[k], b = f[(k + 1) % f.length], edge = (u, v) => edges.get(u < v ? `${u}:${v}` : `${v}:${u}`).index;
        faces.push([a, edge(a, b), fpIndex[fi], edge(p, a)]);
    } }); this.vertices = verts; this.faces = faces; this.smooth = true; this.touch(); }
    mirror(axis = 0) { const len = this.vertices.length; this.vertices.push(...this.vertices.map(p => p.map((v, k) => k === axis ? -v : v))); this.faces.push(...this.faces.map(f => f.map(i => i + len).reverse())); this.touch(); }
    toJSON() { return { vertices: this.vertices, faces: this.faces, smooth: this.smooth }; }
    static fromJSON(j) { if (!j || !Array.isArray(j.vertices) || !Array.isArray(j.faces) || j.vertices.length > 500000 || j.faces.length > 500000)
        throw Error('Invalid mesh or mesh exceeds 500,000-element import limit.'); if (j.vertices.some(v => !Array.isArray(v) || v.length !== 3 || v.some(x => !Number.isFinite(x))))
        throw Error('Invalid vertex coordinate.'); if (j.faces.some(f => !Array.isArray(f) || f.length < 3 || f.length > 10000 || f.some(i => !Number.isInteger(i) || i < 0 || i >= j.vertices.length)))
        throw Error('Invalid polygon index.'); return new Mesh(j.vertices.map(v => v.slice()), j.faces.map(f => f.slice()), !!j.smooth); }
}
export const Primitives = {
    cube() { return new Mesh([[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]], [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [1, 2, 6, 5], [0, 4, 7, 3]]); },
    plane() { return new Mesh([[-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1]], [[0, 1, 2, 3]]); },
    sphere(seg = 32, rings = 20) { const v = [[0, .5, 0]], f = []; for (let j = 1; j < rings; j++) {
        const a = Math.PI * j / rings;
        for (let i = 0; i < seg; i++) {
            const b = Math.PI * 2 * i / seg;
            v.push([.5 * Math.sin(a) * Math.sin(b), .5 * Math.cos(a), .5 * Math.sin(a) * Math.cos(b)]);
        }
    } v.push([0, -.5, 0]); for (let i = 0; i < seg; i++)
        f.push([0, 1 + i, 1 + (i + 1) % seg]); for (let j = 0; j < rings - 2; j++)
        for (let i = 0; i < seg; i++) {
            const a = 1 + j * seg + i, b = 1 + j * seg + (i + 1) % seg;
            f.push([a, a + seg, b + seg, b]);
        } for (let i = 0; i < seg; i++)
        f.push([v.length - 1, 1 + (rings - 2) * seg + (i + 1) % seg, 1 + (rings - 2) * seg + i]); return new Mesh(v, f, true); },
    cylinder(seg = 32, top = .5, bottom = .5) { const v = [], f = []; for (let y = 0; y < 2; y++)
        for (let i = 0; i < seg; i++) {
            const a = i / seg * Math.PI * 2, r = y ? top : bottom;
            v.push([Math.sin(a) * r, y - .5, Math.cos(a) * r]);
        } for (let i = 0; i < seg; i++) {
        let j = (i + 1) % seg;
        f.push([i, j, j + seg, i + seg]);
    } f.push(Array.from({ length: seg }, (_, i) => seg - 1 - i)); f.push(Array.from({ length: seg }, (_, i) => i + seg)); return new Mesh(v, f, false); },
    cone() { return Primitives.cylinder(32, 0, .5); },
    torus(seg = 48, tube = 12, radius = .5, tubeRadius = .14) { const v = [], f = []; for (let j = 0; j < seg; j++)
        for (let i = 0; i < tube; i++) {
            const a = j / seg * Math.PI * 2, b = i / tube * Math.PI * 2, r = radius + tubeRadius * Math.cos(b);
            v.push([Math.sin(a) * r, tubeRadius * Math.sin(b), Math.cos(a) * r]);
        } for (let j = 0; j < seg; j++)
        for (let i = 0; i < tube; i++)
            f.push([j * tube + i, j * tube + (i + 1) % tube, ((j + 1) % seg) * tube + (i + 1) % tube, ((j + 1) % seg) * tube + i].reverse()); return new Mesh(v, f, true); },
    capsule() { let m = Primitives.sphere(); m.vertices = m.vertices.map(p => [p[0], p[1] + Math.sign(p[1]) * .35, p[2]]); m.touch(); return m; },
    roundedBox(radius = .12) { const m = Primitives.cube(); m.subdivide(); m.subdivide(); const inner = .5 - radius; m.vertices = m.vertices.map(p => { const max = Math.max(...p.map(Math.abs)), q = p.map(v => v / max * .5), c = q.map(v => Math.max(-inner, Math.min(inner, v))); return V.add(c, V.mul(V.norm(V.sub(q, c)), radius)); }); m.smooth = true; m.touch(); return m; }
};
export function parseOBJ(text) { const vs = [], faces = []; for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') {
        const v = p.slice(1, 4).map(Number);
        if (v.length !== 3 || v.some(x => !Number.isFinite(x)))
            throw Error('Invalid OBJ vertex');
        vs.push(v);
    }
    else if (p[0] === 'f') {
        faces.push(p.slice(1).map(t => { const n = parseInt(t.split('/')[0], 10); return n < 0 ? vs.length + n : n - 1; }));
    }
} return Mesh.fromJSON({ vertices: vs, faces, smooth: false }); }
export function exportOBJ(nodes) { let out = ['# Kinetra Studio OBJ export'], offset = 1; for (const n of nodes) {
    if (!n.mesh)
        continue;
    out.push('o ' + n.name.replace(/\s+/g, '_'));
    for (const v of n.mesh.vertices)
        out.push('v ' + M.point(n.world, v).map(x => +x.toFixed(6)).join(' '));
    for (const f of n.mesh.faces)
        out.push('f ' + f.map(i => i + offset).join(' '));
    offset += n.mesh.vertices.length;
} return out.join('\n'); }
