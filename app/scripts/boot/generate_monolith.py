"""Generate the boot screen monolith: a low-poly model and its textures.

Outputs, in ``app/public/assets/boot``:

- ``monolith.glb``: the monolith (positions, normals, uvs) and six loose rocks
  (positions, normals), one mesh each, in a single binary buffer.
- ``monolith-albedo.png``: dark slate with painted cracks, mapped on the front face.
- ``monolith-mask.png``: energy mask. R = rune channels, G = glowing cracks,
  B = order in which the runes light up as the boot advances (0 first, 1 last).

Run from the repository root:  python app/scripts/boot/generate_monolith.py
Requires numpy and Pillow. The output is deterministic (fixed seed).
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SEED = 7
OUT = Path(__file__).resolve().parents[2] / "public" / "assets" / "boot"
TEXTURE_W, TEXTURE_H = 512, 1024

# Monolith size in model units: x width, y height, z depth.
WIDTH, HEIGHT, DEPTH = 2.0, 2.5, 0.45
GRID_X, GRID_Y = 28, 50

# The textures are painted on a canvas with the proportions of the front face, so circles
# stay round, and then resized to a power of two for mipmaps.
DESIGN_W = 1024
DESIGN_H = int(round(DESIGN_W * HEIGHT / WIDTH))
FACE_RATIO = HEIGHT / WIDTH

rng = np.random.default_rng(SEED)


# --------------------------------------------------------------------------- noise


def value_noise(width: int, height: int, scale: float, octaves: int, seed: int) -> np.ndarray:
    """Smooth fractal value noise in [0, 1]."""
    generator = np.random.default_rng(seed)
    result = np.zeros((height, width), dtype=np.float32)
    amplitude, total = 1.0, 0.0
    for octave in range(octaves):
        cells = max(2, int(scale * 2**octave))
        grid = generator.random((cells + 1, cells + 1)).astype(np.float32)
        small = Image.fromarray((grid * 255).astype(np.uint8))
        layer = np.asarray(small.resize((width, height), Image.BICUBIC), dtype=np.float32) / 255.0
        result += layer * amplitude
        total += amplitude
        amplitude *= 0.5
    return result / total


def noise3(x: float, y: float, z: float) -> float:
    """Cheap deterministic 3D noise for vertex jitter."""
    return (
        math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
    ) % 1.0 - 0.5


# --------------------------------------------------------------------------- monolith mesh


# Chips taken out of the outline: (height, side, depth, size), side -1 left, +1 right.
CHIPS = [(0.22, -1, 0.05, 0.05), (0.52, 1, 0.04, 0.06), (0.69, -1, 0.035, 0.04), (0.86, 1, 0.05, 0.035), (0.1, 1, 0.03, 0.04)]


def silhouette(v: float, side: float) -> float:
    """Half width of the slab at height v (0 bottom, 1 top) on one side: slightly tapered,
    with an arched top, rough edges and a few chips."""
    taper = 1.0 - 0.08 * v
    if v > 0.74:
        t = (v - 0.74) / 0.26
        lean = 0.06 * side
        taper *= math.sqrt(max(0.03, 1.0 - (t * (1.0 + lean)) ** 2 * 0.94))
    wobble = 0.012 * math.sin(v * 23.0 + side * 1.7) + 0.008 * math.sin(v * 61.0 + side * 4.1)
    bite = sum(
        depth * math.exp(-(((v - height) / size) ** 2))
        for height, chip_side, depth, size in CHIPS
        if chip_side == side
    )
    return 0.5 * WIDTH * taper * (1.0 + wobble) - bite * 1.1


def build_monolith() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    positions: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    indices: list[int] = []

    def face(sign: float) -> None:
        start = len(positions)
        for j in range(GRID_Y + 1):
            v = j / GRID_Y
            left, right = silhouette(v, -1.0), silhouette(v, 1.0)
            for i in range(GRID_X + 1):
                u = i / GRID_X
                x = -left + u * (left + right)
                y = v * HEIGHT
                # Planar mapping: the texture lies flat on the face, so the runes stay true.
                planar_u = x / WIDTH + 0.5
                edge = min(u, 1 - u, v, 1 - v)
                bevel = min(1.0, edge * 7)
                z = sign * (DEPTH / 2) * (0.35 + 0.65 * bevel ** 0.7)
                jitter = noise3(x * 3.1, y * 2.7, sign) * 0.03 + noise3(x * 9.0, y * 8.0, sign * 2) * 0.012
                z += sign * jitter
                x += noise3(y * 5.0, sign, x) * 0.01
                positions.append((x, y, z))
                uvs.append((planar_u if sign > 0 else 1 - planar_u, 1 - v))
        row = GRID_X + 1
        for j in range(GRID_Y):
            for i in range(GRID_X):
                a = start + j * row + i
                b, c, d = a + 1, a + row, a + row + 1
                if sign > 0:
                    indices.extend([a, b, d, a, d, c])
                else:
                    indices.extend([a, d, b, a, c, d])

    face(+1.0)
    face(-1.0)

    # Side band joining the outline of both faces.
    row = GRID_X + 1
    back_start = (GRID_Y + 1) * row
    outline: list[int] = []
    outline += [j * row for j in range(GRID_Y + 1)]
    outline += [GRID_Y * row + i for i in range(1, GRID_X + 1)]
    outline += [j * row + GRID_X for j in range(GRID_Y - 1, -1, -1)]
    outline += [i for i in range(GRID_X - 1, 0, -1)]
    for k in range(len(outline)):
        a = outline[k]
        b = outline[(k + 1) % len(outline)]
        fa, fb = a, b
        ba, bb = a + back_start, b + back_start
        indices += [fa, ba, bb, fa, bb, fb]

    pos = np.asarray(positions, dtype=np.float32)
    pos[:, 1] -= HEIGHT / 2
    uv = np.asarray(uvs, dtype=np.float32)
    idx = np.asarray(indices, dtype=np.uint32)
    return pos, compute_normals(pos, idx), uv, idx


def compute_normals(pos: np.ndarray, idx: np.ndarray) -> np.ndarray:
    normals = np.zeros_like(pos)
    tris = idx.reshape(-1, 3)
    a, b, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    face_normals = np.cross(b - a, c - a)
    for corner in range(3):
        np.add.at(normals, tris[:, corner], face_normals)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    return (normals / np.maximum(lengths, 1e-8)).astype(np.float32)


# --------------------------------------------------------------------------- rocks


def build_rock(seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """A jagged rock: an icosphere, subdivided once, pushed in and out and flattened."""
    t = (1 + math.sqrt(5)) / 2
    verts = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t),
             (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4),
             (11, 10, 2), (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8),
             (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    vertices = [np.array(v, dtype=np.float64) / np.linalg.norm(v) for v in verts]
    cache: dict[tuple[int, int], int] = {}

    def midpoint(i: int, j: int) -> int:
        key = (min(i, j), max(i, j))
        if key not in cache:
            m = vertices[i] + vertices[j]
            vertices.append(m / np.linalg.norm(m))
            cache[key] = len(vertices) - 1
        return cache[key]

    subdivided = []
    for a, b, c in faces:
        ab, bc, ca = midpoint(a, b), midpoint(b, c), midpoint(c, a)
        subdivided += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]

    generator = np.random.default_rng(seed)
    stretch = np.array([1.0 + generator.random() * 0.6, 0.6 + generator.random() * 0.5, 0.8 + generator.random() * 0.4])
    pos = np.array([v * (0.75 + generator.random() * 0.5) * stretch for v in vertices], dtype=np.float32)
    # Flat facets: duplicate vertices per face so each face keeps its own normal.
    flat_pos, flat_idx = [], []
    for a, b, c in subdivided:
        base = len(flat_pos)
        flat_pos += [pos[a], pos[b], pos[c]]
        flat_idx += [base, base + 1, base + 2]
    flat_pos_arr = np.asarray(flat_pos, dtype=np.float32) * 0.5
    flat_idx_arr = np.asarray(flat_idx, dtype=np.uint32)
    return flat_pos_arr, compute_normals(flat_pos_arr, flat_idx_arr), flat_idx_arr


# --------------------------------------------------------------------------- textures


# Shapes are laid out in face units: x from 0 to 1 across the width, y from 0 at the top
# to FACE_RATIO at the bottom, so one unit is the same length on both axes.
Shape = tuple[list[tuple[float, float]], float]


def arc(center: tuple[float, float], radius: float, start: float, end: float, steps: int = 48) -> list[tuple[float, float]]:
    """Points of a circular arc; angles in degrees, y down (180..360 is the upper half)."""
    return [
        (center[0] + math.cos(math.radians(a)) * radius, center[1] + math.sin(math.radians(a)) * radius)
        for a in np.linspace(start, end, steps)
    ]


RING = (0.5, 0.36)
GEMS = [(0.5 - 0.075, 0.335), (0.5 + 0.075, 0.335)]


def rune_shapes() -> list[Shape]:
    """The rune: a wide central channel split at the top, inner and outer pillars, a double
    ring crossed by two bars, a gem on each side of the channel and a few branches."""
    cx = 0.5
    bottom = FACE_RATIO + 0.02
    shapes: list[Shape] = [([(cx, 0.3), (cx, bottom)], 0.085)]
    for side in (-1, 1):
        def at(offset: float) -> float:
            return cx + side * offset

        shapes += [
            ([(at(0.042), 0.03), (at(0.042), 0.34)], 0.03),  # prongs at the top of the channel
            ([(at(0.14), 0.07), (at(0.14), 0.5), (at(0.165), 0.56), (at(0.165), bottom)], 0.03),  # inner pillar
            ([(at(0.265), 0.43), (at(0.265), 0.66), (at(0.29), 0.71), (at(0.29), bottom)], 0.028),  # outer pillar
            ([(at(0.165), 0.68), (at(0.29), 0.8)], 0.022),  # branch between the pillars
            ([(at(0.29), 0.55), (at(0.375), 0.63), (at(0.375), 0.92)], 0.022),  # outer branch
            ([(at(0.41), 0.43), (at(0.41), 0.5)], 0.02),  # end of the lower bar
            ([GEMS[(side + 1) // 2], (at(0.19), 0.235)], 0.022),  # diagonal from the gem up
            ([GEMS[(side + 1) // 2], (at(0.17), 0.43)], 0.022),  # diagonal from the gem down
            (arc(RING, 0.15, 20, 70) if side > 0 else arc(RING, 0.15, 110, 160), 0.022),  # lower ring pieces
        ]
    shapes += [
        ([(0.09, 0.385), (0.91, 0.385)], 0.022),  # crossbars
        ([(0.11, 0.43), (0.89, 0.43)], 0.022),
        (arc(RING, 0.22, 180, 360), 0.026),  # double ring, upper half
        (arc(RING, 0.15, 180, 360), 0.022),
    ]
    return shapes


def gem_polygon(center: tuple[float, float], size: float) -> list[tuple[float, float]]:
    x, y = center
    return [(x, y - size * 1.3), (x + size, y), (x, y + size * 1.3), (x - size, y)]


def design(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(x * DESIGN_W, y * DESIGN_W) for x, y in points]


def voronoi(width: int, height: int, count: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Distance to the nearest cell border (in pixels) and the cell of each pixel, with the
    borders warped by noise so they read as broken stone rather than a tiling."""
    generator = np.random.default_rng(seed)
    points = generator.random((count, 2)) * [width, height]
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float32)
    xs += (value_noise(width, height, 7, 3, seed + 1) - 0.5) * 46
    ys += (value_noise(width, height, 7, 3, seed + 2) - 0.5) * 46
    nearest = np.full((height, width), 1e9, np.float32)
    second = nearest.copy()
    cell = np.zeros((height, width), np.int32)
    for index, (px_, py_) in enumerate(points):
        distance = np.hypot(xs - px_, (ys - py_) * 0.85)
        closer = distance < nearest
        second = np.where(closer, nearest, np.minimum(second, distance))
        cell = np.where(closer, index, cell)
        nearest = np.where(closer, distance, nearest)
    return second - nearest, cell


def crack_lines(count: int) -> list[list[tuple[float, float]]]:
    """Short hairline cracks inside the stone blocks, in face units."""
    lines = []
    for _ in range(count):
        x, y = rng.random(), rng.random() * FACE_RATIO
        angle = rng.random() * math.tau
        points = [(x, y)]
        for _ in range(int(2 + rng.random() * 5)):
            angle += (rng.random() - 0.5) * 1.2
            step = 0.015 + rng.random() * 0.03
            x += math.cos(angle) * step
            y += math.sin(angle) * step
            points.append((x, y))
        lines.append(points)
    return lines


def to_texture(values: np.ndarray, mode: str = "L") -> Image.Image:
    image = Image.fromarray(np.clip(values, 0, 255).astype(np.uint8), mode)
    return image.resize((TEXTURE_W, TEXTURE_H), Image.LANCZOS)


def build_textures() -> tuple[Image.Image, Image.Image]:
    w, h = DESIGN_W, DESIGN_H

    # Rune channels (R) and their light-up order (B): the energy climbs from the bottom.
    rune = Image.new("L", (w, h), 0)
    order = Image.new("L", (w, h), 255)
    draw_rune, draw_order = ImageDraw.Draw(rune), ImageDraw.Draw(order)
    for points, width in rune_shapes():
        pixels = design(points)
        stroke = max(3, int(width * w))
        draw_rune.line(pixels, fill=255, width=stroke, joint="curve")
        for (x0, y0), (x1, y1) in zip(pixels, pixels[1:]):
            steps = max(2, int(math.hypot(x1 - x0, y1 - y0) / 3))
            for s in range(steps + 1):
                x = x0 + (x1 - x0) * s / steps
                y = y0 + (y1 - y0) * s / steps
                value = int(np.clip((FACE_RATIO - 0.02 - y / w) / (FACE_RATIO - 0.06) * 255, 0, 250))
                r = stroke * 0.6 + 2
                draw_order.ellipse((x - r, y - r, x + r, y + r), fill=value)
    for gem in GEMS:
        draw_rune.polygon(design(gem_polygon(gem, 0.03)), fill=255)
        draw_order.polygon(design(gem_polygon(gem, 0.045)), fill=252)

    # A hot core with a short falloff: the bloom pass adds the wide glow.
    rune_core = np.asarray(rune.filter(ImageFilter.GaussianBlur(2)), np.float32)
    rune_glow = np.asarray(rune.filter(ImageFilter.GaussianBlur(9)), np.float32)
    rune_arr = np.maximum(rune_core, rune_glow * 0.45)

    # Stone blocks: dark borders between broken cells, plus hairline cracks.
    border, cell = voronoi(w, h, 58, SEED + 3)
    seams = np.clip(1.0 - border / 3.2, 0, 1)
    hairlines = Image.new("L", (w, h), 0)
    draw_hair = ImageDraw.Draw(hairlines)
    for line in crack_lines(70):
        draw_hair.line(design(line), fill=200, width=int(1 + rng.random() * 2))
    hair = np.asarray(hairlines.filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255.0
    cracks = np.maximum(seams, hair * 0.8)

    # Cracks close to the runes carry a little of their light.
    near_runes = np.asarray(rune.filter(ImageFilter.GaussianBlur(70)), np.float32) / 255.0
    crack_glow = np.clip(cracks * 255 * (near_runes * 2.2 - 0.05), 0, 255)

    mask = np.stack([rune_arr, crack_glow, np.asarray(order, np.float32)], axis=-1)
    mask_image = to_texture(mask, "RGB")

    # Albedo: dark slate, each block its own tone, darker towards its borders.
    generator = np.random.default_rng(SEED + 4)
    cell_tone = generator.random(int(cell.max()) + 1).astype(np.float32)
    base = value_noise(w, h, 4, 5, SEED + 1)
    grain = value_noise(w, h, 64, 2, SEED + 2)
    tone = 0.15 + cell_tone[cell] * 0.06 + base * 0.07 + grain * 0.05
    tone -= (1.0 - np.clip(border / 22.0, 0, 1)) * 0.05
    tone -= cracks * 0.12
    tone -= np.asarray(rune.filter(ImageFilter.GaussianBlur(4)), np.float32) / 255.0 * 0.07
    tone = np.clip(tone, 0.02, 1.0)
    color = np.stack([tone * 0.8, tone * 0.9, tone * 0.92], axis=-1)
    albedo_image = to_texture(color * 255, "RGB")
    return albedo_image, mask_image


# --------------------------------------------------------------------------- glb


def write_glb(path: Path, meshes: list[dict]) -> None:
    """Write meshes to a binary glTF with one buffer and no materials."""
    binary = bytearray()
    buffer_views, accessors, gltf_meshes, nodes = [], [], [], []

    def add(data: np.ndarray, component: int, kind: str, target: int, minmax: bool = False) -> int:
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        raw = data.tobytes()
        binary.extend(raw)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw), "target": target})
        accessor = {
            "bufferView": len(buffer_views) - 1,
            "componentType": component,
            "count": int(data.shape[0]),
            "type": kind,
        }
        if minmax:
            accessor["min"] = data.min(axis=0).tolist()
            accessor["max"] = data.max(axis=0).tolist()
        accessors.append(accessor)
        return len(accessors) - 1

    for mesh in meshes:
        attributes = {
            "POSITION": add(mesh["position"], 5126, "VEC3", 34962, True),
            "NORMAL": add(mesh["normal"], 5126, "VEC3", 34962),
        }
        if "uv" in mesh:
            attributes["TEXCOORD_0"] = add(mesh["uv"], 5126, "VEC2", 34962)
        index_data = mesh["index"].astype(np.uint16 if mesh["position"].shape[0] < 65536 else np.uint32)
        component = 5123 if index_data.dtype == np.uint16 else 5125
        indices = add(index_data.reshape(-1, 1), component, "SCALAR", 34963)
        gltf_meshes.append({"name": mesh["name"], "primitives": [{"attributes": attributes, "indices": indices}]})
        nodes.append({"name": mesh["name"], "mesh": len(gltf_meshes) - 1})

    while len(binary) % 4:
        binary.append(0)
    document = {
        "asset": {"version": "2.0", "generator": "ZForge generate_monolith.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": buffer_views,
        "accessors": accessors,
    }
    json_bytes = json.dumps(document, separators=(",", ":")).encode()
    while len(json_bytes) % 4:
        json_bytes += b" "
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    with path.open("wb") as file:
        file.write(struct.pack("<III", 0x46546C67, 2, total))
        file.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        file.write(json_bytes)
        file.write(struct.pack("<II", len(binary), 0x004E4942))
        file.write(binary)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    position, normal, uv, index = build_monolith()
    meshes = [{"name": "monolith", "position": position, "normal": normal, "uv": uv, "index": index}]
    for k in range(6):
        rock_position, rock_normal, rock_index = build_rock(SEED * 10 + k)
        meshes.append({"name": f"rock{k}", "position": rock_position, "normal": rock_normal, "index": rock_index})
    write_glb(OUT / "monolith.glb", meshes)

    albedo, mask = build_textures()
    albedo.save(OUT / "monolith-albedo.png", optimize=True)
    mask.save(OUT / "monolith-mask.png", optimize=True)

    triangles = sum(int(m["index"].size // 3) for m in meshes)
    print(f"monolith.glb: {len(meshes)} meshes, {triangles} triangles")
    for name in ("monolith.glb", "monolith-albedo.png", "monolith-mask.png"):
        print(f"{name}: {(OUT / name).stat().st_size / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
