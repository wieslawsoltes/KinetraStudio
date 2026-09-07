import { readFile, writeFile, mkdir, cp, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, join } from 'node:path';
import { Scene, makeDemo } from '../src/scene.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const standalone = await readFile(join(dist, 'index.html'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(join(root, 'examples'), { recursive: true });
await mkdir(join(dist, 'examples'), { recursive: true });
const demo = JSON.stringify(makeDemo(new Scene()).serialize());
await writeFile(join(root, 'examples/pip-07.kinetra.json'), demo);
await writeFile(join(dist, 'examples/pip-07.kinetra.json'), demo);
await copyFile(join(dist, 'index.html'), join(dist, 'kinetra-studio.html'));
await writeFile(join(dist, '.nojekyll'), '');
for (const name of ['README.md', 'LICENSE']) {
    await copyFile(join(root, name), join(dist, name));
}
await cp(join(root, 'test-results'), join(dist, 'test-results'), { recursive: true });
const browser = JSON.parse(await readFile(join(root, 'test-results/browser-report.json'), 'utf8'));
await writeFile(join(dist, 'build-info.json'), JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    commit: process.env.GITHUB_SHA || null,
    builtAt: new Date().toISOString(),
    indexSha256: sha256(standalone),
    indexBytes: standalone.byteLength,
    browserBackend: browser.backend,
    browserChecksPassed: browser.checksPassed,
    browserHarness: browser.harness
}, null, 2) + '\n');

async function files(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await files(path));
        else if (entry.isFile()) result.push(path);
        else throw new Error(`Unexpected non-regular Pages asset: ${path}`);
    }
    return result;
}
const lines = [];
for (const file of (await files(dist)).sort()) {
    if (relative(dist, file) === 'SHA256SUMS') continue;
    lines.push(`${sha256(await readFile(file))}  ${relative(dist, file).replaceAll('\\', '/')}`);
}
await writeFile(join(dist, 'SHA256SUMS'), lines.join('\n') + '\n');
console.log(`Prepared ${lines.length} Pages assets, including the reproducible PIP-07 sample and browser reports.`);
