# PIP-07 / Survey companion

The application starts with the editable PIP-07 sample: 46 polygon meshes, three transform groups, original procedural materials and a keyed head-gimbal survey motion.

[Download the portable Kinetra scene](https://wieslawsoltes.github.io/KinetraStudio/examples/pip-07.kinetra.json).

The source of truth is `makeDemo` in `src/scene.js`. The exported JSON is generated during Pages packaging rather than checked in. Regenerate the exact original scene from the repository root with Node 22:

```sh
node --input-type=module - <<'JS'
import { Scene, makeDemo } from './src/scene.js';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('examples', { recursive: true });
await writeFile('examples/pip-07.kinetra.json', JSON.stringify(makeDemo(new Scene()).serialize()));
JS
```

Open the result through **File → Open scene / OBJ**, or drag it into the viewport. **File → Load survey companion** rebuilds the sample directly inside the editor.
