"""Map configuration and the world->minimap coordinate transform.

Single source of truth for coordinate mapping. The dataset README gives a
scale and origin per map; everything else in the pipeline derives from here.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class MapConfig:
    map_id: str
    label: str
    scale: float
    origin_x: float
    origin_z: float
    source_image: str


MAPS = {
    "AmbroseValley": MapConfig(
        "AmbroseValley", "Ambrose Valley", 900.0, -370.0, -473.0,
        "AmbroseValley_Minimap.png"),
    "GrandRift": MapConfig(
        "GrandRift", "Grand Rift", 581.0, -290.0, -290.0,
        "GrandRift_Minimap.png"),
    "Lockdown": MapConfig(
        "Lockdown", "Lockdown", 1000.0, -500.0, -500.0,
        "Lockdown_Minimap.jpg"),
}


def world_to_uv(x, z, cfg: MapConfig):
    """World (x, z) -> normalised minimap UV.

    u runs left->right, v runs bottom->top, both nominally in [0, 1].

    The `y` column in the source data is elevation, NOT a map axis. Using it
    here is the single most likely way to get this whole tool wrong, so it is
    deliberately not a parameter of this function.

    Values are NOT clamped. A small number of real events fall outside [0, 1]
    or outside the drawn landmass (see ARCHITECTURE.md); clamping them would
    hide exactly the anomalies a level designer wants to see.
    """
    u = (x - cfg.origin_x) / cfg.scale
    v = (z - cfg.origin_z) / cfg.scale
    return u, v


def uv_to_pixel(u, v, img_w, img_h):
    """Normalised UV -> image pixel coordinates.

    v is flipped because image origin is top-left while world z runs
    bottom-up. Resolution-independent: works for any minimap size.
    """
    return u * img_w, (1.0 - v) * img_h
