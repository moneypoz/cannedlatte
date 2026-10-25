"""Make a can's product images from a shelf photo.

    python -P scripts/make-cutout.py PHOTO SLUG --can X0 X1 [options]

Writes the three files every photographed can needs:

    public/images/products/<slug>.jpg              1200x1200 on the house background
    src/assets/products/<slug>.jpg                 the same file, for astro:assets
    src/assets/products/cards/<slug>-card.png      transparent cutout, 900 px tall

The label photo itself is not touched; copy it to
public/images/products/<slug>-label.jpg yourself and cite it in `sources`.

Shelf photos are rarely clean: the front can touches the next can, sits in a
cardboard tray, or has a box beside it. Background removal alone keeps all of
that, so the mask is constrained by the can's geometry:

  --can X0 X1      horizontal span of the front can, generously. Segmentation
                   runs on this strip only, so the neighbour can't merge in.
  sides            fitted as straight lines from the rows where the mask is the
                   can's own width. --seam right|left|both instead puts that edge
                   on the dark seam where the can touches its neighbour, which is
                   what you want whenever two cans are in contact.
  --base EDGE CTR  clip the bottom to an ellipse: EDGE is the y where the sides
                   start curving into the base, CTR the y of the rim at the
                   centre. Use it when a tray or box covers the can's foot.

Run it, look at the --preview sheet, adjust, run again. It is one command per
can; the numbers it prints are worth keeping in the commit message.

Needs Pillow, numpy, scipy and rembg (pip install pillow numpy scipy rembg).
Run with -P so a stray module next to a downloaded photo is never imported.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import remove
from scipy import ndimage

BG = (246, 243, 238)         # the house background, sampled from existing composites
CARD_H = 900                 # card cutout height; also the can's height in the composite
CANVAS = 1200
TOP = 140                    # can top in the composite, which centres it with its shadow

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def segment(im, x0, x1, tries=3):
    """Alpha mask for the strip x0..x1. rembg occasionally fails with a bad
    allocation on Windows; a retry almost always clears it."""
    for i in range(tries):
        try:
            strip = remove(im.crop((x0, 0, x1, im.height)), only_mask=True)
            break
        except Exception as e:  # onnxruntime raises its own exception types
            if i == tries - 1:
                raise
            print(f'  segmentation failed ({e.__class__.__name__}), retrying')
    alpha = np.zeros((im.height, im.width))
    alpha[:, x0:x1] = np.asarray(strip, dtype=float)
    return alpha


def fit_mask_edges(alpha, cx, y0, y1):
    """Fit each side as x = a*y + b over rows where the run through the can's
    centre column is close to the median width, i.e. nothing is attached."""
    L, R, Y = [], [], []
    W = alpha.shape[1]
    for y in range(y0, y1):
        row = alpha[y] > 128
        if not row[cx]:
            continue
        l = cx
        while l > 0 and row[l - 1]:
            l -= 1
        r = cx
        while r < W - 1 and row[r + 1]:
            r += 1
        L.append(l); R.append(r); Y.append(y)
    if len(Y) < 20:
        sys.exit(f'only {len(Y)} usable rows between y={y0} and y={y1}; widen --fit or check --can')
    L, R, Y = map(np.array, (L, R, Y))
    w = R - L
    ok = np.abs(w - np.median(w)) < 6
    return np.polyfit(Y[ok], L[ok], 1), np.polyfit(Y[ok], R[ok], 1), int(ok.sum())


def fit_seam(gray, lo, hi, y0, y1):
    """The darkest column per row inside lo..hi, fitted robustly. Where two cans
    touch there is a shadowed seam, and it is a far steadier edge than the mask."""
    ys, xs = [], []
    for y in range(y0, y1, 10):
        row = np.convolve(gray[y - 2:y + 3].mean(0), np.ones(5) / 5, 'same')
        xs.append(lo + int(np.argmin(row[lo:hi])))
        ys.append(y)
    ys, xs = np.array(ys), np.array(xs)
    p = np.polyfit(ys, xs, 1)
    ok = np.abs(xs - np.polyval(p, ys)) < 8
    return np.polyfit(ys[ok], xs[ok], 1), int(ok.sum()), len(ys)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('photo')
    ap.add_argument('slug')
    ap.add_argument('--can', nargs=2, type=int, required=True, metavar=('X0', 'X1'))
    ap.add_argument('--fit', nargs=2, type=int, metavar=('Y0', 'Y1'),
                    help='rows to fit the sides from (default: 12%%-50%% of the photo height)')
    ap.add_argument('--seam', choices=['right', 'left', 'both'])
    ap.add_argument('--seam-band', type=int, default=50,
                    help='how far either side of the fitted edge to look for the seam (default 50)')
    ap.add_argument('--base', nargs=2, type=int, metavar=('EDGE', 'CENTRE'))
    ap.add_argument('--out', help='write all files here instead of into the repo')
    ap.add_argument('--preview', help='also write a side-by-side check image to this path')
    a = ap.parse_args()

    im = Image.open(a.photo).convert('RGB')
    W, H = im.size
    x0, x1 = max(0, a.can[0]), min(W, a.can[1])
    cx = (x0 + x1) // 2
    y0, y1 = a.fit or (int(H * 0.12), int(H * 0.5))

    alpha = segment(im, x0, x1)
    pl, pr, n = fit_mask_edges(alpha, cx, y0, y1)
    print(f'{a.slug}: sides fitted from {n} rows  left x={pl[0]:.4f}y+{pl[1]:.1f}  right x={pr[0]:.4f}y+{pr[1]:.1f}')

    # Pull each edge inward so no background fringe survives: 2 px off a
    # mask-fitted side, 3 px off a seam, whose darkest column is the shadow itself.
    pl = pl + np.array([0, 2])
    pr = pr - np.array([0, 2])

    gray = np.asarray(im.convert('L'), dtype=float)
    for side in (['left', 'right'] if a.seam == 'both' else [a.seam] if a.seam else []):
        p = pl if side == 'left' else pr
        mid = int(np.polyval(p, (y0 + y1) / 2))  # the inset is noise inside a ±50 px band
        lo, hi = max(0, mid - a.seam_band), min(W, mid + a.seam_band)
        fit, ok, tot = fit_seam(gray, lo, hi, y0, int(H * 0.85))
        print(f'  {side} seam x={fit[0]:.4f}y+{fit[1]:.1f}  ({ok}/{tot} rows agree)')
        if ok < tot * 0.7:
            print(f'  warning: the {side} seam is noisy; check the preview')
        if side == 'left':
            pl = fit + np.array([0, 3])
        else:
            pr = fit - np.array([0, 3])

    yy, xx = np.mgrid[0:H, 0:W]
    left = np.polyval(pl, yy)
    right = np.polyval(pr, yy)
    geo = (xx >= left) & (xx <= right)
    if a.base:
        edge, centre = a.base
        c, r = (left + right) / 2, (right - left) / 2
        geo &= yy <= edge + (centre - edge) * np.sqrt(np.clip(1 - ((xx - c) / r) ** 2, 0, 1))

    m = np.where(geo, alpha, 0)
    lab, n = ndimage.label(m > 128)
    if n == 0:
        sys.exit('mask is empty; check --can')
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = ndimage.binary_fill_holes(lab == int(np.argmax(sizes)) + 1)
    mask = Image.fromarray(np.where(keep, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))

    cut = Image.fromarray(np.dstack([np.asarray(im), np.asarray(mask)]), 'RGBA')
    cut = cut.crop(cut.getbbox())
    card = cut.resize((round(cut.width * CARD_H / cut.height), CARD_H), Image.LANCZOS)

    comp = Image.new('RGB', (CANVAS, CANVAS), BG)
    shadow = Image.new('L', comp.size, 0)
    bottom, mid = TOP + CARD_H, CANVAS // 2
    ImageDraw.Draw(shadow).ellipse((mid - card.width * 0.55, bottom - 22, mid + card.width * 0.55, bottom + 22), fill=90)
    comp.paste((200, 196, 190), (0, 0), shadow.filter(ImageFilter.GaussianBlur(18)))
    comp.paste(card, (mid - card.width // 2, TOP), card)

    if a.out:
        os.makedirs(a.out, exist_ok=True)
        paths = [os.path.join(a.out, f'{a.slug}.jpg'), None, os.path.join(a.out, f'{a.slug}-card.png')]
    else:
        paths = [os.path.join(ROOT, 'public', 'images', 'products', f'{a.slug}.jpg'),
                 os.path.join(ROOT, 'src', 'assets', 'products', f'{a.slug}.jpg'),
                 os.path.join(ROOT, 'src', 'assets', 'products', 'cards', f'{a.slug}-card.png')]
    for p in paths[:2]:
        if p:
            comp.save(p, quality=88)
    card.save(paths[2])
    print(f'  cut {cut.size[0]}x{cut.size[1]} -> card {card.size[0]}x{card.size[1]}')
    for p in filter(None, paths):
        print(f'  wrote {os.path.relpath(p, ROOT) if not a.out else p}')

    if a.preview:
        # The source with the fitted edges drawn on, beside the composite: the two
        # things to look at before trusting a run.
        src = im.copy()
        d = ImageDraw.Draw(src)
        d.line([(np.polyval(pl, 0), 0), (np.polyval(pl, H), H)], fill=(255, 0, 0), width=3)
        d.line([(np.polyval(pr, 0), 0), (np.polyval(pr, H), H)], fill=(255, 0, 0), width=3)
        if a.base:
            d.line([(0, a.base[0]), (W, a.base[0])], fill=(0, 0, 255), width=2)
            d.line([(0, a.base[1]), (W, a.base[1])], fill=(0, 0, 255), width=2)
        src = src.resize((round(W * 800 / H), 800))
        sheet = Image.new('RGB', (src.width + 800, 800), BG)
        sheet.paste(src, (0, 0))
        sheet.paste(comp.resize((800, 800)), (src.width, 0))
        sheet.save(a.preview)
        print(f'  preview {a.preview}')


if __name__ == '__main__':
    main()
