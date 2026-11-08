"""Link existing Nature tree IDs to supplied green, autumn and snow artwork, without moving their trunks.
Run from any directory with Pillow. Existing IDs, native canvas sizes and collision rectangles stay unchanged.
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public/collections"
catalog_path = root / "NatureCollection.json"
catalog = json.loads(catalog_path.read_text())
entries = {entry["id"].split(":")[1]: entry for entry in catalog["collection"]}
pairs = {}

for column, autumn, snow in [(2, 2, 1), (3, 3, 2), (4, 4, 3), (6, 2, 1), (7, 3, 2), (9, 2, 1), (10, 3, 2), (11, 4, 3)]:
    key = f"tree-1-{column}"
    pairs[key] = (key, f"tree-2-{autumn}", f"snow-tree-{snow}")
for column in range(2, 8):
    variant = (column - 2) % 3 + 2
    pairs[f"tree-2-{column}"] = (f"tree-1-{variant}", f"tree-2-{variant}", f"snow-tree-{variant - 1}")
for base, snowy in [
    ("tree-2-8", 1), ("tree-2-9", 2), ("tree-2-10", 3), ("tree-2-11", 4),
    ("tree-3-1", 3), ("tree-3-2", 4), ("tree-3-3", 5), ("tree-3-4", 6),
    ("tree-3-5", 5), ("tree-3-6", 6), ("tree-3-7", 7),
    ("tree-3-9", 8), ("tree-3-10", 8), ("tree-3-11", 8),
    ("nature-3", 10), ("nature-4", 10),
]:
    pairs[base] = (base, base, f"snow-evergreen-{snowy}")
for index in [1, 2]:
    pairs[f"nature-{index}"] = (f"nature-{index}", f"tree-2-{index + 2}", "snow-evergreen-9")
for index in [5, 6]:
    pairs[f"nature-{index}"] = (f"nature-{index}", f"nature-{index}", f"snow-tree-{index}")
for index in range(1, 7):
    base = f"tree-1-{index + 1}" if index <= 3 else f"nature-{5 if index <= 5 else 6}"
    autumn = f"tree-2-{index + 1}" if index <= 3 else base
    pairs[f"snow-tree-{index}"] = (base, autumn, f"snow-tree-{index}")
for index, base in enumerate([
    "tree-2-8", "tree-2-9", "tree-3-1", "tree-3-2", "tree-3-3", "tree-3-4", "tree-3-7",
    "tree-3-9", "nature-1", "nature-3",
], start=1):
    pairs[f"snow-evergreen-{index}"] = (base, "tree-2-3" if index == 9 else base, f"snow-evergreen-{index}")


def anchor(entry):
    rectangle = entry["collisionRectangles"][0]
    return (rectangle["x"] + rectangle["width"] / 2, rectangle["y"] + rectangle["height"])


def aligned_variant(target_key, source_key, season):
    target = entries[target_key]
    if target_key == source_key:
        return target["imagePath"]
    source = entries[source_key]
    base_image = Image.open(root / target["imagePath"]).convert("RGBA")
    image = Image.open(root / source["imagePath"]).convert("RGBA")
    tx, ty = anchor(target)
    sx, sy = anchor(source)
    # Fit each side of the supplied artwork around the same trunk point, with nearest-neighbour pixels.
    scale = min(tx / sx, ty / sy, (base_image.width - tx) / (image.width - sx),
                (base_image.height - ty) / (image.height - sy))
    width, height = max(1, round(image.width * scale)), max(1, round(image.height * scale))
    original_width, original_height = image.size
    image = image.resize((width, height), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", base_image.size)
    canvas.paste(image, (round(tx - sx * width / original_width),
                         round(ty - sy * height / original_height)))
    path = f"Nature/weather-{target_key}-{season}.png"
    canvas.save(root / path, optimize=True)
    return path


for key, (green, autumn, winter) in pairs.items():
    entry = entries[key]
    green_path = aligned_variant(key, green, "green")
    entry["seasonal"] = {
        "spring": entry["imagePath"] if key in {"tree-1-6", "tree-1-7", "tree-2-5", "tree-2-6", "tree-2-7"} else green_path,
        "summer": green_path,
        "autumn": aligned_variant(key, autumn, "autumn"),
        "winter": aligned_variant(key, winter, "snow"),
    }
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
