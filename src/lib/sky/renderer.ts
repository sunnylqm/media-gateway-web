import {
  cameraMatrix,
  cameraPosition,
  createNoiseVolume,
  createStars,
  NOISE_SIZE,
  renderSize,
  STAR_COUNT,
  STAR_STRIDE,
} from './scene';
import {
  compositeFragment,
  fullscreenVertex,
  galaxyFragment,
  starFragment,
  starVertex,
} from './shaders';

export type SkyRenderer = {
  setMoving: (moving: boolean) => void;
  dispose: () => void;
};

// Volume integration -> upscale -> depth-aware stars. Only the camera moves;
// no network textures or CPU per-star animation. All GPU resources are owned here.
export function createSkyRenderer(
  canvas: HTMLCanvasElement,
  onState: (ready: boolean) => void,
): SkyRenderer {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL2 is unavailable');
  let disposed = false;
  let lost = false;
  let moving = false;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let quality = 1;
  let frameAverage = 25;
  let samples = 0;
  let resizePending = true;
  let announced = false;
  let width = 1;
  let height = 1;
  let cloudWidth = 1;
  let cloudHeight = 1;
  let pixelRatio = 1;
  const pointRange = gl.getParameter(
    gl.ALIASED_POINT_SIZE_RANGE,
  ) as Float32Array;
  const pointMax = pointRange[1];
  const textureMax = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const stars = createStars();
  const noiseData = createNoiseVolume();
  const programs: WebGLProgram[] = [];
  const buffers: WebGLBuffer[] = [];
  const vaos: WebGLVertexArrayObject[] = [];
  let texture: WebGLTexture | null = null;
  let noiseTexture: WebGLTexture | null = null;
  let target: WebGLFramebuffer | null = null;
  type Pass = {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation | null>;
  };
  let galaxy: Pass;
  let composite: Pass;
  let points: Pass;
  let starVAO: WebGLVertexArrayObject | null = null;
  let quadVAO: WebGLVertexArrayObject | null = null;

  function shader(type: number, source: string): WebGLShader {
    const result = gl!.createShader(type);
    if (!result) throw new Error('Cannot allocate sky shader');
    gl!.shaderSource(result, source);
    gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) {
      const reason = gl!.getShaderInfoLog(result);
      gl!.deleteShader(result);
      throw new Error(`Sky shader: ${reason}`);
    }
    return result;
  }

  function pass(vertex: string, fragment: string, names: string[]): Pass {
    const vertexShader = shader(gl!.VERTEX_SHADER, vertex);
    let fragmentShader: WebGLShader | null = null;
    try {
      fragmentShader = shader(gl!.FRAGMENT_SHADER, fragment);
      const program = gl!.createProgram();
      if (!program) throw new Error('Cannot allocate sky program');
      programs.push(program);
      gl!.attachShader(program, vertexShader);
      gl!.attachShader(program, fragmentShader);
      gl!.linkProgram(program);
      if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
        throw new Error(`Sky link: ${gl!.getProgramInfoLog(program)}`);
      }
      return {
        program,
        uniforms: Object.fromEntries(
          names.map((name) => [name, gl!.getUniformLocation(program, name)]),
        ),
      };
    } finally {
      gl!.deleteShader(vertexShader);
      if (fragmentShader) gl!.deleteShader(fragmentShader);
    }
  }

  function release() {
    for (const program of programs) gl!.deleteProgram(program);
    for (const buffer of buffers) gl!.deleteBuffer(buffer);
    for (const vao of vaos) gl!.deleteVertexArray(vao);
    if (texture) gl!.deleteTexture(texture);
    if (noiseTexture) gl!.deleteTexture(noiseTexture);
    if (target) gl!.deleteFramebuffer(target);
    programs.length = buffers.length = vaos.length = 0;
    texture = noiseTexture = target = null;
  }

  function setup() {
    galaxy = pass(fullscreenVertex, galaxyFragment, [
      'u_camera',
      'u_origin',
      'u_aspect',
      'u_fov',
      'u_noise',
    ]);
    composite = pass(fullscreenVertex, compositeFragment, ['u_sky']);
    points = pass(starVertex, starFragment, [
      'u_camera',
      'u_origin',
      'u_aspect',
      'u_fov',
      'u_time',
      'u_pixelRatio',
      'u_pointMax',
      'u_sky',
      'u_resolution',
    ]);
    quadVAO = gl!.createVertexArray();
    starVAO = gl!.createVertexArray();
    const buffer = gl!.createBuffer();
    texture = gl!.createTexture();
    noiseTexture = gl!.createTexture();
    target = gl!.createFramebuffer();
    if (quadVAO) vaos.push(quadVAO);
    if (starVAO) vaos.push(starVAO);
    if (buffer) buffers.push(buffer);
    if (
      !quadVAO ||
      !starVAO ||
      !buffer ||
      !texture ||
      !noiseTexture ||
      !target
    ) {
      throw new Error('Cannot allocate sky resources');
    }
    gl!.bindVertexArray(starVAO);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, stars, gl!.STATIC_DRAW);
    for (const [location, size, offset] of [
      [0, 3, 0],
      [1, 3, 3],
      [2, 2, 6],
    ]) {
      gl!.enableVertexAttribArray(location);
      gl!.vertexAttribPointer(
        location,
        size,
        gl!.FLOAT,
        false,
        STAR_STRIDE * 4,
        offset * 4,
      );
    }
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_3D, noiseTexture);
    gl!.texParameteri(gl!.TEXTURE_3D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_3D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    for (const axis of [
      gl!.TEXTURE_WRAP_S,
      gl!.TEXTURE_WRAP_T,
      gl!.TEXTURE_WRAP_R,
    ]) {
      gl!.texParameteri(gl!.TEXTURE_3D, axis, gl!.REPEAT);
    }
    gl!.texImage3D(
      gl!.TEXTURE_3D,
      0,
      gl!.RGBA8,
      NOISE_SIZE,
      NOISE_SIZE,
      NOISE_SIZE,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      noiseData,
    );
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.disable(gl!.DEPTH_TEST);
    gl!.disable(gl!.CULL_FACE);
    resizePending = true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const size = renderSize(
      rect.width,
      rect.height,
      window.devicePixelRatio || 1,
      quality,
    );
    const limit = Math.min(1, textureMax / Math.max(size.width, size.height));
    width = Math.max(1, Math.floor(size.width * limit));
    height = Math.max(1, Math.floor(size.height * limit));
    pixelRatio = size.ratio * limit;
    canvas.width = width;
    canvas.height = height;
    // Volume ray marching has a stricter budget than point-like stars.
    const cloudScale = Math.min(0.55, Math.sqrt(240000 / (width * height)));
    cloudWidth = Math.max(1, Math.floor(width * cloudScale));
    cloudHeight = Math.max(1, Math.floor(height * cloudScale));
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA8,
      cloudWidth,
      cloudHeight,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      null,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    const status = gl!.checkFramebufferStatus(gl!.FRAMEBUFFER);
    if (status !== gl!.FRAMEBUFFER_COMPLETE) {
      throw new Error('Sky framebuffer is incomplete');
    }
    resizePending = false;
  }

  function draw() {
    if (disposed || lost) return;
    if (resizePending) resize();
    const aspect = width / height;
    const fov = aspect < 1 ? 0.95 : 0.64;
    const camera = cameraMatrix(elapsed);
    const origin = cameraPosition(elapsed);
    const applyCamera = (p: Pass) => {
      // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook.
      gl!.useProgram(p.program);
      gl!.uniformMatrix3fv(p.uniforms.u_camera, false, camera);
      gl!.uniform3fv(p.uniforms.u_origin, origin);
      gl!.uniform1f(p.uniforms.u_aspect, aspect);
      gl!.uniform1f(p.uniforms.u_fov, fov);
    };
    gl!.disable(gl!.BLEND);
    gl!.bindVertexArray(quadVAO);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target);
    gl!.viewport(0, 0, cloudWidth, cloudHeight);
    applyCamera(galaxy);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_3D, noiseTexture);
    gl!.uniform1i(galaxy.uniforms.u_noise, 1);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook.
    gl!.useProgram(composite.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.uniform1i(composite.uniforms.u_sky, 0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    applyCamera(points);
    gl!.uniform1f(points.uniforms.u_time, elapsed);
    gl!.uniform1f(points.uniforms.u_pixelRatio, pixelRatio);
    gl!.uniform1f(points.uniforms.u_pointMax, pointMax);
    gl!.uniform1i(points.uniforms.u_sky, 0);
    gl!.uniform2f(points.uniforms.u_resolution, width, height);
    gl!.bindVertexArray(starVAO);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.drawArrays(gl!.POINTS, 0, STAR_COUNT);
    gl!.disable(gl!.BLEND);
    if (!announced) {
      if (gl!.getError() !== gl!.NO_ERROR) {
        throw new Error('Sky rendering failed');
      }
      announced = true;
      onState(true);
    }
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }
  function fail() {
    stop();
    lost = true;
    onState(false);
    release();
  }
  function tick(now: number) {
    frame = 0;
    if (!moving || disposed || lost) return;
    const delta = previous ? now - previous : 0;
    if (previous && delta < 32) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (delta > 0) {
      elapsed += Math.min(delta, 250) / 1000;
      frameAverage = frameAverage * 0.96 + delta * 0.04;
      samples++;
      if (samples > 45 && frameAverage > 48 && quality > 0.55) {
        quality = Math.max(0.55, quality * 0.8);
        resizePending = true;
        samples = 0;
        frameAverage = 30;
      }
    }
    previous = now;
    try {
      draw();
    } catch {
      fail();
      return;
    }
    frame = requestAnimationFrame(tick);
  }
  function requestResize() {
    resizePending = true;
    if (!moving && !lost && !disposed) {
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
    stop();
    announced = false;
    onState(false);
  }
  function contextRestored() {
    if (disposed) return;
    programs.length = buffers.length = vaos.length = 0;
    texture = noiseTexture = target = null;
    try {
      lost = false;
      setup();
      draw();
      if (moving) frame = requestAnimationFrame(tick);
    } catch {
      fail();
    }
  }
  const observer = new ResizeObserver(requestResize);
  try {
    setup();
    draw();
    observer.observe(canvas);
    window.addEventListener('resize', requestResize);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
  } catch (error) {
    observer.disconnect();
    release();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
  return {
    setMoving(next) {
      moving = next;
      stop();
      if (moving && !lost && !disposed) frame = requestAnimationFrame(tick);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      observer.disconnect();
      window.removeEventListener('resize', requestResize);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      release();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
