import {
  canonicalSky,
  getSkyPreset,
  getSkyRecipe,
  type SkyPreset,
  type SkyRecipe,
} from './presets';

// Original procedural art. NASA/Webb images guide composition, not textures.
export const fullscreenVertex = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const nebulaSource = `#version 300 es
#define SCENE 0
precision highp float;
precision highp sampler3D;
/* SKY_RECIPE */
in vec2 v_uv;
out vec4 outColor;
uniform mat3 u_camera;
uniform vec3 u_origin;
uniform float u_aspect;
uniform float u_fov;
uniform sampler3D u_noise;

float noise(vec3 p) { return texture(u_noise, (p + 0.5) / 64.0).r; }
float fbm(vec3 p) {
  float value = 0.0;
  float weight = 0.533;
  for (int i = 0; i < 4; i++) {
    value += weight * noise(p);
    p = p * 2.06 + vec3(11.7, 3.4, 7.1);
    weight *= 0.48;
  }
  return value;
}

// Randomness shapes one fixed world, never per-frame boiling or flicker.
// Keep the subject near the approved right-side focal region and retain depth.
vec2 field(vec3 p) {
  vec3 center = p - vec3(11.0, 2.0, 23.0) - OFFSET;
  p = vec3(ROLL_C * center.x - ROLL_S * center.y,
    ROLL_S * center.x + ROLL_C * center.y, center.z) * SCALE
    + vec3(11.0, 2.0, 23.0);
  vec3 q = p * vec3(0.19, 0.26, 0.16) + DETAIL;
  vec3 warp = texture(u_noise, (q * 0.8 + 14.5) / 64.0).rgb - 0.5;
  float turbulence = fbm(q * 2.1 + warp * 2.4);
#if SCENE == 0
  float ridge = p.y - p.x * 0.43 + 3.2
    - pow(abs(sin(p.x * 0.32 * CURL + p.z * 0.10)), 6.0) * 6.5
    + (turbulence - 0.5) * 17.0 * ROUGHNESS;
  float wall = 1.0 - smoothstep(-0.7 * THICKNESS, 1.1 * THICKNESS, ridge);
  float mass = smoothstep(0.39, 0.65, turbulence);
  float sheet = exp(-pow((p.z - 26.0) / (5.0 * THICKNESS), 2.0));
  float veil = exp(-pow((p.z - 9.0) / 3.0, 2.0));
  float foreground = (1.0 - smoothstep(-4.0, -0.7, ridge)) * veil;
  float density = wall * mass * mass * sheet * 0.70 + foreground * mass * mass * 0.28;
  float edge = exp(-abs(ridge + 0.1) * 0.95);
  return vec2(density, edge);
#elif SCENE == 1
  // An inclined, broken ellipsoidal shell with an open blue cavity.
  vec3 shellCenter = p - vec3(11.0, 2.0, 23.0);
  vec3 shell = vec3(shellCenter.x * 0.82 + shellCenter.z * 0.26,
    shellCenter.y, shellCenter.z * 0.85 - shellCenter.x * 0.32);
  float radius = length(shell * vec3(0.82, 1.0, 1.15));
  float ring = radius - 10.5 + (turbulence - 0.5) * 6.5 * ROUGHNESS;
  float envelope = exp(-pow(ring / (1.85 * THICKNESS), 2.0));
  float lace = smoothstep(0.28, 0.67, turbulence);
  float outer = exp(-pow((ring - 2.8) / 1.2, 2.0)) * 0.20;
  return vec2((envelope + outer) * lace * 0.24,
    exp(-abs(ring + 0.8) * 0.80));
#elif SCENE == 2
  // Bounded spacing and thickness keep three distinct silhouettes.
  float material = 0.0;
  float edge = 0.0;
  for (int j = 0; j < 3; j++) {
    float k = float(j);
    float top = 1.0 + k * 4.2;
    float bend = 2.2 * sin(p.y * 0.14 * CURL + k * 1.6);
    vec2 axis = vec2(1.0 + k * 9.0 + bend, 13.0 + k * 8.0);
    float radius = (2.0 + clamp((top - p.y) * 0.095, 0.0, 3.0)) * THICKNESS;
    float side = length((p.xz - axis) * vec2(1.0, 0.68)) - radius;
    float tip = p.y - top;
    float boundary = max(side, tip) + (turbulence - 0.5) * 8.0 * ROUGHNESS;
    float bulk = 1.0 - smoothstep(-1.0, 0.8, boundary);
    float mass = smoothstep(0.25, 0.66, turbulence);
    material += bulk * mass * 0.44;
    edge = max(edge, exp(-abs(boundary) * 0.9));
  }
  float mist = exp(-pow((p.z - 35.0) / 4.0, 2.0))
    * exp(-pow((p.y + 9.0) / 8.0, 2.0)) * 0.045;
  return vec2(material + mist, edge);
#else
  // Two separated, curling ribbons: variation cannot collapse the dark seam.
  float lane = p.y + p.x * 0.38 - 3.0
    - 3.1 * sin(p.x * 0.16 * CURL + p.z * 0.13)
    + (turbulence - 0.5) * 13.0 * ROUGHNESS;
  float ribbon = exp(-pow(lane / (2.6 * THICKNESS), 2.0));
  float second = exp(-pow((lane + 7.0) / (1.7 * THICKNESS), 2.0));
  float sheet = exp(-pow((p.z - 27.0) / 6.0, 2.0));
  float nearSheet = exp(-pow((p.z - 10.0) / 2.8, 2.0));
  float mass = smoothstep(0.25, 0.68, turbulence);
  float density = (ribbon + second * 0.7) * mass
    * (sheet * 0.25 + nearSheet * 0.16);
  return vec2(density, exp(-abs(lane - 0.7) * 0.50)
    + exp(-abs(lane + 6.5) * 0.7) * 0.6);
#endif
}

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  vec3 ray = u_camera * normalize(vec3(p.x * u_aspect * u_fov, p.y * u_fov, 1.0));
  vec3 color = vec3(0.0);
  float transmission = 1.0;
  const int STEPS = 36;
  float stepZ = 40.0 / float(STEPS);
  float stepLength = stepZ / max(ray.z, 0.1);
  for (int i = 0; i < STEPS; i++) {
    float z = 3.0 + (float(i) + 0.5) * stepZ;
    float t = (z - u_origin.z) / max(ray.z, 0.1);
    vec3 world = u_origin + ray * t;
    vec2 cloud = field(world);
    float alpha = 1.0 - exp(-cloud.x * DENSITY * stepLength);
#if SCENE == 0
    float warm = smoothstep(-4.0, 12.0, world.x);
#elif SCENE == 1
    float warm = smoothstep(-1.0, 11.0, world.y);
#elif SCENE == 2
    float warm = smoothstep(-5.0, 12.0, world.y);
#else
    float warm = smoothstep(-8.0, 18.0, world.x);
#endif
    vec3 dust = mix(DUST_A, DUST_B, warm);
    vec3 rim = mix(RIM_A, RIM_B, warm);
    float shadow = exp(-field(world + vec3(-1.4, 2.6, -1.1)).x * DENSITY * 8.0);
    vec3 light = dust * (0.10 + shadow * 1.4) + rim * cloud.y * RIM_GAIN;
    color += transmission * alpha * light;
    transmission *= 1.0 - alpha;
    if (transmission < 0.012) break;
  }
  float glow = exp(-length(p - vec2(0.38, 0.48)) * 1.3);
  vec3 background = vec3(0.002, 0.006, 0.016)
    + vec3(0.007, 0.028, 0.072) * glow;
  color += transmission * background;
  color = vec3(1.0) - exp(-color * EXPOSURE);
  color = pow(max(color, vec3(0.0)), vec3(0.4545));
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
  color += (dither - 0.5) / 255.0;
  outColor = vec4(color, transmission);
}`;

export function buildGalaxyFragment(
  preset: SkyPreset,
  recipe: SkyRecipe = canonicalSky(preset),
) {
  const scalar = (name: string, value: number) =>
    `const float ${name} = ${value.toFixed(6)};`;
  const vector = (name: string, value: readonly number[]) =>
    `const vec3 ${name} = vec3(${value.map((n) => n.toFixed(6)).join(', ')});`;
  // Only internally generated numeric constants reach GLSL. The raw seed does not.
  const constants = [
    vector('OFFSET', recipe.offset),
    vector('SCALE', recipe.scale),
    vector('DETAIL', recipe.detail),
    scalar('ROLL_C', Math.cos(recipe.roll)),
    scalar('ROLL_S', Math.sin(recipe.roll)),
    scalar('ROUGHNESS', recipe.roughness),
    scalar('THICKNESS', recipe.thickness),
    scalar('DENSITY', recipe.density),
    scalar('CURL', recipe.curl),
    scalar('EXPOSURE', recipe.exposure),
    scalar('RIM_GAIN', recipe.rimGain),
    vector('DUST_A', recipe.dustA),
    vector('DUST_B', recipe.dustB),
    vector('RIM_A', recipe.rimA),
    vector('RIM_B', recipe.rimB),
  ].join('\n');
  return nebulaSource
    .replace('#define SCENE 0', `#define SCENE ${preset.shader}`)
    .replace('/* SKY_RECIPE */', constants);
}

// Compile just one generated world; keep its recipe across context recovery.
export const galaxyFragment = buildGalaxyFragment(getSkyPreset(), getSkyRecipe());

export const compositeFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sky;
out vec4 outColor;
void main() { outColor = vec4(texture(u_sky, v_uv).rgb, 1.0); }`;

export const starVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in vec2 a_light;
uniform mat3 u_camera;
uniform vec3 u_origin;
uniform float u_aspect;
uniform float u_fov;
uniform float u_time;
uniform float u_pixelRatio;
uniform float u_pointMax;
out vec3 v_color;
out float v_bright;
out float v_depth;
void main() {
  vec3 pos = transpose(u_camera) * (a_position - u_origin);
  float phase = dot(a_position, vec3(0.713, 0.271, 0.437));
  float twinkle = 1.0 + 0.055 * sin(u_time * 0.8 + phase);
  v_color = a_color * a_light.x * twinkle;
  v_bright = smoothstep(0.72, 1.0, a_light.x);
  v_depth = a_position.z;
  gl_Position = pos.z > 0.1
    ? vec4(pos.x / (u_aspect * u_fov), pos.y / u_fov, 0.0, pos.z)
    : vec4(2.0, 2.0, 2.0, 1.0);
  float perspective = clamp((a_position.z + 11.0) / max(pos.z, 0.1), 0.6, 1.8);
  gl_PointSize = clamp(a_light.y * u_pixelRatio * perspective, 1.0, u_pointMax);
}`;

export const starFragment = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_bright;
in float v_depth;
uniform sampler2D u_sky;
uniform vec2 u_resolution;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float core = exp(-r * 85.0);
  float halo = exp(-r * 8.0) * 0.055;
  float spoke = exp(-abs(p.x) * 110.0)
    + exp(-abs(p.x * 0.5 + p.y * 0.866) * 110.0)
    + exp(-abs(p.x * 0.5 - p.y * 0.866) * 110.0);
  float spikes = spoke * exp(-length(p) * 5.0) * v_bright * 0.20;
  float dust = texture(u_sky, gl_FragCoord.xy / u_resolution).a;
  float extinction = mix(1.0, max(0.02, dust), smoothstep(6.0, 43.0, v_depth));
  outColor = vec4(v_color * (core + halo + spikes) * extinction, 1.0);
}`;
