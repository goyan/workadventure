"""Quilt the supplied terrain bands into larger repeating textures, preserving native pixels."""
from pathlib import Path
import random
import sys
from PIL import Image, ImageChops, ImageEnhance, ImageStat


def minimum_seam(difference: Image.Image) -> list[int]:
    """Find a low-contrast cut through the overlap rather than blurring a straight join."""
    width, height = difference.size
    pixels = difference.load()
    costs = [pixels[x, 0] for x in range(width)]
    parents = []
    for y in range(1, height):
        previous = [min(range(max(0, x - 1), min(width, x + 2)), key=lambda i: costs[i]) for x in range(width)]
        costs = [pixels[x, y] + costs[previous[x]] for x in range(width)]
        parents.append(previous)
    seam = [min(range(width), key=lambda x: costs[x])]
    for previous in reversed(parents):
        seam.append(previous[seam[-1]])
    return list(reversed(seam))


def quilt(source: Image.Image) -> Image.Image:
    size, overlap, step = 64, 16, 48
    width, height = 1536, 1280
    result = Image.new("RGB", (width + size, height + size))
    rng = random.Random(20261108)
    patches = []
    for _ in range(512):
        sx = rng.randrange(source.width - size + 1)
        sy = rng.randrange(source.height - size + 1)
        patch = source.crop((sx, sy, sx + size, sy + size))
        patches.append((sum(ImageStat.Stat(patch).stddev), patch))
    # Open ground only: large plants in the source compete with avatars.
    quiet_patches = [patch for _, patch in sorted(patches, key=lambda item: item[0])[:48]]
    for y in range(0, height, step):
        for x in range(0, width, step):
            existing = result.crop((x, y, x + size, y + size))
            candidates = []
            for _ in range(12):
                patch = rng.choice(quiet_patches)
                difference = ImageChops.difference(existing, patch).convert("L")
                score = 0
                if x:
                    score += ImageStat.Stat(difference.crop((0, 0, overlap, size))).mean[0]
                if y:
                    score += ImageStat.Stat(difference.crop((0, 0, size, overlap))).mean[0]
                candidates.append((score, patch, difference))
            _, patch, difference = min(candidates, key=lambda candidate: candidate[0])
            mask = Image.new("L", (size, size), 255)
            draw = mask.load()
            if x:
                for row, cut in enumerate(minimum_seam(difference.crop((0, 0, overlap, size)))):
                    for column in range(cut):
                        draw[column, row] = 0
            if y:
                top = difference.crop((0, 0, size, overlap)).transpose(Image.Transpose.TRANSPOSE)
                for column, cut in enumerate(minimum_seam(top)):
                    for row in range(cut):
                        draw[column, row] = 0
            result.paste(patch, (x, y), mask)
    terrain = result.crop((0, 0, width, height))
    terrain = ImageEnhance.Color(terrain).enhance(0.75)
    return ImageEnhance.Contrast(terrain).enhance(0.65)


def seamless(image: Image.Image, margin: int = 24) -> Image.Image:
    """Blend only opposing edges; preserve the original detail in the interior."""
    result = image.copy()
    width, height = result.size
    for offset in range(margin):
        weight = 0.5 * (1 - offset / (margin - 1))
        left = image.crop((offset, 0, offset + 1, height))
        right = image.crop((width - offset - 1, 0, width - offset, height))
        result.paste(Image.blend(left, right, weight), (offset, 0))
        result.paste(Image.blend(right, left, weight), (width - offset - 1, 0))
    horizontal = result.copy()
    for offset in range(margin):
        weight = 0.5 * (1 - offset / (margin - 1))
        top = horizontal.crop((0, offset, width, offset + 1))
        bottom = horizontal.crop((0, height - offset - 1, width, height - offset))
        result.paste(Image.blend(top, bottom, weight), (0, offset))
        result.paste(Image.blend(bottom, top, weight), (0, height - offset - 1))
    assert result.crop((0, 0, 1, height)).tobytes() == result.crop((width - 1, 0, width, height)).tobytes()
    assert result.crop((0, 0, width, 1)).tobytes() == result.crop((0, height - 1, width, height)).tobytes()
    assert result.crop((margin, margin, width - margin, height - margin)).tobytes() == image.crop(
        (margin, margin, width - margin, height - margin)
    ).tobytes()
    return result


if __name__ == "__main__":
    source = Image.open(sys.argv[1]).convert("RGB")
    if source.width < 256 or source.height // 3 < 260:
        raise ValueError("Expected three horizontal terrain bands, each at least 256 pixels high")
    destination = Path(__file__).resolve().parents[1] / "public/resources/objects/weather"
    destination.mkdir(parents=True, exist_ok=True)
    for index, season in enumerate(["green", "autumn", "snow"]):
        top = round(index * source.height / 3) + (2 if index else 0)
        bottom = round((index + 1) * source.height / 3) - (2 if index < 2 else 0)
        terrain = seamless(quilt(source.crop((0, top, source.width, bottom))))
        if season == "autumn":
            red, green, blue = terrain.split()
            terrain = Image.merge("RGB", (
                red.point(lambda value: min(255, value + 18)),
                green.point(lambda value: max(0, value - 10)),
                blue.point(lambda value: max(0, value - 8)),
            ))
        assert terrain.size == (1536, 1280)
        terrain.save(destination / f"terrain-{season}.png")
