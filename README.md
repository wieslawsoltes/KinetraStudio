# Kinetra Studio 0.1.0

[Open Kinetra Studio](https://wieslawsoltes.github.io/KinetraStudio/) · [Standalone HTML](https://wieslawsoltes.github.io/KinetraStudio/kinetra-studio.html) · [Source ZIP](https://wieslawsoltes.github.io/KinetraStudio/kinetra-studio-source.zip) · [Sample project](https://wieslawsoltes.github.io/KinetraStudio/examples/pip-07.kinetra.json) · [Build and deployment](https://github.com/wieslawsoltes/KinetraStudio/actions/workflows/pages.yml)

A working, independent Maya-inspired polygon modeling and transform-animation workspace, built with plain HTML, CSS and JavaScript. Native WebGPU/WGSL rendering with a WebGL2 fallback. No runtime frameworks, third-party rendering libraries, external fonts, CDN assets, npm dependencies or telemetry.

This is a functional engineering foundation, **not a feature-equivalent Autodesk Maya replacement or a production-certified DCC suite**. The UI, engine and procedural demo are original. Autodesk and Maya are trademarks of their respective owners; this project is not affiliated with Autodesk.

![Actual browser workspace](https://wieslawsoltes.github.io/KinetraStudio/test-results/workspace.png)

## Run

From this directory:

```sh
python3 -m http.server 8765
```

Open **http://localhost:8765/** for the modular source app. Python is only a convenient static server; any static host works.

To generate the self-contained build, run `npm run build`, then open **http://localhost:8765/dist/**. Generated HTML, screenshots and sample JSON are published by the Pages workflow rather than checked into the source branch.

`dist/index.html` is the complete standalone application. It can be deployed as one file. Use HTTPS in deployment, or localhost in development. Opening through a `file:` URL or a sandboxed HTML preview may restrict graphics APIs or local storage. WebGPU availability depends on the browser, platform, GPU and secure context. The app reports the actual backend and automatically falls back to WebGL2. Append `?webgl` to force the fallback.

There is **no `npm install` step**. Optional Node commands:

```sh
npm start       # Python static server, port 8765
npm test        # Node's built-in test runner
npm run build   # Regenerate dist/index.html from readable source
```

The implementation and build were exercised with Node 22. Changes to source require rebuilding only when using the standalone distribution.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` runs kernel tests, syntax checks, a standalone build, and the browser interaction suite. Successful pushes to `main` publish the resulting `dist/` directory through the official GitHub Pages deployment actions. Pull requests run the build and checks without deploying.

The deployment includes the application, downloadable standalone HTML, source ZIP, procedural sample scene, documentation, test screenshots, JSON browser results, build metadata and SHA-256 checksums. Deployment verification compares the public HTML digest and recorded commit against the workflow's source commit.

- [Published build metadata](https://wieslawsoltes.github.io/KinetraStudio/build-info.json)
- [Published browser results](https://wieslawsoltes.github.io/KinetraStudio/test-results/browser-report.json)
- [Published kernel results](https://wieslawsoltes.github.io/KinetraStudio/test-results/kernel-report.txt)
- [Published asset checksums](https://wieslawsoltes.github.io/KinetraStudio/SHA256SUMS)

The Pages workflow requires the repository's Pages publishing source to be **GitHub Actions**. It uses job-scoped permissions: source reads for building, and `pages: write` plus `id-token: write` only for deployment. It does not push generated commits or require a personal access token. The source archive is generated from the exact workflow commit; build outputs are separate published assets.

## Implemented capabilities

| Area | Implementation |
| --- | --- |
| Workspace | Menus, workflow selector, shelves, hierarchical Outliner, transform toolbar, Channels/Material/History inspector, viewport overlays, timeline, graph editor, command bar and dialogs |
| Navigation | Orbit, pan, dolly, perspective and top/front/right orthographic presets, selection framing, scene framing and viewport maximization |
| Selection | Object-space triangle BVH picking, closest object hit, Shift multi-select, object marquee selection, vertex and polygon face selection |
| Transforms | Interactive move/rotate/local-scale handles; precise TRS fields; grid and angle snapping; group hierarchy; static reparenting; duplicate, delete, visibility and locking |
| Primitives | Cube, sphere, cylinder, cone, torus, plane, capsule and rounded box |
| Polygon editing | Individual face extrusion, Catmull–Clark subdivision, vertex/face transforms, component deletion, geometry mirroring, triangulation, mesh combination and smooth/flat normals |
| Materials | Metallic–roughness GGX shading, color, roughness, metalness, emission and reusable surface presets |
| Lighting | Three fixed studio lights, hemispheric ambient, exposure, directional depth shadows with 3×3 PCF, procedural grid and distance fog |
| Native WebGPU | WGSL, explicit pipelines/bind groups, 4× MSAA, 2048² depth shadow texture, persistent revisioned geometry buffers, shader diagnostics and device-loss reporting |
| WebGL2 fallback | GLSL ES 3.00 implementation of the same lighting model, depth texture shadows, browser antialiasing and context-loss reporting |
| Animation | TRS keys, timeline scrubbing, playback, loop/range/FPS settings, auto-key, key deletion, linear/smoothstep/step interpolation, spin/bounce presets and editable curve points/key tables |
| Persistence | Versioned JSON project save/load, debounced local autosave, validated geometry import and shared-mesh identity preservation |
| Interchange | Wavefront OBJ polygon import/export and viewport PNG export; drag-and-drop project/OBJ input |
| Editing history | Atomic snapshot transactions, failed-operation rollback, redo truncation, coalesced drag operations and approximate bounded history memory |
| Commands | A deliberately restricted parser for modeling commands, rather than arbitrary JavaScript `eval` |

The supplied **PIP-07 / Survey companion** scene contains 49 nodes: 46 meshes and 3 transform groups. Its head gimbal includes an animated survey motion. Source primitives, materials and all geometry are procedural, with no external asset downloads.

## Controls

| Action | Input |
| --- | --- |
| Select / Move / Rotate / Scale | Q / W / E / R |
| Orbit | Alt + left drag |
| Pan | Middle drag, including Alt + middle drag |
| Dolly / Zoom | Alt + right drag / mouse wheel |
| Object / Vertex / Face mode | F8 / F9 / F11 |
| Add/remove selection | Shift + click |
| Frame selection / Frame all | F / A |
| Set a transform key | S |
| Play / Pause | Alt + V, or transport button |
| Previous / Next frame | Left / Right arrow |
| Wireframe / Shaded / Wire overlay | 4 / 5 / 6 |
| Toggle snapping | X |
| Maximize viewport | Space |
| Undo / Redo | Ctrl/Command + Z / Ctrl/Command + Shift + Z |
| Duplicate / Group | Ctrl/Command + D / Ctrl/Command + G |
| Extrude selected faces | Ctrl/Command + E |
| Save / Open project | Ctrl/Command + S / Ctrl/Command + O |
| Delete | Delete or Backspace |
| Help | ? |

Keyboard shortcuts do not execute while a text field or modal dialog owns focus. Some browsers reserve function keys; selection modes are also available in the toolbar and Select menu.

### First modeling edit

Create a cube from the Polygons shelf. Press F to frame it, choose Face mode, click a visible polygon and choose Extrude. Enter a distance; the operation creates real cap and side-wall geometry. Undo, then choose Subdivide to run Catmull–Clark. Switch to Vertex mode to manipulate components.

### First animation edit

Select an object and press S at frame 1. Move the current frame to 60, change a transform channel, and inspect the generated key. Once an object has keys, transform changes commit a key at the current frame. Open the Graph editor from the timeline, choose the object/channel, and drag a key or edit its frame/value in the table. Playback evaluates these transforms, including parent transforms.

### Persistence

Use **Save project** to download a portable `.kinetra.json` scene. Local autosave is best-effort, debounced by 650 ms, and may be restricted by browser permissions or storage quota. The title bar reports the outcome. Do not use browser-local storage as the only copy of important work.

Projects contain topology, TRS, hierarchy, materials, visibility/locking, keys, selection, timeline range and environment settings. Camera position, panel arrangement, GPU resources and undo stacks are not serialized. Download the [sample project](https://wieslawsoltes.github.io/KinetraStudio/examples/pip-07.kinetra.json), or regenerate it from the source using the instructions in `examples/README.md`.

## Engine structure

```text
index.html                    Workspace markup and controls
styles.css                    Application tokens, layout and control styling
src/math.js                   Vectors, matrices, camera, projection and ray tests
src/mesh.js                   Polygon topology, triangulation, subdivision and BVH
src/scene.js                  Scene graph, animation, serialization and transactions
src/renderer.js               WebGPU + WebGL2 backends, shading and GPU resources
src/icons.js                  Original inline SVG interface icons
src/app.js                    Tools, event routing, inspectors, playback and commands
build.mjs                     Dependency-free single-file packager
scripts/prepare-pages.mjs     Sample export, asset staging, metadata and checksums
.github/workflows/pages.yml   Test, build, publish and verify GitHub Pages
examples/                     Procedural sample instructions
 tests/kernel.test.js         Numerical, geometry, import and history tests
 tests/browser_check.py       Browser interaction and rendering checks
 test-results/                Initial validation notes; generated reports/screenshots
 dist/index.html              Generated self-contained deployable app
```

Matrices are column-major and the world is right-handed with Y up. The camera uses zero-to-one clip-space depth; the WebGL shader converts it to the WebGL clip-depth convention. Position/rotation/scale are stored independently; rotations are Euler degrees. Normal transforms are inverse-transpose matrices. Arbitrary affine shear is not represented as editable TRS: decomposition rejects it, and object scale handles operate in local axes. An identity group can preserve animated child curves; arbitrary animated reparenting is rejected rather than silently changing animation.

Mesh edits invalidate triangulation, edge data, normals and the CPU BVH through revision changes. Only changed geometry is uploaded. Scene instances sharing a mesh reuse its GPU buffers. This is shared geometry storage, **not hardware-instanced draw submission**. Per-object materials/transforms have their own uniform data. The renderer releases GPU resources that are no longer referenced by the visible render list.

The color pipeline uses an approximate gamma-2.2 input conversion, linear lighting, an ACES-inspired tone-mapping approximation and output conversion. It is not a color-managed ACES/OCIO implementation. The viewport timing indicator measures CPU frame work/submission, not GPU execution time or a synthetic FPS estimate. No large-scene performance claims have been established.

The history stores before/after JSON snapshots. Its budget is approximately 28 MiB of UTF-16 snapshot payload and up to 40 entries, retaining at least the newest entry even if that entry exceeds the budget. Transient serialization allocations and runtime object overhead are outside that estimate.

### Developer access

The application exposes `window.kinetra` for inspection and development:

```js
// In the browser developer console, after initialization:
kinetra.command('create sphere');
kinetra.command('move 2 1 0');
kinetra.command('rotate 0 45 0');
kinetra.command('scale 1.5 1.5 1.5');
kinetra.execute('keyframe');
kinetra.command('frame 60');
kinetra.command('move -2 2 0');
kinetra.execute('graph');

// Read-only diagnostics and scene serialization:
console.log(kinetra.renderer.backend);
console.log(kinetra.renderer.drawCalls);
const project = kinetra.scene.serialize();
```

The public development object also exposes the scene, camera, history, renderer, mesh/primitive classes and math helpers. Direct mutations bypass UI validation and may bypass undo/autosave; use the normal editor commands for document edits.

## Verification

Initial supplied test run: **29 kernel tests and 27 browser interaction checks passed**. The Pages workflow reruns these suites and publishes fresh reports and screenshots. See `test-results/VALIDATION.md` for the original validation boundaries and the published reports for the deployed build.

Kernel coverage includes 500 deterministic matrix inverse round trips, camera rays, normal transforms, primitive winding, Catmull–Clark boundary behavior, extrusion, mirroring, clone independence, cache/BVH invalidation, BVH versus brute-force intersections, concave polygon triangulation, OBJ handling, hierarchical selection/visibility, scene validation, identifier/prototype-injection rejection, animation interpolation and atomic undo/redo.

Browser checks exercise actual controls and pointer interaction: transforms, undo/redo, primitive/material creation, face picking/extrusion, axis-handle dragging, timeline/key editing, playback, graph edits, animated grouping, combination, file-input OBJ import, render modes and PNG capture. Screenshots document the actual application, not visual mockups.

**Backend disclosure:** the initial browser test environment could run Chromium/SwiftShader WebGL2 but could not navigate to a secure application origin. Tests used an opaque offline document. The native WebGPU backend was implemented and reviewed, but **was not runtime-validated in that run**. The Pages CI interaction suite also deliberately uses the offline harness to exercise the fallback. Zero errors in its browser report refer to the exercised WebGL2 path, not proof of native WebGPU conformance. Persistent local storage cannot be exercised in that opaque document either. Native WebGPU, actual hardware performance, secure-origin persistence and cross-browser behavior remain explicit validation targets. The post-deployment HTTP check verifies published bytes and source identity, not graphics correctness.

To repeat browser checks, install Python Playwright as a development-only dependency and provide an installed Chromium executable:

```sh
python3 -m pip install playwright==1.57.0
python3 -m http.server 8765
# In another terminal:
python3 tests/browser_check.py --url http://localhost:8765 --chromium /path/to/chromium
```

On a Linux software-rendering CI host with Chromium:

```sh
npm run build
python3 tests/browser_check.py --offline --chromium /usr/bin/chromium
```

The offline test cannot validate WebGPU or local persistence. The harness contains CI-oriented browser launch flags; they are not required or recommended for normal application use. Playwright is a development-only dependency, pinned to the version used for the supplied baseline; it is not loaded by the application.

## Scope boundaries

This version does **not** implement Maya `.ma`/`.mb`, NURBS, solid Boolean operations, skeletal rigging, skinning, IK, UV unwrapping, image textures, MTL import, texture painting, cloth/fluids/particles, path tracing, Arnold, plug-in APIs or arbitrary script execution. Mesh History is a record of committed operations, not a non-destructive dependency graph.

Animation uses Euler TRS and step/linear/smoothstep segments, not quaternion curves or editable Bezier tangents. Transform scale channels should not cross zero. The scene uses fixed studio lights, not editable light nodes. Vertex component picking is screen-proximity based and does not perform depth-occlusion filtering. Face extrusion is individual-face extrusion, not region extrusion with a shared boundary. OBJ import uses polygon positions and rebuilds normals; it does not preserve UVs or material groups. Combination retains the first mesh's material.

The directional shadow frustum is centered on the demo area (approximately ±8 light-space units). Large or distant scenes may require editing `Renderer.lightVP`. The renderer does not yet implement draw instancing, visibility culling, LOD, worker-side geometry processing or a scalable scene-wide spatial index. Picking has a per-mesh BVH but still visits candidate scene nodes. Geometry operations are synchronous. Simple planar concave polygons are triangulated with ear clipping; self-intersections, holes and arbitrary non-manifold repair are outside this kernel's scope.

Subdivision refuses an input above 60,000 faces; imported mesh limits are defensive ceilings rather than validated interactive performance targets. The engine is intentionally transparent about these boundaries.

## References

- [W3C WebGPU specification](https://www.w3.org/TR/webgpu/)
- [W3C WGSL specification](https://www.w3.org/TR/WGSL/)
- [MDN GPU interface and secure-context requirement](https://developer.mozilla.org/en-US/docs/Web/API/GPU)
- [Chrome WebGPU troubleshooting and localhost setup](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [Autodesk Maya interface overview, reference only](https://help.autodesk.com/view/MAYAUL/2023/ENU/?guid=GUID-F4FCE554-1FA5-447A-8835-63EB43D2690B)
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## License

MIT. See `LICENSE`. All interface assets and demo geometry in this distribution are included with the source.
