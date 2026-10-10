"""Validate Poko's runtime GLB before it ships.

    python blender/scripts/validate_glb.py src/assets/poko/poko.glb

Pure Python (no Blender needed). Checks the contract the website relies on:
container integrity, one skin with the nine named joints, the expected
animation clips, the vertex attributes the voxel material reads, sane bounds,
and a size budget. Exits non-zero on any failure.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

EXPECTED_JOINTS = {"root", "body", "eye_l", "eye_r", "mouth", "hand_l", "hand_r", "foot_l", "foot_r"}
EXPECTED_CLIPS = {"Idle", "Blink", "Walk", "Hop", "Surprise", "Wave", "LookAround", "Float", "Land"}
REQUIRED_ATTRIBUTES = {"POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0", "JOINTS_0", "WEIGHTS_0"}
SIZE_BUDGET = 200 * 1024  # bytes, compressed


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF", "not a GLB file"
    assert version == 2, f"glTF version {version}, expected 2"
    assert length == len(data), f"header length {length} != file size {len(data)}"
    offset = 12
    doc, binary = None, b""
    while offset < length:
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + chunk_len]
        if chunk_type == 0x4E4F534A:
            doc = json.loads(chunk)
        elif chunk_type == 0x004E4942:
            binary = chunk
        offset += 8 + chunk_len
    assert doc is not None, "missing JSON chunk"
    return doc, binary


def main(path: Path) -> int:
    failures: list[str] = []

    def check(cond: bool, message: str) -> None:
        print(("  ok   " if cond else "  FAIL ") + message)
        if not cond:
            failures.append(message)

    doc, binary = read_glb(path)
    size = path.stat().st_size
    print(f"{path} ({size / 1024:.1f} KiB)")
    check(size <= SIZE_BUDGET, f"size {size / 1024:.1f} KiB within budget {SIZE_BUDGET / 1024:.0f} KiB")
    used = set(doc.get("extensionsUsed", []))
    required = set(doc.get("extensionsRequired", []))
    print(f"  extensions used: {sorted(used) or 'none'}; required: {sorted(required) or 'none'}")
    supported = {"KHR_mesh_quantization", "EXT_meshopt_compression", "KHR_meshopt_compression", "KHR_materials_emissive_strength"}
    check(required <= supported, "every required extension is supported by three.js GLTFLoader + MeshoptDecoder")

    nodes = doc.get("nodes", [])
    skins = doc.get("skins", [])
    check(len(skins) == 1, f"exactly one skin (found {len(skins)})")
    if skins:
        joints = {nodes[j].get("name") for j in skins[0]["joints"]}
        check(joints == EXPECTED_JOINTS, f"skin joints are {sorted(EXPECTED_JOINTS)}")

    clips = {a.get("name") for a in doc.get("animations", [])}
    check(EXPECTED_CLIPS <= clips, f"animation clips present: {sorted(clips)}")
    for anim in doc.get("animations", []):
        for ch in anim["channels"]:
            if nodes[ch["target"]["node"]].get("name") not in EXPECTED_JOINTS:
                failures.append(f"clip {anim['name']} animates non-joint node")

    prims = [p for m in doc.get("meshes", []) for p in m["primitives"]]
    check(len(prims) > 0, f"{len(prims)} mesh primitive(s)")
    for i, p in enumerate(prims):
        missing = REQUIRED_ATTRIBUTES - set(p["attributes"])
        check(not missing, f"primitive {i} has {sorted(REQUIRED_ATTRIBUTES)}" + (f" (missing {sorted(missing)})" if missing else ""))
        # The bevel/seam shader needs 0..1 UVs on every cube face. Quantised UVs
        # (gltfpack without -vtf) are rescaled by KHR_texture_transform, which
        # only exists on textures; Poko has none, so the scale would be lost.
        uv = doc["accessors"][p["attributes"]["TEXCOORD_0"]] if "TEXCOORD_0" in p["attributes"] else None
        if uv is not None:
            check(uv["componentType"] == 5126, f"primitive {i} TEXCOORD_0 is float (keep -vtf in gltfpack)")

    vertices = sum(doc["accessors"][p["attributes"]["POSITION"]]["count"] for p in prims)
    check(vertices < 20000, f"{vertices} vertices (< 20000)")

    # Bounds: with quantisation the accessor min/max are integers scaled by the
    # mesh node; only the un-quantised export can be checked in metres.
    pos = doc["accessors"][prims[0]["attributes"]["POSITION"]]
    if pos.get("componentType") == 5126 and "min" in pos:
        lo, hi = pos["min"], pos["max"]
        check(-1.4 < lo[0] and hi[0] < 1.4 and -0.01 <= lo[1] and hi[1] < 2.5, f"bounds {lo} .. {hi} fit Poko (2.6 m × 2.4 m)")
    check(len(binary) > 0, "binary chunk present")

    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("GLB valid")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "src/assets/poko/poko.glb")))
