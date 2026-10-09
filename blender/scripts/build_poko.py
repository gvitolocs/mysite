"""Build Poko's editable Blender scene and the runtime GLB.

    npm run poko:voxels                      # TypeScript voxelizer -> blender/data/poko_voxels.json
    python blender/scripts/build_poko.py     # -> blender/poko_genesis.blend + blender/exports/poko_raw.glb

Runs inside Blender (`blender -b -P build_poko.py`) or with the `bpy` wheel
(`pip install bpy==5.1.2`). Everything is generated from the voxel JSON, so the
.blend can be rebuilt at any time; hand edits made in Blender should be ported
back into this script (or the voxelizer) to stay reproducible.

Representation A (this file): a skinned surface mesh. Faces shared by two voxels
of the same bone are culled; faces between different bones are kept so that,
for example, blinking reveals the gold behind the eyes rather than a hole.
Each face keeps its own 0..1 UVs so the runtime shader can draw the same
procedural bevel on every voxel as the instanced particles (Representation B).

Coordinate systems
  character space: x right, y up, z towards the viewer, in voxels
  Blender:         x right, -y towards the viewer, z up, in metres (0.1 m/voxel)
  glTF:            the exporter converts back to y-up, so glTF == character * 0.1
All bones point up with zero roll, which makes every bone's local frame equal
to character space: pose values below are authored directly in character axes.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "blender/data/poko_voxels.json"
BLEND = ROOT / "blender/poko_genesis.blend"
GLB = ROOT / "blender/exports/poko_raw.glb"  # uncompressed; npm run poko:pack writes src/assets/poko/poko.glb
RENDERS = ROOT / "blender/renders"
SCALE = 0.1
FPS = 30

# Matched by the runtime material (src/voxel/materials.ts): keep them in sync.
MATERIALS = {
    "gold": {"metallic": 0.5, "roughness": 0.34},
    "enamel": {"metallic": 0.0, "roughness": 0.26},
    "ceramic": {"metallic": 0.0, "roughness": 0.4},
}

FACE_DIRS = [
    # normal, u, v   (u x v == normal, so quads wind counter-clockwise from outside)
    ((1, 0, 0), (0, 1, 0), (0, 0, 1)),
    ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
    ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
    ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
    ((0, 0, 1), (1, 0, 0), (0, 1, 0)),
    ((0, 0, -1), (0, 1, 0), (1, 0, 0)),
]


def to_blender(x: float, y: float, z: float) -> tuple[float, float, float]:
    return (x * SCALE, -z * SCALE, y * SCALE)


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = "METRIC"


def build_materials(palette: dict) -> dict[str, bpy.types.Material]:
    mats = {}
    for name, params in MATERIALS.items():
        mat = bpy.data.materials.new(f"Poko_{name}")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get("Principled BSDF")
        bsdf.inputs["Metallic"].default_value = params["metallic"]
        bsdf.inputs["Roughness"].default_value = params["roughness"]
        attr = nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Color"
        mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
        mats[name] = mat
    return mats


def build_mesh(data: dict, mats: dict) -> bpy.types.Object:
    palette = data["palette"]
    voxels = data["voxels"]
    bone_names = data["boneNames"]
    occupancy = {(v[0], v[1], v[2]): v[4] for v in voxels}
    mat_order = list(MATERIALS)

    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    face_color: list[tuple[float, float, float, float]] = []
    face_bone: list[int] = []
    face_mat: list[int] = []
    for x, y, z, key, bone, _depth, shade, _front in voxels:
        sw = palette[key]
        # Shade in sRGB, then decode: identical to the GPU path (src/voxel/formations/poko.ts).
        rgb = [srgb_to_linear(min(1.0, round(c * 255 * shade) / 255)) for c in sw["rgb"]]
        for n, u, v in FACE_DIRS:
            neighbour = occupancy.get((x + n[0], y + n[1], z + n[2]))
            if neighbour == bone:
                continue  # interior face of a rigid part: never visible
            base = len(verts)
            for su, sv in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
                px = x + 0.5 * n[0] + su * u[0] + sv * v[0]
                py = y + 0.5 * n[1] + su * u[1] + sv * v[1]
                pz = z + 0.5 * n[2] + su * u[2] + sv * v[2]
                verts.append(to_blender(px, py, pz))
            faces.append((base, base + 1, base + 2, base + 3))
            face_color.append((*rgb, 1.0))
            face_bone.append(bone)
            face_mat.append(mat_order.index(sw["material"]))

    mesh = bpy.data.meshes.new("Poko")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for mat in mats.values():
        mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="UVMap")
    colors = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    corner_uv = ((0, 0), (1, 0), (1, 1), (0, 1))
    for poly in mesh.polygons:
        poly.material_index = face_mat[poly.index]
        poly.use_smooth = False
        for k, loop in enumerate(poly.loop_indices):
            uv.data[loop].uv = corner_uv[k]
            colors.data[loop].color = face_color[poly.index]
    mesh.color_attributes.active_color = colors

    obj = bpy.data.objects.new("Poko", mesh)
    bpy.context.scene.collection.objects.link(obj)
    groups = [obj.vertex_groups.new(name=name) for name in bone_names]
    for poly in mesh.polygons:
        groups[face_bone[poly.index]].add(list(poly.vertices), 1.0, "REPLACE")
    print(f"Mesh: {len(faces)} quads ({len(verts)} vertices) from {len(voxels)} voxels")
    return obj


def build_armature(data: dict) -> bpy.types.Object:
    arm = bpy.data.armatures.new("PokoRig")
    rig = bpy.data.objects.new("PokoRig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for spec in data["bones"]:
        b = arm.edit_bones.new(spec["name"])
        b.head = to_blender(*spec["head"])
        b.tail = to_blender(*spec["tail"])
        b.roll = 0.0
        if spec["parent"]:
            b.parent = edit[spec["parent"]]
        edit[spec["name"]] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in arm.bones:  # guard the "bone space == character space" assumption
        m = bone.matrix_local.to_3x3()
        expected = ((1, 0, 0), (0, 0, -1), (0, 1, 0))
        if any(abs(m[i][j] - expected[i][j]) > 1e-6 for i in range(3) for j in range(3)):
            raise RuntimeError(f"Bone {bone.name} rest frame is not character space: {m}")
    return rig


# ---------------------------------------------------------------- animation
# Poses: {bone: {"loc": (x, y, z) voxels, "rot": (x, y, z) degrees XYZ, "scale": (x, y, z)}}

def apply_pose(rig: bpy.types.Object, pose: dict, frame: int, keyed: set[str]) -> None:
    for name in keyed:
        pb = rig.pose.bones[name]
        spec = pose.get(name, {})
        loc = spec.get("loc", (0, 0, 0))
        rot = spec.get("rot", (0, 0, 0))
        scl = spec.get("scale", (1, 1, 1))
        pb.rotation_mode = "QUATERNION"
        pb.location = Vector(loc) * SCALE
        pb.rotation_quaternion = Euler([math.radians(a) for a in rot], "XYZ").to_quaternion()
        pb.scale = scl
        pb.keyframe_insert("location", frame=frame)
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("scale", frame=frame)


def action_fcurves(action: bpy.types.Action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def make_action(rig, name: str, keys: list[tuple[int, dict]], interpolation: dict[int, str] | None = None):
    """Key every bone mentioned anywhere in `keys` at every key frame."""
    keyed = sorted({bone for _, pose in keys for bone in pose})
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, pose in keys:
        apply_pose(rig, pose, frame, set(keyed))
    if interpolation:
        for fc in action_fcurves(action):
            for kp in fc.keyframe_points:
                mode = interpolation.get(int(round(kp.co.x)))
                if mode:
                    kp.interpolation = mode
    action.frame_range = (keys[0][0], keys[-1][0])
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, keys[0][0], action)
    track.mute = True
    rig.animation_data.action = None
    return action


def squash(sy: float) -> tuple[float, float, float]:
    """Volume-preserving squash/stretch about the body pivot."""
    side = 1.0 / math.sqrt(sy)
    return (side, sy, side)


def build_actions(rig) -> list[str]:
    actions = []

    # Idle: two slow breaths, a sway that lags the breath, hands following.
    idle = []
    for i in range(0, 121, 10):
        t = i / 120 * 2 * math.pi
        breath = math.sin(2 * t)
        sway = math.sin(t + 0.6)
        idle.append((i, {
            "body": {"scale": squash(1 + 0.022 * breath), "rot": (0, 0, 1.6 * sway)},
            "hand_l": {"rot": (0, 0, -5 * math.sin(2 * t - 0.7)), "loc": (0, 0.15 * breath, 0)},
            "hand_r": {"rot": (0, 0, 5 * math.sin(2 * t - 0.9)), "loc": (0, 0.15 * breath, 0)},
        }))
    actions.append(make_action(rig, "Idle", idle).name)

    # Blink: fast close, a held frame, slower open.
    shut = {"scale": (1.05, 0.12, 1)}
    actions.append(make_action(rig, "Blink", [
        (0, {"eye_l": {}, "eye_r": {}}),
        (3, {"eye_l": shut, "eye_r": shut}),
        (4, {"eye_l": shut, "eye_r": shut}),
        (9, {"eye_l": {}, "eye_r": {}}),
    ]).name)

    # Walk: a waddle. Feet alternate, the body rolls over the stance foot and
    # bobs twice per cycle; hands swing against the feet.
    walk = []
    for i in range(0, 25, 3):
        t = i / 24 * 2 * math.pi
        lift_l = max(0.0, math.sin(t))
        lift_r = max(0.0, -math.sin(t))
        walk.append((i, {
            "root": {"loc": (0, 0.7 * abs(math.sin(t)), 0)},
            "body": {"rot": (3, 0, -5 * math.sin(t)), "scale": squash(1 - 0.03 * math.cos(2 * t))},
            "foot_l": {"loc": (0, 1.6 * lift_l, 1.6 * math.cos(t)), "rot": (-14 * lift_l, 0, 0)},
            "foot_r": {"loc": (0, 1.6 * lift_r, -1.6 * math.cos(t)), "rot": (-14 * lift_r, 0, 0)},
            "hand_l": {"rot": (16 * math.cos(t), 0, -6)},
            "hand_r": {"rot": (-16 * math.cos(t), 0, 6)},
        }))
    actions.append(make_action(rig, "Walk", walk).name)

    # Hop: anticipation, stretch, apex tuck, contact, squash, overshoot, settle.
    actions.append(make_action(rig, "Hop", [
        (0, {"root": {}, "body": {}, "foot_l": {}, "foot_r": {}, "hand_l": {}, "hand_r": {}}),
        (7, {"body": {"scale": squash(0.84)}, "hand_l": {"rot": (0, 0, -18)}, "hand_r": {"rot": (0, 0, 18)}}),
        (11, {"root": {"loc": (0, 2.5, 0)}, "body": {"scale": squash(1.14)}, "hand_l": {"rot": (0, 0, 28)}, "hand_r": {"rot": (0, 0, -28)}}),
        (19, {"root": {"loc": (0, 8.5, 0)}, "body": {"scale": squash(1.0)}, "foot_l": {"loc": (0, 1.2, 0), "rot": (-10, 0, 0)},
              "foot_r": {"loc": (0, 1.2, 0), "rot": (-10, 0, 0)}, "hand_l": {"rot": (0, 0, 34)}, "hand_r": {"rot": (0, 0, -34)}}),
        (26, {"root": {"loc": (0, 1.0, 0)}, "body": {"scale": squash(1.1)}, "hand_l": {"rot": (0, 0, 20)}, "hand_r": {"rot": (0, 0, -20)}}),
        (28, {"body": {"scale": squash(0.82)}, "hand_l": {"rot": (0, 0, -14)}, "hand_r": {"rot": (0, 0, 14)}}),
        (33, {"body": {"scale": squash(1.05)}, "hand_l": {"rot": (0, 0, 6)}, "hand_r": {"rot": (0, 0, -6)}}),
        (40, {"root": {}, "body": {}, "foot_l": {}, "foot_r": {}, "hand_l": {}, "hand_r": {}}),
    ], interpolation={11: "LINEAR", 26: "LINEAR"}).name)

    # Surprise: a quick stretch back, wide eyes, open mouth, hands up; holds.
    surprised = {
        "body": {"scale": squash(1.07), "rot": (-7, 0, 0)},
        "eye_l": {"scale": (1.25, 1.35, 1)}, "eye_r": {"scale": (1.25, 1.35, 1)},
        "mouth": {"scale": (0.8, 1.9, 1)},
        "hand_l": {"rot": (0, 0, 48), "loc": (0, 0.6, 0)}, "hand_r": {"rot": (0, 0, -48), "loc": (0, 0.6, 0)},
    }
    actions.append(make_action(rig, "Surprise", [
        (0, {k: {} for k in surprised}),
        (3, {"body": {"scale": squash(0.93)}}),
        (8, surprised),
        (12, {**surprised, "body": {"scale": squash(1.03), "rot": (-5, 0, 0)}}),
        (30, {**surprised, "body": {"scale": squash(1.04), "rot": (-5, 0, 0)}}),
    ]).name)

    # Wave: right hand (screen right) raised and swung, with body counter-lean.
    wave = [(0, {"hand_r": {}, "body": {}})]
    for i, ang in ((6, -72), (12, -110), (18, -78), (24, -112), (30, -80), (36, -108)):
        wave.append((i, {"hand_r": {"rot": (0, 0, ang), "loc": (0, 0.8, 0)}, "body": {"rot": (0, 0, 3.5)}}))
    wave.append((46, {"hand_r": {}, "body": {}}))
    actions.append(make_action(rig, "Wave", wave).name)

    # Look around: eyes lead, the body follows (overlapping action).
    look = [
        (0, {"body": {}, "eye_l": {}, "eye_r": {}}),
        (8, {"eye_l": {"loc": (-0.7, 0, 0)}, "eye_r": {"loc": (-0.7, 0, 0)}}),
        (20, {"body": {"rot": (0, -24, 0)}, "eye_l": {"loc": (-0.5, 0, 0)}, "eye_r": {"loc": (-0.5, 0, 0)}}),
        (40, {"body": {"rot": (0, -24, 0)}, "eye_l": {"loc": (0.7, 0, 0)}, "eye_r": {"loc": (0.7, 0, 0)}}),
        (56, {"body": {"rot": (0, 22, 0)}, "eye_l": {"loc": (0.5, 0.2, 0)}, "eye_r": {"loc": (0.5, 0.2, 0)}}),
        (76, {"body": {"rot": (0, 22, 0)}, "eye_l": {"loc": (0, 0.2, 0)}, "eye_r": {"loc": (0, 0.2, 0)}}),
        (90, {"body": {}, "eye_l": {}, "eye_r": {}}),
    ]
    actions.append(make_action(rig, "LookAround", look).name)

    # Float: weightless drift used while Poko's matter is in transit.
    float_keys = []
    for i in range(0, 61, 6):
        t = i / 60 * 2 * math.pi
        float_keys.append((i, {
            "root": {"loc": (0, 0.8 * math.sin(t), 0)},
            "body": {"rot": (2.5 * math.sin(t + 1), 0, 2 * math.sin(t))},
            "foot_l": {"rot": (10 * math.sin(t + 0.8), 0, 0), "loc": (0, -0.3, 0)},
            "foot_r": {"rot": (10 * math.sin(t + 1.4), 0, 0), "loc": (0, -0.3, 0)},
            "hand_l": {"rot": (0, 0, 14 + 8 * math.sin(t + 0.5))},
            "hand_r": {"rot": (0, 0, -14 - 8 * math.sin(t + 0.9))},
        }))
    actions.append(make_action(rig, "Float", float_keys).name)

    # Land: arrives from above, absorbs the impact, settles, looks up.
    actions.append(make_action(rig, "Land", [
        (0, {"root": {"loc": (0, 7, 0)}, "body": {"scale": squash(1.1)}, "foot_l": {"loc": (0, -0.6, 0)}, "foot_r": {"loc": (0, -0.6, 0)},
             "hand_l": {"rot": (0, 0, 30)}, "hand_r": {"rot": (0, 0, -30)}}),
        (6, {"root": {"loc": (0, 0, 0)}, "body": {"scale": squash(1.08)}, "foot_l": {}, "foot_r": {}, "hand_l": {"rot": (0, 0, 24)}, "hand_r": {"rot": (0, 0, -24)}}),
        (9, {"root": {}, "body": {"scale": squash(0.8)}, "hand_l": {"rot": (0, 0, -16)}, "hand_r": {"rot": (0, 0, 16)}}),
        (15, {"root": {}, "body": {"scale": squash(1.06)}, "hand_l": {"rot": (0, 0, 8)}, "hand_r": {"rot": (0, 0, -8)}}),
        (22, {"root": {}, "body": {"scale": squash(0.98), "rot": (-4, 0, 0)}, "hand_l": {}, "hand_r": {}}),
        (30, {"root": {}, "body": {"rot": (-3, 0, 0)}, "foot_l": {}, "foot_r": {}, "hand_l": {}, "hand_r": {}}),
    ], interpolation={6: "LINEAR"}).name)

    return actions


# ---------------------------------------------------------------- staging

def stage_scene() -> None:
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Midnight")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.004, 0.006, 0.016, 1)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world

    def area(name, loc, rot, energy, size, color):
        light = bpy.data.lights.new(name, "AREA")
        light.energy = energy
        light.size = size
        light.color = color
        obj = bpy.data.objects.new(name, light)
        obj.location = loc
        obj.rotation_euler = Euler([math.radians(a) for a in rot])
        scene.collection.objects.link(obj)

    # Same intent as the runtime rig in src/experience/Lighting.ts: warm key,
    # cool rim from behind, faint fill; gold needs large soft sources to read.
    area("Key", (-2.2, -2.6, 3.2), (52, 0, -38), 600, 2.4, (1.0, 0.94, 0.86))
    area("Rim", (2.4, 2.2, 2.6), (-58, 0, 140), 700, 1.6, (0.62, 0.74, 1.0))
    area("Fill", (2.6, -2.4, 0.8), (78, 0, 48), 160, 3.0, (0.8, 0.86, 1.0))

    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 70
    cam = bpy.data.objects.new("Camera", cam_data)
    cam.location = (2.6, -6.2, 2.1)
    scene.collection.objects.link(cam)
    target = bpy.data.objects.new("CameraTarget", None)
    target.location = (0, 0, 1.15)
    scene.collection.objects.link(target)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    floor_mesh = bpy.data.meshes.new("Floor")
    floor_mesh.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("Floor", floor_mesh)
    floor_mat = bpy.data.materials.new("Floor")
    floor_mat.use_nodes = True
    fb = floor_mat.node_tree.nodes["Principled BSDF"]
    fb.inputs["Base Color"].default_value = (0.008, 0.01, 0.022, 1)
    fb.inputs["Roughness"].default_value = 0.35
    floor_mesh.materials.append(floor_mat)
    scene.collection.objects.link(floor)
    floor.hide_render = False

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.view_settings.view_transform = "AgX"


def render_previews(rig, views: list[tuple[str, tuple, str | None, int]]) -> None:
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    cam = scene.camera
    floor = bpy.data.objects["Floor"]
    for name, cam_loc, action_name, frame in views:
        cam.location = cam_loc
        rig.animation_data.action = bpy.data.actions[action_name] if action_name else None
        if not action_name:
            for pb in rig.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.scale = (1, 1, 1)
        scene.frame_set(frame)
        scene.render.filepath = str(RENDERS / f"{name}.jpg")
        floor.hide_render = False
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {scene.render.filepath}")
    rig.animation_data.action = None


def export_glb(mesh_obj, rig) -> None:
    GLB.parent.mkdir(parents=True, exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.select_set(obj in (mesh_obj, rig))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(GLB),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_vertex_color="ACTIVE",
        export_materials="EXPORT",
        export_skins=True,
        export_influence_nb=1,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=False,
        export_reset_pose_bones=True,
        export_rest_position_armature=True,
        export_def_bones=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_copyright="Poko © Giuseppe Vitolo / Pokoin",
    )
    print(f"Exported {GLB} ({GLB.stat().st_size} bytes)")


def main(argv: list[str]) -> None:
    data = json.loads(DATA.read_text())
    reset_scene()
    mats = build_materials(data["palette"])
    mesh_obj = build_mesh(data, mats)
    rig = build_armature(data)
    mesh_obj.parent = rig
    mod = mesh_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    actions = build_actions(rig)
    print(f"Actions: {', '.join(actions)}")
    stage_scene()
    export_glb(mesh_obj, rig)
    if "--no-render" not in argv:
        render_previews(rig, [
            ("poko_front", (0.0, -7.0, 1.2), None, 0),
            ("poko_three_quarter", (3.4, -5.6, 1.9), None, 0),
            ("poko_side", (7.0, 0.0, 1.3), None, 0),
            ("poko_back", (-2.6, 6.4, 1.6), None, 0),
            ("poko_surprise", (2.6, -6.2, 1.6), "Surprise", 14),
            ("poko_hop_apex", (2.6, -6.6, 2.0), "Hop", 19),
            ("poko_wave", (2.6, -6.2, 1.6), "Wave", 12),
        ])
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    print(f"Saved {BLEND}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
