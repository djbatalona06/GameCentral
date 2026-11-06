#!/usr/bin/env python3
"""Meridian background pack, made in Blender from code.

Every location is built from scratch by this script (no downloaded models or textures), lit
with a sky image generated from the chapter's own colours (palettes.json), and rendered with
Cycles. Outputs go to public/backgrounds/ as WebP:

    key-art.webp / key-art-sm.webp   title and menu backdrop (the Drowned City at sunset)
    chNN-pano.webp / chNN-pano-sm.webp   360-degree distant backdrop shown as the in-game sky
    chNN-card.webp                   chapter-select card and loading screen

Run it with Blender's Python module (pip install -r requirements.txt):

    python -I render_backgrounds.py                    # everything (about 20-40 minutes on 4 cores)
    python -I render_backgrounds.py --only ch03        # one scene
    python -I render_backgrounds.py --only key-art --fast   # quick low-quality preview

Directions: "compass" degrees are measured from the panorama's centre (0) turning right (+90).
Blender axes: +Z is up, the panorama camera looks along +Y. In the game (Babylon, y-up) the
same direction is (x, y, z) = (X, Z, Y), so the sky shader can sample the panorama directly.
"""

import argparse
import json
import math
import os
import random

import bpy  # noqa: I001  (bpy must load before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", ".."))

# The game's sun (Babylon light direction, pointing from the sun to the ground), converted to
# Blender axes and flipped so it points at the sun. Keeps the lighting in the panoramas where
# the game draws its sun disc and casts its shadows.
SUN_DAY = Vector((0.45, -0.35, 0.85)).normalized()
SUN_NIGHT = Vector((-0.35, -0.45, 0.8)).normalized()


# ---------------------------------------------------------------------------------- colour

def srgb(hex_: str) -> np.ndarray:
    h = hex_.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


def to_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin(hex_: str):
    return tuple(float(v) for v in to_linear(srgb(hex_))) + (1.0,)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------------- noise

def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def vnoise(x, y, seed=0):
    ix = np.floor(x).astype(np.int64)
    iy = np.floor(y).astype(np.int64)
    fx = (x - ix).astype(np.float32)
    fy = (y - iy).astype(np.float32)
    ux = fx * fx * (3 - 2 * fx)
    uy = fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def fbm(x, y, octaves=5, seed=0, gain=0.5, ridged=False):
    total = np.zeros_like(np.asarray(x, dtype=np.float32))
    amp, freq, norm = 1.0, 1.0, 0.0
    for o in range(octaves):
        n = vnoise(x * freq, y * freq, seed + o * 17)
        if ridged:
            n = 1 - np.abs(n * 2 - 1)
            n = n * n
        total += n * amp
        norm += amp
        amp *= gain
        freq *= 2.03
    return total / norm


# ---------------------------------------------------------------------------------- scene setup

def reset(fast: bool):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.use_persistent_data = True
    sc["fast"] = fast
    return sc


def set_view(sc, filmic: bool):
    """Panoramas use Standard so the sky matches the game's colours exactly; menu art uses AgX."""
    sc.view_settings.view_transform = "AgX" if filmic else "Standard"
    if filmic:
        for look in ("AgX - Punchy", "AgX - Medium High Contrast", "None"):
            try:
                sc.view_settings.look = look
                break
            except TypeError:
                continue


def node_tree(idblock):
    try:
        idblock.use_nodes = True
    except AttributeError:
        pass
    return idblock.node_tree


def sock(node, ident, out=False):
    """Find a socket by identifier or name (Blender's Mix node has several sockets per name)."""
    coll = node.outputs if out else node.inputs
    for s in coll:
        if s.identifier == ident:
            return s
    for s in coll:
        if s.name == ident and s.enabled:
            return s
    raise KeyError(ident)


# ---------------------------------------------------------------------------------- sky image

def sky_image(pal: dict, sun: Vector, width: int, seed: int):
    """Builds the sky as a float image, following the game's own sky shader (src/render/Sky.ts)
    for the colour gradient, then adds clouds, stars and the sun or moon glow."""
    w, h = width, width // 2
    u = (np.arange(w, dtype=np.float32) + 0.5) / w
    v = (np.arange(h, dtype=np.float32) + 0.5) / h  # row 0 = bottom (Blender pixel order)
    az = (u - 0.5) * 2 * math.pi
    el = (v - 0.5) * math.pi
    cel = np.cos(el)[:, None]
    X = cel * np.cos(az)[None, :]
    Y = -cel * np.sin(az)[None, :]
    Z = np.repeat(np.sin(el)[:, None], w, axis=1)

    top, horizon, bottom = srgb(pal["top"]), srgb(pal["fog"]), srgb(pal["bottom"]) * 0.6
    up = np.clip(Z, 0, 1) ** (0.38 if pal.get("sunset") else 0.55)
    sky_up = horizon + (top - horizon) * up[..., None]
    sky_dn = horizon + (bottom - horizon) * np.clip(-Z * 3, 0, 1)[..., None]
    col = np.where((Z > 0)[..., None], sky_up, sky_dn).astype(np.float32)

    night = pal.get("night", False)
    sunset = pal.get("sunset", False)
    s = np.clip(X * sun.x + Y * sun.y + Z * sun.z, 0, 1)
    sun_col = np.array([0.55, 0.62, 0.8] if night else ([1.0, 0.72, 0.42] if sunset else [1.0, 0.86, 0.62]), np.float32)

    if sunset:
        # A wide warm band along the horizon, brightest under the sun.
        band = np.exp(-np.maximum(Z, 0) * 9)[..., None] * (0.35 + 0.65 * s[..., None] ** 3)
        col = col + (np.array([1.0, 0.55, 0.28], np.float32) - col) * np.clip(band, 0, 1) * 0.75

    # Clouds: a flat layer seen from below, so they bunch up and thin out toward the horizon.
    cover = pal.get("clouds", 0.3)
    if cover > 0:
        zz = np.maximum(Z, 0.0) + 0.1
        px, py = X / zz * 1.6, Y / zz * 1.6
        n = fbm(px * 1.0 + 7.3, py * 2.2 + 1.1, 6, seed)
        detail = fbm(px * 4.0, py * 4.0, 4, seed + 99)
        thresh = 0.72 - cover * 0.38
        mask = smoothstep(thresh, thresh + 0.22, n * 0.8 + detail * 0.2) * smoothstep(0.0, 0.12, Z)
        if night:
            lit = horizon * 1.25 + 0.03
            shade = top * 0.9
        elif sunset:
            lit = np.array([1.0, 0.68, 0.45], np.float32)
            shade = np.array([0.35, 0.28, 0.38], np.float32)
        else:
            lit = np.minimum(np.array([1.0, 0.99, 0.97], np.float32) * (0.92 + 0.08 * horizon), 1)
            shade = horizon * 0.82 + top * 0.12
        shading = np.clip(detail * 1.2 - 0.1 + s * 0.35, 0, 1)[..., None]
        cloud = shade + (lit - shade) * shading
        cloud = cloud + sun_col * (s[..., None] ** 6) * (0.6 if sunset else 0.25)
        col = col + (cloud - col) * (mask[..., None] * (0.55 if night else 0.92))

    if night:
        r = np.random.default_rng(seed)
        star = (r.random((h, w)) > 0.9982).astype(np.float32) * r.random((h, w)).astype(np.float32)
        star *= smoothstep(0.04, 0.35, Z)
        if cover > 0:
            star *= 1 - mask
        col = col + star[..., None] * 0.9

    # Soft glow around the sun or moon (the game draws the disc itself on top).
    glow = s ** 12 * (0.22 if not sunset else 0.5) + s ** 220 * (0.6 if not night else 0.35)
    col = col + sun_col * glow[..., None]
    if sunset:
        col = col + sun_col * (s ** 3000 * 30)[..., None]  # the setting sun's disc, for the key art

    lin_col = to_linear(np.clip(col, 0, None))
    img = bpy.data.images.new("sky", w, h, float_buffer=True, alpha=False)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = lin_col
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def world(sc, pal: dict, sun: Vector, width: int, seed: int):
    wd = bpy.data.worlds.new("world")
    sc.world = wd
    nt = node_tree(wd)
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = sky_image(pal, sun, width, seed)
    bg = nt.nodes["Background"]
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0


def sun_lamp(sc, sun: Vector, night: bool, sunset: bool, moon_boost: float = 1.0):
    ld = bpy.data.lights.new("sun", "SUN")
    if night:
        ld.energy, ld.color = 1.2 * moon_boost, (0.62, 0.72, 1.0)
    elif sunset:
        ld.energy, ld.color = 3.2, (1.0, 0.62, 0.36)
    else:
        ld.energy, ld.color = 3.6, (1.0, 0.93, 0.82)
    ld.angle = math.radians(1.2 if not sunset else 2.5)
    ob = bpy.data.objects.new("sun", ld)
    ob.rotation_euler = sun.to_track_quat("Z", "Y").to_euler()
    sc.collection.objects.link(ob)


# ---------------------------------------------------------------------------------- materials

class Mats:
    """Every material blends toward the fog colour with distance (aerial perspective)."""

    def __init__(self, fog_hex: str, haze: float):
        self.fog = lin(fog_hex)
        self.haze = haze
        self.cache = {}
        self.fog_nodes = []  # (math node, base value) so a shot can thin or thicken the haze

    def haze_scale(self, k):
        for node, base in self.fog_nodes:
            node.inputs[1].default_value = base * k

    def _fogged(self, nt, shader_out, scale=1.0):
        cam = nt.nodes.new("ShaderNodeCameraData")
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = -self.haze * scale
        self.fog_nodes.append((mul, -self.haze * scale))
        nt.links.new(sock(cam, "View Distance", out=True), mul.inputs[0])
        ex = nt.nodes.new("ShaderNodeMath")
        ex.operation = "EXPONENT"
        nt.links.new(mul.outputs[0], ex.inputs[0])
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(ex.outputs[0], inv.inputs[1])
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = self.fog
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(inv.outputs[0], mix.inputs[0])
        nt.links.new(shader_out, mix.inputs[1])
        nt.links.new(em.outputs[0], mix.inputs[2])
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(mix.outputs[0], out.inputs["Surface"])

    def solid(self, name, hex_, rough=0.85, metal=0.0, emit=None, emit_strength=0.0, fog_scale=1.0):
        key = (name, hex_)
        if key in self.cache:
            return self.cache[key]
        m = bpy.data.materials.new(name)
        nt = node_tree(m)
        nt.nodes.clear()
        p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        p.inputs["Base Color"].default_value = lin(hex_)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        if emit:
            p.inputs["Emission Color"].default_value = lin(emit)
            p.inputs["Emission Strength"].default_value = emit_strength
        self._fogged(nt, p.outputs[0], fog_scale)
        self.cache[key] = m
        return m

    def terrain(self, name, low_hex, high_hex, snow_hex=None, snow_from=1e9, slope_rock=None):
        """Colour by height (and steepness): sand or grass low, rock high, snow on top."""
        m = bpy.data.materials.new(name)
        nt = node_tree(m)
        nt.nodes.clear()
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Position"], sep.inputs[0])
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 0.02
        noise.inputs["Detail"].default_value = 6
        nt.links.new(geo.outputs["Position"], noise.inputs["Vector"])
        # height + a little noise so the bands are not ruler-straight
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "MULTIPLY_ADD"
        add.inputs[2].default_value = 0
        nt.links.new(noise.outputs["Fac"], add.inputs[0])
        add.inputs[1].default_value = max(60.0, snow_from * 0.15) if snow_hex else 60.0
        h = nt.nodes.new("ShaderNodeMath")
        h.operation = "ADD"
        nt.links.new(sep.outputs["Z"], h.inputs[0])
        nt.links.new(add.outputs[0], h.inputs[1])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = 0
        ramp.inputs["From Max"].default_value = max(snow_from * 0.8, 200) if snow_hex else 400
        nt.links.new(h.outputs[0], ramp.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(ramp.outputs[0], sock(mix, "Factor_Float"))
        sock(mix, "A_Color").default_value = lin(low_hex)
        sock(mix, "B_Color").default_value = lin(high_hex)
        color_out = sock(mix, "Result_Color", out=True)
        if slope_rock:
            sepn = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(geo.outputs["Normal"], sepn.inputs[0])
            steep = nt.nodes.new("ShaderNodeMapRange")
            steep.inputs["From Min"].default_value = 0.85
            steep.inputs["From Max"].default_value = 0.6
            nt.links.new(sepn.outputs["Z"], steep.inputs["Value"])
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type = "RGBA"
            nt.links.new(steep.outputs[0], sock(mx, "Factor_Float"))
            nt.links.new(color_out, sock(mx, "A_Color"))
            sock(mx, "B_Color").default_value = lin(slope_rock)
            color_out = sock(mx, "Result_Color", out=True)
        if snow_hex:
            sepn = nt.nodes.new("ShaderNodeSeparateXYZ")
            nt.links.new(geo.outputs["Normal"], sepn.inputs[0])
            sh = nt.nodes.new("ShaderNodeMapRange")
            sh.inputs["From Min"].default_value = snow_from * 0.9
            sh.inputs["From Max"].default_value = snow_from * 1.05
            nt.links.new(h.outputs[0], sh.inputs["Value"])
            flat = nt.nodes.new("ShaderNodeMapRange")
            flat.inputs["From Min"].default_value = 0.45
            flat.inputs["From Max"].default_value = 0.75
            nt.links.new(sepn.outputs["Z"], flat.inputs["Value"])
            both = nt.nodes.new("ShaderNodeMath")
            both.operation = "MULTIPLY"
            nt.links.new(sh.outputs[0], both.inputs[0])
            nt.links.new(flat.outputs[0], both.inputs[1])
            ms = nt.nodes.new("ShaderNodeMix")
            ms.data_type = "RGBA"
            nt.links.new(both.outputs[0], sock(ms, "Factor_Float"))
            nt.links.new(color_out, sock(ms, "A_Color"))
            sock(ms, "B_Color").default_value = lin(snow_hex)
            color_out = sock(ms, "Result_Color", out=True)
        p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(color_out, p.inputs["Base Color"])
        p.inputs["Roughness"].default_value = 0.95
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        n2 = nt.nodes.new("ShaderNodeTexNoise")
        n2.inputs["Scale"].default_value = 0.6
        n2.inputs["Detail"].default_value = 8
        nt.links.new(geo.outputs["Position"], n2.inputs["Vector"])
        nt.links.new(n2.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], p.inputs["Normal"])
        self._fogged(nt, p.outputs[0])
        return m

    def water(self, deep_hex):
        m = bpy.data.materials.new("water")
        nt = node_tree(m)
        nt.nodes.clear()
        p = nt.nodes.new("ShaderNodeBsdfPrincipled")
        p.inputs["Base Color"].default_value = lin(deep_hex)
        p.inputs["Roughness"].default_value = 0.15
        p.inputs["IOR"].default_value = 1.33
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (0.08, 0.22, 0.08)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 3.0
        n.inputs["Detail"].default_value = 8
        n.inputs["Roughness"].default_value = 0.62
        nt.links.new(mp.outputs[0], n.inputs["Vector"])
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = 0.32
        nt.links.new(n.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs[0], p.inputs["Normal"])
        self._fogged(nt, p.outputs[0], 0.7)
        return m


# ---------------------------------------------------------------------------------- geometry

_TEMPLATES = {}


def _template(kind, segs=8, k=0.0):
    """A unit primitive (built once with bmesh) as vertex and face arrays, reused for every copy."""
    key = (kind, segs, round(k, 3))
    if key in _TEMPLATES:
        return _TEMPLATES[key]
    bm = bmesh.new()
    if kind == "box":
        bmesh.ops.create_cube(bm, size=1.0)
    elif kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(4, segs // 2), radius=1.0)
    else:  # cone: bottom radius 1, top radius k, height 1, standing on z = 0
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=1.0, radius2=k, depth=1.0,
                              matrix=Matrix.Translation((0, 0, 0.5)))
    bm.verts.index_update()
    verts = np.array([v.co[:] for v in bm.verts], dtype=np.float64)
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    _TEMPLATES[key] = (verts, faces)
    return verts, faces


class Batch:
    """Collects many primitives for one material into a single mesh (fast to render and to build:
    each shape is a transformed copy of a template, and the mesh is created once at the end)."""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.count = 0

    @staticmethod
    def _m(c, s=(1, 1, 1), rot=0.0, tilt=0.0):
        return Matrix.Translation(Vector(c)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Rotation(tilt, 4, "X") @ Matrix.Diagonal((s[0], s[1], s[2], 1))

    def _add(self, tpl, m):
        verts, faces = tpl
        mm = np.array(m, dtype=np.float64)
        self.verts.append(verts @ mm[:3, :3].T + mm[:3, 3])
        off = self.count
        self.faces.extend(tuple(i + off for i in f) for f in faces)
        self.count += len(verts)

    def box(self, c, s, rot=0.0, tilt=0.0):
        self._add(_template("box"), self._m(c, s, rot, tilt))

    def cone(self, c, r1, r2, h, segs=8, rot=0.0, tilt=0.0):
        self._add(_template("cone", segs, r2 / r1), self._m(c, (r1, r1, h), rot, tilt))

    def sphere(self, c, r, s=(1, 1, 1), segs=12):
        self._add(_template("sphere", segs), self._m(c, (r * s[0], r * s[1], r * s[2])))

    def dome(self, c, r, segs=14):
        self.sphere(c, r, (1, 1, 0.85), segs)

    def arch(self, c, span, height, depth, thick, rot=0.0):
        """A round arch from boxes: two piers and a curved top."""
        ca, sa = math.cos(rot), math.sin(rot)
        def at(dx, dz):
            return (c[0] + dx * ca, c[1] + dx * sa, c[2] + dz)
        self.box(at(-span / 2 - thick / 2, height / 2), (thick, depth, height), rot)
        self.box(at(span / 2 + thick / 2, height / 2), (thick, depth, height), rot)
        n = 9
        for i in range(n):
            a = math.pi * (i + 0.5) / n
            r = span / 2 + thick / 2
            self.box(at(-math.cos(a) * r, height + math.sin(a) * r), (thick * 1.1, depth, thick * 1.1), rot)

    def link(self, sc, name, mat, smooth=False):
        me = bpy.data.meshes.new(name)
        verts = np.concatenate(self.verts) if self.verts else np.zeros((0, 3))
        me.from_pydata(verts.tolist(), [], self.faces)
        me.update()
        if smooth:
            try:
                me.shade_smooth()
            except AttributeError:
                pass
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        sc.collection.objects.link(ob)
        return ob


def compass_xy(deg, dist):
    a = math.radians(deg)
    return dist * math.sin(a), dist * math.cos(a)


class Terrain:
    """A ring of land around the camera, from noise plus hand-placed hills ("bumps")."""

    def __init__(self, seed, peak, scale=0.0011, ridged=False, base=-6.0, sectors=None, bumps=(), dunes=False, clamp_top=None, shore=0.25):
        self.seed, self.peak, self.scale, self.ridged, self.base = seed, peak, scale, ridged, base
        self.sectors = sectors  # list of (compass_centre, half_width_deg) where land exists
        self.bumps = list(bumps)  # (compass, dist, radius, height, flat_top_or_None)
        self.dunes, self.clamp_top, self.shore = dunes, clamp_top, shore
        self.r0 = self.r1 = 0.0

    def _sector(self, X, Y):
        if not self.sectors:
            return np.ones_like(X)
        comp = np.degrees(np.arctan2(X, Y))
        m = np.zeros_like(X)
        for c, half in self.sectors:
            d = np.abs((comp - c + 180) % 360 - 180)
            m = np.maximum(m, smoothstep(half, half * 0.6, d))
        return m

    def height(self, X, Y):
        X = np.asarray(X, dtype=np.float64)
        Y = np.asarray(Y, dtype=np.float64)
        n = fbm(X * self.scale + 31.7, Y * self.scale - 12.2, 6, self.seed, ridged=self.ridged)
        R = np.hypot(X, Y)
        t = np.clip((R - self.r0) / max(1.0, self.r1 - self.r0), 0, 1)
        env = smoothstep(0.0, self.shore, t)
        z = self.peak * env * n ** 1.6 * self._sector(X, Y)
        if self.dunes:
            ang = X * 0.0021 + Y * 0.0009 + fbm(X * 0.0006, Y * 0.0006, 3, self.seed + 5) * 6
            z = z * 0.35 + np.abs(np.sin(ang)) ** 1.5 * 58 * env * (0.6 + 0.6 * n)
        for comp, dist, rad, hgt, flat in self.bumps:
            bx, by = compass_xy(comp, dist)
            g = np.exp(-((X - bx) ** 2 + (Y - by) ** 2) / (2 * rad * rad))
            g = np.maximum(g - 0.08, 0) / 0.92  # no long tails: hills end where they look like they end
            if flat == "dome":
                g = g ** 0.35  # steep sides, rounded top: karst towers
            elif flat:
                g = np.minimum(g * 1.9, 1.0) ** 0.6
            crag = fbm(X * 0.012 + 3.1, Y * 0.012 - 7.7, 4, self.seed + 3, ridged=True)
            z = z + hgt * g * (0.55 + 0.35 * n + 0.45 * crag)
        if self.clamp_top:
            z = np.minimum(z, self.clamp_top)
        return z + self.base

    def build(self, sc, mat, r0, r1, nr=110, na=900):
        self.r0, self.r1 = r0, r1
        rs = r0 * (r1 / r0) ** np.linspace(0, 1, nr)  # denser near the camera
        az = np.linspace(-math.pi, math.pi, na, endpoint=False)
        R, A = np.meshgrid(rs, az, indexing="ij")
        X, Y = R * np.sin(A), R * np.cos(A)
        Z = self.height(X, Y)
        verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
        i = np.arange(nr - 1)[:, None]
        j = np.arange(na)[None, :]
        jn = (j + 1) % na
        a = i * na + j
        b = i * na + jn
        c = (i + 1) * na + jn
        d = (i + 1) * na + j
        faces = np.stack([a, b, c, d], -1).reshape(-1, 4)
        me = bpy.data.meshes.new("terrain")
        me.vertices.add(len(verts))
        me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
        me.loops.add(faces.size)
        me.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
        me.polygons.add(len(faces))
        me.polygons.foreach_set("loop_start", (np.arange(len(faces)) * 4).astype(np.int32))
        me.update(calc_edges=True)
        me.validate()
        try:
            me.shade_smooth()
        except AttributeError:
            pass
        me.materials.append(mat)
        ob = bpy.data.objects.new("terrain", me)
        sc.collection.objects.link(ob)
        return ob

    def z_at(self, comp, dist):
        x, y = compass_xy(comp, dist)
        return float(self.height(np.array([x]), np.array([y]))[0])


def ocean(sc, mats, deep="#0c2a33", size=40000):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size)
    me = bpy.data.meshes.new("ocean")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats.water(deep))
    ob = bpy.data.objects.new("ocean", me)
    sc.collection.objects.link(ob)


def scatter(n, comp_range, dist_range, rng):
    for _ in range(n):
        c = rng.uniform(*comp_range)
        d = math.sqrt(rng.uniform(dist_range[0] ** 2, dist_range[1] ** 2))
        yield c, d


def trees(sc, mats, terr, rng, n, comp_range, dist_range, hex_, size=(14, 26), kind="pine", min_z=1.0, max_z=1e9):
    bt = Batch()
    spots = list(scatter(n, comp_range, dist_range, rng))
    xy = np.array([compass_xy(c, d) for c, d in spots])
    zs = terr.height(xy[:, 0], xy[:, 1])  # one vectorised call instead of thousands of small ones
    for (x, y), z in zip(xy, zs):
        x, y, z = float(x), float(y), float(z)
        if z < min_z or z > max_z:
            continue
        hgt = rng.uniform(*size)
        if kind == "pine":
            bt.cone((x, y, z - 1), hgt * 0.28, 0.0, hgt, segs=6)
        else:  # broadleaf canopy
            bt.sphere((x, y, z + hgt * 0.55), hgt * 0.45, (1, 1, 0.75), segs=10)
    return bt.link(sc, "trees", mats.solid("tree", hex_, 0.9))


def camera_pano(sc, height):
    cd = bpy.data.cameras.new("pano")
    cd.type = "PANO"
    try:
        cd.panorama_type = "EQUIRECTANGULAR"
    except (AttributeError, TypeError):
        cd.cycles.panorama_type = "EQUIRECTANGULAR"
    cd.clip_end = 60000
    ob = bpy.data.objects.new("pano", cd)
    ob.location = (0, 0, height)
    ob.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(ob)
    return ob


def camera_persp(sc, pos, comp, pitch_deg, lens):
    cd = bpy.data.cameras.new("view")
    cd.lens = lens
    cd.clip_end = 60000
    cd.clip_start = 0.5
    ob = bpy.data.objects.new("view", cd)
    ob.location = pos
    ob.rotation_euler = (math.pi / 2 + math.radians(pitch_deg), 0, -math.radians(comp))
    sc.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------------------------- locations

def ch01(sc, mats, rng, pal):
    """Breakwater: Santa Brigida reef at dawn. Open sea, sea stacks, a headland with a lighthouse."""
    ocean(sc, mats, "#0e3a46")
    t = Terrain(11, 420, scale=0.0016, ridged=True, sectors=[(-150, 70), (40, 35), (175, 40)],
                bumps=[(38, 650, 110, 85, None), (-20, 1400, 50, 90, None), (-55, 1100, 40, 110, None), (-8, 1900, 45, 75, None), (12, 2600, 300, 190, None)])
    t.build(sc, mats.terrain("rock", "#8c8466", "#5f5b55", slope_rock="#4e4a45"), 380, 7000)
    lh = Batch()
    x, y = compass_xy(38, 650)
    z = t.z_at(38, 650)
    lh.cone((x, y, z - 2), 5.5, 4.2, 30, segs=16)
    lh.box((x + 12, y, z + 3), (14, 9, 9))
    lh.link(sc, "lighthouse", mats.solid("white", "#ece7dc", 0.6))
    top = Batch()
    top.cone((x, y, z + 28), 5.0, 5.0, 4, segs=16)
    top.cone((x, y, z + 32), 5.2, 0.5, 5, segs=16)
    top.link(sc, "lamp", mats.solid("red-roof", "#9e3b2c", 0.5, emit="#ffd28a", emit_strength=0.4))
    # A ruined stone breakwater running out to sea.
    bw = Batch()
    for i in range(26):
        cx, cy = compass_xy(-8 + i * 0.4, 260 + i * 9)
        bw.box((cx, cy, -1 + rng.uniform(-0.6, 0.6)), (rng.uniform(5, 9), rng.uniform(5, 8), rng.uniform(4, 7)), rng.uniform(0, 3))
    bw.link(sc, "breakwater", mats.solid("stone", "#8b8172", 0.95))
    return t, dict(card=((0, -40, 9), 26, 1.5, 38))


def ch02(sc, mats, rng, pal):
    """Qasr Amal: an old harbour town of white cubes and domes climbing the hills at dusk."""
    ocean(sc, mats, "#16404a")
    t = Terrain(22, 420, scale=0.0012, sectors=[(0, 95)], shore=0.18,
                bumps=[(-10, 900, 380, 120, None), (25, 1300, 420, 160, None)])
    t.build(sc, mats.terrain("hills", "#c9b38a", "#8f7a5b", slope_rock="#7a6a50"), 320, 9000)
    walls, roofs, domes = Batch(), Batch(), Batch()
    for c, d in scatter(1100, (-70, 70), (360, 1500), rng):
        z = t.z_at(c, d)
        if z < 0.5:
            continue
        x, y = compass_xy(c, d)
        sx, sy, sz = rng.uniform(8, 18), rng.uniform(8, 16), rng.uniform(6, 14)
        rot = math.radians(rng.choice([0, 90]) + rng.uniform(-8, 8) + c)
        walls.box((x, y, z + sz / 2 - 2), (sx, sy, sz), rot)
        if rng.random() < 0.12:
            roofs.box((x, y, z + sz - 1.5), (sx * 0.7, sy * 0.7, 1.4), rot)
    for _ in range(18):
        c, d = rng.uniform(-55, 55), rng.uniform(420, 1300)
        z = t.z_at(c, d)
        if z < 1:
            continue
        x, y = compass_xy(c, d)
        r = rng.uniform(8, 16)
        walls.box((x, y, z + 6), (r * 2.2, r * 2.2, 14))
        domes.dome((x, y, z + 13), r)
    for _ in range(5):
        c, d = rng.uniform(-45, 45), rng.uniform(450, 1100)
        z = t.z_at(c, d)
        x, y = compass_xy(c, d)
        walls.cone((x, y, z - 1), 3.2, 2.6, 46, segs=10)
        domes.cone((x, y, z + 45), 3.6, 0.2, 8, segs=10)
    walls.link(sc, "houses", mats.solid("plaster", "#efe6d6", 0.8))
    roofs.link(sc, "roofs", mats.solid("terracotta", "#b5603e", 0.8))
    domes.link(sc, "domes", mats.solid("dome", "#4f8e95", 0.5))
    harbour = Batch()
    for i in range(40):
        cx, cy = compass_xy(-40 + i * 2, 300)
        harbour.box((cx, cy, 1), (16, 9, 5), math.radians(-40 + i * 2))
    harbour.link(sc, "harbour", mats.solid("quay", "#a8977a", 0.9))
    boats = Batch()
    for _ in range(9):
        c, d = rng.uniform(-35, 35), rng.uniform(120, 260)
        x, y = compass_xy(c, d)
        rot = math.radians(rng.uniform(0, 180))
        boats.box((x, y, 1.2), (5, 16, 3), rot)
        boats.cone((x, y, 2), 0.25, 0.2, 18, segs=6)
    boats.link(sc, "boats", mats.solid("boat", "#5b3b2a", 0.7))
    return t, dict(card=((0, -60, 14), 0, 2.5, 34))


def ch03(sc, mats, rng, pal):
    """The Green Vault: karst towers and a stepped temple rising out of misty jungle."""
    bumps = []
    for _ in range(40):
        c, d = rng.uniform(-180, 180), rng.uniform(900, 4200)
        if abs(c + 6) < 10 and d < 1600:
            continue  # keep the view to the temple clear
        bumps.append((c, d, rng.uniform(90, 200), rng.uniform(220, 480), "dome"))
    bumps.append((-6, 950, 150, 30, True))
    t = Terrain(33, 90, scale=0.0025, base=0.0, bumps=bumps, shore=0.08)
    t.build(sc, mats.terrain("jungle", "#3d5a29", "#59654a", slope_rock="#6d6b5c"), 60, 9000)
    trees(sc, mats, t, rng, 14000, (-180, 180), (90, 1800), "#2c4722", size=(24, 40), kind="broad", min_z=-50)
    trees(sc, mats, t, rng, 4000, (-180, 180), (90, 1800), "#3d5e2a", size=(20, 34), kind="broad", min_z=-50)
    pyr = Batch()
    x, y = compass_xy(-6, 950)
    z = t.z_at(-6, 950) - 4
    for i in range(6):
        s = 70 - i * 11
        pyr.box((x, y, z + i * 9 + 4.5), (s, s, 9))
    pyr.box((x, y, z + 6 * 9 + 6), (14, 14, 12))
    pyr.box((x, y - 20, z + 25), (10, 50, 52), 0, math.radians(-38))  # stair
    pyr.link(sc, "temple", mats.solid("temple", "#9b9a7c", 0.95))
    cam_z = t.z_at(0, 420) + 150
    return t, dict(card=((0, 420, cam_z), -10.3, -7.0, 34))


def ch04(sc, mats, rng, pal):
    """Salt Road: moonlit dunes, flat-topped mesas and a ruined caravanserai."""
    bumps = [(rng.uniform(-180, 180), rng.uniform(1500, 5500), rng.uniform(250, 600), rng.uniform(120, 260), True) for _ in range(14)]
    t = Terrain(44, 60, scale=0.0008, base=0.0, dunes=True, bumps=bumps, shore=0.05)
    t.build(sc, mats.terrain("sand", "#c9a46a", "#a9825a", slope_rock="#8b6a4c"), 40, 9000)
    ruin = Batch()
    for i in range(5):
        c, d = 8 + i * 1.6, 420
        x, y = compass_xy(c, d)
        z = t.z_at(c, d) - 2
        if i != 3:
            ruin.arch((x, y, z), 6, 7, 4, 2.2, math.radians(-c + 90))
    x, y = compass_xy(16, 440)
    ruin.box((x, y, t.z_at(16, 440) + 6), (6, 6, 16))
    ruin.link(sc, "caravanserai", mats.solid("adobe", "#b08a62", 0.95))
    cam_z = t.z_at(4.6, 251) + 5
    return t, dict(card=((20, 250, cam_z), 20, 2.5, 30))


def ch05(sc, mats, rng, pal):
    """Bell of Saint Aurel: snowy peaks and a monastery on a crag."""
    bumps = [(0, 900, 110, 320, None), (-40, 2200, 600, 900, None), (35, 2600, 700, 1100, None), (160, 3000, 800, 1200, None), (-130, 2800, 700, 1000, None)]
    t = Terrain(55, 1500, scale=0.00055, ridged=True, base=-20.0, bumps=bumps, shore=0.35)
    t.build(sc, mats.terrain("alps", "#5d6a52", "#77736c", snow_hex="#eef2f6", snow_from=520, slope_rock="#6a6660"), 200, 12000)
    trees(sc, mats, t, rng, 1800, (-180, 180), (220, 1600), "#2c3b2c", size=(12, 22), kind="pine", min_z=-10, max_z=420)
    mon = Batch()
    x, y = compass_xy(0, 900)
    z = t.z_at(0, 900)
    mon.box((x, y, z + 6), (60, 34, 16))
    mon.box((x - 18, y - 4, z + 22), (12, 12, 40))
    mon.cone((x - 18, y - 4, z + 42), 8.5, 0.3, 14, segs=4, rot=math.radians(45))
    mon.box((x + 20, y, z + 14), (20, 22, 12))
    for i in range(10):
        a = math.radians(i * 36)
        mon.box((x + math.cos(a) * 42, y + math.sin(a) * 30, z + 3), (16, 4, 6), a + math.pi / 2)
    mon.link(sc, "monastery", mats.solid("monastery", "#d8d0c0", 0.85))
    roofs = Batch()
    roofs.box((x, y, z + 15), (62, 36, 2.5))
    roofs.box((x + 20, y, z + 21), (22, 24, 2.5))
    roofs.link(sc, "slate", mats.solid("slate", "#4a4f57", 0.7))
    return t, dict(card=((0, 230, 330), 0, 1.0, 50))


def ch06(sc, mats, rng, pal):
    """Night Train to Varanask: dark pine mountains, a stone viaduct and a lit train."""
    bumps = [(rng.uniform(-180, 180), rng.uniform(1500, 5000), rng.uniform(500, 900), rng.uniform(500, 900), None) for _ in range(10)]
    # (The old close "valley side" hills are gone: the line runs across open high country now,
    # so the view from the train is wide rather than a gorge.)
    t = Terrain(66, 900, scale=0.0007, ridged=True, base=-60.0, bumps=bumps, shore=0.25)
    t.build(sc, mats.terrain("night-mtn", "#2b3528", "#4a4d55", snow_hex="#c5cedb", snow_from=650, slope_rock="#3d4048"), 150, 12000)
    trees(sc, mats, t, rng, 3800, (-180, 180), (160, 2400), "#162019", size=(14, 26), kind="pine", min_z=-55, max_z=560)
    via = Batch()
    # The deck runs 70 m above the lowest point of the valley; where the hills are higher the
    # line simply enters them, as railways do.
    deck_z = min(t.z_at(-14 + i * 1.6, 520) for i in range(-9, 10)) + 70
    for i in range(-9, 10):
        c = -14 + i * 1.6
        x, y = compass_xy(c, 520)
        ground = t.z_at(c, 520)
        hgt = deck_z - ground
        if hgt > 4:
            via.arch((x, y, ground), 11, max(hgt - 7, 1), 9, 4.5, math.radians(-c + 90))
    for i in range(-10, 10):
        c = -14 + i * 1.6
        x, y = compass_xy(c + 0.8, 520)
        via.box((x, y, deck_z + 2), (16, 10, 3), math.radians(-(c + 0.8) + 90))
    via.link(sc, "viaduct", mats.solid("viaduct", "#9a948a", 0.9))
    lamps = Batch()
    for i in range(-10, 11, 2):
        x, y = compass_xy(-14 + i * 1.6, 524)
        lamps.box((x, y, deck_z + 5), (0.8, 0.8, 0.8))
    lamps.link(sc, "lamps", mats.solid("lamp", "#ffcf8a", 0.5, emit="#ffcf8a", emit_strength=30, fog_scale=0.4))
    cars, windows = Batch(), Batch()
    for k in range(7):
        c = -18 + k * 1.25
        x, y = compass_xy(c, 520)
        rot = math.radians(-c + 90)
        cars.box((x, y, deck_z + 7), (10.5, 3.6, 5), rot)
        for wdx in (-3.2, 0, 3.2):
            wx = x + wdx * math.cos(rot)
            wy = y + wdx * math.sin(rot)
            windows.box((wx - 1.9 * math.sin(rot), wy + 1.9 * math.cos(rot), deck_z + 7.8), (2.0, 0.2, 1.4), rot)
    cars.link(sc, "train", mats.solid("train", "#2a2f37", 0.6, metal=0.4))
    windows.link(sc, "windows", mats.solid("window", "#ffb85a", 0.5, emit="#ffb85a", emit_strength=14, fog_scale=0.5))
    cam_z = max(deck_z + 8, t.z_at(-14.9, 155) + 25)
    return t, dict(card=((-40, 150, cam_z), -13.6, 5.0, 28))


def ch07(sc, mats, rng, pal):
    """Ironwood Docks: cranes, hulls and warehouses under a low night sky, city lights beyond."""
    ocean(sc, mats, "#0d1a22")
    t = Terrain(77, 30, scale=0.002, base=0.6, sectors=[(0, 100)], shore=0.02,
                bumps=[(rng.uniform(-90, 90), rng.uniform(3500, 6000), 900, rng.uniform(200, 450), None) for _ in range(6)])
    t.build(sc, mats.terrain("quay", "#3b3f45", "#4d4f52"), 160, 9000)
    iron, hull, sheds, lights = Batch(), Batch(), Batch(), Batch()
    for i in range(11):
        c, d = -75 + i * 14 + rng.uniform(-4, 4), rng.uniform(260, 700)
        x, y = compass_xy(c, d)
        z = t.z_at(c, d)
        rot = math.radians(rng.uniform(0, 360))
        for dx in (-6, 6):
            for dy in (-6, 6):
                iron.box((x + dx, y + dy, z + 22), (1.6, 1.6, 44))
        iron.box((x, y, z + 44), (16, 16, 4))
        bx, by = x + math.sin(rot) * 18, y + math.cos(rot) * 18
        iron.box((bx, by, z + 50), (3, 70, 3), -rot)
        lights.box((bx + math.sin(rot) * 34, by + math.cos(rot) * 34, z + 52), (1.2, 1.2, 1.2))
    for _ in range(6):
        c, d = rng.uniform(-60, 60), rng.uniform(200, 520)
        x, y = compass_xy(c, d)
        rot = math.radians(rng.uniform(0, 180))
        hull.box((x, y, 4), (24, 120, 16), rot)
        hull.box((x + math.sin(rot) * 40, y + math.cos(rot) * 40, 17), (18, 16, 12), -rot)
        hull.cone((x - math.sin(rot) * 20, y - math.cos(rot) * 20, 12), 3, 3, 26, segs=10)
    for _ in range(70):
        c, d = rng.uniform(-90, 90), rng.uniform(600, 1600)
        x, y = compass_xy(c, d)
        z = t.z_at(c, d)
        sx, sy, sz = rng.uniform(30, 70), rng.uniform(20, 40), rng.uniform(12, 26)
        rot = math.radians(c + rng.choice([0, 90]))
        sheds.box((x, y, z + sz / 2), (sx, sy, sz), rot)
        for _ in range(rng.randint(1, 4)):
            lights.box((x + rng.uniform(-sx, sx) * 0.4, y + rng.uniform(-sy, sy) * 0.4, z + rng.uniform(3, sz - 2)), (2.5, 2.5, 1.6))
    for _ in range(8):
        c, d = rng.uniform(-50, 50), rng.uniform(800, 1400)
        x, y = compass_xy(c, d)
        sheds.cone((x, y, t.z_at(c, d)), 4.5, 3.5, rng.uniform(50, 80), segs=10)
    for _ in range(1400):  # the distant city
        c, d = rng.uniform(-95, 95), rng.uniform(2200, 4200)
        x, y = compass_xy(c, d)
        z = t.z_at(c, d)
        hgt = rng.uniform(15, 90)
        sheds.box((x, y, z + hgt / 2), (rng.uniform(15, 35), rng.uniform(15, 35), hgt))
        if rng.random() < 0.6:
            lights.box((x, y, z + rng.uniform(4, hgt)), (6, 6, 3))
    iron.link(sc, "cranes", mats.solid("iron", "#7a3d24", 0.6, metal=0.5))
    hull.link(sc, "hulls", mats.solid("hull", "#2c3036", 0.6, metal=0.3))
    sheds.link(sc, "sheds", mats.solid("shed", "#3a3f47", 0.85))
    lights.link(sc, "lights", mats.solid("sodium", "#ffb357", 0.5, emit="#ffb357", emit_strength=22, fog_scale=0.35))
    return t, dict(card=((0, -80, 26), 4, 4.0, 32))


def ruin_tower(stone, gold, rng, x, y, base_z, hgt, w):
    """A drowned tower: tiers that narrow as they rise, ledges, and a roof or a broken top."""
    rot = math.radians(rng.uniform(0, 90))
    tilt = math.radians(rng.uniform(-5, 5)) if rng.random() < 0.35 else 0.0
    tiers = rng.randint(2, 4)
    z, tw = base_z, w
    for i in range(tiers):
        th = hgt / tiers * rng.uniform(0.8, 1.15)
        stone.box((x, y, z + th / 2), (tw, tw, th), rot, tilt)
        stone.box((x, y, z + th), (tw * 1.12, tw * 1.12, max(1.0, w * 0.08)), rot, tilt)  # ledge
        z += th
        tw *= rng.uniform(0.72, 0.88)
    roll = rng.random()
    if roll < 0.35:
        stone.cone((x, y, z), tw * 0.68, 0.3, tw * 1.7, segs=4, rot=rot + math.radians(45))
    elif roll < 0.6:
        gold.dome((x, y, z - 0.5), tw * 0.55)
    else:  # broken: jagged stubs of the fallen top
        for _ in range(rng.randint(2, 4)):
            ox, oy = rng.uniform(-0.3, 0.3) * tw, rng.uniform(-0.3, 0.3) * tw
            stone.box((x + ox, y + oy, z + 1), (tw * 0.35, tw * 0.35, rng.uniform(2, tw * 0.9)), rot)


def ines(sc, mats, pos, facing_comp):
    """A simple silhouette of Ines: standing, pack on her back, ponytail, looking at the city."""
    b = Batch()
    x, y, z = pos
    rot = -math.radians(facing_comp)
    def at(dx, dy, dz):
        c, s = math.cos(rot), math.sin(rot)
        return (x + dx * c - dy * s, y + dx * s + dy * c, z + dz)
    b.cone(at(-0.11, 0, 0), 0.085, 0.11, 0.92, segs=8)
    b.cone(at(0.12, 0.05, 0), 0.085, 0.11, 0.92, segs=8, tilt=math.radians(-6))
    b.box(at(0, 0, 0.98), (0.36, 0.22, 0.24), rot)
    b.cone(at(0, 0, 1.05), 0.17, 0.21, 0.42, segs=10)
    b.box(at(0, -0.17, 1.22), (0.32, 0.18, 0.42), rot)
    b.cone(at(-0.24, 0, 0.82), 0.05, 0.06, 0.6, segs=6, tilt=math.radians(4))
    b.cone(at(0.25, 0.08, 0.95), 0.05, 0.06, 0.52, segs=6, tilt=math.radians(-28))
    b.sphere(at(0, 0.01, 1.66), 0.115, (1, 1, 1.15), segs=12)
    b.cone(at(0, -0.1, 1.42), 0.03, 0.045, 0.25, segs=6, tilt=math.radians(25))
    return b.link(sc, "ines", mats.solid("silhouette", "#14110f", 0.6, fog_scale=0.0))


def key_art(sc, mats, rng, pal):
    """The Drowned City of Meridia at sunset: towers, domes and arches half under the sea."""
    ocean(sc, mats, "#10262d")
    t = Terrain(99, 420, scale=0.0014, ridged=True, sectors=[(-70, 30), (62, 26), (180, 80)], shore=0.12,
                bumps=[(-74, 380, 150, 130, None), (55, 360, 130, 200, None)])
    t.build(sc, mats.terrain("cliffs", "#4a4038", "#5b5048", slope_rock="#3d3530"), 60, 9000, nr=140)
    # The rock Ines stands on, in the right third of the frame, 22 m from the camera.
    cam = Vector((0, -30, 6))
    rx, ry = compass_xy(-6, 24)
    rock = Batch()
    rock.sphere((cam.x + rx, cam.y + ry, -2.6), 5.0, (1.5, 1.1, 0.95), segs=40)
    rock.sphere((cam.x + rx + 5, cam.y + ry + 3, -2.5), 3.0, (1.2, 1.0, 0.9), segs=28)
    rock.link(sc, "rock", mats.solid("wet-rock", "#2a2522", 0.55), smooth=True)
    stone = Batch()
    gold = Batch()
    for i in range(26):
        c = rng.uniform(-40, 8)
        d = rng.uniform(380, 1100)
        x, y = compass_xy(c, d)
        hgt = rng.uniform(30, 95) * (1.4 if abs(c + 14) < 8 else 1)
        ruin_tower(stone, gold, rng, x, y, -8, hgt, rng.uniform(10, 22))
    for _ in range(40):  # low drowned rooftops and walls between the towers
        c, d = rng.uniform(-40, 10), rng.uniform(300, 1100)
        x, y = compass_xy(c, d)
        stone.box((x, y, rng.uniform(-3, 2)), (rng.uniform(10, 30), rng.uniform(8, 20), rng.uniform(4, 10)), math.radians(rng.uniform(0, 90)))
    x, y = compass_xy(-16, 620)
    stone.box((x, y, 62), (20, 20, 140))
    stone.box((x, y, 136), (14, 14, 12))
    gold.dome((x, y, 142), 8.5)
    stone.cone((x, y, 148), 0.8, 0.2, 18, segs=6)
    for i in range(9):
        c = -34 + i * 3.4
        x, y = compass_xy(c, 330 + i * 10)
        stone.arch((x, y, -6), 10, 14, 5, 3.5, math.radians(-c + 90))
    for _ in range(40):
        c, d = rng.uniform(-40, 10), rng.uniform(140, 600)
        x, y = compass_xy(c, d)
        stone.cone((x, y, -4), 1.6, 1.4, rng.uniform(4, 16), segs=10, tilt=math.radians(rng.uniform(-12, 12)))
    stone.link(sc, "ruins", mats.solid("ruin", "#6a5d55", 0.9))
    gold.link(sc, "domes", mats.solid("verdigris", "#3f6f69", 0.45, metal=0.3))
    ines(sc, mats, (cam.x + rx, cam.y + ry, 2.05), -14)
    # Golden haze for light shafts between the towers (kept thin so it renders quickly).
    if not sc.get("fast"):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 900, 60)) @ Matrix.Diagonal((2600, 2000, 140, 1)))
        me = bpy.data.meshes.new("haze")
        bm.to_mesh(me)
        bm.free()
        m = bpy.data.materials.new("haze")
        nt = node_tree(m)
        nt.nodes.clear()
        vs = nt.nodes.new("ShaderNodeVolumeScatter")
        vs.inputs["Density"].default_value = 0.0009
        vs.inputs["Color"].default_value = lin("#ffd2a0")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(vs.outputs[0], out.inputs["Volume"])
        me.materials.append(m)
        ob = bpy.data.objects.new("haze", me)
        sc.collection.objects.link(ob)
    return t, dict(card=((0, -30, 6), -22, 4.5, 30))


SCENES = {"key-art": key_art, "ch01": ch01, "ch02": ch02, "ch03": ch03, "ch04": ch04, "ch05": ch05, "ch06": ch06, "ch07": ch07}


# ---------------------------------------------------------------------------------- render + save

# ---------------------------------------------------------------------------------- playable terrain
#
# The panoramas are a sky at infinite distance. The game also needs real land around the
# playable area, so the maps look like they go on for ever instead of ending at canyon walls.
# For each chapter this builds a terrain mesh (exported as a .glb the game loads):
#
#   * inside the playable area it sits just under the level's floors, so it never shows through;
#   * right outside the low rock edges it carries on at the same height, then rolls gently;
#   * further out it blends into the very same hills, coast or mountains the panorama shows,
#     so the land meets the horizon of the background.
#
# Coordinates: the game is y-up (x right, z forward). The glTF exporter turns Blender's z-up
# into y-up as (X, Z, -Y), so vertices are written as Blender (gx, -gz, gy) to come out as game
# (gx, gy, gz). The game loads the mesh without the glTF root's handedness flip (see Terrain.ts).

# Vertex colours per chapter: (low ground, high ground, steep rock, snow or None, snow height, sea level or None).
TERRAIN_COLOURS = {
    "ch01": ("#b9a77e", "#7e776a", "#5a5650", None, 0, -0.25),
    "ch02": ("#c9b38a", "#9a8462", "#7a6a50", None, 0, -0.4),
    "ch03": ("#3f5c2b", "#5b6a45", "#6d6b5c", None, 0, None),
    "ch04": ("#d2b07a", "#b08b5e", "#8b6a4c", None, 0, None),
    "ch05": ("#dfe5ea", "#a5aab0", "#6a6660", "#eef2f6", 60, None),
    "ch07": ("#45494f", "#55585c", "#3b3f45", None, 0, -0.8),
}
SEA_HEX = {"ch01": "#1d5866", "ch02": "#1f5560", "ch07": "#10222c"}

CELL = 4.0  # metres per cell of the level's floor map
LEVELS = {}  # filled from levels.json (npm run export-levels)


def _level_fields(level, pad):
    """Floor height per 4 m cell (lowest walkable top), whether the cell is inside the edges,
    and how far each cell is from the playable floor."""
    boxes = np.array(level["boxes"], dtype=np.float64)
    solid = boxes[(boxes[:, 6].astype(int) & 7) == 0]  # not boundary, cover or hidden
    edges = boxes[(boxes[:, 6].astype(int) & 1) == 1]
    thick = solid[(solid[:, 4] - solid[:, 1]) >= 0.3]
    x0, z0 = thick[:, 0].min() - pad, thick[:, 2].min() - pad
    x1, z1 = thick[:, 3].max() + pad, thick[:, 5].max() + pad
    nx, nz = int(math.ceil((x1 - x0) / CELL)), int(math.ceil((z1 - z0) / CELL))
    cx = x0 + (np.arange(nx) + 0.5) * CELL
    cz = z0 + (np.arange(nz) + 0.5) * CELL
    CX, CZ = np.meshgrid(cx, cz, indexing="ij")
    floor = np.full((nx, nz), np.inf)
    for b in thick:
        m = (CX >= b[0]) & (CX <= b[3]) & (CZ >= b[2]) & (CZ <= b[5])
        floor[m] = np.minimum(floor[m], b[4])
    for rp in level["ramps"]:
        m = (CX >= rp[0]) & (CX <= rp[3]) & (CZ >= rp[2]) & (CZ <= rp[5])
        floor[m] = np.minimum(floor[m], rp[1])
    has = np.isfinite(floor)
    # Inside the edges: an invisible edge on both sides in x (corridors, pockets).
    left = np.zeros_like(has)
    right = np.zeros_like(has)
    inside_edge = np.zeros_like(has)
    for e in edges:
        rows = (CZ >= e[2]) & (CZ <= e[5])
        left |= rows & (CX >= e[3])
        right |= rows & (CX <= e[0])
        inside_edge |= rows & (CX >= e[0]) & (CX <= e[3])
    inside = left & right & ~inside_edge
    deep = inside & ~has  # a chasm inside the map: keep it a long way down
    f = np.where(has, floor, np.nan)
    f[deep] = level["killY"] + 4
    # Fill the outside by spreading neighbouring floor heights outwards, and count the steps.
    dist = np.where(np.isfinite(f), 0.0, np.inf)
    for it in range(1, int(pad / CELL) + 2):
        miss = ~np.isfinite(f)
        if not miss.any():
            break
        acc = np.zeros_like(f)
        cnt = np.zeros_like(f)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if dx == 0 and dz == 0:
                    continue
                sh = np.roll(np.roll(f, dx, 0), dz, 1)
                ok = np.isfinite(sh) & ~deep  # chasm depth never spreads outside
                acc += np.where(ok, sh, 0)
                cnt += ok
        new = miss & (cnt > 0)
        f[new] = acc[new] / cnt[new]
        dist[new] = it * CELL
    rest = ~np.isfinite(f)
    f[rest] = np.nanmedian(np.where(has, floor, np.nan))
    dist[rest] = pad
    return dict(x0=x0, z0=z0, nx=nx, nz=nz, floor=f, dist=dist, has=has, deep=deep, rect=(x0 + pad, z0 + pad, x1 - pad, z1 - pad))


def _sample(field, X, Z):
    ix = np.clip(((X - field["x0"]) / CELL).astype(int), 0, field["nx"] - 1)
    iz = np.clip(((Z - field["z0"]) / CELL).astype(int), 0, field["nz"] - 1)
    return ix, iz


def _axis(lo, hi, step, reach, grow=1.13):
    """Grid lines: even spacing across the level, then wider and wider steps out to `reach`."""
    mid = np.arange(lo - 24, hi + 24 + 1e-6, step)
    out = []
    d, s = 0.0, step
    while d < reach:
        s *= grow
        d += s
        out.append(d)
    out = np.array(out)
    return np.concatenate([mid[0] - out[::-1], mid, mid[-1] + out])


def near_terrain(scene_id, terr, level, coarse=False):
    """Vertices (game coords), quads and sRGB colours for one chapter's playable terrain."""
    pad = 240.0
    field = _level_fields(level, pad)
    rx0, rz0, rx1, rz1 = field["rect"]
    step = 6.0 if not coarse else 16.0
    if scene_id == "ch04":
        step *= 1.5  # the salt road is very long
    reach = 1300.0
    xs = _axis(rx0, rx1, step, reach, 1.13 if not coarse else 1.3)
    zs = _axis(rz0, rz1, step * (1.6 if scene_id == "ch04" else 1.0), reach, 1.13 if not coarse else 1.3)
    GX, GZ = np.meshgrid(xs, zs, indexing="ij")
    ix, iz = _sample(field, GX, GZ)
    F = field["floor"][ix, iz]
    D = field["dist"][ix, iz]
    # Beyond the floor map, keep counting the distance.
    out_x = np.maximum(0, np.maximum(rx0 - pad - GX, GX - (rx1 + pad)))
    out_z = np.maximum(0, np.maximum(rz0 - pad - GZ, GZ - (rz1 + pad)))
    D = D + np.hypot(out_x, out_z)
    inside = field["has"][ix, iz] & (out_x == 0) & (out_z == 0)
    deep = field["deep"][ix, iz] & (out_x == 0) & (out_z == 0)
    seed = sum(map(ord, scene_id))
    # Close to the map: the same height as the floor beside the edge, with a gentle roll.
    roll = fbm(GX * 0.012 + 5.3, GZ * 0.012 - 2.1, 4, seed + 9) - 0.45
    near = F - 0.6 + 6.0 * smoothstep(10, 160, D) * roll + 2.0 * smoothstep(20, 200, D)
    # Far away: exactly the land of the panorama (Blender X = game x, Blender Y = game z).
    far = terr.height(GX, GZ)
    w = smoothstep(80, 650, D)
    H = near * (1 - w) + far * w
    H = np.where(inside, F - 0.6, H)
    H = np.where(deep, level["killY"] + 4, H)
    # Colours: low ground to high ground, rock on steep slopes, snow up high.
    low, high, rock, snow, snow_from, sea = TERRAIN_COLOURS[scene_id]
    lo_c, hi_c, rk_c = srgb(low), srgb(high), srgb(rock)
    ref = np.nanmedian(F)
    t = smoothstep(ref + 4, ref + 160, H)[..., None]
    col = lo_c * (1 - t) + hi_c * t
    gx_, gz_ = np.gradient(H, xs, zs)
    slope = smoothstep(0.35, 0.9, np.hypot(gx_, gz_))[..., None]
    col = col * (1 - slope) + rk_c * slope
    if snow:
        sn = smoothstep(snow_from, snow_from + 60, H)[..., None] * (1 - slope * 0.7)
        col = col * (1 - sn) + srgb(snow) * sn
    if sea is not None:
        wet = smoothstep(sea + 0.5, sea - 1.5, H)[..., None]
        col = col * (1 - wet * 0.45)
    col = col * (0.92 + 0.16 * fbm(GX * 0.05, GZ * 0.05, 3, seed + 21)[..., None])
    col = np.clip(col, 0, 1)
    nx, nz = GX.shape
    verts = np.stack([GX, H, GZ], -1).reshape(-1, 3)
    i = np.arange(nx - 1)[:, None]
    j = np.arange(nz - 1)[None, :]
    a = i * nz + j
    quads = np.stack([a, a + 1, a + nz + 1, a + nz], -1).reshape(-1, 4)
    return verts, quads, col.reshape(-1, 3), sea, (xs[0], xs[-1], zs[0], zs[-1])


def export_terrain(scene_id, terr, level, out_dir, coarse=False):
    verts, quads, cols, sea, ext = near_terrain(scene_id, terr, level, coarse)
    scn = bpy.data.scenes.new(f"terrain-{scene_id}")
    me = bpy.data.meshes.new(f"terrain-{scene_id}")
    bl = np.stack([verts[:, 0], -verts[:, 2], verts[:, 1]], -1)  # game (x, y, z) -> Blender (x, -z, y)
    parts = [(bl, quads, cols)]
    if sea is not None:
        x0, x1, z0, z1 = ext
        sq = np.array([[x0, -z0, sea], [x1, -z0, sea], [x1, -z1, sea], [x0, -z1, sea]], dtype=np.float64)
        parts.append((sq, np.array([[0, 1, 2, 3]]), np.tile(srgb(SEA_HEX[scene_id]), (4, 1))))
    V, Q, C = [], [], []
    base = 0
    for v, q, c in parts:
        V.append(v)
        Q.append(q + base)
        C.append(c)
        base += len(v)
    V, Q, C = np.concatenate(V), np.concatenate(Q), np.concatenate(C)
    me.vertices.add(len(V))
    me.vertices.foreach_set("co", V.astype(np.float32).ravel())
    me.loops.add(Q.size)
    me.loops.foreach_set("vertex_index", Q.astype(np.int32).ravel())
    me.polygons.add(len(Q))
    me.polygons.foreach_set("loop_start", (np.arange(len(Q)) * 4).astype(np.int32))
    me.update(calc_edges=True)
    me.validate()
    # Every face must point up (the sea quad and the grid are wound differently).
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    try:
        me.shade_smooth()
    except AttributeError:
        pass
    # Linear colours in a float attribute: the exporter writes them as glTF COLOR_0 (linear).
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    lin_c = np.concatenate([to_linear(C), np.ones((len(C), 1), dtype=np.float32)], -1)
    attr.data.foreach_set("color", lin_c.astype(np.float32).ravel())
    me.color_attributes.active_color = attr
    mat = bpy.data.materials.new(f"terrain-{scene_id}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "Col"
    nt.links.new(ca.outputs[0], bsdf.inputs[0])
    me.materials.append(mat)
    ob = bpy.data.objects.new(f"terrain-{scene_id}", me)
    scn.collection.objects.link(ob)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{scene_id}{'-lo' if coarse else ''}.glb")
    opts = dict(filepath=path, export_format="GLB", export_yup=True, export_normals=True,
                export_texcoords=False, export_materials="EXPORT", export_apply=True, use_active_scene=True)
    with bpy.context.temp_override(scene=scn, view_layer=scn.view_layers[0]):
        last = None
        for extra in (dict(export_vertex_color="ACTIVE"), dict(export_colors=True), {}):
            try:
                bpy.ops.export_scene.gltf(**opts, **extra)
                last = None
                break
            except TypeError as err:
                last = err
        if last:
            raise last
    print(f"  terrain {os.path.relpath(path, GAME)}: {len(V)} vertices, {os.path.getsize(path) // 1024} KB", flush=True)
    bpy.data.scenes.remove(scn)
    return path


def render_to(sc, cam, w, h, samples, path_png):
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.cycles.samples = samples
    sc.render.filepath = path_png
    bpy.ops.render.render(write_still=True)


def save_webp(png, out, size=None, quality=82):
    from PIL import Image
    im = Image.open(png).convert("RGB")
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"  wrote {os.path.relpath(out, GAME)} ({os.path.getsize(out) // 1024} KB, {im.size[0]}x{im.size[1]})")


def run(scene_id, args, palettes, tmp):
    pal = palettes[scene_id]
    fast = args.fast
    sc = reset(fast)
    rng = random.Random(sum(map(ord, scene_id)) * 7919)
    night = pal.get("night", False)
    sunset = pal.get("sunset", False)
    sun = Vector((-0.17, 0.98, 0.1)).normalized() if sunset else (SUN_NIGHT if night else SUN_DAY)
    sky_w = 1024 if fast else (8192 if scene_id == "key-art" else 4096)
    world(sc, pal, sun, sky_w, seed=sum(map(ord, scene_id)))
    sun_lamp(sc, sun, night, sunset, pal.get("moon", 1.0))
    mats = Mats(pal["fog"], pal["haze"])
    import time
    t0 = time.time()
    terr, views = SCENES[scene_id](sc, mats, rng, pal)
    print(f"  built the scene in {time.time() - t0:.1f} s", flush=True)
    level = LEVELS.get(scene_id)
    if (args.terrain or args.terrain_only) and level and not level["scroll"] and scene_id in TERRAIN_COLOURS:
        export_terrain(scene_id, terr, level, args.terrain_out)
        export_terrain(scene_id, terr, level, args.terrain_out, coarse=True)
    if args.terrain_only:
        return
    pos, comp, pitch, lens = views["card"]
    view = camera_persp(sc, pos, comp, pitch, lens)
    out = args.out
    if scene_id == "key-art":
        set_view(sc, True)
        w, h = (1280, 720) if fast else (2560, 1440)
        png = os.path.join(tmp, "key-art.png")
        render_to(sc, view, w, h, 16 if fast else 96, png)
        save_webp(png, os.path.join(out, "key-art.webp"), quality=80)
        save_webp(png, os.path.join(out, "key-art-sm.webp"), (1280, 720), quality=78)
        return
    set_view(sc, False)
    pano = camera_pano(sc, 8.0 if scene_id not in ("ch03", "ch05", "ch06") else 40.0)
    if scene_id == "ch03":
        pano.location.z = max(40.0, terr.z_at(0, 1) + 30)
    if scene_id == "ch06":
        pano.location.z = 320.0  # the railway runs high in the mountains: only the summits rise above the horizon
    w = 1024 if fast else 2048
    png = os.path.join(tmp, f"{scene_id}-pano.png")
    render_to(sc, pano, w, w // 2, 8 if fast else 48, png)
    save_webp(png, os.path.join(out, f"{scene_id}-pano.webp"), quality=80)
    save_webp(png, os.path.join(out, f"{scene_id}-pano-sm.webp"), (1024, 512), quality=76)
    set_view(sc, True)
    if night:
        sc.view_settings.exposure = 1.4  # night menu art: brighter, the panoramas keep the game's exact colours
    mats.haze_scale(0.45)
    png = os.path.join(tmp, f"{scene_id}-card.png")
    render_to(sc, view, 480 if fast else 960, 270 if fast else 540, 16 if fast else 64, png)
    save_webp(png, os.path.join(out, f"{scene_id}-card.webp"), quality=80)


def main():
    import sys
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma-separated scene ids: " + ", ".join(SCENES))
    ap.add_argument("--out", default=os.path.join(GAME, "public", "backgrounds"))
    ap.add_argument("--tmp", default=os.path.join(HERE, ".render-tmp"))
    ap.add_argument("--fast", action="store_true", help="small, noisy preview renders")
    ap.add_argument("--terrain", action="store_true", help="also export each chapter's playable terrain (.glb)")
    ap.add_argument("--terrain-only", action="store_true", help="only export the terrain, render nothing")
    ap.add_argument("--terrain-out", default=os.path.join(GAME, "assets-src", "terrain"))
    args = ap.parse_args(argv)
    levels_path = os.path.join(HERE, "levels.json")
    if os.path.exists(levels_path):
        with open(levels_path) as f:
            LEVELS.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    with open(os.path.join(HERE, "palettes.json")) as f:
        palettes = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.tmp, exist_ok=True)
    ids = [s for s in args.only.split(",") if s] or list(SCENES)
    import time
    for sid in ids:
        t0 = time.time()
        print(f"[{sid}] building and rendering", flush=True)
        run(sid, args, palettes, args.tmp)
        print(f"[{sid}] done in {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
