import { cameraAt, frameSize, type Recipe, starsFor, stream } from './recipe';
import {
  bloomExtract,
  blur,
  copy,
  fullscreen,
  output,
  starFragment,
  starVertex,
  volumeSource,
} from './shaders';

type Pass = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};
type Target = {
  texture: WebGLTexture;
  buffer: WebGLFramebuffer;
  width: number;
  height: number;
};
export type Renderer = {
  setMoving: (moving: boolean) => void;
  dispose: () => void;
};

export function createRenderer(
  canvas: HTMLCanvasElement,
  recipe: Recipe,
  onState: (ready: boolean) => void,
): Renderer {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!context) throw new Error('WebGL2 unavailable');
  const gl: WebGL2RenderingContext = context;
  const programs: WebGLProgram[] = [];
  const arrays: WebGLVertexArrayObject[] = [];
  const buffers: WebGLBuffer[] = [];
  const targets: Target[] = [];
  let noise: WebGLTexture | null = null;
  let fence: WebGLSync | null = null;
  let quad: WebGLVertexArrayObject;
  let stars: WebGLVertexArrayObject;
  let cloudPass: Pass,
    copyPass: Pass,
    starPass: Pass,
    extractPass: Pass,
    blurPass: Pass,
    finalPass: Pass;
  let cloud: Target,
    scene: Target,
    nearA: Target,
    nearB: Target,
    farA: Target,
    farB: Target;
  let hdr = false,
    announced = false,
    dirty = true,
    lost = false,
    disposed = false,
    moving = false;
  let frame = 0,
    last = 0,
    elapsed = 0,
    quality = 1,
    samples = 0,
    average = 33;
  let width = 0,
    height = 0,
    ratio = 1;
  let pointMax = 64,
    textureMax = 4096;
  let targetRange = 1;
  const starData = starsFor(recipe);
  const noiseData = new Uint8Array(64 ** 3 * 4);
  const noiseRandom = stream(0x79f321ef);
  for (let i = 0; i < noiseData.length; i++)
    noiseData[i] = Math.floor(noiseRandom() * 256);

  function shader(type: number, source: string) {
    const result = gl.createShader(type);
    if (!result) throw new Error('G2 shader allocation');
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(result);
      gl.deleteShader(result);
      throw new Error(`G2 shader: ${reason}`);
    }
    return result;
  }
  function pass(vertex: string, fragment: string, names: string[]): Pass {
    const vs = shader(gl.VERTEX_SHADER, vertex);
    let fs: WebGLShader | null = null;
    try {
      fs = shader(gl.FRAGMENT_SHADER, fragment);
      const program = gl.createProgram();
      if (!program) throw new Error('G2 program allocation');
      programs.push(program);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`G2 link: ${gl.getProgramInfoLog(program)}`);
      return {
        program,
        uniforms: Object.fromEntries(
          names.map((n) => [n, gl.getUniformLocation(program, n)]),
        ),
      };
    } finally {
      gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
  }
  function bindPass(p: Pass) {
    // biome-ignore lint/correctness/useHookAtTopLevel: Native WebGL API, not a React hook.
    gl.useProgram(p.program);
  }
  function clearTargets() {
    for (const t of targets) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.buffer);
    }
    targets.length = 0;
  }
  function target(w: number, h: number): Target {
    const texture = gl.createTexture(),
      buffer = gl.createFramebuffer();
    if (!texture || !buffer) {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteFramebuffer(buffer);
      throw new Error('G2 target allocation');
    }
    const t = { texture, buffer, width: w, height: h };
    targets.push(t);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      hdr ? gl.RGBA16F : gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE ||
      gl.getError() !== gl.NO_ERROR
    )
      throw new Error('G2 target incomplete');
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return t;
  }
  function allocate(cw: number, ch: number) {
    clearTargets();
    cloud = target(cw, ch);
    scene = target(width, height);
    const nw = hdr ? Math.max(1, width >> 2) : 1;
    const nh = hdr ? Math.max(1, height >> 2) : 1;
    nearA = target(nw, nh);
    nearB = target(nw, nh);
    farA = target(Math.max(1, nw >> 1), Math.max(1, nh >> 1));
    farB = target(farA.width, farA.height);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const size = frameSize(
      rect.width,
      rect.height,
      window.devicePixelRatio || 1,
      quality,
    );
    const limit = Math.min(1, textureMax / Math.max(size.width, size.height));
    const w = Math.max(1, Math.floor(size.width * limit));
    const h = Math.max(1, Math.floor(size.height * limit));
    dirty = false;
    if (w === width && h === height && targets.length) return;
    width = w;
    height = h;
    ratio = size.ratio * limit;
    canvas.width = w;
    canvas.height = h;
    const cw = Math.max(1, Math.floor(size.cloudWidth * limit));
    const ch = Math.max(1, Math.floor(size.cloudHeight * limit));
    try {
      allocate(cw, ch);
    } catch (error) {
      if (!hdr) throw error;
      hdr = false;
      // Extension availability is insufficient: actual allocation must succeed.
      for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++) {
        /* drain */
      }
      allocate(cw, ch);
    }
    targetRange = hdr ? 1 : 0.25;
    canvas.dataset.colorMode = hdr ? 'hdr16f' : 'ldr8';
  }
  function setup() {
    hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
    pointMax = (
      gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array
    )[1];
    textureMax = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    );
    cloudPass = pass(fullscreen, volumeSource(recipe), [
      'u_noise',
      'u_camera',
      'u_origin',
      'u_aspect',
      'u_fov',
      'u_range',
    ]);
    copyPass = pass(fullscreen, copy, ['u_tex']);
    starPass = pass(starVertex, starFragment, [
      'u_camera',
      'u_origin',
      'u_aspect',
      'u_fov',
      'u_time',
      'u_ratio',
      'u_pointMax',
      'u_volume',
      'u_resolution',
      'u_range',
    ]);
    extractPass = pass(fullscreen, bloomExtract, ['u_tex', 'u_texel']);
    blurPass = pass(fullscreen, blur, ['u_tex', 'u_step']);
    finalPass = pass(fullscreen, output, [
      'u_scene',
      'u_near',
      'u_far',
      'u_exposure',
      'u_bloom',
      'u_range',
    ]);
    const q = gl.createVertexArray(),
      s = gl.createVertexArray(),
      b = gl.createBuffer();
    if (q) arrays.push(q);
    if (s) arrays.push(s);
    if (b) buffers.push(b);
    noise = gl.createTexture();
    if (!q || !s || !b || !noise) throw new Error('G2 geometry allocation');
    quad = q;
    stars = s;
    gl.bindVertexArray(stars);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
    for (const [index, size, offset] of [
      [0, 3, 0],
      [1, 3, 3],
      [2, 2, 6],
    ]) {
      gl.enableVertexAttribArray(index);
      gl.vertexAttribPointer(index, size, gl.FLOAT, false, 32, offset * 4);
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, noise);
    for (const axis of [
      gl.TEXTURE_WRAP_S,
      gl.TEXTURE_WRAP_T,
      gl.TEXTURE_WRAP_R,
    ])
      gl.texParameteri(gl.TEXTURE_3D, axis, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      64,
      64,
      64,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      noiseData,
    );
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    width = height = 0;
    dirty = true;
  }
  function destination(t?: Target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t?.buffer ?? null);
    gl.viewport(0, 0, t?.width ?? width, t?.height ?? height);
  }
  function input(p: Pass, name: string, t: Target, unit = 0) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.uniform1i(p.uniforms[name], unit);
  }
  function triangle() {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function filtered(p: Pass, source: Target, target: Target, dx = 0, dy = 0) {
    destination(target);
    bindPass(p);
    input(p, 'u_tex', source);
    if (p === blurPass)
      gl.uniform2f(p.uniforms.u_step, dx / source.width, dy / source.height);
    if (p === extractPass)
      gl.uniform2f(p.uniforms.u_texel, 1 / source.width, 1 / source.height);
    triangle();
  }
  function draw() {
    if (lost || disposed) return;
    if (dirty) resize();
    const aspect = width / height,
      fov = aspect < 1 ? 0.94 : 0.64;
    const camera = cameraAt(elapsed, recipe);
    const applyCamera = (p: Pass) => {
      bindPass(p);
      gl.uniformMatrix3fv(p.uniforms.u_camera, false, camera.rotation);
      gl.uniform3fv(p.uniforms.u_origin, camera.origin);
      gl.uniform1f(p.uniforms.u_aspect, aspect);
      gl.uniform1f(p.uniforms.u_fov, fov);
      gl.uniform1f(p.uniforms.u_range, targetRange);
    };
    gl.disable(gl.BLEND);
    gl.bindVertexArray(quad);
    destination(cloud);
    applyCamera(cloudPass);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, noise);
    gl.uniform1i(cloudPass.uniforms.u_noise, 1);
    triangle();
    filtered(copyPass, cloud, scene);
    applyCamera(starPass);
    input(starPass, 'u_volume', cloud);
    gl.uniform2f(starPass.uniforms.u_resolution, width, height);
    gl.uniform1f(starPass.uniforms.u_time, elapsed);
    gl.uniform1f(starPass.uniforms.u_ratio, ratio);
    gl.uniform1f(starPass.uniforms.u_pointMax, pointMax);
    gl.bindVertexArray(stars);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, starData.length / 8);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(quad);
    if (hdr) {
      filtered(extractPass, scene, nearA);
      filtered(blurPass, nearA, nearB, 1, 0);
      filtered(blurPass, nearB, nearA, 0, 1);
      filtered(copyPass, nearA, farA);
      filtered(blurPass, farA, farB, 1, 0);
      filtered(blurPass, farB, farA, 0, 1);
    }
    destination();
    bindPass(finalPass);
    input(finalPass, 'u_scene', scene);
    input(finalPass, 'u_near', nearA, 2);
    input(finalPass, 'u_far', farA, 3);
    gl.uniform1f(finalPass.uniforms.u_exposure, recipe.exposure);
    gl.uniform1f(finalPass.uniforms.u_bloom, hdr ? recipe.bloom : 0);
    gl.uniform1f(finalPass.uniforms.u_range, targetRange);
    triangle();
    if (fence) gl.deleteSync(fence);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) throw new Error('G2 frame synchronization');
    gl.flush();
    if (!announced) {
      if (gl.getError() !== gl.NO_ERROR) throw new Error('G2 rendering failed');
      announced = true;
      onState(true);
    }
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }
  function release() {
    if (fence) gl.deleteSync(fence);
    fence = null;
    clearTargets();
    for (const p of programs) gl.deleteProgram(p);
    for (const a of arrays) gl.deleteVertexArray(a);
    for (const b of buffers) gl.deleteBuffer(b);
    if (noise) gl.deleteTexture(noise);
    noise = null;
    programs.length = arrays.length = buffers.length = 0;
  }
  function fail() {
    stop();
    lost = true;
    release();
    onState(false);
  }
  function tick(now: number) {
    frame = 0;
    if (!moving || disposed || lost) return;
    if (fence) {
      const state = gl.clientWaitSync(fence, 0, 0);
      if (state === gl.TIMEOUT_EXPIRED) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (state === gl.WAIT_FAILED) {
        fail();
        return;
      }
      gl.deleteSync(fence);
      fence = null;
    }
    const delta = last ? now - last : 0;
    if (last && delta < 32) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (delta > 0) {
      elapsed += Math.min(delta, 250) / 1000;
      average = average * 0.94 + delta * 0.06;
      if (++samples > 30 && average > 48 && quality > 0.5) {
        quality = Math.max(0.5, quality * 0.8);
        dirty = true;
        samples = 0;
        average = 33;
      }
    }
    last = now;
    try {
      draw();
    } catch {
      fail();
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function resized() {
    dirty = true;
    if (!moving && !lost && !disposed) {
      // Resize may redraw one frozen frame; it must never restart animation.
      const rect = canvas.getBoundingClientRect();
      const size = frameSize(
        rect.width,
        rect.height,
        window.devicePixelRatio || 1,
        quality,
      );
      if (size.width === width && size.height === height) {
        dirty = false;
        return;
      }
      try {
        draw();
      } catch {
        fail();
      }
    }
  }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    announced = false;
    stop();
    onState(false);
  }
  function restored() {
    if (disposed) return;
    programs.length = arrays.length = buffers.length = targets.length = 0;
    noise = null;
    fence = null;
    announced = false;
    try {
      lost = false;
      setup();
      draw();
      if (moving) frame = requestAnimationFrame(tick);
    } catch {
      fail();
    }
  }
  const observer = new ResizeObserver(resized);
  try {
    setup();
    draw();
    observer.observe(canvas);
    window.addEventListener('resize', resized);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', restored);
  } catch (error) {
    observer.disconnect();
    release();
    throw error;
  }
  return {
    setMoving(next) {
      if (moving === next) return;
      moving = next;
      stop();
      if (moving && !lost && !disposed) frame = requestAnimationFrame(tick);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      observer.disconnect();
      window.removeEventListener('resize', resized);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', restored);
      release();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
