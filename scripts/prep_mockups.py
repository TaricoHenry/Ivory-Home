"""Make web copies of the home-page device mockups.

    python3 scripts/prep_mockups.py

- mockup-laptop.png: if it has no transparency, the light-grey studio
  background is removed here and its shadow kept as soft black (stand-in until
  a transparent export exists).
- Everything is trimmed to its visible pixels and saved as WebP next to the
  originals: mockup-laptop.webp, mockup-iphone-1.webp, mockup-iphone-2.webp.
- A rendered spin in assets/images/phone-spin/ (.png or .jpg, sorted by name)
  becomes phone-spin/001.webp, 002.webp, ... Frames without transparency are
  cut out of their grey studio backdrop (key_phone_frame); all frames share
  one crop box so the phone stays in the same spot from frame to frame.
Needs Pillow, numpy and cwebp (brew install webp).
"""
import glob
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")


def cut_studio_background(img):
    """Split a product shot on a plain grey backdrop into object + black shadow."""
    a = np.asarray(img.convert("RGB")).astype(float)
    h, w, _ = a.shape
    lum = a.mean(2)
    # The backdrop has a gentle vignette: fit a smooth surface to the border pixels.
    b = max(4, h // 40)
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    edge = np.zeros((h, w), bool)
    edge[:b] = edge[-b:] = True
    edge[:, :b] = edge[:, -b:] = True

    def terms(y, x):
        x, y = x / w, y / h
        return np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)

    with np.errstate(all="ignore"):  # Accelerate BLAS on macOS warns spuriously
        coef, *_ = np.linalg.lstsq(terms(ys[edge], xs[edge]), lum[edge], rcond=None)
        bg = terms(ys, xs) @ coef
    diff = bg - lum  # > 0 where darker than the backdrop
    sat = a.max(2) - a.min(2)
    # Very dark (bezel, keys), brighter than the backdrop, or coloured = the laptop itself.
    obj = (diff > 110) | (diff < -8) | (sat > 18)
    mask = np.zeros_like(obj)
    for y in np.where(obj.sum(1) > w * 0.02)[0]:
        cols = np.where(obj[y])[0]
        mask[y, cols.min():cols.max() + 1] = True
    alpha_obj = np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))
    ).astype(float) / 255
    # Remaining darkening is shadow: keep it as black at partial opacity.
    shadow = np.clip(np.clip(diff / bg, 0, 1) * 1.6, 0, 0.55)
    alpha = np.maximum(alpha_obj, shadow * (1 - alpha_obj))
    rgb = a * alpha_obj[..., None] / np.maximum(alpha, 1e-6)[..., None]
    return Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")


def key_phone_frame(img, thresh=14):
    """Cut a phone out of one video frame shot on a light-grey studio backdrop.

    The camera is fixed and the phone stays near the middle, so: model the
    backdrop's gentle gradient from the frame edges, keep the blob of
    different-looking pixels at the centre, and fill each row between its outer
    edges (a phone's outline is convex at any angle). The floor shadow touches
    the phone's bottom, so the last tenth of the phone is trimmed with extra rules.
    """
    a = np.asarray(img.convert("RGB")).astype(float)
    h, w, _ = a.shape
    lum = a.mean(2)
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    sample = np.zeros((h, w), bool)
    sample[:, : int(w * 0.12)] = sample[:, -int(w * 0.12):] = True
    sample[: int(h * 0.06)] = True

    def terms(y, x):
        x, y = x / w, y / h
        return np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)

    with np.errstate(all="ignore"):  # Accelerate BLAS on macOS warns spuriously
        coef, *_ = np.linalg.lstsq(terms(ys[sample], xs[sample]), lum[sample], rcond=None)
        bg = terms(ys, xs) @ coef
    sat = a.max(2) - a.min(2)
    cand = (((np.abs(lum - bg) > thresh) | (sat > 25)) * 255).astype(np.uint8)
    work = Image.fromarray(cand).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))

    seed = None
    for dy in range(0, h // 4, 4):
        for y in (h // 2 - dy, h // 2 + dy):
            if work.getpixel((w // 2, y)) == 255:
                seed = (w // 2, y)
                break
        if seed:
            break
    if seed is None:
        raise ValueError("no phone found in the middle of the frame")
    ImageDraw.floodfill(work, seed, 128)
    comp = np.asarray(work) == 128

    # Shadow rows only hold pixels a little darker than the backdrop; phone rows
    # always have a highlight, a dark bezel or colour somewhere.
    strong = comp & (((lum - bg) > 10) | ((bg - lum) > 70) | (sat > 25))
    rows = np.where(strong.sum(1) >= 3)[0]
    bottom = rows.max() + 2 if len(rows) else h
    comp[bottom:] = False

    filled = np.where(comp.any(1))[0]
    foot = bottom - int((bottom - filled.min()) * 0.10)
    screen_facing = ((lum - bg) > 20)[comp].mean() > 0.25
    mask = np.zeros((h, w), np.uint8)
    prev = None
    for y in filled:
        cols = np.where(comp[y])[0]
        lo, hi = cols.min(), cols.max()
        if y >= foot and prev is not None:
            edge = np.where(strong[y])[0]
            if screen_facing and len(edge) >= 3:
                # Screen side: bezel and frame are crisp, so keep to those pixels.
                lo, hi = max(lo, edge.min() - 2), min(hi, edge.max() + 2)
            else:
                # Plain silver back: the phone only narrows towards its rounded corners.
                lo, hi = max(lo, prev[0]), min(hi, prev[1])
            if lo > hi:
                break
        mask[y, lo: hi + 1] = 255
        prev = (lo, hi)

    # Opening clears thin shadow streaks; blur + re-threshold rounds off the
    # stair-steps the row fill leaves at the corners; then a 1px inset and a soft edge.
    m = Image.fromarray(mask).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    m = m.filter(ImageFilter.GaussianBlur(4)).point(lambda v: 255 if v >= 140 else 0)
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGBA")
    out.putalpha(m)
    return out


def trim(img):
    box = img.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    return img.crop(box) if box else img


def save_webp(img, dest, max_w=None, max_h=None, quality=82):
    img = img.copy()
    if max_w or max_h:
        img.thumbnail((max_w or 99999, max_h or 99999), Image.LANCZOS)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        img.save(tmp.name)
    subprocess.run(["cwebp", "-quiet", "-q", str(quality), "-alpha_q", "90", tmp.name, "-o", dest], check=True)
    os.unlink(tmp.name)
    print(f"{os.path.relpath(dest, ROOT)}  {img.size[0]}x{img.size[1]}  {os.path.getsize(dest) // 1024}KB")


def main():
    laptop = Image.open(os.path.join(ROOT, "mockup-laptop.png"))
    if laptop.mode != "RGBA" or laptop.getchannel("A").getextrema()[0] == 255:
        laptop = laptop.convert("RGB")
        laptop.thumbnail((2400, 2400), Image.LANCZOS)
        laptop = cut_studio_background(laptop)
    save_webp(trim(laptop.convert("RGBA")), os.path.join(ROOT, "mockup-laptop.webp"), max_w=1600)

    for name in ("mockup-iphone-1", "mockup-iphone-2"):
        img = Image.open(os.path.join(ROOT, name + ".png")).convert("RGBA")
        save_webp(trim(img), os.path.join(ROOT, name + ".webp"), max_h=1400)

    # Rendered spin: every .png/.jpg in phone-spin/ in name order (outputs are NNN.webp).
    spin_dir = os.path.join(ROOT, "phone-spin")
    sources = sorted(
        p for p in glob.glob(os.path.join(spin_dir, "*"))
        if p.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    if sources:
        cut = []
        for path in sources:
            img = Image.open(path)
            has_alpha = img.mode == "RGBA" and img.getchannel("A").getextrema()[0] < 255
            cut.append(img.convert("RGBA") if has_alpha else key_phone_frame(img))
        # One crop box for all frames, so the phone doesn't jump between them.
        boxes = [c.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox() for c in cut]
        pad = 8
        box = (
            max(0, min(b[0] for b in boxes) - pad), max(0, min(b[1] for b in boxes) - pad),
            min(cut[0].width, max(b[2] for b in boxes) + pad), min(cut[0].height, max(b[3] for b in boxes) + pad),
        )
        for old in glob.glob(os.path.join(spin_dir, "[0-9][0-9][0-9].webp")):
            os.unlink(old)
        for i, img in enumerate(cut, start=1):
            save_webp(img.crop(box), os.path.join(spin_dir, f"{i:03d}.webp"), max_h=1400, quality=78)
        print(f"{len(cut)} frames -> set phone_spin.frames: {len(cut)} in _data/showcase.yml")


if __name__ == "__main__":
    main()
