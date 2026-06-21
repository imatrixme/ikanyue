import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets-src" / "pets" / "v7"
BLEND_PATH = OUT_DIR / "blend" / "sprout_hd_soft.blend"
PREVIEW_PATH = OUT_DIR / "preview" / "sprout_hd_soft_idle.png"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def make_material(name, color, roughness=0.8, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(
        (
            node
            for node in material.node_tree.nodes
            if node.bl_idname == "ShaderNodeBsdfPrincipled"
        ),
        None,
    )
    if bsdf is None:
        bsdf = material.node_tree.nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


def shade_soft(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    modifier = obj.modifiers.new("soft subdivision", "SUBSURF")
    modifier.levels = 1
    modifier.render_levels = 1


def soften_decal(obj):
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    if hasattr(obj, "cycles_visibility"):
        obj.cycles_visibility.shadow = False
    return obj


def add_uv_sphere(name, location, scale, material, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=1,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(material)
    shade_soft(obj)
    return obj


def add_ellipsoid(name, location, scale, material, rotation=(0, 0, 0), decal=False):
    obj = add_uv_sphere(name, location, scale, material)
    obj.rotation_euler = rotation
    if decal:
        soften_decal(obj)
    return obj


def add_curve_leaf(name, side, material, vein_material):
    body = add_ellipsoid(
        f"{name} leaf pad",
        (0.36 * side, 1.78, 0.0),
        (0.62, 0.18, 0.075),
        material,
        (0.0, 0.0, math.radians(-18 * side)),
    )

    tip = add_ellipsoid(
        f"{name} leaf tip",
        (0.82 * side, 1.69, 0.01),
        (0.21, 0.14, 0.052),
        material,
        (0.0, 0.0, math.radians(-24 * side)),
    )

    vein = add_ellipsoid(
        f"{name} leaf vein",
        (0.42 * side, 1.79, 0.08),
        (0.42, 0.018, 0.009),
        vein_material,
        (0.0, 0.0, math.radians(-18 * side)),
        decal=True,
    )

    accent_a = add_ellipsoid(
        f"{name} leaf highlight a",
        (0.12 * side, 1.86, 0.095),
        (0.17, 0.018, 0.008),
        vein_material,
        (0.0, 0.0, math.radians(-18 * side)),
        decal=True,
    )
    accent_b = add_ellipsoid(
        f"{name} leaf highlight b",
        (0.61 * side, 1.72, 0.095),
        (0.13, 0.016, 0.008),
        vein_material,
        (0.0, 0.0, math.radians(-18 * side)),
        decal=True,
    )
    return [body, tip, vein, accent_a, accent_b]


def add_eye(name, x, y, materials):
    eye = add_ellipsoid(
        f"{name} eye",
        (x, y, 0.93),
        (0.105, 0.135, 0.026),
        materials["ink"],
    )
    shine = add_ellipsoid(
        f"{name} eye shine",
        (x - 0.03, y + 0.045, 0.957),
        (0.028, 0.036, 0.01),
        materials["white"],
    )
    return [eye, shine]


def add_mouth(material):
    mouth = add_ellipsoid(
        "tiny soft mouth",
        (0.0, 0.02, 0.965),
        (0.13, 0.014, 0.01),
        material,
    )
    mouth.rotation_euler[0] = math.radians(3)
    return mouth


def add_soft_sprout():
    materials = {
        "body": make_material("pear body soft gradient base", (0.72, 0.88, 0.24, 1.0)),
        "body_light": make_material("warm body highlight", (0.88, 0.97, 0.42, 1.0)),
        "body_shadow": make_material("soft lime shadow", (0.51, 0.69, 0.18, 1.0)),
        "leaf": make_material("fresh leaf body", (0.62, 0.84, 0.18, 1.0)),
        "leaf_vein": make_material("painted leaf vein", (0.33, 0.55, 0.17, 1.0)),
        "stem": make_material("round leaf stem", (0.6, 0.79, 0.22, 1.0)),
        "ink": make_material("soft dark ink", (0.08, 0.11, 0.06, 1.0)),
        "white": make_material("eye sparkle", (1.0, 1.0, 0.94, 1.0)),
        "blush": make_material("peach blush", (1.0, 0.62, 0.53, 1.0)),
    }

    root = bpy.data.objects.new("Sprout HD soft mascot", None)
    bpy.context.collection.objects.link(root)

    body = add_uv_sphere(
        "soft pear body",
        (0.0, -0.08, 0.0),
        (0.88, 1.06, 0.84),
        materials["body"],
        segments=64,
        rings=32,
    )
    body.parent = root

    belly = add_ellipsoid(
        "tiny lower cheek shine",
        (-0.2, -0.16, 0.825),
        (0.13, 0.05, 0.012),
        materials["body_light"],
        decal=True,
    )
    belly.parent = root

    brow_light = add_ellipsoid(
        "forehead bean highlight",
        (-0.1, 0.62, 0.82),
        (0.25, 0.055, 0.018),
        materials["body_light"],
        (0, 0, math.radians(-4)),
        decal=True,
    )
    brow_light.parent = root

    side_shadow = add_ellipsoid(
        "right rounded shadow",
        (0.63, -0.33, 0.43),
        (0.09, 0.28, 0.02),
        materials["body_shadow"],
        (0, 0, math.radians(-7)),
        decal=True,
    )
    side_shadow.parent = root

    smile = add_ellipsoid(
        "subtle lower smile crease",
        (0.03, -0.54, 0.78),
        (0.36, 0.03, 0.012),
        materials["body_shadow"],
        (0, 0, math.radians(2)),
        decal=True,
    )
    smile.parent = root

    stem = add_ellipsoid(
        "round flexible stem",
        (0.0, 1.18, 0.0),
        (0.115, 0.45, 0.095),
        materials["stem"],
        (0.0, 0.0, math.radians(-2)),
    )
    stem.parent = root

    for obj in add_curve_leaf("left", -1, materials["leaf"], materials["leaf_vein"]):
        obj.parent = root
    for obj in add_curve_leaf("right", 1, materials["leaf"], materials["leaf_vein"]):
        obj.parent = root

    for obj in add_eye("left", -0.3, 0.18, materials):
        obj.parent = root
    for obj in add_eye("right", 0.31, 0.18, materials):
        obj.parent = root

    add_mouth(materials["ink"]).parent = root

    for x in (-0.5, 0.5):
        cheek = add_ellipsoid(
            f"{'left' if x < 0 else 'right'} peach cheek",
            (x, -0.03, 0.9),
            (0.18, 0.06, 0.014),
            materials["blush"],
            decal=True,
        )
        cheek.parent = root

    for x in (-0.52, 0.52):
        arm = add_ellipsoid(
            f"{'left' if x < 0 else 'right'} nub arm",
            (x, -0.36, 0.49),
            (0.12, 0.08, 0.095),
            materials["body"],
            (0.0, 0.0, math.radians(17 * (-1 if x < 0 else 1))),
        )
        arm.parent = root

    for x in (-0.34, 0.34):
        foot = add_ellipsoid(
            f"{'left' if x < 0 else 'right'} tiny foot",
            (x, -1.01, 0.24),
            (0.19, 0.09, 0.095),
            materials["body_shadow"],
        )
        foot.parent = root

    root.rotation_euler = (math.radians(2), 0, 0)
    return root


def add_world():
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    if hasattr(bpy.context.scene, "eevee"):
        bpy.context.scene.eevee.taa_render_samples = 64
    bpy.context.scene.render.film_transparent = True
    bpy.context.scene.render.resolution_x = 768
    bpy.context.scene.render.resolution_y = 768
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.image_settings.color_mode = "RGBA"

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (1.0, 1.0, 1.0)

    bpy.ops.object.light_add(type="AREA", location=(-2.6, 3.4, 4.2))
    key = bpy.context.object
    key.name = "large soft key light"
    key.data.energy = 520
    key.data.size = 4.5

    bpy.ops.object.light_add(type="POINT", location=(2.0, 1.2, 2.8))
    rim = bpy.context.object
    rim.name = "mint rim light"
    rim.data.energy = 62
    rim.data.color = (0.72, 1.0, 0.82)

    bpy.ops.object.camera_add(location=(0, 0.34, 6.2), rotation=(0, 0, 0))
    camera = bpy.context.object
    camera.name = "orthographic sprite camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.05
    camera.data.lens = 70
    bpy.context.scene.camera = camera


def add_animation(root):
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 48
    for frame in (1, 13, 25, 37, 48):
        phase = (frame - 1) / 47
        root.location = (0, math.sin(phase * math.tau) * 0.035, 0)
        root.scale = (
            1.0 + math.sin(phase * math.tau) * 0.018,
            1.0 - math.sin(phase * math.tau) * 0.012,
            1.0,
        )
        root.rotation_euler[2] = math.radians(math.sin(phase * math.tau) * 1.8)
        root.keyframe_insert(data_path="location", frame=frame)
        root.keyframe_insert(data_path="scale", frame=frame)
        root.keyframe_insert(data_path="rotation_euler", frame=frame)

    action = root.animation_data.action if root.animation_data else None
    fcurves = getattr(action, "fcurves", []) if action else []
    for fcurve in fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "SINE"


def save_and_render():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.context.scene.frame_set(1)
    bpy.context.scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    clear_scene()
    root = add_soft_sprout()
    add_world()
    add_animation(root)
    save_and_render()


if __name__ == "__main__":
    main()
