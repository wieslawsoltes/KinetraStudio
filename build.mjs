import { readFile, writeFile, mkdir } from 'node:fs/promises';
const modules = ['math', 'mesh', 'scene', 'renderer', 'icons', 'app'];
const code = (await Promise.all(modules.map(async (name) => (await readFile(`src/${name}.js`, 'utf8')).replace(/^import .*?;\s*$/gm, '').replace(/^export /gm, '')))).join('\n;\n');
const html = await readFile('index.html', 'utf8');
const css = await readFile('styles.css', 'utf8');
const standalone = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`).replace('<script type="module" src="src/app.js"></script>', () => `<script type="module">\n${code}\n</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', standalone);
console.log(`Built dist/index.html: ${(Buffer.byteLength(standalone) / 1024).toFixed(1)} KiB; no external requests.`);
