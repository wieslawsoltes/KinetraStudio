/** Kinetra math kernel. Column-major matrices, right-handed world, Y-up, ZO depth. */
export const V = {
    add: (a, b) => a.map((v, i) => v + b[i]), sub: (a, b) => a.map((v, i) => v - b[i]),
    mul: (a, s) => a.map(v => v * s), dot: (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(...a), norm: a => { const l = Math.hypot(...a); return l > 1e-12 ? a.map(v => v / l) : [0, 0, 0]; },
    lerp: (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const radians = d => d * Math.PI / 180;
export const M = {
    identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) { let o = new Float32Array(16); for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++)
                o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; },
    point(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [0, 1, 2].map(r => (m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]) / (w || 1)); },
    vector: (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2]),
    transpose: m => new Float32Array([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]),
    inverse(m) { const a = Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => c < 4 ? m[c * 4 + r] : +(c - 4 === r))); for (let c = 0; c < 4; c++) {
        let p = c;
        for (let r = c + 1; r < 4; r++)
            if (Math.abs(a[r][c]) > Math.abs(a[p][c]))
                p = r;
        if (Math.abs(a[p][c]) < 1e-12)
            return M.identity();
        [a[c], a[p]] = [a[p], a[c]];
        const s = a[c][c];
        a[c] = a[c].map(x => x / s);
        for (let r = 0; r < 4; r++)
            if (r !== c) {
                const f = a[r][c];
                a[r] = a[r].map((x, k) => x - f * a[c][k]);
            }
    } return new Float32Array(Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)])); },
    compose(p, r, s) { const [x, y, z] = r.map(radians), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z); return new Float32Array([(cz * cy) * s[0], (sz * cy) * s[0], -sy * s[0], 0, (cz * sy * sx - sz * cx) * s[1], (sz * sy * sx + cz * cx) * s[1], cy * sx * s[1], 0, (cz * sy * cx + sz * sx) * s[2], (sz * sy * cx - cz * sx) * s[2], cy * cx * s[2], 0, ...p, 1]); },
    lookAt(eye, target, up = [0, 1, 0]) { const z = V.norm(V.sub(eye, target)), x = V.norm(V.cross(up, z)), y = V.cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, eye), -V.dot(y, eye), -V.dot(z, eye), 1]); },
    perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov / 2); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, far * near / (near - far), 0]); },
    ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, 1 / (n - f), 0, -(r + l) / (r - l), -(t + b) / (t - b), n / (n - f), 1]); }
};
export class Camera {
    constructor() { this.target = [0, 1.5, 0]; this.distance = 11.5; this.yaw = .62; this.pitch = .28; this.fov = 45; this.projection = 'perspective'; this.near = .03; this.far = 1000; }
    update(w, h) { this.width = w; this.height = h; this.eye = V.add(this.target, [this.distance * Math.cos(this.pitch) * Math.sin(this.yaw), this.distance * Math.sin(this.pitch), this.distance * Math.cos(this.pitch) * Math.cos(this.yaw)]); this.view = M.lookAt(this.eye, this.target, Math.abs(this.pitch) > 1.56 ? [0, 0, -1] : [0, 1, 0]); const a = w / h, s = this.distance * .42; this.proj = this.projection === 'perspective' ? M.perspective(radians(this.fov), a, this.near, this.far) : M.ortho(-s * a, s * a, -s, s, this.near, this.far); this.vp = M.mul(this.proj, this.view); this.inv = M.inverse(this.vp); }
    project(p) { const q = M.point(this.vp, p); return [(q[0] + 1) * this.width / 2, (1 - q[1]) * this.height / 2, q[2]]; }
    ray(x, y) { const forward = V.norm(V.sub(this.target, this.eye)), right = V.norm(V.cross(Math.abs(this.pitch) > 1.56 ? [0, 0, -1] : [0, 1, 0], V.mul(forward, -1))), up = V.cross(right, forward), nx = x / this.width * 2 - 1, ny = 1 - y / this.height * 2, aspect = this.width / this.height; if (this.projection === 'orthographic') {
        const half = this.distance * .42;
        return { origin: V.add(this.eye, V.add(V.add(V.mul(right, nx * half * aspect), V.mul(up, ny * half)), V.mul(forward, this.near))), direction: forward };
    } const half = Math.tan(radians(this.fov) / 2), direction = V.norm(V.add(forward, V.add(V.mul(right, nx * half * aspect), V.mul(up, ny * half)))); return { origin: V.add(this.eye, V.mul(direction, this.near / V.dot(direction, forward))), direction }; }
    pan(dx, dy) { const k = this.distance / this.height * .8, right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)], up = V.cross(V.norm(V.sub(this.eye, this.target)), right); this.target = V.add(this.target, V.add(V.mul(right, -dx * k), V.mul(up, dy * k))); }
    preset(name) { this.projection = name === 'perspective' ? 'perspective' : 'orthographic'; if (name === 'top') {
        this.yaw = 0;
        this.pitch = Math.PI / 2;
    }
    else if (name === 'front') {
        this.yaw = 0;
        this.pitch = 0;
    }
    else if (name === 'right') {
        this.yaw = Math.PI / 2;
        this.pitch = 0;
    }
    else {
        this.yaw = .62;
        this.pitch = .28;
    } }
}
export function intersectTriangle(origin, direction, a, b, c) { const e1 = V.sub(b, a), e2 = V.sub(c, a), p = V.cross(direction, e2), det = V.dot(e1, p); if (Math.abs(det) < 1e-9)
    return null; const t = V.sub(origin, a), u = V.dot(t, p) / det; if (u < 0 || u > 1)
    return null; const q = V.cross(t, e1), v = V.dot(direction, q) / det; if (v < 0 || u + v > 1)
    return null; const d = V.dot(e2, q) / det; return d > 1e-5 ? d : null; }
export function intersectBox(o, d, min, max) { let lo = 0, hi = Infinity; for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
        if (o[k] < min[k] || o[k] > max[k])
            return false;
        continue;
    }
    let a = (min[k] - o[k]) / d[k], b = (max[k] - o[k]) / d[k];
    if (a > b)
        [a, b] = [b, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, b);
    if (hi < lo)
        return false;
} return true; }
