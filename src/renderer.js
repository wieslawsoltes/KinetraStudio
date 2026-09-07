import { M, V } from './math.js';
import { Mesh, Primitives } from './mesh.js';
const WGSL = /* wgsl */ `
struct Frame { vp:mat4x4<f32>, lightVP:mat4x4<f32>, eye:vec4<f32>, env:vec4<f32> };
struct Object { model:mat4x4<f32>, normal:mat4x4<f32>, color:vec4<f32>, params:vec4<f32> };
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var shadowTex:texture_depth_2d;
@group(0) @binding(2) var shadowSampler:sampler_comparison;
@group(1) @binding(0) var<uniform> obj:Object;
struct Out { @builtin(position) clip:vec4<f32>, @location(0) world:vec3<f32>, @location(1) normal:vec3<f32>, @location(2) shadow:vec4<f32> };
@vertex fn vs(@location(0) p:vec3<f32>, @location(1) n:vec3<f32>)->Out { var o:Out;let w=obj.model*vec4(p,1);o.clip=frame.vp*w;o.world=w.xyz;o.normal=(obj.normal*vec4(n,0)).xyz;o.shadow=frame.lightVP*w;return o; }
@vertex fn lineVS(@location(0) p:vec3<f32>, @location(1) n:vec3<f32>)->Out { var o:Out;let w=obj.model*vec4(p,1);o.clip=frame.vp*w;o.clip.z-=.00008*o.clip.w;o.world=w.xyz;o.normal=(obj.normal*vec4(n,0)).xyz;o.shadow=frame.lightVP*w;return o; }
@vertex fn shadowVS(@location(0) p:vec3<f32>)->@builtin(position) vec4<f32> { return frame.lightVP*obj.model*vec4(p,1); }
fn visibility(pos:vec4<f32>,n:vec3<f32>,l:vec3<f32>)->f32 {let p=pos.xyz/pos.w;let uv=p.xy*vec2(.5,-.5)+.5;let inside=all(uv>=vec2(0.0))&&all(uv<=vec2(1.0))&&p.z<1.0&&p.z>0.0;var s=0.0;let bias=max(.0005,.002*(1.0-dot(n,l)));for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){s+=textureSampleCompareLevel(shadowTex,shadowSampler,uv+vec2(f32(x),f32(y))/2048.0,p.z-bias);}}return select(1.0,s/9.0,inside&&frame.env.w>0.5); }
fn brdf(n:vec3<f32>,v:vec3<f32>,l:vec3<f32>,base:vec3<f32>,metal:f32,rough:f32)->vec3<f32>{let h=normalize(v+l);let nv=max(dot(n,v),.001);let nl=max(dot(n,l),.0);let nh=max(dot(n,h),.0);let hv=max(dot(h,v),.0);let a=rough*rough;let a2=a*a;let denom=nh*nh*(a2-1.0)+1.0;let D=a2/max(3.14159*denom*denom,.0001);let k=(rough+1.0)*(rough+1.0)/8.0;let G=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);let F0=mix(vec3(.04),base,metal);let F=F0+(1.0-F0)*pow(1.0-hv,5.0);let spec=D*G*F/(4.0*nv*max(nl,.001));return ((1.0-F)*(1.0-metal)*base/3.14159+spec)*nl;}
fn aces(x:vec3<f32>)->vec3<f32>{return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3(0.0),vec3(1.0));}
@fragment fn fs(i:Out,@builtin(front_facing) front:bool)->@location(0) vec4<f32>{var n=normalize(i.normal)*select(-1.0,1.0,front);let v=normalize(frame.eye.xyz-i.world);let l=normalize(vec3(5.0,9.0,6.0));var base=pow(obj.color.rgb,vec3(2.2));let rough=max(.07,obj.params.y);let metal=obj.params.x;let ground=obj.params.w>1.5;let coord=i.world.xz;let grid=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.0001));let line=1.0-min(min(grid.x,grid.y),1.0);let majorCoord=coord/5.0;let major=abs(fract(majorCoord-.5)-.5)/max(fwidth(majorCoord),vec2(.0001));let majorLine=1.0-min(min(major.x,major.y),1.0);if(ground){base=mix(base,vec3(.16,.21,.235),(line*.065+majorLine*.06)*frame.env.z*exp(-length(coord)*.025));let axisWidth=max(fwidth(coord.x),fwidth(coord.y));if(abs(coord.x)<axisWidth) {base=mix(base,vec3(.09,.16,.25),.7*frame.env.z);}if(abs(coord.y)<axisWidth){base=mix(base,vec3(.26,.10,.105),.7*frame.env.z);}}
let shadow=visibility(i.shadow,n,l);var color=brdf(n,v,l,base,metal,rough)*vec3(4.4,4.2,3.9)*shadow;color+=brdf(n,v,normalize(vec3(-5.0,3.0,-2.0)),base,metal,rough)*vec3(1.15,1.65,2.1);color+=brdf(n,v,normalize(vec3(0.0,4.0,-6.0)),base,metal,rough)*vec3(1.6,1.8,1.65);let hemi=mix(vec3(.12,.15,.18),vec3(.52,.65,.70),n.y*.5+.5);color+=base*hemi*frame.env.y*(1.0-metal*.6);let fres=pow(1.0-max(dot(n,v),.0),3.0);color+=mix(vec3(.03),base,metal)*hemi*(.12+fres*.35);color+=base*obj.params.z;var finalColor=pow(aces(color*frame.env.x),vec3(1.0/2.2));if(ground){let fade=1.0-exp(-length(i.world-frame.eye.xyz)*.033);finalColor=mix(finalColor,vec3(.105,.132,.165),fade);}return vec4(finalColor,1);}
@fragment fn lineFS(i:Out)->@location(0) vec4<f32>{return select(vec4(.14,.20,.23,1),vec4(.35,.91,.77,1),obj.params.w>.5);}
`;
const GLSL_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;
uniform mat4 uVP,uLightVP,uModel,uNormal;out vec3 vWorld,vNormal;out vec4 vShadow;
void main(){vec4 w=uModel*vec4(aPosition,1.);gl_Position=uVP*w;gl_Position.z=gl_Position.z*2.-gl_Position.w;vWorld=w.xyz;vNormal=(uNormal*vec4(aNormal,0.)).xyz;vShadow=uLightVP*w;}`;
const GLSL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld,vNormal;in vec4 vShadow;out vec4 frag;
uniform vec4 uColor,uParams,uEnv;uniform vec3 uEye;uniform bool uLine;uniform sampler2D uShadow;
vec3 brdf(vec3 n,vec3 v,vec3 l,vec3 base,float metal,float rough){vec3 h=normalize(v+l);float nv=max(dot(n,v),.001),nl=max(dot(n,l),0.),nh=max(dot(n,h),0.),hv=max(dot(h,v),0.),a=rough*rough,a2=a*a,denom=nh*nh*(a2-1.)+1.,D=a2/max(3.14159*denom*denom,.0001),k=(rough+1.)*(rough+1.)/8.,G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);vec3 F0=mix(vec3(.04),base,metal),F=F0+(1.-F0)*pow(1.-hv,5.);return ((1.-F)*(1.-metal)*base/3.14159+D*G*F/(4.*nv*max(nl,.001)))*nl;}
float visibility(vec3 n,vec3 l){vec3 p=vShadow.xyz/vShadow.w;vec2 uv=p.xy*.5+.5;float s=0.,bias=max(.0005,.002*(1.-dot(n,l)));for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){float dep=texture(uShadow,uv+vec2(x,y)/2048.).r;s+=p.z-bias<dep?1.:0.;}return (uEnv.w>.5&&all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1)))&&p.z<1.&&p.z>0.)?s/9.:1.;}
vec3 aces(vec3 x){return clamp(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){if(uLine){frag=uParams.w>.5?vec4(.35,.91,.77,1):vec4(.14,.20,.23,1);return;}vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.),v=normalize(uEye-vWorld),l=normalize(vec3(5,9,6)),base=pow(uColor.rgb,vec3(2.2));float rough=max(.07,uParams.y),metal=uParams.x;bool ground=uParams.w>1.5;vec2 coord=vWorld.xz,grid=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.0001)),mc=coord/5.,major=abs(fract(mc-.5)-.5)/max(fwidth(mc),vec2(.0001));float line=1.-min(min(grid.x,grid.y),1.),ml=1.-min(min(major.x,major.y),1.);if(ground){base=mix(base,vec3(.16,.21,.235),(line*.065+ml*.06)*uEnv.z*exp(-length(coord)*.025));float aw=max(fwidth(coord.x),fwidth(coord.y));if(abs(coord.x)<aw)base=mix(base,vec3(.09,.16,.25),.7*uEnv.z);if(abs(coord.y)<aw)base=mix(base,vec3(.26,.10,.105),.7*uEnv.z);}vec3 color=brdf(n,v,l,base,metal,rough)*vec3(4.4,4.2,3.9)*visibility(n,l);color+=brdf(n,v,normalize(vec3(-5,3,-2)),base,metal,rough)*vec3(1.15,1.65,2.1);color+=brdf(n,v,normalize(vec3(0,4,-6)),base,metal,rough)*vec3(1.6,1.8,1.65);vec3 hemi=mix(vec3(.12,.15,.18),vec3(.52,.65,.70),n.y*.5+.5);color+=base*hemi*uEnv.y*(1.-metal*.6);float fres=pow(1.-max(dot(n,v),0.),3.);color+=mix(vec3(.03),base,metal)*hemi*(.12+fres*.35);color+=base*uParams.z;vec3 finalColor=pow(aces(color*uEnv.x),vec3(1./2.2));if(ground)finalColor=mix(finalColor,vec3(.105,.132,.165),1.-exp(-length(vWorld-uEye)*.033));frag=vec4(finalColor,1.);}`;
function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
export class Renderer {
    constructor(canvas, onStatus = () => { }) { this.canvas = canvas; this.onStatus = onStatus; this.meshes = new Map(); this.objects = new Map(); this.drawCalls = 0; this.mode = 'shaded'; this.showWire = false; this.lost = false; this.frameData = new Float32Array(40); this.lightVP = M.mul(M.ortho(-8, 8, -8, 8, .1, 35), M.lookAt([7, 12, 8], [0, 1, 0])); this.ground = { id: '_ground', mesh: Primitives.plane(), world: M.compose([0, -.012, 0], [0, 0, 0], [150, 1, 150]), normal: M.identity(), material: { color: '#242b32', metallic: .08, roughness: .82, emission: 0 }, effectiveVisible: true }; this.errorLog = []; }
    async init() { let error; try {
        if (new URLSearchParams(location.search).has('webgl'))
            throw Error('WebGL2 requested');
        if (!navigator.gpu)
            throw Error('WebGPU is unavailable');
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter)
            throw Error('No WebGPU adapter');
        this.device = await adapter.requestDevice();
        this.device.addEventListener('uncapturederror', e => { this.errorLog.push(e.error.message); console.error('WebGPU', e.error.message); this.onStatus('GPU validation error', true); });
        this.device.lost.then(info => { if (info.reason !== 'destroyed') {
            this.lost = true;
            this.onStatus('GPU device lost. Reload to restore.', true);
        } });
        this.device.pushErrorScope('validation');
        await this.initGPU();
        const initializationError = await this.device.popErrorScope();
        if (initializationError)
            throw Error(initializationError.message);
        this.backend = 'WebGPU';
        this.adapter = adapter.info?.description || adapter.info?.device || 'Hardware accelerated';
        this.onStatus('WebGPU');
        return;
    }
    catch (e) {
        error = e;
        this.device?.destroy();
        this.device = null;
        console.warn('WebGPU fallback:', e.message);
    } try {
        this.initGL();
        this.backend = 'WebGL2';
        this.onStatus('WebGL2 fallback');
        this.fallbackReason = error?.message;
    }
    catch (e) {
        this.onStatus('No supported GPU backend', true);
        throw e;
    } }
    async initGPU() { const d = this.device; this.context = this.canvas.getContext('webgpu'); if (!this.context)
        throw Error('Cannot create WebGPU canvas'); this.format = navigator.gpu.getPreferredCanvasFormat(); this.context.configure({ device: d, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC }); const frameLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } }, { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }] }); const shadowLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }] }); this.objectLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }] }); this.frameBuffer = d.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); this.shadowTexture = d.createTexture({ size: [2048, 2048], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }); this.shadowView = this.shadowTexture.createView(); this.frameGroup = d.createBindGroup({ layout: frameLayout, entries: [{ binding: 0, resource: { buffer: this.frameBuffer } }, { binding: 1, resource: this.shadowView }, { binding: 2, resource: d.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' }) }] }); this.shadowFrameGroup = d.createBindGroup({ layout: shadowLayout, entries: [{ binding: 0, resource: { buffer: this.frameBuffer } }] }); const module = d.createShaderModule({ code: WGSL, label: 'Kinetra PBR + PCF shadows' }); const compilation = await module.getCompilationInfo(); const shaderErrors = compilation.messages.filter(m => m.type === 'error'); if (shaderErrors.length)
        throw Error(shaderErrors.map(m => `WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('\n')); const buffers = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }], layout = d.createPipelineLayout({ bindGroupLayouts: [frameLayout, this.objectLayout] }); this.mainPipeline = d.createRenderPipeline({ layout, vertex: { module, entryPoint: 'vs', buffers }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }, multisample: { count: 4 } }); this.linePipeline = d.createRenderPipeline({ layout, vertex: { module, entryPoint: 'lineVS', buffers }, fragment: { module, entryPoint: 'lineFS', targets: [{ format: this.format }] }, primitive: { topology: 'line-list' }, depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' }, multisample: { count: 4 } }); this.shadowPipeline = d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [shadowLayout, this.objectLayout] }), vertex: { module, entryPoint: 'shadowVS', buffers }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2 } }); }
    initGL() { let canvas = this.canvas; if (this.context) {
        const copy = canvas.cloneNode();
        canvas.replaceWith(copy);
        this.canvas = canvas = copy;
        this.context = null;
    } const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true }); if (!gl)
        throw Error('WebGL2 unavailable. Enable browser hardware acceleration.'); const compile = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw Error(gl.getShaderInfoLog(sh)); return sh; }, program = (vs, fs) => { const p = gl.createProgram(); const a = compile(gl.VERTEX_SHADER, vs), b = compile(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p); gl.deleteShader(a); gl.deleteShader(b); if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(p)); return p; }; this.program = program(GLSL_VERTEX, GLSL_FRAGMENT); this.shadowProgram = program(`#version 300 es\nlayout(location=0) in vec3 aPosition;uniform mat4 uLightVP,uModel;void main(){gl_Position=uLightVP*uModel*vec4(aPosition,1);gl_Position.z=gl_Position.z*2.-gl_Position.w;}`, `#version 300 es\nprecision highp float;void main(){}`); this.uniforms = {}; for (const name of ['uVP', 'uLightVP', 'uModel', 'uNormal', 'uColor', 'uParams', 'uEnv', 'uEye', 'uLine', 'uShadow'])
        this.uniforms[name] = gl.getUniformLocation(this.program, name); this.shadowUniforms = { model: gl.getUniformLocation(this.shadowProgram, 'uModel'), vp: gl.getUniformLocation(this.shadowProgram, 'uLightVP') }; this.glShadow = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.glShadow); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, 2048, 2048, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null); for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
        gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); this.shadowFBO = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.glShadow, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw Error('Shadow framebuffer incomplete'); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onStatus('Graphics context lost. Reload to restore.', true); }); }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (this.canvas.width === w && this.canvas.height === h && (this.backend !== 'WebGPU' || this.depth))
        return; this.canvas.width = w; this.canvas.height = h; if (this.device && this.backend === 'WebGPU') {
        this.depth?.destroy();
        this.msaa?.destroy();
        this.depth = this.device.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this.msaa = this.device.createTexture({ size: [w, h], format: this.format, sampleCount: 4, usage: GPUTextureUsage.RENDER_ATTACHMENT });
        this.depthView = this.depth.createView();
        this.msaaView = this.msaa.createView();
    } }
    meshResource(mesh) { let r = this.meshes.get(mesh.id); if (r?.revision === mesh.revision)
        return r; if (r)
        this.destroyMesh(r); const b = mesh.bake(); r = { revision: mesh.revision, count: b.count, lineCount: b.lineCount }; if (this.backend === 'WebGPU') {
        const make = data => { const buf = this.device.createBuffer({ size: Math.max(4, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); if (data.byteLength)
            this.device.queue.writeBuffer(buf, 0, data); return buf; };
        r.vertex = make(b.data);
        r.wire = make(b.lines);
    }
    else {
        const gl = this.gl, make = data => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); return { vao, buffer }; };
        r.vertex = make(b.data);
        r.wire = make(b.lines);
    } this.meshes.set(mesh.id, r); return r; }
    destroyMesh(r) { if (this.backend === 'WebGPU') {
        r.vertex.destroy();
        r.wire.destroy();
    }
    else
        for (const a of [r.vertex, r.wire]) {
            this.gl.deleteBuffer(a.buffer);
            this.gl.deleteVertexArray(a.vao);
        } }
    objectResource(n, selected) { let o = this.objects.get(n.id); if (!o) {
        o = { data: new Float32Array(40) };
        if (this.backend === 'WebGPU') {
            o.buffer = this.device.createBuffer({ size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            o.group = this.device.createBindGroup({ layout: this.objectLayout, entries: [{ binding: 0, resource: { buffer: o.buffer } }] });
        }
    } o.data.set(n.world, 0); o.data.set(n.normal, 16); o.data.set([...rgb(n.material.color), 1], 32); o.data.set([n.material.metallic, n.material.roughness, n.material.emission, n.id === '_ground' ? 2 : selected ? 1 : 0], 36); if (this.backend === 'WebGPU')
        this.device.queue.writeBuffer(o.buffer, 0, o.data); this.objects.set(n.id, o); return o; }
    render(scene, camera) { if (this.lost)
        return; this.resize(); const rect = this.canvas.getBoundingClientRect(); camera.update(rect.width, rect.height); scene.update(); const list = [this.ground, ...scene.nodes.filter(n => n.mesh && n.effectiveVisible)]; const ids = new Set(list.map(n => n.id)), meshIds = new Set(list.map(n => n.mesh.id)); for (const [id, r] of this.meshes)
        if (!meshIds.has(id)) {
            this.destroyMesh(r);
            this.meshes.delete(id);
        } for (const [id, o] of this.objects)
        if (!ids.has(id)) {
            o.buffer?.destroy();
            this.objects.delete(id);
        } const e = scene.environment; this.frameData.set(camera.vp); this.frameData.set(this.lightVP, 16); this.frameData.set([...camera.eye, 1], 32); this.frameData.set([e.exposure, e.ambient, e.grid ? 1 : 0, e.shadows ? 1 : 0], 36); this.drawCalls = 0; const items = list.map(n => ({ n, r: this.meshResource(n.mesh), o: this.objectResource(n, scene.selection.has(n.id)) })); if (this.backend === 'WebGPU')
        this.renderGPU(items, scene);
    else
        this.renderGL(items, scene); this.triangles = items.reduce((s, i) => s + i.r.count / 3, 0); this.vertices = scene.nodes.reduce((s, n) => s + (n.mesh?.vertices.length || 0), 0); }
    renderGPU(items, scene) { const d = this.device; d.queue.writeBuffer(this.frameBuffer, 0, this.frameData); const encoder = d.createCommandEncoder(); if (scene.environment.shadows) {
        const p = encoder.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
        p.setPipeline(this.shadowPipeline);
        p.setBindGroup(0, this.shadowFrameGroup);
        for (const i of items)
            if (i.n !== this.ground) {
                p.setBindGroup(1, i.o.group);
                p.setVertexBuffer(0, i.r.vertex);
                p.draw(i.r.count);
                this.drawCalls++;
            }
        p.end();
    } const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.msaaView, resolveTarget: this.context.getCurrentTexture().createView(), clearValue: { r: .105, g: .132, b: .165, a: 1 }, loadOp: 'clear', storeOp: 'store' }], depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } }); pass.setPipeline(this.mainPipeline); pass.setBindGroup(0, this.frameGroup); for (const i of items) {
        if (this.mode === 'wireframe' && i.n !== this.ground)
            continue;
        pass.setBindGroup(1, i.o.group);
        pass.setVertexBuffer(0, i.r.vertex);
        pass.draw(i.r.count);
        this.drawCalls++;
    } pass.setPipeline(this.linePipeline); for (const i of items)
        if (i.n !== this.ground && (this.showWire || this.mode === 'wireframe' || scene.selection.has(i.n.id))) {
            pass.setBindGroup(1, i.o.group);
            pass.setVertexBuffer(0, i.r.wire);
            pass.draw(i.r.lineCount);
            this.drawCalls++;
        } pass.end(); d.queue.submit([encoder.finish()]); }
    renderGL(items, scene) { const gl = this.gl, u = this.uniforms; if (scene.environment.shadows) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
        gl.viewport(0, 0, 2048, 2048);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shadowProgram);
        gl.uniformMatrix4fv(this.shadowUniforms.vp, false, this.lightVP);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(2, 2);
        for (const i of items)
            if (i.n !== this.ground) {
                gl.uniformMatrix4fv(this.shadowUniforms.model, false, i.n.world);
                gl.bindVertexArray(i.r.vertex.vao);
                gl.drawArrays(gl.TRIANGLES, 0, i.r.count);
                this.drawCalls++;
            }
        gl.disable(gl.POLYGON_OFFSET_FILL);
    } gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(.105, .132, .165, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(this.program); gl.uniformMatrix4fv(u.uVP, false, this.frameData.subarray(0, 16)); gl.uniformMatrix4fv(u.uLightVP, false, this.lightVP); gl.uniform3fv(u.uEye, this.frameData.subarray(32, 35)); gl.uniform4fv(u.uEnv, this.frameData.subarray(36, 40)); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.glShadow); gl.uniform1i(u.uShadow, 0); const object = i => { gl.uniformMatrix4fv(u.uModel, false, i.n.world); gl.uniformMatrix4fv(u.uNormal, false, i.n.normal); gl.uniform4fv(u.uColor, i.o.data.subarray(32, 36)); gl.uniform4fv(u.uParams, i.o.data.subarray(36, 40)); }; gl.uniform1i(u.uLine, 0); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); gl.depthFunc(gl.LESS); for (const i of items) {
        if (this.mode === 'wireframe' && i.n !== this.ground)
            continue;
        object(i);
        gl.bindVertexArray(i.r.vertex.vao);
        gl.drawArrays(gl.TRIANGLES, 0, i.r.count);
        this.drawCalls++;
    } gl.disable(gl.POLYGON_OFFSET_FILL); gl.uniform1i(u.uLine, 1); gl.depthMask(false); gl.depthFunc(gl.LEQUAL); for (const i of items)
        if (i.n !== this.ground && (this.showWire || this.mode === 'wireframe' || scene.selection.has(i.n.id))) {
            object(i);
            gl.bindVertexArray(i.r.wire.vao);
            gl.drawArrays(gl.LINES, 0, i.r.lineCount);
            this.drawCalls++;
        } gl.depthMask(true); }
    async capture(scene, camera) { this.render(scene, camera); if (this.backend === 'WebGPU')
        await this.device.queue.onSubmittedWorkDone(); return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png')); }
    dispose() { for (const r of this.meshes.values())
        this.destroyMesh(r); for (const o of this.objects.values())
        o.buffer?.destroy(); this.depth?.destroy(); this.msaa?.destroy(); this.shadowTexture?.destroy(); this.frameBuffer?.destroy(); this.device?.destroy(); }
}
