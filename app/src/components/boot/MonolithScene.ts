/**
 * Boot scene drawn with plain WebGL 1: a floating rune monolith whose channels light up
 * with the boot progress, loose rocks orbiting it, embers rising and a canyon of crags
 * in the fog behind. No 3D library is used; the whole scene is a handful of draw calls.
 */

import { parseGlb, type GlbMesh } from "./glb";
import { lookAt, multiply, perspective, transform, type Mat4 } from "./math";
import {
  BACKGROUND_FRAGMENT,
  BLOOM_FRAGMENT,
  HALO_FRAGMENT,
  MESH_FRAGMENT,
  MESH_VERTEX,
  PARTICLE_FRAGMENT,
  PARTICLE_VERTEX,
  SCREEN_VERTEX,
  SPRITE_VERTEX,
} from "./shaders";

/** How much detail the scene draws. */
export type BootQuality = "low" | "medium" | "high";

interface QualityPreset {
  /** Largest device pixel ratio used for the canvas. */
  pixelRatio: number;
  /** Frames per second; lower saves power on modest machines. */
  fps: number;
  rocks: number;
  particles: number;
  antialias: boolean;
}

const QUALITY: Record<BootQuality, QualityPreset> = {
  low: { pixelRatio: 1, fps: 30, rocks: 6, particles: 40, antialias: false },
  medium: { pixelRatio: 1.25, fps: 60, rocks: 10, particles: 90, antialias: true },
  high: { pixelRatio: 2, fps: 60, rocks: 16, particles: 180, antialias: true },
};

/** Files of the monolith: the model and the textures of its front face. */
export interface SceneAssets {
  model: string;
  albedo: string;
  mask: string;
}

/** Colors of the scene, as linear-ish RGB in 0..1. */
export interface SceneColors {
  primary: [number, number, number];
  base: [number, number, number];
}

const EMBER: [number, number, number] = [1.0, 0.52, 0.22];
const CAMERA: [number, number, number] = [0, 0.1, 5.2];
const TARGET: [number, number, number] = [0, 0, 0];
const MONOLITH_HEIGHT = 2.5;
const MONOLITH_HALF_WIDTH = 1.0;
const MONOLITH_DEPTH = 0.45;
/** Seconds the final surge takes to climb the runes and settle. */
const FLARE_SECONDS = 1.4;

interface MeshBuffers {
  position: WebGLBuffer;
  normal: WebGLBuffer;
  uv: WebGLBuffer | null;
  index: WebGLBuffer;
  count: number;
  type: number;
}

interface Rock {
  mesh: number;
  radius: number;
  height: number;
  speed: number;
  phase: number;
  scale: number;
  bob: number;
  spin: [number, number, number];
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function compile(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader || !program) throw new Error("boot scene: cannot create shaders");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`boot scene: ${gl.getShaderInfoLog(shader) ?? "shader error"}`);
    }
    gl.attachShader(program, shader);
  }
  if (!program) throw new Error("boot scene: cannot create a program");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`boot scene: ${gl.getProgramInfoLog(program) ?? "link error"}`);
  }
  return program;
}

function buffer(gl: WebGLRenderingContext, data: BufferSource, target: number = gl.ARRAY_BUFFER): WebGLBuffer {
  const created = gl.createBuffer();
  if (!created) throw new Error("boot scene: cannot create a buffer");
  gl.bindBuffer(target, created);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return created;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  return image;
}

function texture(gl: WebGLRenderingContext, image: HTMLImageElement, mipmaps: boolean): WebGLTexture {
  const created = gl.createTexture();
  if (!created) throw new Error("boot scene: cannot create a texture");
  gl.bindTexture(gl.TEXTURE_2D, created);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const powerOfTwo = (value: number) => (value & (value - 1)) === 0;
  if (mipmaps && powerOfTwo(image.width) && powerOfTwo(image.height)) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  return created;
}

/** A running boot scene on a canvas. */
export class MonolithScene {
  private readonly gl: WebGLRenderingContext;
  private readonly preset: QualityPreset;
  private readonly background: WebGLProgram;
  private readonly meshProgram: WebGLProgram;
  private readonly halo: WebGLProgram;
  private readonly bloom: WebGLProgram;
  private readonly particlesProgram: WebGLProgram;
  private readonly screen: WebGLBuffer;
  private readonly quad: WebGLBuffer;
  private readonly seeds: WebGLBuffer;
  private readonly meshes: MeshBuffers[];
  private readonly albedo: WebGLTexture;
  private readonly mask: WebGLTexture;
  private readonly rocks: Rock[];
  private colors: SceneColors = { primary: [0.44, 0.81, 0.75], base: [0.075, 0.086, 0.082] };
  private progress = 0;
  private shownProgress = 0;
  private activity = 0;
  private shownActivity = 0;
  private complete = false;
  private flare = 0;
  private frame = 0;
  private last = 0;
  private time = 0;
  private running = false;

  private readonly canvas: HTMLCanvasElement;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    quality: BootQuality,
    glb: GlbMesh[],
    albedo: HTMLImageElement,
    mask: HTMLImageElement,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.preset = QUALITY[quality];
    this.background = compile(gl, SCREEN_VERTEX, BACKGROUND_FRAGMENT);
    this.meshProgram = compile(gl, MESH_VERTEX, MESH_FRAGMENT);
    this.halo = compile(gl, SPRITE_VERTEX, HALO_FRAGMENT);
    this.bloom = compile(gl, SPRITE_VERTEX, BLOOM_FRAGMENT);
    this.particlesProgram = compile(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    this.screen = buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.quad = buffer(gl, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));

    const uint32 = gl.getExtension("OES_element_index_uint") !== null;
    this.meshes = glb
      .filter((mesh) => uint32 || mesh.indices instanceof Uint16Array)
      .map((mesh) => ({
        position: buffer(gl, mesh.positions),
        normal: buffer(gl, mesh.normals),
        uv: mesh.uvs ? buffer(gl, mesh.uvs) : null,
        index: buffer(gl, mesh.indices, gl.ELEMENT_ARRAY_BUFFER),
        count: mesh.indices.length,
        type: mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      }));
    if (this.meshes.length === 0 || !this.meshes[0].uv) throw new Error("boot scene: the model has no textured monolith");

    this.albedo = texture(gl, albedo, false);
    this.mask = texture(gl, mask, true);

    const random = seeded(20261127);
    const seeds = new Float32Array(this.preset.particles * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    this.seeds = buffer(gl, seeds);

    const rockMeshes = Math.max(1, this.meshes.length - 1);
    this.rocks = Array.from({ length: this.preset.rocks }, (_, index) => ({
      mesh: 1 + (index % rockMeshes),
      radius: 1.45 + random() * 1.4,
      height: -1.0 + random() * 2.4,
      speed: (0.06 + random() * 0.16) * (index % 2 === 0 ? 1 : -1),
      phase: random() * Math.PI * 2,
      scale: 0.07 + random() * random() * 0.32,
      bob: 0.04 + random() * 0.12,
      spin: [random() * 0.6, random() * 0.8, random() * 0.5],
    }));
  }

  /** Load the assets and start a scene, or throw when WebGL or the assets are missing. */
  static async create(canvas: HTMLCanvasElement, assets: SceneAssets, quality: BootQuality): Promise<MonolithScene> {
    const preset = QUALITY[quality];
    const gl = canvas.getContext("webgl", {
      antialias: preset.antialias,
      alpha: false,
      depth: true,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("boot scene: WebGL is not available");
    const [model, albedo, mask] = await Promise.all([
      fetch(assets.model).then((response) => {
        if (!response.ok) throw new Error(`boot scene: model ${response.status}`);
        return response.arrayBuffer();
      }),
      loadImage(assets.albedo),
      loadImage(assets.mask),
    ]);
    return new MonolithScene(canvas, gl, quality, parseGlb(model), albedo, mask);
  }

  setProgress(progress: number) {
    this.progress = Math.max(0, Math.min(1, progress));
  }

  setActivity(activity: number) {
    this.activity = Math.max(0, Math.min(1, activity));
  }

  setComplete(complete: boolean) {
    if (complete && !this.complete) this.flare = 1;
    this.complete = complete;
  }

  setColors(colors: SceneColors) {
    this.colors = colors;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(loop);
      const step = 1000 / this.preset.fps;
      const elapsed = now - this.last;
      if (elapsed < step - 1) return;
      this.last = now;
      this.tick(Math.min(elapsed, 100) / 1000);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  /**
   * Stop drawing. The context is not lost on purpose: the same canvas may start a new
   * scene (React mounts effects twice in development), and the browser frees the context
   * with the canvas.
   */
  dispose() {
    this.stop();
  }

  private resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private tick(delta: number) {
    this.time += delta;
    const ease = 1 - Math.exp(-delta * 3);
    this.shownProgress += (this.progress - this.shownProgress) * ease;
    this.shownActivity += (this.activity - this.shownActivity) * (1 - Math.exp(-delta * 2));
    this.flare = Math.max(0, this.flare - delta / FLARE_SECONDS);
    this.resize();
    this.draw();
  }

  private draw() {
    const { gl } = this;
    const t = this.time;
    const progress = this.shownProgress;
    // The final surge is a soft bell, so it rises and settles instead of popping.
    const surge = Math.sin(Math.PI * this.flare);
    const energy = 0.35 + 0.65 * progress + 0.25 * surge;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
    const [pr, pg, pb] = this.colors.primary;
    const [br, bg, bb] = this.colors.base;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const aspect = this.canvas.width / this.canvas.height;
    const viewProjection = multiply(perspective((32 * Math.PI) / 180, aspect, 0.1, 40), lookAt(CAMERA, TARGET));

    // Background.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.resetAttributes();
    gl.useProgram(this.background);
    this.attribute(this.background, "aPosition", this.screen, 2);
    gl.uniform3f(gl.getUniformLocation(this.background, "uBase"), br, bg, bb);
    gl.uniform3f(gl.getUniformLocation(this.background, "uColor"), pr, pg, pb);
    gl.uniform1f(gl.getUniformLocation(this.background, "uTime"), t);
    gl.uniform1f(gl.getUniformLocation(this.background, "uProgress"), Math.min(1, progress + surge * 0.2));
    gl.uniform1f(gl.getUniformLocation(this.background, "uAspect"), aspect);
    gl.uniform2f(gl.getUniformLocation(this.background, "uFocus"), 0.5, 0.58);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Monolith: levitates, sways and lifts a little higher as the energy grows.
    const lift = 0.04 * Math.sin(t * 0.9) + 0.05 * progress;
    const monolithPosition: [number, number, number] = [0, 0.08 + lift, 0];
    const monolith = transform(monolithPosition, [0.015 * Math.sin(t * 0.5), 0.08 * Math.sin(t * 0.27), 0.01 * Math.sin(t * 0.43)], 1);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.resetAttributes();
    gl.useProgram(this.meshProgram);
    const meshUniform = (name: string) => gl.getUniformLocation(this.meshProgram, name);
    gl.uniformMatrix4fv(meshUniform("uViewProjection"), false, viewProjection);
    gl.uniform3f(meshUniform("uColor"), pr, pg, pb);
    gl.uniform3f(meshUniform("uBase"), br, bg, bb);
    gl.uniform3f(meshUniform("uEmber"), EMBER[0], EMBER[1], EMBER[2]);
    gl.uniform3f(meshUniform("uCamera"), CAMERA[0], CAMERA[1], CAMERA[2]);
    gl.uniform3f(meshUniform("uCenter"), monolithPosition[0], monolithPosition[1], monolithPosition[2]);
    gl.uniform1f(meshUniform("uProgress"), Math.min(1.02, progress + (this.complete ? 0.05 : 0)));
    gl.uniform1f(meshUniform("uTime"), t);
    gl.uniform1f(meshUniform("uPulse"), pulse);
    gl.uniform1f(meshUniform("uFlare"), this.flare);
    gl.uniform1f(meshUniform("uSurge"), surge);
    gl.uniform1f(meshUniform("uGlow"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.albedo);
    gl.uniform1i(meshUniform("uAlbedo"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.uniform1i(meshUniform("uMask"), 1);

    gl.uniform1f(meshUniform("uTextured"), 1);
    this.drawMesh(0, monolith);

    // Rocks orbit faster while resources download and as the boot advances.
    gl.uniform1f(meshUniform("uTextured"), 0);
    gl.uniform1f(meshUniform("uGlow"), 0);
    const pace = 1 + this.shownActivity * 2.2 + progress * 0.6 + surge * 1.5;
    for (const rock of this.rocks) {
      const angle = rock.phase + t * rock.speed * pace;
      const position: [number, number, number] = [
        Math.cos(angle) * rock.radius,
        rock.height + monolithPosition[1] + Math.sin(t * 0.8 + rock.phase) * rock.bob + progress * 0.15,
        Math.sin(angle) * rock.radius * 0.55,
      ];
      const spin: [number, number, number] = [t * rock.spin[0], t * rock.spin[1] + rock.phase, t * rock.spin[2]];
      this.drawMesh(rock.mesh, transform(position, spin, rock.scale));
    }

    // Additive light: halo behind, rune bloom in front, embers.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);

    this.resetAttributes();
    gl.useProgram(this.halo);
    this.sprite(this.halo, viewProjection, [0, monolithPosition[1] + 0.3, -0.6], [3.2, 3.0], [1, 0, 0], [0, 1, 0]);
    gl.uniform3f(gl.getUniformLocation(this.halo, "uColor"), pr, pg, pb);
    gl.uniform1f(gl.getUniformLocation(this.halo, "uIntensity"), 0.12 + 0.3 * energy * (0.85 + 0.15 * pulse));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.DEPTH_TEST);
    this.resetAttributes();
    gl.useProgram(this.bloom);
    const right: [number, number, number] = [monolith[0], monolith[1], monolith[2]];
    const up: [number, number, number] = [monolith[4], monolith[5], monolith[6]];
    const forward: [number, number, number] = [monolith[8], monolith[9], monolith[10]];
    const front = MONOLITH_DEPTH / 2 + 0.04;
    this.sprite(
      this.bloom,
      viewProjection,
      [monolithPosition[0] + forward[0] * front, monolithPosition[1] + forward[1] * front, forward[2] * front],
      [MONOLITH_HALF_WIDTH, MONOLITH_HEIGHT / 2],
      right,
      up,
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask);
    gl.uniform1i(gl.getUniformLocation(this.bloom, "uMask"), 1);
    gl.uniform3f(gl.getUniformLocation(this.bloom, "uColor"), pr, pg, pb);
    gl.uniform1f(gl.getUniformLocation(this.bloom, "uProgress"), progress);
    gl.uniform1f(gl.getUniformLocation(this.bloom, "uIntensity"), 0.32 + 0.1 * pulse + surge * 0.25);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    this.resetAttributes();
    gl.useProgram(this.particlesProgram);
    this.attribute(this.particlesProgram, "aSeed", this.seeds, 4);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.particlesProgram, "uViewProjection"), false, viewProjection);
    gl.uniform1f(gl.getUniformLocation(this.particlesProgram, "uTime"), t);
    gl.uniform1f(gl.getUniformLocation(this.particlesProgram, "uSpeed"), 0.7 + this.shownActivity * 1.6 + surge);
    gl.uniform1f(gl.getUniformLocation(this.particlesProgram, "uScale"), this.canvas.height / 360);
    gl.uniform3f(gl.getUniformLocation(this.particlesProgram, "uColor"), pr, pg, pb);
    gl.uniform3f(gl.getUniformLocation(this.particlesProgram, "uEmber"), EMBER[0], EMBER[1], EMBER[2]);
    gl.uniform1f(gl.getUniformLocation(this.particlesProgram, "uIntensity"), 0.5 + 0.5 * energy);
    gl.drawArrays(gl.POINTS, 0, this.preset.particles);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** Turn off every vertex array, so arrays of a previous pass never reach the next one. */
  private resetAttributes() {
    for (let location = 0; location < 8; location++) this.gl.disableVertexAttribArray(location);
  }

  private attribute(program: WebGLProgram, name: string, source: WebGLBuffer, size: number) {
    const { gl } = this;
    const location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, source);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  private sprite(
    program: WebGLProgram,
    viewProjection: Mat4,
    center: [number, number, number],
    size: [number, number],
    right: [number, number, number],
    up: [number, number, number],
  ) {
    const { gl } = this;
    this.attribute(program, "aCorner", this.quad, 2);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
    gl.uniform3f(gl.getUniformLocation(program, "uCenter"), center[0], center[1], center[2]);
    gl.uniform2f(gl.getUniformLocation(program, "uSize"), size[0], size[1]);
    gl.uniform3f(gl.getUniformLocation(program, "uRight"), right[0], right[1], right[2]);
    gl.uniform3f(gl.getUniformLocation(program, "uUp"), up[0], up[1], up[2]);
  }

  private drawMesh(index: number, model: Mat4) {
    const { gl } = this;
    const mesh = this.meshes[index];
    if (!mesh) return;
    gl.uniformMatrix4fv(gl.getUniformLocation(this.meshProgram, "uModel"), false, model);
    this.attribute(this.meshProgram, "aPosition", mesh.position, 3);
    this.attribute(this.meshProgram, "aNormal", mesh.normal, 3);
    const uvLocation = gl.getAttribLocation(this.meshProgram, "aUv");
    if (mesh.uv) {
      this.attribute(this.meshProgram, "aUv", mesh.uv, 2);
    } else if (uvLocation >= 0) {
      gl.disableVertexAttribArray(uvLocation);
      gl.vertexAttrib2f(uvLocation, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
  }
}
