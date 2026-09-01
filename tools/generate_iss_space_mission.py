#!/usr/bin/env python3
"""Generate the lightweight suspended ISS exhibit used by the A-Frame museum.

The script writes a self-contained binary glTF 2.0 file (GLB) in metres.
No external textures are required: the visual identity comes from PBR
materials and named, reusable mesh instances.  The model deliberately keeps
the silhouette of the ISS recognisable while matching the museum palette.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from dataclasses import dataclass
from pathlib import Path

import numpy as np


def align4(data: bytearray, pad: bytes = b"\x00") -> None:
    while len(data) % 4:
        data.extend(pad)


def quaternion_from_euler(rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> list[float]:
    """Return a glTF quaternion for intrinsic XYZ Euler angles."""
    cx, sx = math.cos(rx / 2), math.sin(rx / 2)
    cy, sy = math.cos(ry / 2), math.sin(ry / 2)
    cz, sz = math.cos(rz / 2), math.sin(rz / 2)
    return [
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz + sx * sy * cz,
        cx * cy * cz - sx * sy * sz,
    ]


def compose_matrix(translation, rotation, scale) -> np.ndarray:
    x, y, z, w = rotation
    rot = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1],
        ],
        dtype=float,
    )
    scl = np.diag([scale[0], scale[1], scale[2], 1.0])
    out = rot @ scl
    out[:3, 3] = translation
    return out


@dataclass
class Geometry:
    name: str
    vertices: np.ndarray
    normals: np.ndarray
    indices: np.ndarray


def box_geometry() -> Geometry:
    # Unit cube centred at the origin, with face-specific normals.
    faces = [
        ((1, 0, 0), [(0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (0.5, 0.5, 0.5), (0.5, -0.5, 0.5)]),
        ((-1, 0, 0), [(-0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, 0.5, -0.5), (-0.5, -0.5, -0.5)]),
        ((0, 1, 0), [(-0.5, 0.5, -0.5), (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (0.5, 0.5, -0.5)]),
        ((0, -1, 0), [(-0.5, -0.5, 0.5), (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5)]),
        ((0, 0, 1), [(-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]),
        ((0, 0, -1), [(0.5, -0.5, -0.5), (-0.5, -0.5, -0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5)]),
    ]
    vertices, normals, indices = [], [], []
    for normal, quad in faces:
        start = len(vertices)
        vertices.extend(quad)
        normals.extend([normal] * 4)
        indices.extend([start, start + 1, start + 2, start, start + 2, start + 3])
    return Geometry("UnitBox", np.array(vertices, np.float32), np.array(normals, np.float32), np.array(indices, np.uint16))


def cylinder_geometry(segments: int = 20) -> Geometry:
    # Unit cylinder: radius .5, height 1, principal axis Y.
    vertices, normals, indices = [], [], []
    for i in range(segments + 1):
        a = 2 * math.pi * i / segments
        x, z = 0.5 * math.cos(a), 0.5 * math.sin(a)
        nx, nz = math.cos(a), math.sin(a)
        vertices.extend([(x, -0.5, z), (x, 0.5, z)])
        normals.extend([(nx, 0, nz), (nx, 0, nz)])
    for i in range(segments):
        k = i * 2
        indices.extend([k, k + 1, k + 3, k, k + 3, k + 2])
    for y, ny in [(-0.5, -1), (0.5, 1)]:
        center = len(vertices)
        vertices.append((0, y, 0))
        normals.append((0, ny, 0))
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring.append(len(vertices))
            vertices.append((0.5 * math.cos(a), y, 0.5 * math.sin(a)))
            normals.append((0, ny, 0))
        for i in range(segments):
            a, b = ring[i], ring[(i + 1) % segments]
            indices.extend([center, b, a] if ny < 0 else [center, a, b])
    return Geometry("UnitCylinder", np.array(vertices, np.float32), np.array(normals, np.float32), np.array(indices, np.uint16))


def sphere_geometry(rings: int = 10, segments: int = 18) -> Geometry:
    vertices, normals, indices = [], [], []
    for r in range(rings + 1):
        phi = math.pi * r / rings
        y = math.cos(phi)
        rr = math.sin(phi)
        for s in range(segments + 1):
            theta = 2 * math.pi * s / segments
            x, z = rr * math.cos(theta), rr * math.sin(theta)
            vertices.append((0.5 * x, 0.5 * y, 0.5 * z))
            normals.append((x, y, z))
    stride = segments + 1
    for r in range(rings):
        for s in range(segments):
            a = r * stride + s
            b = a + stride
            indices.extend([a, b, a + 1, a + 1, b, b + 1])
    return Geometry("UnitSphere", np.array(vertices, np.float32), np.array(normals, np.float32), np.array(indices, np.uint16))


def torus_geometry(major_segments: int = 24, minor_segments: int = 8) -> Geometry:
    # Unit torus around Y. Major radius .36, tube radius .09.
    vertices, normals, indices = [], [], []
    for i in range(major_segments + 1):
        u = 2 * math.pi * i / major_segments
        cu, su = math.cos(u), math.sin(u)
        for j in range(minor_segments + 1):
            v = 2 * math.pi * j / minor_segments
            cv, sv = math.cos(v), math.sin(v)
            x = (0.36 + 0.09 * cv) * cu
            y = 0.09 * sv
            z = (0.36 + 0.09 * cv) * su
            vertices.append((x, y, z))
            normals.append((cv * cu, sv, cv * su))
    stride = minor_segments + 1
    for i in range(major_segments):
        for j in range(minor_segments):
            a = i * stride + j
            b = a + stride
            indices.extend([a, b, a + 1, a + 1, b, b + 1])
    return Geometry("UnitTorus", np.array(vertices, np.float32), np.array(normals, np.float32), np.array(indices, np.uint16))


class GLBBuilder:
    def __init__(self):
        self.binary = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.materials = []
        self.meshes = []
        self.nodes = []
        self.geometries: dict[str, Geometry] = {}
        self.mesh_cache: dict[tuple[str, int], int] = {}
        self.preview_parts = []
        self.root_children = []

    def add_material(self, name, color, metallic=0.0, roughness=0.65, emissive=None, alpha=1.0, double_sided=False):
        pbr = {
            "baseColorFactor": [*color, alpha],
            "metallicFactor": metallic,
            "roughnessFactor": roughness,
        }
        material = {"name": name, "pbrMetallicRoughness": pbr, "doubleSided": double_sided}
        if emissive:
            material["emissiveFactor"] = list(emissive)
        if alpha < 1.0:
            material.update({"alphaMode": "BLEND", "alphaCutoff": 0.01})
        self.materials.append(material)
        return len(self.materials) - 1

    def add_geometry(self, geometry: Geometry):
        self.geometries[geometry.name] = geometry

    def _append_view(self, payload: bytes, target: int) -> int:
        align4(self.binary)
        offset = len(self.binary)
        self.binary.extend(payload)
        index = len(self.buffer_views)
        self.buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
        return index

    def _add_accessor(self, array: np.ndarray, component_type: int, accessor_type: str, target: int, include_bounds=False) -> int:
        packed = np.ascontiguousarray(array).tobytes()
        view = self._append_view(packed, target)
        accessor = {
            "bufferView": view,
            "byteOffset": 0,
            "componentType": component_type,
            "count": int(array.shape[0]),
            "type": accessor_type,
        }
        if include_bounds:
            accessor["min"] = [float(v) for v in array.min(axis=0)]
            accessor["max"] = [float(v) for v in array.max(axis=0)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def mesh_for(self, geometry_name: str, material_index: int) -> int:
        key = (geometry_name, material_index)
        if key in self.mesh_cache:
            return self.mesh_cache[key]
        geom = self.geometries[geometry_name]
        pos = self._add_accessor(geom.vertices, 5126, "VEC3", 34962, include_bounds=True)
        nor = self._add_accessor(geom.normals, 5126, "VEC3", 34962)
        component_type = 5123 if geom.indices.dtype == np.uint16 else 5125
        idx = self._add_accessor(geom.indices.reshape(-1), component_type, "SCALAR", 34963)
        mesh = {
            "name": f"{geometry_name}_{self.materials[material_index]['name']}",
            "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": idx, "material": material_index}],
        }
        self.meshes.append(mesh)
        mesh_index = len(self.meshes) - 1
        self.mesh_cache[key] = mesh_index
        return mesh_index

    def add_instance(self, name, geometry_name, material_index, translation=(0, 0, 0), rotation=(0, 0, 0, 1), scale=(1, 1, 1), extras=None):
        mesh_index = self.mesh_for(geometry_name, material_index)
        node = {
            "name": name,
            "mesh": mesh_index,
            "translation": [float(v) for v in translation],
            "rotation": [float(v) for v in rotation],
            "scale": [float(v) for v in scale],
        }
        if extras:
            node["extras"] = extras
        self.nodes.append(node)
        node_index = len(self.nodes) - 1
        self.root_children.append(node_index)

        geom = self.geometries[geometry_name]
        matrix = compose_matrix(translation, rotation, scale)
        verts_h = np.column_stack((geom.vertices, np.ones(len(geom.vertices))))
        verts = (matrix @ verts_h.T).T[:, :3]
        rgb = self.materials[material_index]["pbrMetallicRoughness"]["baseColorFactor"][:3]
        alpha = self.materials[material_index]["pbrMetallicRoughness"]["baseColorFactor"][3]
        self.preview_parts.append((verts, geom.indices.reshape(-1, 3), rgb, alpha, name))
        return node_index

    def add_anchor(self, name, translation, extras=None):
        node = {"name": name, "translation": [float(v) for v in translation]}
        if extras:
            node["extras"] = extras
        self.nodes.append(node)
        node_index = len(self.nodes) - 1
        self.root_children.append(node_index)
        return node_index

    def write(self, path: Path):
        root_index = len(self.nodes)
        self.nodes.append(
            {
                "name": "ISS_SPACE_MISSION",
                "children": self.root_children,
                "extras": {
                    "units": "metres",
                    "exhibit": "Rhodospirillum rubrum space mission",
                    "animationRole": "descentRoot",
                },
            }
        )
        align4(self.binary)
        gltf = {
            "asset": {"version": "2.0", "generator": "Purple Museum ISS generator 1.0"},
            "scene": 0,
            "scenes": [{"name": "ISS Space Mission", "nodes": [root_index]}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.binary)}],
        }
        json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "
        total_length = 12 + 8 + len(json_bytes) + 8 + len(self.binary)
        payload = bytearray()
        payload.extend(struct.pack("<4sII", b"glTF", 2, total_length))
        payload.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
        payload.extend(json_bytes)
        payload.extend(struct.pack("<I4s", len(self.binary), b"BIN\x00"))
        payload.extend(self.binary)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)


def build_model() -> GLBBuilder:
    b = GLBBuilder()
    for geom in [box_geometry(), cylinder_geometry(), sphere_geometry(), torus_geometry()]:
        b.add_geometry(geom)

    white = b.add_material("ISS_Ceramic_White", (0.82, 0.84, 0.86), metallic=0.15, roughness=0.45)
    warm_white = b.add_material("ISS_Warm_White", (0.94, 0.91, 0.86), metallic=0.05, roughness=0.62)
    grey = b.add_material("ISS_Structure_Grey", (0.30, 0.32, 0.36), metallic=0.72, roughness=0.32)
    dark = b.add_material("ISS_Dark_Structure", (0.055, 0.045, 0.075), metallic=0.74, roughness=0.28)
    solar = b.add_material("Solar_Cell_Indigo", (0.035, 0.045, 0.13), metallic=0.35, roughness=0.24, emissive=(0.012, 0.016, 0.07))
    copper = b.add_material("Solar_Frame_Copper", (0.47, 0.25, 0.12), metallic=0.78, roughness=0.28)
    violet = b.add_material("Museum_Violet", (0.38, 0.07, 0.55), metallic=0.12, roughness=0.34, emissive=(0.32, 0.03, 0.55))
    violet_soft = b.add_material("Culture_Violet", (0.70, 0.18, 0.92), metallic=0.0, roughness=0.42, emissive=(0.48, 0.07, 0.72))
    turquoise = b.add_material("Status_Turquoise", (0.08, 0.58, 0.55), metallic=0.1, roughness=0.30, emissive=(0.03, 0.42, 0.40))
    glass = b.add_material("Sample_Capsule_Glass", (0.48, 0.32, 0.62), metallic=0.0, roughness=0.08, emissive=(0.035, 0.012, 0.07), alpha=0.22, double_sided=True)

    q_x = quaternion_from_euler(rz=math.pi / 2)  # cylinder Y -> X
    q_z = quaternion_from_euler(rx=math.pi / 2)  # cylinder Y -> Z

    # Main truss and braces.
    b.add_instance("ISS_Truss_Main", "UnitBox", dark, translation=(0, 0.04, 0), scale=(1.28, 0.045, 0.050))
    for x in (-0.42, -0.21, 0.21, 0.42):
        b.add_instance(f"ISS_Truss_Node_{x:+.2f}", "UnitSphere", grey, translation=(x, 0.04, 0), scale=(0.075, 0.075, 0.075))
    for x in (-0.54, -0.27, 0.27, 0.54):
        b.add_instance(f"ISS_Truss_Brace_{x:+.2f}", "UnitBox", grey, translation=(x, 0.04, 0), rotation=quaternion_from_euler(rx=0.58), scale=(0.016, 0.12, 0.016))
        b.add_instance(f"ISS_Truss_Brace_Mirror_{x:+.2f}", "UnitBox", grey, translation=(x, 0.04, 0), rotation=quaternion_from_euler(rx=-0.58), scale=(0.016, 0.12, 0.016))

    # Eight recognisable solar-panel rectangles: four pylons, upper/lower.
    panel_xs = (-0.52, -0.79, 0.52, 0.79)
    for px in panel_xs:
        pylon_side = "L" if px < 0 else "R"
        b.add_instance(f"Solar_Pylon_{pylon_side}_{abs(px):.2f}", "UnitCylinder", grey, translation=(px, 0.04, 0), scale=(0.022, 0.54, 0.022))
        for row, py in [("Upper", 0.19), ("Lower", -0.11)]:
            prefix = f"SolarArray_{pylon_side}_{abs(px):.2f}_{row}"
            b.add_instance(prefix + "_Cell", "UnitBox", solar, translation=(px, py, 0), scale=(0.205, 0.27, 0.018))
            # Copper perimeter.
            b.add_instance(prefix + "_FrameTop", "UnitBox", copper, translation=(px, py + 0.135, 0.012), scale=(0.22, 0.012, 0.014))
            b.add_instance(prefix + "_FrameBottom", "UnitBox", copper, translation=(px, py - 0.135, 0.012), scale=(0.22, 0.012, 0.014))
            b.add_instance(prefix + "_FrameLeft", "UnitBox", copper, translation=(px - 0.108, py, 0.012), scale=(0.012, 0.282, 0.014))
            b.add_instance(prefix + "_FrameRight", "UnitBox", copper, translation=(px + 0.108, py, 0.012), scale=(0.012, 0.282, 0.014))
            for j in (-0.045, 0.045):
                b.add_instance(prefix + f"_GridV_{j:+.3f}", "UnitBox", copper, translation=(px + j, py, 0.014), scale=(0.006, 0.255, 0.008))
            for j, offset in enumerate((-0.09, -0.045, 0.0, 0.045, 0.09)):
                b.add_instance(prefix + f"_GridH_{j}", "UnitBox", copper, translation=(px, py + offset, 0.014), scale=(0.195, 0.004, 0.008))

    # Central scientific modules. Cylinders use named parts so A-Frame can
    # highlight them later without touching the solar arrays.
    b.add_instance("ISS_Lab_Module_Main", "UnitCylinder", warm_white, translation=(0, -0.015, 0.015), rotation=q_z, scale=(0.20, 0.42, 0.20))
    b.add_instance("ISS_Lab_Module_Ring_Front", "UnitTorus", violet, translation=(0, -0.015, 0.225), rotation=q_z, scale=(0.24, 0.24, 0.24))
    b.add_instance("ISS_Lab_Module_Ring_Back", "UnitTorus", grey, translation=(0, -0.015, -0.195), rotation=q_z, scale=(0.24, 0.24, 0.24))
    b.add_instance("ISS_Node_Left", "UnitCylinder", white, translation=(-0.20, -0.015, 0.01), rotation=q_x, scale=(0.14, 0.33, 0.14))
    b.add_instance("ISS_Node_Right", "UnitCylinder", white, translation=(0.20, -0.015, 0.01), rotation=q_x, scale=(0.14, 0.33, 0.14))
    b.add_instance("ISS_Service_Module", "UnitBox", grey, translation=(0, 0.105, -0.02), scale=(0.23, 0.12, 0.18))
    b.add_instance("ISS_Cupola", "UnitSphere", glass, translation=(0, 0.175, -0.02), scale=(0.13, 0.08, 0.13))
    b.add_instance("ISS_Docking_Port", "UnitCylinder", dark, translation=(0, -0.015, 0.275), rotation=q_z, scale=(0.11, 0.08, 0.11))
    b.add_instance("ISS_Docking_Ring", "UnitTorus", turquoise, translation=(0, -0.015, 0.315), rotation=q_z, scale=(0.18, 0.18, 0.18))

    # Radiators and antenna accents, behind the main modules.
    for i, (x, z) in enumerate(((-0.23, -0.16), (0.23, -0.16), (-0.23, 0.17), (0.23, 0.17))):
        b.add_instance(f"ISS_Radiator_{i+1}", "UnitBox", white, translation=(x, -0.02, z), rotation=quaternion_from_euler(ry=0.14 if x < 0 else -0.14), scale=(0.24, 0.10, 0.014))
    b.add_instance("ISS_Antenna_Dish", "UnitSphere", warm_white, translation=(0.16, 0.14, 0.12), scale=(0.13, 0.045, 0.13))
    b.add_instance("ISS_Antenna_Stem", "UnitCylinder", grey, translation=(0.16, 0.09, 0.12), scale=(0.015, 0.10, 0.015))

    # Suspension hardware. Dynamic cables are created in A-Frame from these
    # anchors to the ceiling; the short rods make the attachment believable.
    for side, x in (("Left", -0.28), ("Right", 0.28)):
        b.add_instance(f"CableHook_{side}_Rod", "UnitCylinder", dark, translation=(x, 0.27, 0), scale=(0.018, 0.40, 0.018), extras={"role": "suspensionHook"})
        b.add_instance(f"CableHook_{side}_Eye", "UnitTorus", violet, translation=(x, 0.475, 0), scale=(0.075, 0.075, 0.075), extras={"role": "suspensionHook"})
        b.add_anchor(f"CableAnchor_{side}", (x, 0.51, 0), extras={"role": "dynamicCableAnchor"})

    # Purple culture capsule hanging underneath the scientific modules.
    b.add_instance("SampleCapsule_Connector", "UnitCylinder", grey, translation=(0, -0.17, 0.01), scale=(0.035, 0.22, 0.035))
    b.add_instance("SampleCapsule_Glass", "UnitCylinder", glass, translation=(0, -0.315, 0.01), scale=(0.17, 0.25, 0.17), extras={"role": "spaceSample"})
    b.add_instance("SampleCapsule_RingTop", "UnitTorus", violet, translation=(0, -0.19, 0.01), scale=(0.22, 0.22, 0.22))
    b.add_instance("SampleCapsule_RingBottom", "UnitTorus", violet, translation=(0, -0.44, 0.01), scale=(0.22, 0.22, 0.22))
    b.add_instance("SampleCapsule_Culture", "UnitSphere", violet, translation=(0, -0.315, 0.01), scale=(0.13, 0.20, 0.13))

    bacteria_specs = [
        (-0.025, -0.275, 0.035, 0.3, -0.5, 0.2),
        (0.030, -0.300, -0.012, -0.4, 0.2, 0.8),
        (-0.018, -0.335, -0.028, 0.7, 0.1, -0.4),
        (0.022, -0.360, 0.025, -0.2, -0.7, 0.6),
        (0.000, -0.395, 0.000, 0.5, 0.5, 0.1),
    ]
    for i, (x, y, z, rx, ry, rz) in enumerate(bacteria_specs, start=1):
        b.add_instance(
            f"Rhodospirillum_Rubrum_Cell_{i:02d}",
            "UnitSphere",
            violet_soft,
            translation=(x, y, z),
            rotation=quaternion_from_euler(rx, ry, rz),
            scale=(0.020, 0.064, 0.020),
            extras={"organism": "Rhodospirillum rubrum"},
        )
    b.add_instance("SampleCapsule_Status", "UnitSphere", turquoise, translation=(0, -0.455, 0.01), scale=(0.025, 0.025, 0.025))

    b.add_anchor("InteractionAnchor_SPACE_MISSION", (0, -0.02, 0.36), extras={"role": "interactionAnchor"})
    b.add_anchor("PlacardAnchor_SPACE_MISSION", (0, -0.49, 0.02), extras={"role": "placardAnchor"})
    return b


def render_previews(builder: GLBBuilder, preview_dir: Path):
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    preview_dir.mkdir(parents=True, exist_ok=True)
    views = [
        ("front", 8, -90),
        ("three-quarter", 18, -58),
        ("underside", -18, -70),
    ]
    saved = []
    for label, elev, azim in views:
        fig = plt.figure(figsize=(12, 8), dpi=140, facecolor="#1c1322")
        ax = fig.add_subplot(111, projection="3d", facecolor="#1c1322")
        for vertices, faces, rgb, alpha, name in builder.preview_parts:
            tris = vertices[faces]
            # Glass is shown last and kept translucent.
            collection = Poly3DCollection(
                tris,
                facecolor=(*rgb, max(alpha, 0.16)),
                edgecolor=(0, 0, 0, 0.06),
                linewidth=0.08,
                alpha=max(alpha, 0.16),
            )
            ax.add_collection3d(collection)
        ax.set_xlim(-1.0, 1.0)
        ax.set_ylim(-0.58, 0.62)
        ax.set_zlim(-0.48, 0.48)
        ax.set_box_aspect((2.0, 1.2, 0.96))
        ax.view_init(elev=elev, azim=azim)
        ax.set_proj_type("ortho")
        ax.axis("off")
        ax.set_title("ISS · RHODOSPIRILLUM RUBRUM SPACE MISSION", color="#f2ece7", fontsize=14, pad=8)
        fig.subplots_adjust(left=0, right=1, top=0.94, bottom=0)
        out = preview_dir / f"iss-space-mission-{label}.png"
        fig.savefig(out, facecolor=fig.get_facecolor(), bbox_inches="tight", pad_inches=0.05)
        plt.close(fig)
        saved.append(out)

    # Contact sheet for quick visual QA.
    from PIL import Image, ImageOps, ImageDraw

    images = [Image.open(p).convert("RGB") for p in saved]
    target_h = 600
    resized = []
    for img in images:
        w = round(img.width * target_h / img.height)
        resized.append(img.resize((w, target_h), Image.Resampling.LANCZOS))
    gap = 18
    sheet = Image.new("RGB", (sum(i.width for i in resized) + gap * (len(resized) + 1), target_h + gap * 2), "#1c1322")
    x = gap
    for img in resized:
        sheet.paste(img, (x, gap))
        x += img.width + gap
    sheet.save(preview_dir / "iss-space-mission-contact-sheet.png")


def validate_glb(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 28:
        raise ValueError("GLB is too small")
    magic, version, declared = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or declared != len(data):
        raise ValueError("Invalid GLB header")
    json_len, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise ValueError("Missing JSON chunk")
    doc = json.loads(data[20 : 20 + json_len].decode("utf-8"))
    bin_offset = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", data, bin_offset)
    if bin_type != b"BIN\x00":
        raise ValueError("Missing BIN chunk")
    if bin_offset + 8 + bin_len != len(data):
        raise ValueError("Binary chunk length mismatch")
    if doc["buffers"][0]["byteLength"] != bin_len:
        raise ValueError("glTF buffer length mismatch")
    for view in doc["bufferViews"]:
        if view.get("byteOffset", 0) + view["byteLength"] > bin_len:
            raise ValueError("bufferView exceeds binary chunk")
    return {
        "bytes": len(data),
        "nodes": len(doc.get("nodes", [])),
        "meshes": len(doc.get("meshes", [])),
        "materials": len(doc.get("materials", [])),
        "accessors": len(doc.get("accessors", [])),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("modulos/iss_space_mission.glb"))
    parser.add_argument("--preview-dir", type=Path)
    args = parser.parse_args()
    builder = build_model()
    builder.write(args.output)
    if args.preview_dir:
        render_previews(builder, args.preview_dir)
    print(json.dumps(validate_glb(args.output), indent=2))


if __name__ == "__main__":
    main()
