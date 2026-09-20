"""Lila Black telemetry -> static web artifacts.

Reads the 1,243 raw parquet files once, normalises them, and writes compact
columnar JSON plus web-sized minimaps into web/public/data/.

Run once; the output is committed. The browser never sees parquet, and the
deployed tool needs no server, no database and no API.

    python3 pipeline/build.py --data ~/Downloads/player_data

See ARCHITECTURE.md for why the data is shaped this way.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from maps import MAPS, world_to_uv  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
MATCH_SUFFIX = ".nakama-0"
QUANT = 10_000          # UV -> int scale factor; ~0.09 m of world space per unit
MINIMAP_MAX_PX = 2048   # source art is up to 9000x9000; unusable on the web
MASK_PX = 1600          # resolution at which the landmass mask is computed
COVERAGE_GRID = 96      # cells per axis for the coverage / cold-spot grid


# --------------------------------------------------------------------------
# load
# --------------------------------------------------------------------------

def load_raw(data_dir: str) -> pd.DataFrame:
    """Read every parquet file into one frame, tagging source day and file."""
    frames, unreadable = [], []
    for day in sorted(os.listdir(data_dir)):
        day_dir = os.path.join(data_dir, day)
        if not os.path.isdir(day_dir) or not day.startswith("February_"):
            continue
        for name in sorted(os.listdir(day_dir)):
            path = os.path.join(day_dir, name)
            try:
                frame = pq.read_table(path).to_pandas()
            except Exception as exc:                       # noqa: BLE001
                unreadable.append((name, repr(exc)[:120]))
                continue
            frame["src_day"] = day
            frames.append(frame)

    if not frames:
        raise SystemExit(f"no parquet files found under {data_dir}")
    if unreadable:
        print(f"  WARNING: {len(unreadable)} unreadable files, skipped")

    return pd.concat(frames, ignore_index=True)


# --------------------------------------------------------------------------
# normalise
# --------------------------------------------------------------------------

def normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Apply every data-format fix in one place.

    Four corrections, each documented in ARCHITECTURE.md:
      1. `event` is parquet binary, not string.
      2. `ts` is declared as milliseconds but holds Unix SECONDS.
      3. `match_id` carries a `.nakama-0` server-instance suffix.
      4. Human vs bot is decided by user_id shape, not by event name.
    """
    df = df.copy()

    df["event"] = df["event"].map(
        lambda v: v.decode("utf-8") if isinstance(v, (bytes, bytearray)) else v)

    # datetime64[ms].astype(int64) returns the raw stored integer. That integer
    # is a Unix timestamp in seconds, which is why naive readers see 1970-01-21.
    df["ts"] = df["ts"].astype("int64")

    df["match_id"] = df["match_id"].str.removesuffix(MATCH_SUFFIX)

    # Event names alone are unreliable: 636 `Position` and 115 `Loot` rows
    # carry numeric (bot) ids, contradicting the dataset README.
    df["is_human"] = df["user_id"].str.match(UUID_RE).fillna(False)

    unknown = sorted(set(df["map_id"].unique()) - set(MAPS))
    if unknown:
        raise SystemExit(f"unknown map_id values in data: {unknown}")

    return df


def add_uv(df: pd.DataFrame) -> pd.DataFrame:
    """Project world coords to UV per map. Uses x and z; y is elevation."""
    df = df.copy()
    df["u"] = np.nan
    df["v"] = np.nan
    for map_id, cfg in MAPS.items():
        sel = df["map_id"] == map_id
        u, v = world_to_uv(df.loc[sel, "x"], df.loc[sel, "z"], cfg)
        df.loc[sel, "u"] = u
        df.loc[sel, "v"] = v
    return df


# --------------------------------------------------------------------------
# landmass mask
# --------------------------------------------------------------------------

def landmass_mask(image_path: str) -> np.ndarray:
    """Boolean mask of drawn map area, True where a pixel is inside the map.

    The minimaps have no alpha channel and the off-map void is opaque black,
    so darkness alone does not identify it -- black POI outlines and shadows
    inside the map are just as dark. Instead, flood from the image border:
    black regions connected to the edge are outside, interior black is not.
    """
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((MASK_PX, MASK_PX))
    dark = np.asarray(img).mean(axis=2) < 18

    labels, _ = ndimage.label(dark)
    edge = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    edge.discard(0)
    return ~np.isin(labels, list(edge))


def coverage_grid(mask: np.ndarray, grid: int = COVERAGE_GRID) -> str:
    """Downsample the landmass mask to a coarse grid the browser can reason about.

    Returned as a flat row-major string of '1' (inside the playable map) and
    '0', indexed [row * grid + col] with row 0 at the TOP of the image -- the
    same orientation as the minimap itself. A cell counts as inside when most
    of it is inside, which keeps ragged coastlines from producing a fringe of
    spurious "unused" cells.

    At 96 cells per axis this is ~9 KB per map before compression, and it is
    what lets the cold-spot view distinguish "nobody goes here" from "this
    isn't part of the map".
    """
    h, w = mask.shape
    out = []
    for row in range(grid):
        y0, y1 = int(row * h / grid), max(int((row + 1) * h / grid), int(row * h / grid) + 1)
        for col in range(grid):
            x0, x1 = int(col * w / grid), max(int((col + 1) * w / grid), int(col * w / grid) + 1)
            out.append('1' if mask[y0:y1, x0:x1].mean() >= 0.5 else '0')
    return ''.join(out)


def flag_out_of_bounds(df: pd.DataFrame, minimap_dir: str) -> pd.DataFrame:
    """Mark events that fall outside the drawn landmass.

    These are kept, not dropped -- see ARCHITECTURE.md. Roughly 0.05% of
    events, almost all in one cluster off Grand Rift's southern shoreline.
    """
    df = df.copy()
    df["oob"] = False
    grids = {}
    for map_id, cfg in MAPS.items():
        sel = df["map_id"] == map_id
        if not sel.any():
            continue
        mask = landmass_mask(os.path.join(minimap_dir, cfg.source_image))
        grids[map_id] = coverage_grid(mask)
        h, w = mask.shape
        px = (df.loc[sel, "u"] * w).astype(int).clip(0, w - 1)
        py = ((1 - df.loc[sel, "v"]) * h).astype(int).clip(0, h - 1)
        df.loc[sel, "oob"] = ~mask[py.values, px.values]
    return df, grids


# --------------------------------------------------------------------------
# minimaps
# --------------------------------------------------------------------------

def export_minimaps(minimap_dir: str, out_dir: str) -> dict:
    """Downscale source art to web-sized WebP.

    Source images run 4320x4320 to 9000x9000 (21 MB). Neither a browser nor a
    git repo wants those. UV is resolution-independent so the transform is
    unaffected by the resize.
    """
    os.makedirs(out_dir, exist_ok=True)
    out = {}
    for map_id, cfg in MAPS.items():
        src = os.path.join(minimap_dir, cfg.source_image)
        img = Image.open(src).convert("RGB")
        source_size = img.size
        img.thumbnail((MINIMAP_MAX_PX, MINIMAP_MAX_PX), Image.LANCZOS)
        rel = f"maps/{map_id}.webp"
        img.save(os.path.join(out_dir, f"{map_id}.webp"), "WEBP", quality=88, method=6)
        out[map_id] = {
            "image": rel,
            "width": img.size[0],
            "height": img.size[1],
            "sourceWidth": source_size[0],
            "sourceHeight": source_size[1],
            "sourceBytes": os.path.getsize(src),
            "bytes": os.path.getsize(os.path.join(out_dir, f"{map_id}.webp")),
        }
        print(f"  {map_id:16s} {source_size[0]}x{source_size[1]} "
              f"({os.path.getsize(src)/1e6:5.1f} MB) -> "
              f"{img.size[0]}x{img.size[1]} "
              f"({out[map_id]['bytes']/1e3:6.1f} KB)")
    return out


# --------------------------------------------------------------------------
# emit
# --------------------------------------------------------------------------

def build_match_index(df: pd.DataFrame) -> list[dict]:
    """One summary row per match, loaded up front by the app.

    Small enough to ship whole (~800 entries), which is what lets every filter
    control populate without touching the bulky per-map event payloads.
    """
    out = []
    for match_id, grp in df.groupby("match_id", sort=False):
        start = int(grp["ts"].min())
        humans = grp.loc[grp["is_human"], "user_id"].unique()
        bots = grp.loc[~grp["is_human"], "user_id"].unique()
        out.append({
            "id": match_id,
            "map": grp["map_id"].iloc[0],
            "day": pd.to_datetime(start, unit="s", utc=True).strftime("%Y-%m-%d"),
            "start": start,
            "duration": int(grp["ts"].max()) - start,
            "humans": sorted(humans.tolist()),
            "bots": sorted(bots.tolist()),
            "counts": grp["event"].value_counts().to_dict(),
            "oob": int(grp["oob"].sum()),
        })
    out.sort(key=lambda m: m["start"])
    return out


def build_map_payload(df: pd.DataFrame, map_id: str) -> dict:
    """Columnar event payload for one map.

    Structure-of-arrays with string tables rather than an array of objects:
    the same data compresses several times smaller and parses faster, because
    repeated match ids, user ids and event names each appear once.

    Coordinates are stored as integers in quantised UV space. They are
    deliberately not clamped to [0, QUANT] -- out-of-bounds events are real.
    """
    sel = df[df["map_id"] == map_id]

    users = sorted(sel["user_id"].unique())
    matches = sorted(sel["match_id"].unique())
    events = sorted(sel["event"].unique())
    user_ix = {v: i for i, v in enumerate(users)}
    match_ix = {v: i for i, v in enumerate(matches)}
    event_ix = {v: i for i, v in enumerate(events)}

    # t is stored relative to each match's own start, so playback needs no
    # epoch arithmetic and the numbers stay small.
    match_start = sel.groupby("match_id")["ts"].transform("min")

    return {
        "map": map_id,
        "quant": QUANT,
        "users": users,
        "userIsHuman": [bool(UUID_RE.match(u)) for u in users],
        "matches": matches,
        "events": events,
        "n": int(len(sel)),
        "cols": {
            "m": sel["match_id"].map(match_ix).to_numpy().tolist(),
            "u": sel["user_id"].map(user_ix).to_numpy().tolist(),
            "e": sel["event"].map(event_ix).to_numpy().tolist(),
            "x": np.rint(sel["u"] * QUANT).astype(int).tolist(),
            "y": np.rint(sel["v"] * QUANT).astype(int).tolist(),
            "t": (sel["ts"] - match_start).astype(int).tolist(),
            "o": sel["oob"].astype(int).tolist(),
        },
    }


def write_json(path: str, payload) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    return os.path.getsize(path)


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", required=True,
                    help="path to the unzipped player_data directory")
    ap.add_argument("--out", default=None,
                    help="output dir (default: web/public/data next to this script)")
    args = ap.parse_args()

    data_dir = os.path.expanduser(args.data)
    minimap_dir = os.path.join(data_dir, "minimaps")
    out_dir = os.path.expanduser(args.out) if args.out else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "data")
    out_dir = os.path.normpath(out_dir)

    print(f"reading  {data_dir}")
    df = load_raw(data_dir)
    print(f"  {len(df):,} rows from {df['src_day'].nunique()} days")

    print("normalising")
    df = add_uv(normalise(df))

    print("flagging out-of-bounds events")
    df, coverage = flag_out_of_bounds(df, minimap_dir)
    print(f"  {int(df['oob'].sum())} of {len(df):,} events outside drawn landmass "
          f"({df['oob'].mean()*100:.3f}%)")

    print("exporting minimaps")
    minimaps = export_minimaps(minimap_dir, os.path.join(out_dir, "maps"))

    print("writing payloads")
    matches = build_match_index(df)
    total = write_json(os.path.join(out_dir, "matches.json"), matches)
    print(f"  matches.json     {total/1e3:7.1f} KB  ({len(matches)} matches)")

    map_meta = {}
    for map_id, cfg in MAPS.items():
        sel = df[df["map_id"] == map_id]
        size = write_json(os.path.join(out_dir, f"events-{map_id}.json"),
                          build_map_payload(df, map_id))
        total += size
        map_meta[map_id] = {
            "id": map_id,
            "label": cfg.label,
            "scale": cfg.scale,
            "originX": cfg.origin_x,
            "originZ": cfg.origin_z,
            "events": f"events-{map_id}.json",
            "matches": int(sel["match_id"].nunique()),
            "coverageGrid": COVERAGE_GRID,
            "landmask": coverage[map_id],
            "playableCells": coverage[map_id].count("1"),
            **minimaps[map_id],
        }
        print(f"  events-{map_id+'.json':22s} {size/1e3:7.1f} KB  ({len(sel):,} events)")

    manifest = {
        "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "maps": map_meta,
        "totals": {
            "events": int(len(df)),
            "matches": int(df["match_id"].nunique()),
            "humans": int(df.loc[df["is_human"], "user_id"].nunique()),
            "bots": int(df.loc[~df["is_human"], "user_id"].nunique()),
            "outOfBounds": int(df["oob"].sum()),
        },
        "days": sorted(pd.to_datetime(df["ts"], unit="s", utc=True)
                       .dt.strftime("%Y-%m-%d").unique().tolist()),
        "eventTypes": sorted(df["event"].unique().tolist()),
    }
    write_json(os.path.join(out_dir, "manifest.json"), manifest)

    img_bytes = sum(m["bytes"] for m in minimaps.values())
    print(f"\ndone -> {out_dir}")
    print(f"  json {total/1e6:.2f} MB + images {img_bytes/1e6:.2f} MB "
          f"= {(total+img_bytes)/1e6:.2f} MB total")


if __name__ == "__main__":
    main()
