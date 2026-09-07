"""Interaction smoke tests. Optional Playwright dev dependency; app has none.

Normal run: python tests/browser_check.py --url http://localhost:8765
Offline CI: xvfb-run -a python tests/browser_check.py --offline --chromium /usr/bin/chromium
The offline harness uses an opaque document and therefore tests WebGL2, not WebGPU.
"""
import argparse
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

async def main(args):
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=args.chromium,
            headless=True,
            args=['--no-sandbox', '--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
        )
        page = await browser.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
        errors, warnings, checks = [], [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else warnings.append(m.text) if m.type == 'warning' else None)
        if args.offline:
            await page.set_content((ROOT / 'dist/index.html').read_text(), wait_until='load')
        else:
            await page.goto(args.url, wait_until='networkidle')
        await page.wait_for_function('window.kinetra?.renderer?.backend')
        await page.wait_for_timeout(600)
        backend = await page.evaluate('kinetra.renderer.backend')
        async def check(name, expression):
            assert await page.evaluate(expression), name
            checks.append(name)
        async def execute(action):
            await page.evaluate('(action) => kinetra.execute(action)', action)
            await page.wait_for_timeout(80)
        async def input_value(selector, value):
            field = page.locator(selector)
            await field.fill(str(value))
            await field.press('Tab')
            await page.wait_for_timeout(80)

        await check('initial scene renders 49 nodes', 'kinetra.scene.nodes.length === 49 && kinetra.renderer.triangles > 20000')
        await check('graphics API reports no errors', 'kinetra.renderer.errorLog.length === 0 && (!kinetra.renderer.gl || kinetra.renderer.gl.getError() === 0)')
        initial = await page.evaluate('JSON.stringify(kinetra.scene.serialize())')
        await input_value('input[data-transform="position"][data-axis="0"]', .75)
        await check('numeric transform editing', 'kinetra.scene.active.position[0] === .75')
        await execute('undo')
        await check('numeric transform undo', 'kinetra.scene.active.position[0] === 0')
        await execute('redo')
        await check('numeric transform redo', 'kinetra.scene.active.position[0] === .75')
        await execute('confirmNew')
        await page.locator('[data-action="create:cube"]').first.click()
        await check('primitive shelf creates an editable mesh', 'kinetra.scene.nodes.length === 1 && kinetra.scene.active.mesh.faces.length === 6')
        await execute('material:orange')
        await check('material application changes scene data', 'kinetra.scene.active.material.color === "#e6a457"')
        await execute('duplicate')
        await check('duplicate creates independent mesh data', 'kinetra.scene.nodes.length === 2 && kinetra.scene.nodes[0].mesh !== kinetra.scene.nodes[1].mesh')
        await execute('undo')
        await execute('subdivide')
        await check('subdivision updates topology', 'kinetra.scene.active.mesh.vertices.length === 26 && kinetra.scene.active.mesh.faces.length === 24')
        await execute('undo')
        await execute('frameSelected')
        await execute('tool:select')
        await execute('faceMode')
        box = await page.locator('#overlayCanvas').bounding_box()
        await page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        await check('pointer ray picking selects a polygon face', 'kinetra.state.components.size === 1')
        await execute('extrude')
        await page.locator('#extrudeAmount').fill('0.5')
        await page.locator('#applyExtrude').click()
        await check('extrude dialog edits real topology', 'kinetra.scene.active.mesh.faces.length === 10 && kinetra.scene.active.mesh.vertices.length === 12')
        await execute('undo')
        await execute('objectMode')
        await execute('tool:move')
        await page.wait_for_timeout(100)
        handle = await page.evaluate('kinetra.state.gizmo.find(g=>g.axis===0).path')
        box = await page.locator('#overlayCanvas').bounding_box()
        sx = box['x'] + handle[0][0] * .3 + handle[1][0] * .7
        sy = box['y'] + handle[0][1] * .3 + handle[1][1] * .7
        await page.mouse.move(sx, sy)
        await page.mouse.down()
        await page.mouse.move(sx + 35, sy, steps=5)
        await page.mouse.up()
        await check('axis handle drag moves object', 'kinetra.scene.active.position[0] > .01')
        await execute('undo')
        await check('gizmo drag coalesces into one undo transaction', 'Math.abs(kinetra.scene.active.position[0]) < .001')
        await execute('keyframe')
        await input_value('#currentFrame', 60)
        await input_value('input[data-transform="position"][data-axis="1"]', 2)
        await check('animated transform edit creates key at current frame', 'kinetra.scene.active.keys.length === 2 && kinetra.scene.active.keys[1].frame === 60')
        await execute('graph')
        await page.locator('#graphChannel').select_option('p:1')
        await input_value('#graphTable input[data-key="2"][data-field="value"]', 3)
        await check('graph editor updates keyframe values', 'kinetra.scene.active.keys[1].p[1] === 3')
        await execute('closeModal')
        await execute('firstFrame')
        await execute('play')
        await page.wait_for_function('kinetra.state.playing && kinetra.scene.frame > 1', timeout=10000)
        await check('playback advances animation time', 'kinetra.state.playing && kinetra.scene.frame > 1')
        await execute('play')
        await check('playback pauses', '!kinetra.state.playing')
        await page.evaluate("kinetra.command('create sphere')")
        await page.evaluate("kinetra.command('move 3 2 1')")
        await check('command parser edits the scene', 'kinetra.scene.active.position.join(",") === "3,2,1"')
        await execute('selectAll')
        await execute('group')
        await check('grouping builds hierarchy', '!kinetra.scene.active.mesh && kinetra.scene.nodes.filter(n=>n.parent===kinetra.scene.active.id).length === 2')
        await check('identity grouping preserves animation curves', 'kinetra.scene.nodes.some(n=>n.keys.length===2)')
        await execute('ungroup')
        await check('ungroup preserves children', 'kinetra.scene.nodes.length === 2 && kinetra.scene.nodes.every(n=>n.parent===null)')
        await check('identity ungroup preserves animation curves', 'kinetra.scene.nodes.some(n=>n.keys.length===2)')
        # Combining animated meshes is explicitly unsupported.
        await page.evaluate('kinetra.scene.nodes.forEach(n=>n.keys=[])')
        await execute('combine')
        await check('combine bakes mesh transforms', 'kinetra.scene.nodes.length === 1 && kinetra.scene.active.mesh.vertices.length > 600')
        await page.set_input_files('#fileInput', {'name': 'triangle.obj', 'mimeType': 'text/plain', 'buffer': b'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'})
        await page.wait_for_timeout(150)
        await check('OBJ file input imports geometry', 'kinetra.scene.active.name === "triangle" && kinetra.scene.active.mesh.faces.length === 1')
        await execute('wireframe')
        await check('wireframe mode switches render path', 'kinetra.renderer.mode === "wireframe"')
        await execute('shaded')
        await check('shaded mode restores surfaces', 'kinetra.renderer.mode === "shaded"')
        await page.evaluate('(snapshot)=>{kinetra.scene.load(JSON.parse(snapshot));kinetra.camera.target=[0,1.9,0];kinetra.camera.distance=8.7;kinetra.refresh();document.querySelector(".scene-caption").style.display="block"}', initial)
        await execute('tool:move')
        await page.wait_for_timeout(400)
        capture_size = await page.evaluate('async()=>{const b=await kinetra.renderer.capture(kinetra.scene,kinetra.camera);return b?.size||0}')
        assert capture_size > 5000, 'PNG capture contains rendered pixels'
        checks.append('PNG capture contains rendered pixels')
        assert not errors, '\n'.join(errors)
        out = ROOT / 'test-results'
        out.mkdir(exist_ok=True)
        # Let the normal toast lifecycle finish before documenting the workspace.
        await page.wait_for_timeout(4200)
        await page.screenshot(path=str(out / 'workspace.png'))
        await execute('graph')
        await page.wait_for_timeout(100)
        await page.screenshot(path=str(out / 'graph-editor.png'))
        report = {'backend': backend, 'harness': 'opaque-document offline / no native WebGPU validation' if args.offline else args.url, 'checksPassed': len(checks), 'checks': checks, 'javascriptErrors': errors, 'gpuValidationErrors': await page.evaluate('kinetra.renderer.errorLog'), 'warnings': warnings, 'pngBytes': capture_size}
        (out / 'browser-report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        await browser.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--url', default='http://localhost:8765')
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    asyncio.run(main(parser.parse_args()))
