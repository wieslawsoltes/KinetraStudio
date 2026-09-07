import { V, M, Camera, clamp } from './math.js';
import { Mesh, Primitives, parseOBJ, exportOBJ } from './mesh.js';
import { Scene, SceneNode, History, PALETTE, makeDemo } from './scene.js';
import { Renderer } from './renderer.js';
import { icon, fillIcons } from './icons.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const scene = new Scene(), camera = new Camera();
const state = { tool: 'select', mode: 'object', inspector: 'channels', shelf: 'Polygons', snap: false, autoKey: false, playing: false, loop: true, dirty: true, raf: 0, collapsed: new Set(), components: new Set(), gizmo: [], drag: null, graph: null, saveTimer: null, saved: false, logs: [], view: 'perspective', lastStats: 0, disposed: false };
let renderer;
const history = new History(scene, () => { refresh(); scheduleSave(); });
function toast(message, error = false) { const e = document.createElement('div'); e.className = 'toast' + (error ? ' error' : ''); e.textContent = message; $('#toastStack').append(e); setTimeout(() => e.remove(), 4000); log(message, error); }
function log(message, error = false) { state.logs.push(`[${new Date().toLocaleTimeString()}] ${error ? 'ERROR  ' : ''}${message}`); if (state.logs.length > 200)
    state.logs.shift(); $('#commandResult').textContent = message; }
function safe(fn) { try {
    const result = fn();
    if (result?.catch)
        result.catch(e => toast(e.message, true));
    return result;
}
catch (e) {
    console.error(e);
    toast(e.message, true);
} }
function mutate(label, fn) { stopPlayback(); history.run(label, () => { fn(); scene.update(); }); toast(label); }
function requireNode(mesh = false) { const n = scene.active; if (!n)
    throw Error('Select an object first.'); if (mesh && !n.mesh)
    throw Error('Select a polygon mesh, rather than a group.'); if (n.locked)
    throw Error('This object is locked. Unlock it in Channels.'); return n; }
function editableMesh(n) { n.mesh = n.mesh.clone(); return n.mesh; }
function requestDraw() { state.dirty = true; if (!state.raf)
    state.raf = requestAnimationFrame(draw); }
function draw(time) { state.raf = 0; if (!renderer || state.disposed)
    return; const t = performance.now(); if (state.playing) {
    const f = state.playFrame + (time - state.playTime) * scene.fps / 1000;
    if (f > scene.end && !state.loop) {
        scene.frame = scene.end;
        stopPlayback();
    }
    else
        scene.frame = scene.start + ((f - scene.start) % (scene.end - scene.start + 1));
    $('#currentFrame').value = Math.round(scene.frame);
    state.dirty = true;
} if (state.dirty) {
    renderer.render(scene, camera);
    drawOverlay();
    drawTimeline();
    state.dirty = false;
    if (time - state.lastStats > 450) {
        $('#triangleCount').textContent = renderer.triangles.toLocaleString() + ' triangles';
        $('#frameTime').textContent = (performance.now() - t).toFixed(1) + ' ms CPU';
        state.lastStats = time;
        if (state.playing)
            updateTransformReadouts();
    }
} if (state.playing)
    state.raf = requestAnimationFrame(draw); }
function refresh() { renderTree(); renderInspector(); drawTimeline(); $('#documentName').textContent = scene.name; $('#objectCount').textContent = scene.nodes.filter(n => n.mesh).length + ' meshes · ' + scene.nodes.filter(n => !n.mesh).length + ' groups'; $('#selectionStatus').textContent = scene.selected.length ? scene.selected.length + ' object' + (scene.selected.length === 1 ? '' : 's') + ' selected' : 'Nothing selected'; $('#selectionBadge').textContent = state.mode === 'object' ? (scene.active?.name || 'Object mode') : `${state.mode[0].toUpperCase() + state.mode.slice(1)} mode · ${state.components.size} selected`; $('#undoBtn').disabled = !history.past.length; $('#redoBtn').disabled = !history.future.length; $('#currentFrame').value = Math.round(scene.frame); $('#startFrame').value = scene.start; $('#endFrame').value = scene.end; $('#fpsSelect').value = String(scene.fps); $('#durationLabel').textContent = ((scene.end - scene.start + 1) / scene.fps).toFixed(1) + ' sec'; $('#gridCheck').checked = scene.environment.grid; $('#shadowCheck').checked = scene.environment.shadows; $('#wireCheck').checked = renderer?.showWire || false; requestDraw(); }
function scheduleSave() { state.saved = false; $('#dirtyMarker').textContent = '•'; $('#saveState').textContent = 'Saving locally…'; clearTimeout(state.saveTimer); state.saveTimer = setTimeout(() => { try {
    localStorage.setItem('kinetra.scene.v1', JSON.stringify(scene.serialize()));
    $('#saveState').textContent = 'Saved on this device';
    $('#dirtyMarker').textContent = '';
    state.saved = true;
}
catch (e) {
    $('#saveState').textContent = e.name === 'QuotaExceededError' ? 'Local storage full · export to save' : 'Local autosave unavailable';
    log('Autosave unavailable — use File → Save project', true);
} }, 650); }
function renderTree() { const query = $('#sceneSearch').value.toLowerCase(), nodes = scene.nodes; const matches = n => n.name.toLowerCase().includes(query) || nodes.some(c => c.parent === n.id && matches(c)); let html = ''; const visit = (parent, depth) => { for (const n of nodes.filter(n => n.parent === parent)) {
    if (query && !matches(n))
        continue;
    const children = nodes.some(c => c.parent === n.id), collapsed = state.collapsed.has(n.id) && !query;
    html += `<div role="treeitem" aria-selected="${scene.selection.has(n.id)}" ${children ? `aria-expanded="${!collapsed}"` : ''} draggable="true" class="tree-row ${scene.selection.has(n.id) ? 'selected' : ''} ${!n.mesh ? 'group' : ''} ${!n.visible ? 'dim' : ''}" data-node="${n.id}" style="padding-left:${8 + depth * 13}px"><button class="tree-toggle" data-collapse="${n.id}" title="Toggle group">${children ? (collapsed ? '›' : '⌄') : ''}</button><span class="node-icon">${icon(n.mesh ? 'cube' : 'folder')}</span><span class="node-name" title="${esc(n.name)}">${esc(n.name)}</span>${n.keys.length ? '<span class="tree-key" title="Animated"></span>' : ''}<button class="tree-eye ${!n.visible ? 'off' : ''}" data-visibility="${n.id}" title="Toggle visibility">${icon(n.visible ? 'eye' : 'eyeOff')}</button></div>`;
    if (!collapsed)
        visit(n.id, depth + 1);
} }; visit(null, 0); $('#sceneTree').innerHTML = html || '<div class="empty-panel">No objects found.<br>Create a primitive to get started.</div>'; }
function renderInspector() {
    const host = $('#inspectorContent'), n = scene.active;
    if (!n) {
        host.innerHTML = `<div class="empty-panel">${icon('cursor')}<b>Make something remarkable.</b><p>Select an object to edit its transforms and surface, or add a primitive from the shelf.</p><button class="primary-btn" data-action="create:cube">Create a cube</button></div>`;
        return;
    }
    const t = n.evaluated(scene.frame), heading = `<div class="object-heading"><div class="object-type">${icon(n.mesh ? 'cube' : 'folder')} ${n.mesh ? 'POLYGON MESH' : 'TRANSFORM GROUP'} <span style="margin-left:auto">${n.id.toUpperCase()}</span></div><input id="objectName" aria-label="Object name" value="${esc(n.name)}"><div class="object-meta">${n.mesh ? `${n.mesh.vertices.length.toLocaleString()} vertices · ${n.mesh.faces.length.toLocaleString()} faces` : `${scene.nodes.filter(c => c.parent === n.id).length} direct children`} ${n.keys.length ? ' · Animated' : ''}</div></div>`;
    const material = `<div class="section-title">SURFACE MATERIAL <span>${icon('sphere')}</span></div><div class="material-preview"><div class="material-orb" style="--material:${n.material.color}"></div><div class="material-name">${esc(n.material.name)}<small>STANDARD SURFACE · GGX</small></div></div><div class="property-row"><label for="matColor">Base color</label><input id="matColor" type="color" value="${n.material.color}" data-material="color"><span class="hex-value">${n.material.color.toUpperCase()}</span></div>${[['metallic', 'Metalness', 0, 1, .01], ['roughness', 'Roughness', .07, 1, .01], ['emission', 'Emission', 0, 5, .05]].map(([k, label, min, max, step]) => `<div class="property-row"><label for="mat-${k}">${label}</label><input id="mat-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${n.material[k]}" data-material="${k}"><output>${Number(n.material[k]).toFixed(2)}</output></div>`).join('')}<div class="material-swatches">${Object.entries(PALETTE).map(([key, m]) => `<button data-action="material:${key}" title="${m.name}" style="background:${m.color}" aria-label="Apply ${m.name}"></button>`).join('')}</div>`;
    if (state.inspector === 'channels') {
        host.innerHTML = heading + `<div class="section-title">TRANSFORM <button data-action="resetTransform" title="Reset transform">Reset</button></div><div class="transform-section"><div class="axis-headings"><span></span><span class="axis-x">X</span><span class="axis-y">Y</span><span class="axis-z">Z</span><span></span></div>${[['position', 'Translate', 'p'], ['rotation', 'Rotate', 'r'], ['scale', 'Scale', 's']].map(([k, label, short]) => `<div class="transform-row"><label>${label}</label>${t[short].map((v, i) => `<input aria-label="${label} ${'XYZ'[i]}" class="${n.keys.length ? 'keyed' : ''}" type="number" data-transform="${k}" data-axis="${i}" step="${k === 'rotation' ? 1 : .1}" value="${v.toFixed(3)}">`).join('')}<button data-action="keyframe" title="Set transform keyframe">◇</button></div>`).join('')}<div class="object-flags"><label><input type="checkbox" id="visibleFlag" ${n.visible ? 'checked' : ''}>Visible</label><label><input type="checkbox" id="lockedFlag" ${n.locked ? 'checked' : ''}>Locked</label></div></div>` + (n.mesh ? material : `<div class="empty-panel">Group transforms propagate to every child. Drag nodes in the Outliner to reparent them while preserving their current world pose.</div>`);
    }
    else if (state.inspector === 'material') {
        host.innerHTML = heading + (n.mesh ? material + '<div class="panel-separator"></div><div class="empty-panel">Materials use metallic–roughness GGX shading with a three-light studio setup. Color inputs are interpreted as sRGB and shaded in linear space.</div>' : '<div class="empty-panel">Choose a polygon mesh to edit its surface.</div>');
    }
    else {
        host.innerHTML = heading + `<div class="section-title">OPERATION LOG <span>${icon('clock')}</span></div>` + (n.history.length ? n.history.map((h, i) => `<div class="history-node">${icon(i ? 'subdivide' : 'cube')}<div><b>${esc(h.name)}</b><small>${esc(h.detail || 'Committed topology operation')}</small></div></div>`).join('') : '<div class="empty-panel">No mesh operations yet.</div>') + `<div class="empty-panel">This is a record of committed operations, not a procedural modifier stack. Use Undo to reverse recent edits.</div>`;
    }
    if (n.mesh)
        host.innerHTML += `<div class="panel-separator"></div><div class="section-title">GEOMETRY</div><div class="shape-info"><div><b>${n.mesh.vertices.length.toLocaleString()}</b><span>VERTICES</span></div><div><b>${n.mesh.faces.length.toLocaleString()}</b><span>FACES</span></div><div><b>${(n.mesh.bake().count / 3).toLocaleString()}</b><span>TRIANGLES</span></div></div>`;
}
function updateTransformReadouts() { const n = scene.active; if (!n)
    return; const t = n.evaluated(scene.frame); $$('[data-transform]').forEach(el => { if (el !== document.activeElement)
    el.value = t[{ position: 'p', rotation: 'r', scale: 's' }[el.dataset.transform]][+el.dataset.axis].toFixed(3); }); }
const shelves = { Polygons: [['cube', 'Cube', 'create:cube'], ['sphere', 'Sphere', 'create:sphere'], ['cylinder', 'Cylinder', 'create:cylinder'], ['cone', 'Cone', 'create:cone'], ['torus', 'Torus', 'create:torus'], ['plane', 'Plane', 'create:plane'], ['capsule', 'Capsule', 'create:capsule'], ['rounded', 'Soft box', 'create:roundedBox'], '|', ['extrude', 'Extrude', 'extrude'], ['subdivide', 'Subdivide', 'subdivide'], ['mirror', 'Mirror', 'mirror'], ['combine', 'Combine', 'combine'], '|', ['smooth', 'Smooth', 'smooth'], ['duplicate', 'Duplicate', 'duplicate']], Modeling: [['vertices', 'Vertices', 'vertexMode'], ['face', 'Faces', 'faceMode'], ['cube', 'Objects', 'objectMode'], '|', ['extrude', 'Extrude', 'extrude'], ['subdivide', 'Subdivide', 'subdivide'], ['triangle', 'Triangulate', 'triangulate'], ['mirror', 'Mirror X', 'mirror'], ['combine', 'Combine', 'combine'], ['smooth', 'Smooth', 'smooth'], '|', ['group', 'Group', 'group'], ['duplicate', 'Duplicate', 'duplicate'], ['trash', 'Delete', 'delete']], Animation: [['key', 'Set key', 'keyframe'], ['trash', 'Delete key', 'deleteKey'], ['graph', 'Graph editor', 'graph'], '|', ['play', 'Play / pause', 'play'], ['first', 'First frame', 'firstFrame'], ['last', 'Last frame', 'lastFrame'], ['loop', 'Loop', 'loop'], '|', ['rotate', 'Spin keys', 'spinKeys'], ['move', 'Bounce keys', 'bounceKeys']], Materials: Object.entries(PALETTE).map(([k, m]) => [k, m.name.split(' · ')[1], 'material:' + k]), Rendering: [['camera', 'Capture PNG', 'capture'], ['sliders', 'Settings', 'renderSettings'], '|', ['sphere', 'Lit', 'shaded'], ['wire', 'Wire overlay', 'wireOverlay'], ['cube', 'Wireframe', 'wireframe'], ['sun', 'Shadows', 'toggleShadows'], ['grid', 'Grid', 'toggleGrid'], '|', ['focus', 'Frame object', 'frameSelected'], ['fit', 'Frame all', 'frameAll']] };
function renderShelf(name = state.shelf) { state.shelf = name; $$('[data-shelf]').forEach(b => b.classList.toggle('active', b.dataset.shelf === name)); $('#shelfTools').innerHTML = shelves[name].map(item => item === '|' ? '<span class="shelf-divider"></span>' : `<button class="shelf-tool" data-action="${item[2]}" title="${item[1]}">${name === 'Materials' ? `<span class="swatch-ball" style="background:${PALETTE[item[0]].color}"></span>` : icon(item[0])}<span>${item[1]}</span></button>`).join('') + `<span class="shelf-tail"><kbd>Q</kbd> Select <kbd>W</kbd> Move <kbd>E</kbd> Rotate <kbd>R</kbd> Scale</span>`; }
const menus = { File: [['file', 'New scene', 'new', 'Ctrl N'], ['folder', 'Open scene / OBJ…', 'open', 'Ctrl O'], ['save', 'Save project…', 'save', 'Ctrl S'], '|', ['download', 'Export Wavefront OBJ…', 'exportOBJ'], ['camera', 'Capture viewport PNG…', 'capture'], '|', ['cube', 'Load survey companion', 'demo']], Edit: [['undo', 'Undo', 'undo', 'Ctrl Z'], ['redo', 'Redo', 'redo', 'Ctrl Shift Z'], '|', ['duplicate', 'Duplicate selected', 'duplicate', 'Ctrl D'], ['trash', 'Delete selected', 'delete', 'Del'], '|', ['group', 'Group selection', 'group', 'Ctrl G'], ['folder', 'Ungroup', 'ungroup']], Create: shelves.Polygons.slice(0, 8).map(a => [a[0], a[1], a[2]]), Select: [['cube', 'Object selection', 'objectMode', 'F8'], ['vertices', 'Vertex selection', 'vertexMode', 'F9'], ['face', 'Face selection', 'faceMode', 'F11'], '|', ['fit', 'Select all meshes', 'selectAll', 'Ctrl A'], ['cursor', 'Deselect all', 'deselect', 'Esc']], Modify: [['move', 'Move tool', 'tool:move', 'W'], ['rotate', 'Rotate tool', 'tool:rotate', 'E'], ['scale', 'Scale tool', 'tool:scale', 'R'], '|', ['settings', 'Reset transforms', 'resetTransform'], ['magnet', 'Toggle grid snapping', 'snap', 'X']], Mesh: [['extrude', 'Extrude selected faces…', 'extrude', 'Ctrl E'], ['subdivide', 'Catmull–Clark subdivision', 'subdivide'], ['triangle', 'Triangulate polygons', 'triangulate'], ['mirror', 'Mirror geometry across local X', 'mirror'], ['combine', 'Combine selected meshes', 'combine'], '|', ['smooth', 'Toggle smooth normals', 'smooth']], Display: [['grid', 'Toggle grid', 'toggleGrid'], ['sun', 'Toggle shadows', 'toggleShadows'], ['cube', 'Wireframe', 'wireframe', '4'], ['sphere', 'Shaded', 'shaded', '5'], ['wire', 'Wireframe overlay', 'wireOverlay', '6'], '|', ['focus', 'Frame selected', 'frameSelected', 'F'], ['fit', 'Frame all', 'frameAll', 'A']], Windows: [['graph', 'Animation graph editor', 'graph'], ['sphere', 'Material inspector', 'materialInspector'], ['sliders', 'Render settings', 'renderSettings'], ['keyboard', 'Command history', 'console'], '|', ['panel', 'Toggle outliner', 'toggleLeft'], ['panel', 'Toggle inspector', 'toggleRight'], ['expand', 'Maximize viewport', 'maximize', 'Space']], Help: [['keyboard', 'Keyboard & mouse shortcuts', 'help', '?'], ['help', 'About Kinetra Studio', 'about']] };
function showMenu(items, anchor, x, y) { const menu = $('#dropdown'); menu.innerHTML = items.map(i => i === '|' ? '<hr>' : `<button data-action="${i[2]}">${icon(i[0])}<b style="font-weight:400">${esc(i[1])}</b><span>${i[3] || ''}</span></button>`).join(''); menu.hidden = false; const r = anchor?.getBoundingClientRect(); menu.style.left = Math.min(x ?? r.left, innerWidth - 260) + 'px'; menu.style.top = Math.min(y ?? r.bottom + 3, innerHeight - menu.offsetHeight - 10) + 'px'; }
function setTool(tool) { state.tool = tool; $$('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool)); $('#toolStatus').textContent = { select: 'Select Tool', move: 'Move Tool', rotate: 'Rotate Tool', scale: 'Scale Tool' }[tool]; requestDraw(); }
function setMode(mode) { state.mode = mode; state.components.clear(); $('#componentMode').value = mode; $$('[data-action="vertexMode"],[data-action="faceMode"]').forEach(b => b.classList.toggle('active-toggle', b.dataset.action === mode + 'Mode')); refresh(); toast(mode[0].toUpperCase() + mode.slice(1) + ' selection mode'); }
function selectNode(id, add = false) { scene.select(id, add); state.components.clear(); refresh(); }
function descend(nodes) { const ids = new Set(nodes.map(n => n.id)); let again = true; while (again) {
    again = false;
    for (const n of scene.nodes)
        if (ids.has(n.parent) && !ids.has(n.id)) {
            ids.add(n.id);
            again = true;
        }
} return scene.nodes.filter(n => ids.has(n.id)); }
function selectedRoots() { return scene.selected.filter(n => { let p = scene.get(n.parent); while (p) {
    if (scene.selection.has(p.id))
        return false;
    p = scene.get(p.parent);
} return true; }); }
function frameNodes(nodes) { const b = scene.bounds(nodes), center = V.mul(V.add(b.min, b.max), .5), size = V.len(V.sub(b.max, b.min)); camera.target = center; camera.distance = Math.max(1.5, size * 1.35); requestDraw(); }
/** Decompose representable affine TRS; reject shear rather than silently changing geometry. */
function decompose(matrix) {
    const columns = [[matrix[0], matrix[1], matrix[2]], [matrix[4], matrix[5], matrix[6]], [matrix[8], matrix[9], matrix[10]]];
    const scale = columns.map(V.len);
    if (scale.some(v => v < 1e-9)) throw Error('A singular transform cannot be decomposed.');
    if (V.dot(V.cross(columns[0], columns[1]), columns[2]) < 0) scale[0] *= -1;
    const axes = columns.map((v, i) => V.mul(v, 1 / scale[i]));
    if (Math.abs(V.dot(axes[0], axes[1])) > 1e-4 || Math.abs(V.dot(axes[0], axes[2])) > 1e-4 || Math.abs(V.dot(axes[1], axes[2])) > 1e-4)
        throw Error('This operation would introduce shear. Use local scale, or an unscaled parent group.');
    const y = Math.asin(clamp(-axes[0][2], -1, 1));
    const regular = Math.abs(axes[0][2]) < .9999999;
    const x = regular ? Math.atan2(axes[1][2], axes[2][2]) : Math.atan2(-axes[2][1], axes[1][1]);
    const z = regular ? Math.atan2(axes[0][1], axes[0][0]) : 0;
    return { position: [matrix[12], matrix[13], matrix[14]], scale, rotation: [x, y, z].map(v => v * 180 / Math.PI) };
}
function reparent(n, parent) { scene.update(); let p = parent; while (p) {
    if (p.id === n.id)
        throw Error('A node cannot be parented to itself or a descendant.');
    p = scene.get(p.parent);
} if (n.keys.length)
    throw Error('Reparenting animated nodes is not supported; use an unanimated group above the node.'); const local = parent ? M.mul(M.inverse(parent.world), n.world) : n.world; Object.assign(n, decompose(local)); n.parent = parent?.id || null; }
function syncBase(n) { const t = n.evaluated(scene.frame); n.position = t.p.slice(); n.rotation = t.r.slice(); n.scale = t.s.slice(); }
function commitAnimated(n) { if (state.autoKey || n.keys.length)
    n.setKey(Math.round(scene.frame)); }
function addPrimitive(type) { mutate('Created ' + type, () => { if (!Primitives[type])
    throw Error('Unknown primitive.'); const n = scene.add(new SceneNode(type[0].toUpperCase() + type.slice(1) + ' ' + (scene.nodes.length + 1), Primitives[type]())); n.position = [0, .65, 0]; n.history = [{ name: 'poly' + type, detail: 'Primitive source' }]; scene.select(n.id); state.components.clear(); }); setMode('object'); setTool('move'); }
function duplicate() { mutate('Duplicated selection', () => { const roots = selectedRoots(), nodes = descend(roots), map = new Map(), copies = []; if (!nodes.length)
    throw Error('Select objects to duplicate.'); for (const n of nodes) {
    const c = new SceneNode(n.name + ' copy', n.mesh?.clone(), n.material);
    for (const k of ['position', 'rotation', 'scale'])
        c[k] = n[k].slice();
    c.keys = structuredClone(n.keys);
    c.history = structuredClone(n.history);
    c.visible = n.visible;
    c.parent = n.parent;
    map.set(n.id, c.id);
    copies.push(c);
} for (const c of copies) {
    if (map.has(c.parent))
        c.parent = map.get(c.parent);
    else {
        c.position[0] += .65;
        if (c.keys.length)
            c.keys.forEach(k => k.p[0] += .65);
    }
    scene.add(c);
} scene.selection = new Set(roots.map(n => map.get(n.id))); }); }
function doMesh(op) { const n = requireNode(true); mutate({ subdivide: 'Catmull–Clark subdivision', triangulate: 'Triangulated mesh', smooth: 'Updated shading normals', mirror: 'Mirrored geometry' }[op], () => { const mesh = editableMesh(n); if (op === 'subdivide')
    mesh.subdivide();
else if (op === 'triangulate') {
    mesh.faces = mesh.bake().triangles.map(t => t.ids);
    mesh.touch();
}
else if (op === 'smooth') {
    mesh.smooth = !mesh.smooth;
    mesh.touch();
}
else
    mesh.mirror(0); n.history.push({ name: op, detail: `${mesh.vertices.length} vertices · ${mesh.faces.length} polygons` }); state.components.clear(); }); }
function group() { mutate('Grouped selection', () => { const roots = selectedRoots(); if (!roots.length)
    throw Error('Select objects to group.'); const g = scene.add(new SceneNode('Group ' + (scene.nodes.length + 1))), commonParent = roots.every(n => n.parent === roots[0].parent); if (commonParent) {
    g.parent = roots[0].parent;
    for (const n of roots)
        n.parent = g.id;
}
else
    for (const n of roots)
        reparent(n, g); scene.select(g.id); }); }
function ungroup() { mutate('Ungrouped selection', () => { const g = requireNode(); if (g.mesh)
    throw Error('Select a transform group.'); const children = scene.nodes.filter(n => n.parent === g.id), identity = !g.keys.length && g.position.every(v => Math.abs(v) < 1e-9) && g.rotation.every(v => Math.abs(v) < 1e-9) && g.scale.every(v => Math.abs(v - 1) < 1e-9); for (const n of children) {
    if (identity)
        n.parent = g.parent;
    else
        reparent(n, scene.get(g.parent));
} scene.nodes = scene.nodes.filter(n => n !== g); scene.selection = new Set(children.map(n => n.id)); }); }
function combine() { mutate('Combined meshes', () => { const nodes = scene.selected.filter(n => n.mesh && !n.locked); if (nodes.length < 2)
    throw Error('Select at least two mesh objects using Shift.'); if (nodes.some(n => n.keys.length || scene.nodes.some(c => c.parent === n.id)))
    throw Error('Combine requires static leaf meshes.'); scene.update(); const vertices = [], faces = []; for (const n of nodes) {
    const offset = vertices.length;
    vertices.push(...n.mesh.vertices.map(v => M.point(n.world, v)));
    faces.push(...n.mesh.faces.map(f => f.map(i => i + offset)));
} const n = scene.add(new SceneNode('Combined mesh', new Mesh(vertices, faces), nodes[0].material)); n.history = [{ name: 'combine', detail: `Merged ${nodes.length} objects using the first object’s material` }]; scene.nodes = scene.nodes.filter(x => !nodes.includes(x)); scene.select(n.id); }); }
function deleteSelection() { if (state.mode !== 'object' && state.components.size) {
    const n = requireNode(true);
    mutate('Deleted components', () => { const mesh = editableMesh(n); mesh.faces = mesh.faces.filter((f, i) => state.mode === 'face' ? !state.components.has(i) : !f.some(v => state.components.has(v))); mesh.touch(); state.components.clear(); });
}
else
    mutate('Deleted selection', () => { scene.removeSelected(); state.components.clear(); }); }
function extrude() { const n = requireNode(true); if (state.mode !== 'face' || !state.components.size) {
    setMode('face');
    toast('Click a polygon face, then choose Extrude.');
    return;
} openModal('Extrude polygon faces', `<p>Extrude ${state.components.size} selected face${state.components.size === 1 ? '' : 's'} along their individual local normals. Side walls are created and the new caps remain selected.</p><label>Distance <input id="extrudeAmount" type="number" step=".1" value=".25" style="width:100px;margin-left:10px"></label><div class="modal-actions"><button class="secondary-btn" data-action="closeModal">Cancel</button><button class="primary-btn" id="applyExtrude">Extrude faces</button></div>`); $('#applyExtrude').onclick = () => safe(() => { const d = Number($('#extrudeAmount').value); if (!Number.isFinite(d) || Math.abs(d) > 10000)
    throw Error('Enter a finite extrusion distance below 10,000 units.'); mutate('Extruded faces', () => { const mesh = editableMesh(n); state.components = new Set(mesh.extrude([...state.components], d)); n.history.push({ name: 'polyExtrudeFace', detail: `Individual extrusion · ${d} units` }); }); $('#modal').close(); }); }
function setFrame(frame) { stopPlayback(); scene.frame = clamp(Math.round(frame), scene.start, scene.end); $('#currentFrame').value = scene.frame; updateTransformReadouts(); requestDraw(); }
function stopPlayback() { if (state.playing) {
    state.playing = false;
    scene.frame = Math.round(scene.frame);
    $('#playBtn').innerHTML = icon('play');
    requestDraw();
} }
function togglePlayback() { if (state.playing) {
    stopPlayback();
    return;
} state.playing = true; state.playTime = performance.now(); state.playFrame = scene.frame; $('#playBtn').innerHTML = icon('pause'); requestDraw(); }
function keyframe() { const selected = scene.selected; if (!selected.length)
    throw Error('Select objects to animate.'); mutate('Set key at frame ' + Math.round(scene.frame), () => { for (const n of selected) {
    syncBase(n);
    n.setKey(Math.round(scene.frame));
} }); }
function jumpKey(direction) { const frames = [...new Set(scene.nodes.flatMap(n => n.keys.map(k => k.frame)))].sort((a, b) => a - b); setFrame(direction < 0 ? (frames.filter(f => f < scene.frame).at(-1) ?? scene.start) : (frames.find(f => f > scene.frame) ?? scene.end)); }
function animationPreset(kind) { mutate('Created ' + kind + ' animation', () => { const n = requireNode(); syncBase(n); const p = n.position.slice(), r = n.rotation.slice(); n.keys = []; for (const [frame, t] of [[scene.start, 0], [Math.round((scene.start + scene.end) / 2), .5], [scene.end, 1]]) {
    n.position = p.slice();
    n.rotation = r.slice();
    if (kind === 'spin')
        n.rotation[1] += 360 * t;
    else
        n.position[1] += t === .5 ? 1.8 : 0;
    n.setKey(frame, kind === 'spin' ? 'linear' : 'smooth');
} n.position = p; n.rotation = r; }); }
function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
function saveProject() { download(new Blob([JSON.stringify(scene.serialize(), null, 2)], { type: 'application/json' }), 'kinetra-project.kinetra.json'); scheduleSave(); toast('Project exported as Kinetra Scene JSON'); }
async function openFile(file) { if (file.size > 50 * 1024 * 1024)
    throw Error('Import limit: 50 MB.'); const text = await file.text(); if (file.name.toLowerCase().endsWith('.obj')) {
    const mesh = parseOBJ(text);
    mutate('Imported ' + file.name, () => { const n = scene.add(new SceneNode(file.name.replace(/\.obj$/i, ''), mesh)); n.history = [{ name: 'OBJ import', detail: `${mesh.vertices.length} vertices` }]; scene.select(n.id); });
    frameNodes(scene.selected);
}
else {
    const data = JSON.parse(text);
    mutate('Opened ' + file.name, () => scene.load(data));
    state.components.clear();
    frameNodes(scene.nodes);
} $('.scene-caption').style.display = 'none'; refresh(); }
async function capture() { const blob = await renderer.capture(scene, camera); if (!blob)
    throw Error('Could not capture the canvas.'); download(blob, 'kinetra-render.png'); toast(`Saved ${renderer.canvas.width} × ${renderer.canvas.height} PNG`); }
function openModal(title, html) { stopPlayback(); $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; fillIcons($('#modal')); if (!$('#modal').open)
    $('#modal').showModal(); }
function help() { const keys = [['Select / Move / Rotate / Scale', 'Q / W / E / R'], ['Orbit camera', 'Alt + left drag'], ['Pan camera', 'Middle drag'], ['Dolly camera', 'Wheel / Alt + right drag'], ['Frame selection / all', 'F / A'], ['Object / Vertex / Face', 'F8 / F9 / F11'], ['Multi-select objects / faces', 'Shift + click'], ['Box select objects', 'Drag in empty space'], ['Grid snapping (0.25 units)', 'X'], ['Wireframe / Shaded / Overlay', '4 / 5 / 6'], ['Set transform key', 'S'], ['Play / pause', 'Alt + V'], ['Previous / next frame', '← / →'], ['Maximize viewport', 'Space'], ['Duplicate / Group', 'Ctrl/⌘ D / G'], ['Undo / Redo', 'Ctrl/⌘ Z / Shift Z'], ['Delete / deselect', 'Delete / Esc'], ['Save / Open', 'Ctrl/⌘ S / O']]; openModal('Make yourself at home', `<p>A familiar 3D workspace, rebuilt for the browser. Use the shelf to create meshes, the Outliner to organize them, and Channels to make precise changes.</p><div class="shortcuts">${keys.map(k => `<div class="shortcut"><span>${k[0]}</span><kbd>${k[1]}</kbd></div>`).join('')}</div><h3>POLYGON MODELING</h3><p>Choose Face mode, click a polygon, and use Extrude. In Vertex mode, select vertices and use the Move tool. The handles constrain transforms to world axes; dragging outside a handle transforms in the screen plane. Shift-click adds to the selection.</p><h3>ANIMATION</h3><p>Set a key with S, scrub to another frame, change a transform, and set another key. Editing an already animated node updates its key at the current frame. Open the Graph editor to edit key values and interpolation.</p><h3>PROJECTS & COMMANDS</h3><p>Projects autosave to this browser. Export a JSON project for a portable copy, or use OBJ for polygon geometry. Try <code>create sphere</code>, <code>move 0 2 0</code>, <code>frame 60</code>, or <code>help</code> in the command bar.</p>`); }
function renderSettings() { openModal('Viewport rendering', `<div class="render-grid"><div class="setting"><label>Exposure <output id="exposureOutput">${scene.environment.exposure.toFixed(2)}</output></label><input id="exposureSetting" type="range" min=".2" max="3" step=".01" value="${scene.environment.exposure}"><small>Linear light → ACES tone mapping → sRGB</small></div><div class="setting"><label>Environment fill <output id="ambientOutput">${scene.environment.ambient.toFixed(2)}</output></label><input id="ambientSetting" type="range" min="0" max="1.5" step=".01" value="${scene.environment.ambient}"><small>Hemispheric ambient illumination</small></div><div class="setting"><label><input id="settingsShadows" type="checkbox" ${scene.environment.shadows ? 'checked' : ''}> Contact & cast shadows</label><small>2048² directional shadow map · 3 × 3 PCF</small></div><div class="setting"><label>Graphics backend</label><b>${renderer.backend}</b><br><small>${renderer.backend === 'WebGPU' ? 'Native WGSL · 4× MSAA' : 'GLSL ES 3.00 · browser antialiasing'}</small></div></div><div class="modal-note">Captures export the shaded viewport at its current pixel resolution, without editor handles or overlays. This is a real-time raster renderer, not a path tracer.</div><div class="modal-actions"><button class="secondary-btn" data-action="closeModal">Done</button><button class="primary-btn" data-action="capture">${icon('camera')} Capture PNG</button></div>`); for (const [id, k, out] of [['exposureSetting', 'exposure', 'exposureOutput'], ['ambientSetting', 'ambient', 'ambientOutput']]) {
    const el = $('#' + id);
    el.oninput = () => { scene.environment[k] = Number(el.value); $('#' + out).value = Number(el.value).toFixed(2); requestDraw(); };
    el.onchange = scheduleSave;
} $('#settingsShadows').onchange = e => { scene.environment.shadows = e.target.checked; refresh(); scheduleSave(); }; }
function about() { openModal('Kinetra Studio', `<div style="display:flex;gap:15px;align-items:center"><span class="brandmark">K</span><div><b style="font-size:20px;font-weight:400">3D creation, in motion.</b><br><span style="color:#809ca7;font-size:11px">Version 0.1.0 · Plain JavaScript · Zero runtime dependencies</span></div></div><p>An independent Maya-inspired modeling and animation workspace. Native WebGPU rendering, editable polygon topology, hierarchical transforms, and portable scene files.</p><h3>IMPLEMENTED</h3><p>GGX metallic–roughness shading; PCF shadow maps; editable primitives; face extrusion; Catmull–Clark subdivision; vertex manipulation; world-axis handles; multi-selection; grouping; OBJ import/export; transform animation with linear, smooth, and step interpolation; graph editing; undo/redo and bounded local autosave.</p><h3>BOUNDARIES</h3><p>This release is not a feature-equivalent replacement for Autodesk Maya. It does not read or write Maya .ma/.mb files and does not implement a NURBS kernel, UV unwrapping or texture painting, skeletal skinning, IK, cloth/fluid dynamics, Boolean solids, audio, a path tracer, or a plug-in system. Operation history is a log, not a non-destructive dependency graph. OBJ support is polygon geometry, not MTL materials.</p><p style="font-size:10px">Kinetra Studio is an independent implementation. Autodesk and Maya are trademarks of their respective owner; no affiliation is implied.</p>`); }
function execute(action, anchor) { if (action.startsWith('create:'))
    return addPrimitive(action.split(':')[1]); if (action.startsWith('tool:'))
    return setTool(action.split(':')[1]); if (action.startsWith('material:'))
    return mutate('Applied material', () => { const material = PALETTE[action.split(':')[1]]; if (!material)
        throw Error('Unknown material'); requireNode(true); for (const n of scene.selected)
        if (n.mesh)
            n.material = { ...material }; }); switch (action) {
    case 'new': return openModal('Create a new scene', `<p>The current project will be replaced. Export it first to keep a portable copy.</p><div class="modal-actions"><button class="secondary-btn" data-action="save">Save current project</button><button class="primary-btn" data-action="confirmNew">New empty scene</button></div>`);
    case 'confirmNew':
        mutate('Created empty scene', () => { scene.nodes = []; scene.selection.clear(); scene.frame = 1; scene.name = 'Untitled scene'; state.components.clear(); });
        $('.scene-caption').style.display = 'none';
        $('#modal').close();
        return;
    case 'demo':
        mutate('Loaded survey companion', () => makeDemo(scene));
        camera.target = [0, 1.9, 0];
        camera.distance = 8.7;
        $('.scene-caption').style.display = 'block';
        return;
    case 'save': return saveProject();
    case 'open':
        $('#fileInput').click();
        return;
    case 'exportOBJ':
        scene.update();
        download(new Blob([exportOBJ(scene.nodes.filter(n => n.effectiveVisible))], { type: 'text/plain' }), 'kinetra-scene.obj');
        return toast('Exported visible meshes to OBJ');
    case 'capture': return capture();
    case 'undo':
        state.components.clear();
        return toast(history.undo() ? 'Undo complete' : 'Nothing to undo');
    case 'redo':
        state.components.clear();
        return toast(history.redo() ? 'Redo complete' : 'Nothing to redo');
    case 'duplicate': return duplicate();
    case 'delete': return deleteSelection();
    case 'group': return group();
    case 'ungroup': return ungroup();
    case 'combine': return combine();
    case 'subdivide':
    case 'triangulate':
    case 'smooth':
    case 'mirror': return doMesh(action);
    case 'extrude': return extrude();
    case 'objectMode': return setMode('object');
    case 'vertexMode': return setMode('vertex');
    case 'faceMode': return setMode('face');
    case 'selectAll':
        scene.selection = new Set(scene.nodes.filter(n => n.mesh && !n.locked).map(n => n.id));
        return refresh();
    case 'deselect':
        scene.selection.clear();
        state.components.clear();
        return refresh();
    case 'snap':
        state.snap = !state.snap;
        $('#snapBtn').classList.toggle('active-toggle', state.snap);
        return toast('Grid snapping ' + (state.snap ? 'on · 0.25 units' : 'off'));
    case 'frameSelected': return frameNodes(scene.selected.length ? descend(scene.selected) : scene.nodes);
    case 'frameAll': return frameNodes(scene.nodes);
    case 'resetTransform': return mutate('Reset transforms', () => { const n = requireNode(); n.position = [0, 0, 0]; n.rotation = [0, 0, 0]; n.scale = [1, 1, 1]; commitAnimated(n); });
    case 'toggleGrid':
        scene.environment.grid = !scene.environment.grid;
        refresh();
        return scheduleSave();
    case 'toggleShadows':
        scene.environment.shadows = !scene.environment.shadows;
        refresh();
        return scheduleSave();
    case 'wireframe':
        renderer.mode = 'wireframe';
        $('#shadingLabel').textContent = 'WIREFRAME';
        $('#shadedBtn').classList.remove('active');
        return requestDraw();
    case 'shaded':
        renderer.mode = 'shaded';
        $('#shadingLabel').textContent = 'LIT';
        $('#shadedBtn').classList.add('active');
        return requestDraw();
    case 'wireOverlay':
        renderer.showWire = !renderer.showWire;
        $('#wireCheck').checked = renderer.showWire;
        return requestDraw();
    case 'keyframe': return keyframe();
    case 'deleteKey': return mutate('Removed keyframe', () => { const n = requireNode(); n.keys = n.keys.filter(k => k.frame !== Math.round(scene.frame)); });
    case 'autoKey':
        state.autoKey = !state.autoKey;
        $('#autoKeyBtn').classList.toggle('active', state.autoKey);
        return toast('Auto key ' + (state.autoKey ? 'on' : 'off'));
    case 'spinKeys': return animationPreset('spin');
    case 'bounceKeys': return animationPreset('bounce');
    case 'firstFrame': return setFrame(scene.start);
    case 'lastFrame': return setFrame(scene.end);
    case 'prevFrame': return setFrame(scene.frame - 1);
    case 'nextFrame': return setFrame(scene.frame + 1);
    case 'prevKey': return jumpKey(-1);
    case 'nextKey': return jumpKey(1);
    case 'play': return togglePlayback();
    case 'loop':
        state.loop = !state.loop;
        $('#loopBtn').classList.toggle('active', state.loop);
        return;
    case 'help': return help();
    case 'about': return about();
    case 'renderSettings': return renderSettings();
    case 'graph': return graphEditor();
    case 'closeModal':
        $('#modal').close();
        return;
    case 'console': return openModal('Command history', `<div class="console-log">${esc(state.logs.join('\n') || 'No commands yet.')}</div><p>The command bar accepts deterministic editor commands, not arbitrary JavaScript. Type <code>help</code> for the command grammar.</p>`);
    case 'materialInspector':
        state.inspector = 'material';
        $$('[data-inspector]').forEach(b => b.classList.toggle('active', b.dataset.inspector === 'material'));
        return renderInspector();
    case 'toggleLeft':
        $('#leftPanel').classList.toggle('hidden-panel');
        return requestDraw();
    case 'toggleRight':
        $('#rightPanel').classList.toggle('hidden-panel');
        return requestDraw();
    case 'maximize':
        $('.editor').classList.toggle('maximized');
        return requestDraw();
    case 'collapseTree':
        if (state.collapsed.size)
            state.collapsed.clear();
        else
            scene.nodes.filter(n => !n.mesh).forEach(n => state.collapsed.add(n.id));
        return renderTree();
    case 'createMenu': return showMenu(menus.Create, anchor || $('.panel-title'));
    case 'viewMenu': return showMenu([['home', 'Perspective', 'view:perspective'], ['plane', 'Top orthographic', 'view:top'], ['face', 'Front orthographic', 'view:front'], ['face', 'Right orthographic', 'view:right'], '|', ['focus', 'Frame selection', 'frameSelected'], ['fit', 'Frame all', 'frameAll']], anchor);
    case 'shadingMenu': return showMenu(menus.Display.slice(2, 5), anchor);
    default: if (action.startsWith('view:')) {
        state.view = action.split(':')[1];
        camera.preset(state.view);
        $('#viewName').textContent = state.view === 'perspective' ? 'persp' : state.view;
        $('.viewport-label').childNodes[0].textContent = state.view.toUpperCase();
        requestDraw();
    }
} }
function drawTimeline() { const canvas = $('#timelineCanvas'); if (!canvas)
    return; const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr)); const c = canvas.getContext('2d'); c.scale(dpr, dpr); const w = r.width, h = r.height, pad = 15, span = scene.end - scene.start, x = f => pad + (f - scene.start) / span * (w - pad * 2); c.clearRect(0, 0, w, h); c.font = '9px -apple-system, Segoe UI, sans-serif'; c.textAlign = 'center'; const step = span <= 120 ? 5 : Math.ceil(span / 24 / 5) * 5; for (let f = scene.start; f <= scene.end; f++) {
    const px = x(f);
    if (f === scene.start || f === scene.end || f % step === 0) {
        c.fillStyle = '#93a4af';
        c.fillText(f, px, 15);
        c.strokeStyle = '#56656e';
        c.beginPath();
        c.moveTo(px, 22);
        c.lineTo(px, h - 8);
        c.stroke();
    }
    else if (span < 300) {
        c.strokeStyle = '#3c4a53';
        c.beginPath();
        c.moveTo(px, h - 17);
        c.lineTo(px, h - 8);
        c.stroke();
    }
} const animated = scene.selected.some(n => n.keys.length) ? scene.selected : scene.nodes; const frames = new Set(animated.flatMap(n => n.keys.map(k => k.frame))); for (const f of frames) {
    const px = x(f);
    c.fillStyle = '#ba9c63';
    c.beginPath();
    c.moveTo(px, h - 9);
    c.lineTo(px + 3, h - 5);
    c.lineTo(px, h - 1);
    c.lineTo(px - 3, h - 5);
    c.closePath();
    c.fill();
} const px = x(scene.frame); c.fillStyle = '#629e8733'; c.fillRect(px - 6, 0, 12, h); c.strokeStyle = '#8cd8bd'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, .5); c.lineTo(px, h); c.stroke(); c.fillStyle = '#9ddfc6'; c.beginPath(); c.moveTo(px - 5, 0); c.lineTo(px + 5, 0); c.lineTo(px, 6); c.closePath(); c.fill(); $('#timeRuler').setAttribute('aria-valuenow', Math.round(scene.frame)); $('#timeRuler').setAttribute('aria-valuemin', scene.start); $('#timeRuler').setAttribute('aria-valuemax', scene.end); }
function componentIndices(n) { if (state.mode === 'vertex')
    return [...state.components].filter(i => n.mesh.vertices[i]); if (state.mode === 'face')
    return [...new Set([...state.components].flatMap(i => n.mesh.faces[i] || []))]; return []; }
function gizmoOrigin(n) { if (n.mesh && state.mode !== 'object' && state.components.size) {
    const ids = componentIndices(n);
    if (ids.length)
        return M.point(n.world, V.mul(ids.reduce((p, i) => V.add(p, n.mesh.vertices[i]), [0, 0, 0]), 1 / ids.length));
} return M.point(n.world, [0, 0, 0]); }
function drawOverlay() { const canvas = $('#overlayCanvas'), r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
} const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height); state.gizmo = []; const n = scene.active; if (!n || !n.effectiveVisible)
    return; if (n.mesh && state.mode !== 'object') {
    if (state.mode === 'face') {
        for (const i of state.components) {
            const f = n.mesh.faces[i];
            if (!f)
                continue;
            const points = f.map(v => camera.project(M.point(n.world, n.mesh.vertices[v])));
            if (points.some(p => p[2] < 0 || p[2] > 1))
                continue;
            c.beginPath();
            points.forEach((p, j) => j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
            c.closePath();
            c.fillStyle = '#edb95955';
            c.strokeStyle = '#f5c474';
            c.lineWidth = 1.5;
            c.fill();
            c.stroke();
        }
    }
    else if (n.mesh.vertices.length < 15000) {
        for (let i = 0; i < n.mesh.vertices.length; i++) {
            const p = camera.project(M.point(n.world, n.mesh.vertices[i]));
            if (p[2] < 0 || p[2] > 1)
                continue;
            c.beginPath();
            c.arc(p[0], p[1], state.components.has(i) ? 4 : 2.2, 0, Math.PI * 2);
            c.fillStyle = state.components.has(i) ? '#f3c779' : '#9ed8c9';
            c.fill();
        }
    }
} if (state.tool === 'select')
    return; const center = gizmoOrigin(n), p = camera.project(center); if (p[2] < 0 || p[2] > 1)
    return; const length = camera.distance * .135, colors = ['#ed8589', '#a3d891', '#8bb8f3']; for (let axis = 0; axis < 3; axis++) {
    const v = [0, 0, 0];
    v[axis] = length;
    c.strokeStyle = colors[axis];
    c.fillStyle = colors[axis];
    c.lineWidth = 2;
    c.shadowColor = '#0e1e25';
    c.shadowBlur = 3;
    if (state.tool === 'rotate') {
        const path = [];
        for (let j = 0; j <= 64; j++) {
            const angle = j / 64 * Math.PI * 2, q = center.slice();
            q[(axis + 1) % 3] += Math.cos(angle) * length;
            q[(axis + 2) % 3] += Math.sin(angle) * length;
            path.push(camera.project(q));
        }
        c.beginPath();
        path.forEach((q, j) => j ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]));
        c.stroke();
        state.gizmo.push({ axis, path, center: p, world: center });
    }
    else {
        const direction = state.tool === 'scale' && state.mode === 'object' ? V.mul(V.norm(M.vector(n.world, v)), length) : v;
        const end = camera.project(V.add(center, direction)), dx = end[0] - p[0], dy = end[1] - p[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        c.beginPath();
        c.moveTo(p[0], p[1]);
        c.lineTo(end[0], end[1]);
        c.stroke();
        if (state.tool === 'scale') {
            c.fillRect(end[0] - 4, end[1] - 4, 8, 8);
        }
        else {
            c.beginPath();
            c.moveTo(end[0], end[1]);
            c.lineTo(end[0] - ux * 12 + uy * 4, end[1] - uy * 12 - ux * 4);
            c.lineTo(end[0] - ux * 12 - uy * 4, end[1] - uy * 12 + ux * 4);
            c.closePath();
            c.fill();
        }
        c.font = 'bold 10px sans-serif';
        c.fillText('XYZ'[axis], end[0] + ux * 12 - 3, end[1] + uy * 12 + 3);
        state.gizmo.push({ axis, path: [p, end], center: p, world: center, dir: [ux, uy] });
    }
} c.shadowBlur = 0; c.fillStyle = '#d7e3d7'; c.strokeStyle = '#233732'; c.lineWidth = 1; c.fillRect(p[0] - 4, p[1] - 4, 8, 8); c.strokeRect(p[0] - 4, p[1] - 4, 8, 8); $('#coordStatus').textContent = `X ${center[0].toFixed(2)}  Y ${center[1].toFixed(2)}  Z ${center[2].toFixed(2)}`; }
function pointSegmentDistance(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); }
function hitGizmo(x, y) { let best = null, distance = 10; for (const g of state.gizmo)
    for (let i = 1; i < g.path.length; i++) {
        const d = pointSegmentDistance([x, y], g.path[i - 1], g.path[i]);
        if (d < distance) {
            distance = d;
            best = g;
        }
    } return best; }
function localXY(e, element = $('#overlayCanvas')) { const r = element.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function startTransform(e, x, y, gizmo) { const nodes = selectedRoots().filter(n => !n.locked); if (!nodes.length)
    return; history.begin(); scene.update(); const snapshots = nodes.map(n => { syncBase(n); return { node: n, p: n.position.slice(), r: n.rotation.slice(), s: n.scale.slice(), world: n.world.slice(), parentWorld: scene.get(n.parent)?.world.slice() || M.identity() }; }); let vertices = null; const n = scene.active; if (state.mode !== 'object' && n?.mesh && state.components.size) {
    vertices = { node: n, ids: componentIndices(n), base: n.mesh.vertices.map(p => p.slice()), world: n.world.slice(), cloned: false };
} state.drag = { kind: 'transform', x, y, axis: gizmo?.axis ?? -1, dir: gizmo?.dir || [1, 0], snapshots, vertices, gizmo, tool: state.tool, origin: gizmoOrigin(n), moved: false }; $('#overlayCanvas').setPointerCapture(e.pointerId); }
function pointerDown(e) { if (e.button > 2)
    return; const [x, y] = localXY(e); $('#dropdown').hidden = true; stopPlayback(); if (e.altKey || e.button === 1) {
    e.preventDefault();
    state.drag = { kind: e.button === 1 ? 'pan' : e.button === 2 ? 'dolly' : 'orbit', x, y, yaw: camera.yaw, pitch: camera.pitch, distance: camera.distance, lastX: x, lastY: y };
    $('#overlayCanvas').setPointerCapture(e.pointerId);
    return;
} if (e.button === 2) {
    state.drag = { kind: 'context', x, y };
    return;
} const gizmo = state.tool === 'select' ? null : hitGizmo(x, y); if (gizmo) {
    startTransform(e, x, y, gizmo);
    return;
} const hit = scene.pick(camera.ray(x, y)); if (state.mode === 'vertex' && scene.active?.mesh) {
    const n = scene.active;
    let best = -1, d = 11;
    for (let i = 0; i < n.mesh.vertices.length; i++) {
        const p = camera.project(M.point(n.world, n.mesh.vertices[i])), dist = Math.hypot(p[0] - x, p[1] - y);
        if (dist < d && p[2] >= 0 && p[2] <= 1) {
            d = dist;
            best = i;
        }
    }
    if (best >= 0) {
        if (!e.shiftKey && !state.components.has(best))
            state.components.clear();
        if (e.shiftKey && state.components.has(best))
            state.components.delete(best);
        else
            state.components.add(best);
        refresh();
        if (state.tool !== 'select')
            startTransform(e, x, y, null);
        return;
    }
} if (hit) {
    if (state.mode === 'object') {
        if (!scene.selection.has(hit.node.id) || e.shiftKey)
            selectNode(hit.node.id, e.shiftKey);
        if (state.tool !== 'select')
            startTransform(e, x, y, null);
    }
    else {
        if (scene.active !== hit.node) {
            scene.select(hit.node.id);
            state.components.clear();
        }
        if (state.mode === 'face') {
            if (!e.shiftKey && !state.components.has(hit.face))
                state.components.clear();
            if (e.shiftKey && state.components.has(hit.face))
                state.components.delete(hit.face);
            else
                state.components.add(hit.face);
        }
        refresh();
        if (state.tool !== 'select' && state.components.size)
            startTransform(e, x, y, null);
    }
}
else {
    state.drag = { kind: 'marquee', x, y, shift: e.shiftKey, moved: false };
    $('#overlayCanvas').setPointerCapture(e.pointerId);
} }
function pointerMove(e) { const [x, y] = localXY(e), d = state.drag; if (!d) {
    $('#overlayCanvas').style.cursor = hitGizmo(x, y) ? 'grab' : state.tool === 'select' ? 'default' : 'crosshair';
    return;
} const dx = x - d.x, dy = y - d.y; if (d.kind === 'orbit') {
    camera.yaw = d.yaw - dx * .008;
    camera.pitch = clamp(d.pitch + dy * .006, -1.54, 1.54);
    state.view = 'perspective';
    camera.projection = 'perspective';
    requestDraw();
    return;
} if (d.kind === 'pan') {
    camera.pan(x - d.lastX, y - d.lastY);
    d.lastX = x;
    d.lastY = y;
    requestDraw();
    return;
} if (d.kind === 'dolly') {
    camera.distance = clamp(d.distance * Math.exp((dx + dy) * .009), .3, 1000);
    requestDraw();
    return;
} if (d.kind === 'marquee') {
    d.moved = Math.hypot(dx, dy) > 4;
    const m = $('#marquee');
    m.hidden = !d.moved;
    Object.assign(m.style, { left: Math.min(d.x, x) + 'px', top: Math.min(d.y, y) + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
    return;
} if (d.kind !== 'transform')
    return; d.moved = Math.hypot(dx, dy) > 1; if (!d.moved)
    return; const units = camera.distance / Math.max(1, camera.height) * .83; let amount = d.axis < 0 ? 0 : (dx * d.dir[0] + dy * d.dir[1]) * units; const right = [camera.view[0], camera.view[4], camera.view[8]], up = [camera.view[1], camera.view[5], camera.view[9]]; let delta = d.axis < 0 ? V.add(V.mul(right, dx * units), V.mul(up, -dy * units)) : [0, 0, 0]; if (d.axis >= 0)
    delta[d.axis] = amount; if (state.snap)
    delta = delta.map(v => Math.round(v / .25) * .25); let angle = (dx - dy) * .6; if (state.snap)
    angle = Math.round(angle / 15) * 15; const rot = [0, 0, 0]; rot[d.axis < 0 ? 1 : d.axis] = angle; const scale = clamp(Math.exp((d.axis < 0 ? dx - dy : dx * d.dir[0] + dy * d.dir[1]) * .009), .02, 50), scaleVec = [1, 1, 1]; if (d.axis < 0)
    scaleVec.fill(scale);
else
    scaleVec[d.axis] = scale; let transform; if (d.tool === 'move')
    transform = M.compose(delta, [0, 0, 0], [1, 1, 1]);
else
    transform = M.mul(M.compose(d.origin, [0, 0, 0], [1, 1, 1]), M.mul(M.compose([0, 0, 0], d.tool === 'rotate' ? rot : [0, 0, 0], d.tool === 'scale' ? scaleVec : [1, 1, 1]), M.compose(V.mul(d.origin, -1), [0, 0, 0], [1, 1, 1]))); if (d.vertices) {
    const v = d.vertices;
    if (!v.cloned) {
        editableMesh(v.node);
        v.cloned = true;
    }
    const local = M.mul(M.inverse(v.world), M.mul(transform, v.world));
    for (const i of v.ids)
        v.node.mesh.vertices[i] = M.point(local, v.base[i]);
    v.node.mesh.touch();
}
else
    for (const s of d.snapshots) {
        if (d.tool === 'move') {
            s.node.position = V.add(s.p, M.vector(M.inverse(s.parentWorld), delta));
        }
        else if (d.tool === 'scale') {
            // Local-axis scaling is representable without introducing affine shear.
            s.node.scale = s.s.map((value, axis) => value * (d.axis < 0 || d.axis === axis ? scale : 1));
        }
        else {
            const world = M.mul(transform, s.world), local = M.mul(M.inverse(s.parentWorld), world);
            Object.assign(s.node, decompose(local));
        }
        commitAnimated(s.node);
    } scene.update(); updateTransformReadouts(); requestDraw(); }
function pointerUp(e) { const d = state.drag; if (!d)
    return; const [x, y] = localXY(e); state.drag = null; if ($('#overlayCanvas').hasPointerCapture(e.pointerId))
    $('#overlayCanvas').releasePointerCapture(e.pointerId); if (d.kind === 'transform') {
    history.commit(d.tool[0].toUpperCase() + d.tool.slice(1) + (d.vertices ? ' components' : ' selection'));
    refresh();
}
else if (d.kind === 'context') {
    showMenu([['cube', 'Object selection', 'objectMode'], ['vertices', 'Vertex selection', 'vertexMode'], ['face', 'Face selection', 'faceMode'], '|', ['extrude', 'Extrude face', 'extrude'], ['subdivide', 'Subdivide mesh', 'subdivide'], ['duplicate', 'Duplicate', 'duplicate'], ['trash', 'Delete', 'delete'], '|', ['focus', 'Frame selection', 'frameSelected']], null, e.clientX, e.clientY);
}
else if (d.kind === 'marquee') {
    $('#marquee').hidden = true;
    if (!d.shift)
        scene.selection.clear();
    if (d.moved) {
        const left = Math.min(x, d.x), right = Math.max(x, d.x), top = Math.min(y, d.y), bottom = Math.max(y, d.y);
        for (const n of scene.nodes) {
            if (!n.mesh || n.locked || !n.effectiveVisible)
                continue;
            const p = camera.project(M.point(n.world, [0, 0, 0]));
            if (p[0] >= left && p[0] <= right && p[1] >= top && p[1] <= bottom && p[2] > 0 && p[2] < 1)
                scene.selection.add(n.id);
        }
    }
    state.components.clear();
    refresh();
} }
function graphEditor() { let n = scene.active; if (!n?.keys.length)
    n = scene.nodes.find(n => n.keys.length) || scene.active; if (!n) {
    toast('Create an object and set a keyframe first.');
    return;
} state.graph = { id: n.id, property: 'r', axis: 1 }; openModal('Animation · Graph editor', `<div class="graph-toolbar"><select id="graphNode" aria-label="Animated object">${scene.nodes.filter(x => x.keys.length || x === n).map(x => `<option value="${x.id}" ${x === n ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><select id="graphChannel" aria-label="Animation channel"><option value="p:0">Translate X</option><option value="p:1">Translate Y</option><option value="p:2">Translate Z</option><option value="r:0">Rotate X</option><option value="r:1" selected>Rotate Y</option><option value="r:2">Rotate Z</option><option value="s:0">Scale X</option><option value="s:1">Scale Y</option><option value="s:2">Scale Z</option></select><select id="graphInterp" aria-label="Interpolation"><option value="smooth">Smoothstep</option><option value="linear">Linear</option><option value="step">Step</option></select></div><canvas id="graphCanvas" class="graph-canvas"></canvas><div id="graphTable"></div><p style="font-size:10px">Drag a key point to change its time and value. Table edits are precise. Interpolation is applied to all transform keys on the chosen object.</p>`); $('#graphNode').onchange = e => { state.graph.id = e.target.value; paintGraph(); }; $('#graphChannel').onchange = e => { const [p, a] = e.target.value.split(':'); state.graph.property = p; state.graph.axis = +a; paintGraph(); }; $('#graphInterp').onchange = e => safe(() => { mutate('Changed interpolation', () => scene.get(state.graph.id).keys.forEach(k => k.interpolation = e.target.value)); paintGraph(); }); $('#graphTable').addEventListener('change', e => safe(() => { const el = e.target; if (!el.dataset.key)
    return; const n = scene.get(state.graph.id), index = +el.dataset.key - 1, k = n.keys[index], value = Number(el.value); if (!Number.isFinite(value))
    throw Error('Invalid keyframe value'); mutate('Edited animation key', () => { if (el.dataset.field === 'frame') {
    const f = clamp(Math.round(value), scene.start, scene.end);
    if (n.keys.some(other => other !== k && other.frame === f))
        throw Error('A key already exists at that frame.');
    k.frame = f;
    n.keys.sort((a, b) => a.frame - b.frame);
}
else {
    if (state.graph.property === 's' && Math.abs(value) < .00001)
        throw Error('Scale cannot be zero.');
    k[state.graph.property][state.graph.axis] = value;
} }); paintGraph(); })); $('#graphTable').addEventListener('click', e => { const b = e.target.closest('[data-remove-key]'); if (!b)
    return; safe(() => { mutate('Deleted animation key', () => scene.get(state.graph.id).keys.splice(+b.dataset.removeKey, 1)); paintGraph(); }); }); const canvas = $('#graphCanvas'); let drag = null; canvas.onpointerdown = e => { const [x, y] = localXY(e, canvas), g = state.graph; let index = g.points.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < 10); if (index < 0)
    return; history.begin(); drag = { key: scene.get(g.id).keys[index], mapping: { ...g.mapping } }; canvas.setPointerCapture(e.pointerId); }; canvas.onpointermove = e => { if (!drag)
    return; const [x, y] = localXY(e, canvas), m = drag.mapping, g = state.graph, n = scene.get(g.id), f = clamp(Math.round(scene.start + (x - m.left) / (m.width) * (scene.end - scene.start)), scene.start, scene.end); if (!n.keys.some(k => k !== drag.key && k.frame === f))
    drag.key.frame = f; let value = m.max - (y - m.top) / m.height * (m.max - m.min); if (g.property === 's')
    value = Math.max(.001, value); drag.key[g.property][g.axis] = value; n.keys.sort((a, b) => a.frame - b.frame); paintGraph(false, m); requestDraw(); }; const finish = () => { if (!drag)
    return; drag = null; history.commit('Moved animation key'); paintGraph(); }; canvas.onpointerup = finish; canvas.onpointercancel = finish; paintGraph(); }
function paintGraph(updateTable = true, fixedMapping = null) { if (!$('#graphCanvas'))
    return; const g = state.graph, n = scene.get(g.id); if (!n)
    return; const canvas = $('#graphCanvas'), r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = r.width * dpr; canvas.height = r.height * dpr; const c = canvas.getContext('2d'); c.scale(dpr, dpr); const values = n.keys.map(k => k[g.property][g.axis]); let min = Math.min(0, ...values), max = Math.max(1, ...values), padding = (max - min) * .22; min -= padding; max += padding; const m = fixedMapping || { left: 48, top: 20, width: r.width - 68, height: r.height - 47, min, max }; g.mapping = m; const x = f => m.left + (f - scene.start) / (scene.end - scene.start) * m.width, y = v => m.top + (m.max - v) / (m.max - m.min) * m.height; c.clearRect(0, 0, r.width, r.height); c.font = '9px sans-serif'; c.strokeStyle = '#354951'; c.fillStyle = '#7f9fa8'; for (let i = 0; i <= 6; i++) {
    const f = scene.start + (scene.end - scene.start) * i / 6, px = x(f);
    c.beginPath();
    c.moveTo(px, m.top);
    c.lineTo(px, m.top + m.height);
    c.stroke();
    c.textAlign = 'center';
    c.fillText(Math.round(f), px, r.height - 10);
} for (let i = 0; i <= 4; i++) {
    const v = m.min + (m.max - m.min) * i / 4, py = y(v);
    c.beginPath();
    c.moveTo(m.left, py);
    c.lineTo(m.left + m.width, py);
    c.stroke();
    c.textAlign = 'right';
    c.fillText(v.toFixed(1), m.left - 9, py + 3);
} c.strokeStyle = ['#d98888', '#99cca1', '#83b3da'][g.axis]; c.lineWidth = 2; c.beginPath(); for (let px = 0; px <= m.width; px++) {
    const frame = scene.start + px / m.width * (scene.end - scene.start), value = n.evaluated(frame)[g.property][g.axis];
    if (px)
        c.lineTo(m.left + px, y(value));
    else
        c.moveTo(m.left, y(value));
} c.stroke(); g.points = []; for (const k of n.keys) {
    const p = [x(k.frame), y(k[g.property][g.axis])];
    g.points.push(p);
    c.fillStyle = '#d7ca98';
    c.strokeStyle = '#192b2e';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(p[0], p[1] - 5);
    c.lineTo(p[0] + 5, p[1]);
    c.lineTo(p[0], p[1] + 5);
    c.lineTo(p[0] - 5, p[1]);
    c.closePath();
    c.fill();
    c.stroke();
} c.strokeStyle = '#b9dac299'; c.lineWidth = 1; c.beginPath(); c.moveTo(x(scene.frame), m.top); c.lineTo(x(scene.frame), m.top + m.height); c.stroke(); if (updateTable) {
    $('#graphTable').innerHTML = n.keys.length ? `<table class="key-list"><thead><tr><th>Key</th><th>Frame</th><th>Value</th><th>Interpolation</th><th></th></tr></thead><tbody>${n.keys.map((k, i) => `<tr><td>◇ ${i + 1}</td><td><input aria-label="Key ${i + 1} frame" data-key="${i + 1}" data-field="frame" type="number" value="${k.frame}"></td><td><input aria-label="Key ${i + 1} value" data-key="${i + 1}" data-field="value" type="number" step=".1" value="${k[g.property][g.axis].toFixed(3)}"></td><td>${esc(k.interpolation)}</td><td><button data-remove-key="${i}" title="Delete key">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<p>No transform keys on this object. Select it and press S to set a key.</p>';
    $('#graphInterp').value = n.keys[0]?.interpolation || 'smooth';
} }
function command(text) { const args = text.trim().split(/\s+/), cmd = args.shift()?.toLowerCase(); if (!cmd)
    return; log('› ' + text); const vector = () => { if (args.length !== 3 || args.some(a => !Number.isFinite(Number(a))))
    throw Error('Expected three finite numeric coordinates.'); return args.map(Number); }; if (cmd === 'create')
    return addPrimitive(args[0]?.toLowerCase()); if (cmd === 'select') {
    const name = args.join(' ').toLowerCase(), n = scene.nodes.find(n => n.name.toLowerCase() === name) || scene.nodes.find(n => n.name.toLowerCase().includes(name));
    if (!n)
        throw Error('No matching node.');
    selectNode(n.id);
    return;
} if (['move', 'rotate', 'scale'].includes(cmd)) {
    const value = vector();
    if (cmd === 'scale' && value.some(v => Math.abs(v) < .001))
        throw Error('Scale must be non-zero.');
    return mutate('Command: ' + cmd, () => { const n = requireNode(); syncBase(n); n[{ move: 'position', rotate: 'rotation', scale: 'scale' }[cmd]] = value; commitAnimated(n); });
} if (cmd === 'frame') {
    const f = Number(args[0]);
    if (!Number.isFinite(f))
        throw Error('Expected a frame number');
    return setFrame(f);
} if (cmd === 'rename')
    return mutate('Renamed object', () => requireNode().name = args.join(' ').slice(0, 128) || 'Object'); if (cmd === 'help') {
    toast('Commands: create TYPE; select NAME; move/rotate/scale X Y Z; frame N; rename NAME; duplicate; delete; undo; redo; save; keyframe; play');
    return;
} const aliases = { focus: 'frameSelected', key: 'keyframe', grid: 'toggleGrid' }; const action = aliases[cmd] || cmd; if (['duplicate', 'delete', 'undo', 'redo', 'save', 'keyframe', 'play', 'subdivide', 'smooth', 'mirror', 'group', 'frameSelected', 'toggleGrid', 'extrude'].includes(action))
    return execute(action); throw Error('Unknown command. Type help for supported commands.'); }
function installEvents() {
    fillIcons();
    $('#menus').innerHTML = Object.keys(menus).map(name => `<button data-menu="${name}">${name}</button>`).join('');
    document.addEventListener('click', e => { const action = e.target.closest('[data-action]'); if (action) {
        e.stopPropagation();
        const keep = ['viewMenu', 'shadingMenu', 'createMenu'].includes(action.dataset.action);
        if (!keep)
            $('#dropdown').hidden = true;
        safe(() => execute(action.dataset.action, action));
        return;
    } const menu = e.target.closest('[data-menu]'); if (menu) {
        showMenu(menus[menu.dataset.menu], menu);
        return;
    } if (!e.target.closest('#dropdown'))
        $('#dropdown').hidden = true; const tool = e.target.closest('[data-tool]'); if (tool) {
        setTool(tool.dataset.tool);
        return;
    } const shelf = e.target.closest('[data-shelf]'); if (shelf) {
        renderShelf(shelf.dataset.shelf);
        return;
    } const tab = e.target.closest('[data-inspector]'); if (tab) {
        state.inspector = tab.dataset.inspector;
        $$('[data-inspector]').forEach(b => b.classList.toggle('active', b === tab));
        renderInspector();
        return;
    } const view = e.target.closest('[data-view]'); if (view)
        safe(() => execute('view:' + view.dataset.view)); });
    $('#sceneSearch').oninput = renderTree;
    $('#sceneTree').onclick = e => safe(() => { const collapse = e.target.closest('[data-collapse]'); if (collapse) {
        const id = collapse.dataset.collapse;
        if (state.collapsed.has(id))
            state.collapsed.delete(id);
        else
            state.collapsed.add(id);
        return renderTree();
    } const eye = e.target.closest('[data-visibility]'); if (eye) {
        return mutate('Changed visibility', () => { const n = scene.get(eye.dataset.visibility); n.visible = !n.visible; });
    } const row = e.target.closest('[data-node]'); if (row)
        selectNode(row.dataset.node, e.shiftKey || e.ctrlKey || e.metaKey); });
    $('#sceneTree').ondblclick = e => { if (e.target.closest('button'))
        return; const row = e.target.closest('[data-node]'); if (row) {
        selectNode(row.dataset.node);
        frameNodes(descend(scene.selected));
    } };
    let draggingId;
    $('#sceneTree').ondragstart = e => { draggingId = e.target.closest('[data-node]')?.dataset.node; e.dataTransfer.setData('text/plain', draggingId || ''); e.dataTransfer.effectAllowed = 'move'; };
    $('#sceneTree').ondragover = e => { if (draggingId)
        e.preventDefault(); };
    $('#sceneTree').ondrop = e => { e.preventDefault(); const target = e.target.closest('[data-node]')?.dataset.node; if (draggingId && target !== draggingId)
        safe(() => mutate('Reparented object', () => reparent(scene.get(draggingId), scene.get(target)))); draggingId = null; };
    $('#sceneTree').ondragend = () => draggingId = null;
    $('#inspectorContent').addEventListener('change', e => safe(() => { const el = e.target, n = scene.active; if (!n)
        return; if (el.dataset.transform) {
        const value = Number(el.value);
        if (!Number.isFinite(value) || Math.abs(value) > 1e7)
            throw Error('Enter a finite transform within ±10,000,000.');
        if (el.dataset.transform === 'scale' && Math.abs(value) < .001)
            throw Error('Scale magnitude must be at least 0.001.');
        mutate('Edited transform', () => { syncBase(n); n[el.dataset.transform][+el.dataset.axis] = value; commitAnimated(n); });
    }
    else if (el.id === 'objectName')
        mutate('Renamed object', () => n.name = el.value.trim().slice(0, 128) || 'Object');
    else if (el.id === 'visibleFlag' || el.id === 'lockedFlag')
        mutate('Updated object flags', () => n[el.id === 'visibleFlag' ? 'visible' : 'locked'] = el.checked);
    else if (el.dataset.material) {
        if (history.pending)
            history.commit('Edited material');
        else
            mutate('Edited material', () => n.material[el.dataset.material] = el.dataset.material === 'color' ? el.value : Number(el.value));
    } }));
    $('#inspectorContent').addEventListener('input', e => { const el = e.target, n = scene.active; if (!n || !el.dataset.material)
        return; if (!history.pending)
        history.begin(); n.material[el.dataset.material] = el.dataset.material === 'color' ? el.value : Number(el.value); if (el.nextElementSibling?.tagName === 'OUTPUT')
        el.nextElementSibling.value = Number(el.value).toFixed(2); if (el.dataset.material === 'color') {
        $('.material-orb')?.style.setProperty('--material', el.value);
        $('.hex-value').textContent = el.value.toUpperCase();
    } requestDraw(); });
    $('#componentMode').onchange = e => setMode(e.target.value);
    for (const id of ['workspaceSelect', 'menuSet'])
        $('#' + id).onchange = e => { const value = e.target.value; $('#workspaceSelect').value = value; $('#menuSet').value = value; renderShelf(value === 'Animation' ? 'Animation' : value === 'Rendering' ? 'Rendering' : 'Polygons'); if (value === 'Rendering')
            state.inspector = 'material';
        else
            state.inspector = 'channels'; $$('[data-inspector]').forEach(b => b.classList.toggle('active', b.dataset.inspector === state.inspector)); renderInspector(); };
    $('#gridCheck').onchange = e => { scene.environment.grid = e.target.checked; requestDraw(); scheduleSave(); };
    $('#shadowCheck').onchange = e => { scene.environment.shadows = e.target.checked; requestDraw(); scheduleSave(); };
    $('#wireCheck').onchange = e => { renderer.showWire = e.target.checked; requestDraw(); };
    $('#currentFrame').onchange = e => setFrame(Number(e.target.value) || scene.start);
    $('#startFrame').onchange = e => mutate('Updated playback range', () => { scene.start = clamp(Math.round(Number(e.target.value)) || 1, 1, scene.end - 1); scene.frame = clamp(scene.frame, scene.start, scene.end); });
    $('#endFrame').onchange = e => mutate('Updated playback range', () => { scene.end = clamp(Math.round(Number(e.target.value)) || 120, scene.start + 1, 100000); scene.frame = clamp(scene.frame, scene.start, scene.end); });
    $('#fpsSelect').onchange = e => { scene.fps = Number(e.target.value); refresh(); scheduleSave(); };
    const ruler = $('#timeRuler');
    let scrubbing = false;
    const scrub = e => { const [x] = localXY(e, ruler), width = ruler.clientWidth; setFrame(scene.start + clamp((x - 15) / (width - 30), 0, 1) * (scene.end - scene.start)); };
    ruler.onpointerdown = e => { scrubbing = true; ruler.setPointerCapture(e.pointerId); scrub(e); };
    ruler.onpointermove = e => { if (scrubbing)
        scrub(e); };
    ruler.onpointerup = () => scrubbing = false;
    ruler.onpointercancel = () => scrubbing = false;
    ruler.onkeydown = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setFrame(scene.frame + (e.key === 'ArrowLeft' ? -1 : 1));
    } };
    const overlay = $('#overlayCanvas');
    overlay.onpointerdown = e => safe(() => pointerDown(e));
    overlay.onpointermove = e => safe(() => {
        try { pointerMove(e); }
        catch (error) {
            if (state.drag?.kind === 'transform' && history.pending) {
                scene.load(JSON.parse(history.pending));
                history.pending = null;
            }
            state.drag = null;
            if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
            refresh();
            throw error;
        }
    });
    overlay.onpointerup = e => safe(() => pointerUp(e));
    overlay.onpointercancel = e => { if (state.drag?.kind === 'transform' && history.pending) {
        scene.load(JSON.parse(history.pending));
        history.pending = null;
    } state.drag = null; $('#marquee').hidden = true; refresh(); };
    overlay.oncontextmenu = e => e.preventDefault();
    overlay.addEventListener('wheel', e => { e.preventDefault(); camera.distance = clamp(camera.distance * Math.exp(e.deltaY * .001), .3, 1000); requestDraw(); }, { passive: false });
    overlay.ondblclick = e => { const [x, y] = localXY(e), hit = scene.pick(camera.ray(x, y)); if (hit) {
        selectNode(hit.node.id);
        frameNodes(scene.selected);
    } };
    $('#fileInput').onchange = e => { const f = e.target.files[0]; if (f)
        safe(() => openFile(f)); e.target.value = ''; };
    const viewport = $('#viewport');
    viewport.ondragover = e => { if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        if (!$('.file-drop')) {
            const div = document.createElement('div');
            div.className = 'file-drop';
            div.textContent = 'Drop an OBJ or Kinetra project';
            viewport.append(div);
        }
    } };
    viewport.ondragleave = e => { if (!viewport.contains(e.relatedTarget))
        $('.file-drop')?.remove(); };
    viewport.ondrop = e => { e.preventDefault(); $('.file-drop')?.remove(); const f = e.dataTransfer.files[0]; if (f)
        safe(() => openFile(f)); };
    $('#commandInput').onkeydown = e => { if (e.key === 'Enter') {
        safe(() => command(e.target.value));
        e.target.value = '';
        e.target.blur();
    } };
    $('#modal').addEventListener('click', e => { if (e.target === $('#modal')) {
        const r = $('#modal').getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
            $('#modal').close();
    } });
    document.addEventListener('keydown', e => { if (e.target.matches('input,select,textarea') || e.target.isContentEditable || $('#modal').open)
        return; const key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let action; if (ctrl) {
        action = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: 'save', o: 'open', n: 'new', d: 'duplicate', g: 'group', a: 'selectAll', e: 'extrude' }[key];
    }
    else if (e.altKey && key === 'v')
        action = 'play';
    else if (!e.altKey) {
        action = { q: 'tool:select', w: 'tool:move', e: 'tool:rotate', r: 'tool:scale', f: 'frameSelected', a: 'frameAll', s: 'keyframe', x: 'snap', '4': 'wireframe', '5': 'shaded', '6': 'wireOverlay', ' ': 'maximize', delete: 'delete', backspace: 'delete', escape: 'deselect', arrowleft: 'prevFrame', arrowright: 'nextFrame', f8: 'objectMode', f9: 'vertexMode', f11: 'faceMode', '?': 'help' }[key];
    } if (action) {
        e.preventDefault();
        safe(() => execute(action));
    } });
    new ResizeObserver(() => requestDraw()).observe($('#viewport'));
    new ResizeObserver(() => drawTimeline()).observe($('#timeRuler'));
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        stopPlayback();
    else
        requestDraw(); });
    window.addEventListener('beforeunload', () => { try {
        localStorage.setItem('kinetra.scene.v1', JSON.stringify(scene.serialize()));
    }
    catch { } renderer?.dispose(); state.disposed = true; });
    window.addEventListener('error', e => log(e.message, true));
    window.addEventListener('unhandledrejection', e => log(String(e.reason), true));
}
async function boot() { makeDemo(scene); camera.target = [0, 1.9, 0]; camera.distance = 8.7; try {
    const saved = localStorage.getItem('kinetra.scene.v1');
    if (saved) {
        scene.load(JSON.parse(saved));
        log('Restored local project');
    }
}
catch (e) {
    log('Could not restore local project: ' + e.message, true);
} renderer = new Renderer($('#gpuCanvas'), (status, error) => { $('#engineStatus').textContent = status; $('#rendererInfo').textContent = status; if (error)
    toast(status, true); }); try {
    await renderer.init();
    installEvents();
    setTool('move');
    renderShelf();
    refresh();
    $('#bootScreen').remove();
    log('Kinetra Studio ready · ' + renderer.backend);
    requestDraw();
}
catch (e) {
    console.error(e);
    $('#bootScreen').innerHTML = `<span class="brandmark">K</span><div>Graphics initialization failed</div><small>${esc(e.message)}</small><small>Use HTTPS or localhost and enable hardware acceleration.</small>`;
} window.kinetra = { scene, camera, renderer, history, state, execute: (action) => safe(() => execute(action)), refresh, command, openFile, Primitives, Mesh, M, V, version: '0.1.0' }; }
boot();
