/**
 * Minimal reader for binary glTF (`.glb`) files with plain triangle meshes: positions,
 * normals, optional texture coordinates and indices. Materials, skins and animations
 * are ignored; the boot scene draws every mesh with its own shaders.
 */

/** A triangle mesh read from a `.glb` file. */
export interface GlbMesh {
  name: string;
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  uvs: Float32Array<ArrayBuffer> | null;
  indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>;
}

interface Accessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4";
}

interface BufferView {
  byteOffset?: number;
  byteLength: number;
}

interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
}

interface Document {
  meshes?: { name?: string; primitives: Primitive[] }[];
  accessors?: Accessor[];
  bufferViews?: BufferView[];
}

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENTS: Record<Accessor["type"], number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(
  document: Document,
  binary: ArrayBuffer,
  index: number,
): Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  const accessor = document.accessors?.[index];
  const view = accessor ? document.bufferViews?.[accessor.bufferView] : undefined;
  if (!accessor || !view) throw new Error(`glb: accessor ${index} is missing`);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const length = accessor.count * COMPONENTS[accessor.type];
  switch (accessor.componentType) {
    case 5126:
      return new Float32Array(binary.slice(offset, offset + length * 4));
    case 5123:
      return new Uint16Array(binary.slice(offset, offset + length * 2));
    case 5125:
      return new Uint32Array(binary.slice(offset, offset + length * 4));
    default:
      throw new Error(`glb: component type ${accessor.componentType} is not supported`);
  }
}

/** Read every mesh of a `.glb` file. */
export function parseGlb(data: ArrayBuffer): GlbMesh[] {
  const header = new DataView(data);
  if (header.getUint32(0, true) !== MAGIC) throw new Error("glb: not a binary glTF file");

  let offset = 12;
  let document: Document | null = null;
  let binary: ArrayBuffer | null = null;
  while (offset + 8 <= data.byteLength) {
    const length = header.getUint32(offset, true);
    const type = header.getUint32(offset + 4, true);
    const chunk = data.slice(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) document = JSON.parse(new TextDecoder().decode(chunk)) as Document;
    if (type === BIN_CHUNK) binary = chunk;
    offset += 8 + length;
  }
  if (!document || !binary) throw new Error("glb: missing JSON or binary chunk");

  const meshes: GlbMesh[] = [];
  for (const [meshIndex, mesh] of (document.meshes ?? []).entries()) {
    const primitive = mesh.primitives[0];
    if (!primitive || primitive.indices === undefined) continue;
    const { POSITION, NORMAL, TEXCOORD_0 } = primitive.attributes;
    if (POSITION === undefined || NORMAL === undefined) continue;
    const indices = read(document, binary, primitive.indices);
    if (indices instanceof Float32Array) throw new Error("glb: float indices");
    meshes.push({
      name: mesh.name ?? `mesh${meshIndex}`,
      positions: read(document, binary, POSITION) as Float32Array<ArrayBuffer>,
      normals: read(document, binary, NORMAL) as Float32Array<ArrayBuffer>,
      uvs: TEXCOORD_0 === undefined ? null : (read(document, binary, TEXCOORD_0) as Float32Array<ArrayBuffer>),
      indices,
    });
  }
  return meshes;
}
