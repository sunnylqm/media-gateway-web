// Original procedural sky, not a star catalogue or an astronomical simulation.
// Diffuse starlight is rendered at a lower resolution; stars stay pixel-sharp.
export const fullscreenVertex = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const galaxyFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform mat3 u_camera;
uniform float u_aspect;
uniform float u_fov;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float sum = 0.0, weight = 0.53;
  for (int i = 0; i < 6; i++) {
    sum += weight * noise(p);
    p = p * 2.03 + vec3(5.2, 9.1, 2.8);
    weight *= 0.49;
  }
  return sum;
}
void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  vec3 ray = u_camera * normalize(vec3(p.x * u_aspect * u_fov, p.y * u_fov, 1.0));
  vec3 normal = normalize(vec3(-0.58, 0.81, -0.03));
  vec3 tangent = normalize(vec3(0.81, 0.58, 0.0));
  vec3 forward = cross(tangent, normal);
  float latitude = asin(clamp(dot(ray, normal), -1.0, 1.0));
  float longitude = atan(dot(ray, tangent), dot(ray, forward));
  vec3 q = ray * 7.0;
  vec3 warp = vec3(fbm(q + 9.0), fbm(q - 6.0), fbm(q + 24.0));
  float filaments = fbm(q * 2.8 + warp * 2.4);
  float grain = noise(q * 170.0);
  float haze = exp(-pow(latitude / 0.21, 2.0));
  float spine = exp(-pow(latitude / 0.083, 2.0));
  float core = exp(-pow((longitude - 0.61) / 0.38, 2.0));
  float cloud = pow(max(filaments, 0.0), 2.0) * 2.8;
  float riftCenter = 0.018 + (fbm(q * 1.2 + 46.0) - 0.5) * 0.065;
  float rift = exp(-pow((latitude - riftCenter) / 0.034, 2.0));
  float knots = smoothstep(0.38, 0.72, fbm(q * 5.1 + warp * 3.0));
  float extinction = exp(-rift * (1.0 + 3.2 * knots) - haze * knots * 1.4);
  vec3 cold = vec3(0.30, 0.41, 0.59);
  vec3 warm = vec3(0.88, 0.68, 0.44);
  vec3 light = mix(cold, warm, core * 0.84);
  float density = haze * (0.028 + cloud * 0.28) + spine * cloud * (0.13 + core * 0.27);
  vec3 color = vec3(0.004, 0.007, 0.015);
  color += light * density * extinction;
  color += vec3(0.19, 0.23, 0.36) * haze * cloud * 0.035;
  // Restrained emission pockets, not animated rainbow clouds.
  float emission = pow(max(fbm(q * 3.3 + 61.0) - 0.48, 0.0), 2.0);
  color += vec3(0.56, 0.15, 0.21) * emission * spine * 1.7;
  color += light * max(grain - 0.62, 0.0) * spine * cloud * 0.17;
  // Exposure and a film-like shoulder; dither avoids bands in the dark sky.
  color = vec3(1.0) - exp(-color * 1.9);
  color = pow(max(color, vec3(0.0)), vec3(0.4545));
  color += (hash(vec3(gl_FragCoord.xy, 17.0)) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}`;

export const compositeFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sky;
out vec4 outColor;
void main() { outColor = texture(u_sky, v_uv); }`;

export const starVertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
layout(location=2) in vec2 a_light;
uniform mat3 u_camera;
uniform float u_aspect;
uniform float u_fov;
uniform float u_time;
uniform float u_pixelRatio;
uniform float u_pointMax;
out vec3 v_color;
out float v_bright;
void main() {
  vec3 pos = transpose(u_camera) * a_position;
  float phase = dot(a_position, vec3(71.3, 27.1, 43.7));
  float twinkle = 1.0 + 0.12 * sin(u_time * 1.35 + phase)
                          * sin(u_time * 0.61 + phase * 2.3);
  v_color = a_color * a_light.x * twinkle;
  v_bright = smoothstep(0.65, 1.0, a_light.x);
  gl_Position = pos.z > 0.02
    ? vec4(pos.x / (u_aspect * u_fov), pos.y / u_fov, 0.0, pos.z)
    : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = clamp(a_light.y * u_pixelRatio, 1.0, u_pointMax);
}`;

export const starFragment = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_bright;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float core = exp(-r * 65.0);
  float halo = exp(-r * 8.0) * 0.065;
  float spike = (exp(-abs(p.x) * 110.0) + exp(-abs(p.y) * 110.0))
             * exp(-length(p) * 7.0) * v_bright * 0.14;
  outColor = vec4(v_color * (core + halo + spike), 1.0);
}`;
