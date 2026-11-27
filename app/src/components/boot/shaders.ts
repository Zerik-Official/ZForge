/**
 * GLSL ES 1.0 shaders of the boot scene (WebGL 1, so it runs on modest GPUs).
 */

/** Full-screen triangle shared by the background pass. */
export const SCREEN_VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * Background: a dark canyon of jagged crags in three layers of fog, lit from behind the
 * monolith by the primary color as the boot advances.
 */
export const BACKGROUND_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uBase;
uniform vec3 uColor;
uniform float uTime;
uniform float uProgress;
uniform float uAspect;
uniform vec2 uFocus;

float hash(float n) { return fract(sin(n) * 43758.5453); }
float noise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), u);
}
float ridge(float x, float seed) {
  float h = 0.0;
  float a = 0.5;
  float f = 1.0;
  for (int i = 0; i < 4; i++) {
    h += a * (1.0 - abs(noise(x * f + seed) * 2.0 - 1.0));
    f *= 2.07;
    a *= 0.5;
  }
  return h;
}
float crags(vec2 p, float seed, float height, float drift) {
  float side = abs(p.x - 0.5) * 2.0;
  float wall = mix(0.08, height, smoothstep(0.08, 0.95, side));
  float h = wall + ridge(p.x * 3.4 + seed + uTime * drift, seed) * 0.32 * (0.35 + side);
  return smoothstep(h + 0.004, h - 0.004, p.y);
}

void main() {
  vec2 p = vUv;
  vec2 q = vec2((p.x - 0.5) * uAspect + 0.5, p.y);
  float light = uProgress;

  vec3 sky = mix(uBase * 0.55, uBase * 1.35 + uColor * 0.05, smoothstep(0.0, 0.9, p.y));
  float halo = exp(-pow(length((q - uFocus) * vec2(0.9, 0.6)) * 2.3, 2.0));
  vec3 color = sky + uColor * halo * (0.04 + 0.12 * light);

  float far = crags(vec2(q.x, p.y), 11.0, 0.78, 0.002);
  float mid = crags(vec2(q.x, p.y + 0.06), 37.0, 0.62, 0.004);
  float near = crags(vec2(q.x, p.y + 0.16), 73.0, 0.5, 0.0);
  vec3 farTone = mix(uBase * 1.2, uColor * 0.16, 0.12 + 0.12 * light) * (0.75 + halo * 0.5);
  vec3 midTone = uBase * 0.85 + uColor * 0.05 * halo * light;
  vec3 nearTone = uBase * 0.42;
  color = mix(color, farTone, far * 0.9);
  color = mix(color, midTone, mid);
  color = mix(color, nearTone, near);

  float fog = smoothstep(0.42, 0.0, p.y) * (0.55 + 0.1 * sin(uTime * 0.3 + p.x * 6.0));
  color = mix(color, uBase * 0.9 + uColor * 0.06, fog * 0.6);

  float vignette = smoothstep(1.25, 0.35, length((p - 0.5) * vec2(uAspect, 1.0)));
  gl_FragColor = vec4(color * vignette, 1.0);
}`;

/** Lit meshes: the monolith (textured) and the floating rocks. */
export const MESH_VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProjection;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal);
  vUv = aUv;
  gl_Position = uViewProjection * world;
}`;

export const MESH_FRAGMENT = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
uniform sampler2D uAlbedo;
uniform sampler2D uMask;
uniform float uTextured;
uniform vec3 uColor;
uniform vec3 uBase;
uniform vec3 uEmber;
uniform vec3 uCamera;
uniform vec3 uCenter;
uniform float uProgress;
uniform float uTime;
uniform float uPulse;
uniform float uFlare;
uniform float uSurge;
uniform float uGlow;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(uCamera - vWorld);

  vec3 albedo = vec3(0.16, 0.18, 0.18);
  vec3 mask = vec3(0.0, 0.0, 1.0);
  if (uTextured > 0.5) {
    albedo = texture2D(uAlbedo, vUv).rgb;
    mask = texture2D(uMask, vUv).rgb;
  }

  vec3 key = normalize(vec3(-0.5, 0.8, 0.6));
  vec3 fill = normalize(vec3(0.7, 0.2, 0.5));
  float diffuse = max(dot(normal, key), 0.0) * 0.55 + max(dot(normal, fill), 0.0) * 0.18;
  float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.5);

  // Light the energy gives the surroundings: rocks closer to the monolith catch more.
  float near = 1.0 / (1.0 + dot(vWorld - uCenter, vWorld - uCenter) * 0.35);
  vec3 bounce = uColor * (0.08 + 0.5 * uProgress) * near * (0.4 + 0.6 * max(normal.z, 0.0));

  vec3 color = albedo * (0.18 + diffuse) + bounce * albedo * 2.0;
  color += uColor * rim * (0.08 + 0.35 * uProgress);
  color += uEmber * rim * 0.04;

  // Runes light from the bottom up as the progress passes their order (mask.b).
  float lit = smoothstep(mask.b - 0.03, mask.b + 0.01, uProgress);
  float flow = 0.75 + 0.25 * sin(uTime * 2.2 - mask.b * 14.0);
  // When the boot ends a band of light climbs the runes once (uFlare goes from 1 to 0).
  float wave = exp(-pow((mask.b - (1.0 - uFlare) * 1.15 + 0.05) * 7.0, 2.0)) * step(0.001, uFlare);
  float rune = mask.r * lit * flow * (1.4 + uPulse * 0.4 + uSurge * 0.35 + wave * 0.9);
  float dormant = mask.r * (1.0 - lit) * 0.12;
  float crack = mask.g * (0.25 + 1.1 * uProgress) * (0.65 + 0.35 * sin(uTime * 3.1 + vUv.y * 40.0));
  color += uColor * (rune * 0.62 + crack * 0.9 + dormant) * uGlow;
  color += mix(uColor, vec3(1.0), 0.35) * pow(min(mask.r * lit, 1.0), 4.0) * 0.18 * uGlow;

  // The foot of the monolith sinks into the fog.
  float foot = mix(1.0, smoothstep(0.98, 0.62, vUv.y), uTextured);
  color = mix(uBase * 0.7, color, foot);

  gl_FragColor = vec4(color, 1.0);
}`;

/** Camera-facing quads drawn additively: halos and the rune bloom. */
export const SPRITE_VERTEX = `
attribute vec2 aCorner;
uniform mat4 uViewProjection;
uniform vec3 uCenter;
uniform vec2 uSize;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  vec3 world = uCenter + uRight * aCorner.x * uSize.x + uUp * aCorner.y * uSize.y;
  gl_Position = uViewProjection * vec4(world, 1.0);
}`;

export const HALO_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(1.0, 0.7)) * 2.0;
  float glow = exp(-r * r * 3.2) * 0.9 + exp(-r * 6.0) * 0.4;
  gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
}`;

/** Soft copy of the rune mask in front of the monolith: cheap bloom from a blurred mip. */
export const BLOOM_FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform vec3 uColor;
uniform float uProgress;
uniform float uIntensity;
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 m = texture2D(uMask, uv, 4.0).rgb;
  float lit = smoothstep(m.b - 0.05, m.b + 0.02, uProgress);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.36, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
  gl_FragColor = vec4(uColor * m.r * lit * uIntensity * edge, 1.0);
}`;

/** Embers and motes rising around the monolith. */
export const PARTICLE_VERTEX = `
attribute vec4 aSeed;
uniform mat4 uViewProjection;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
varying float vAlpha;
varying float vWarm;
void main() {
  float life = fract(aSeed.w + uTime * (0.05 + aSeed.z * 0.07) * uSpeed);
  float angle = aSeed.x * 6.2831 + uTime * 0.15 * (aSeed.y - 0.5);
  float radius = 0.4 + aSeed.y * 2.6;
  vec3 position = vec3(cos(angle) * radius, -1.6 + life * 4.2, sin(angle) * radius * 0.7 - 0.2);
  position.x += sin(uTime * (0.6 + aSeed.z) + aSeed.x * 20.0) * 0.12;
  vAlpha = sin(life * 3.14159) * (0.35 + 0.65 * aSeed.z);
  vWarm = step(0.55, aSeed.y);
  vec4 clip = uViewProjection * vec4(position, 1.0);
  gl_Position = clip;
  gl_PointSize = (1.5 + aSeed.z * 3.5) * uScale / clip.w * 4.0;
}`;

export const PARTICLE_FRAGMENT = `
precision mediump float;
varying float vAlpha;
varying float vWarm;
uniform vec3 uColor;
uniform vec3 uEmber;
uniform float uIntensity;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float soft = smoothstep(0.5, 0.0, length(d));
  vec3 color = mix(uColor, uEmber, vWarm);
  gl_FragColor = vec4(color * soft * vAlpha * uIntensity, 1.0);
}`;
