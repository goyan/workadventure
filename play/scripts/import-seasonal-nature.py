"""Lossless crops of the supplied 1536 × 1024 nature sheet (requires Pillow).
Usage: python3 play/scripts/import-seasonal-nature.py /path/tree_nature.png
"""
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public/collections"
dest = root / "Nature"
dest.mkdir(exist_ok=True)
source = Image.open(sys.argv[1]).convert("RGBA")
if source.size != (1536, 1024):
    raise ValueError("Expected the original 1536 × 1024 sheet")
entries = []


def add(name, key, image, trunk=None, seasonal=None, overhead=False):
    if not seasonal:
        image.save(dest / f"{key}.png", optimize=True)
    entry = {"id": f"Nature:{key}:Default:Down", "name": name,
             "tags": ["Nature"], "imagePath": seasonal["summer"] if seasonal else f"Nature/{key}.png",
             "direction": "Down", "color": "Default", "layer": "overhead" if overhead else "standing"}
    if trunk:
        x, y = trunk
        entry["collisionRectangles"] = [{"x": x - 8, "y": y - 10, "width": 16, "height": 10}]
        entry["depthOffset"] = y - image.height
    if seasonal:
        entry["seasonal"] = seasonal
    entries.append(entry)


def crop(box):
    image = source.crop(box)
    bounds = image.getchannel("A").point(lambda a: 255 if a >= 32 else 0).getbbox()
    if not bounds:
        raise ValueError(f"Empty crop: {box}")
    return image.crop(bounds)


columns = [(0, 148), (148, 288), (288, 423), (423, 556), (556, 706),
           (706, 852), (852, 987), (987, 1130), (1130, 1267), (1267, 1407), (1407, 1536)]
rows = [(20, 205), (215, 425), (435, 685)]
names = [
    ["Feuillage clair", "Chêne clair 1", "Chêne clair 2", "Chêne clair 3", "Feuillage fleuri",
     "Arbre fleuri 1", "Arbre fleuri 2", "Feuillage sombre", "Chêne sombre 1", "Chêne sombre 2", "Chêne sombre 3"],
    ["Feuillage d’automne", "Arbre d’automne 1", "Arbre d’automne 2", "Arbre d’automne 3", "Cerisier 1",
     "Cerisier 2", "Cerisier 3", "Sapin sombre 1", "Sapin sombre 2", "Sapin sombre 3", "Sapin sombre 4"],
    ["Sapin clair 1", "Sapin clair 2", "Sapin clair 3", "Sapin clair 4", "Cyprès 1", "Cyprès 2", "Cyprès 3",
     "Feuillage de saule", "Saule 1", "Saule 2", "Saule 3"],
]
for row, (top, bottom) in enumerate(rows):
    for column, (left, right) in enumerate(columns):
        image = crop((left, top, right, bottom))
        canopy = (row == 0 and column in (0, 4, 7)) or (row == 1 and column == 0) or (row == 2 and column == 7)
        add(names[row][column], f"tree-{row + 1}-{column + 1}", image,
            None if canopy else (image.width // 2, image.height - 12), overhead=canopy)

extras = [
    ("Grand chêne 1", (0, 695, 203, 970), True), ("Grand chêne 2", (203, 695, 422, 970), True),
    ("Palmier 1", (422, 695, 621, 970), True), ("Palmier 2", (621, 695, 813, 970), True),
    ("Arbre nu 1", (813, 710, 982, 970), True), ("Arbre nu 2", (982, 710, 1150, 970), True),
    ("Souche", (1170, 755, 1290, 865), False), ("Rochers", (1300, 755, 1410, 865), False),
    ("Buisson fleuri", (1410, 755, 1536, 865), False),
    ("Buisson", (1170, 875, 1295, 980), False), ("Herbes", (1300, 875, 1410, 980), False),
    ("Fleurs", (1410, 875, 1536, 980), False),
]
for index, (name, box, tree) in enumerate(extras):
    image = crop(box)
    add(name, f"nature-{index + 1}", image, (image.width // 2, image.height - 12) if tree else None)

# Equal canvases registered by trunk foot, with native pixels and space for the winter branches.
variants = [
    {"spring": ((706, 215, 852, 425), (774, 382)), "summer": ((148, 20, 288, 205), (220, 177)),
     "autumn": ((148, 215, 288, 425), (220, 373)), "winter": ((813, 710, 982, 970), (891, 936))},
    {"spring": ((852, 215, 987, 425), (916, 383)), "summer": ((288, 20, 423, 205), (350, 178)),
     "autumn": ((288, 215, 423, 425), (353, 377)), "winter": ((982, 710, 1150, 970), (1054, 936))},
]
for index, seasons in enumerate(variants):
    paths = {}
    for season, (box, anchor) in seasons.items():
        canvas = Image.new("RGBA", (192, 288))
        canvas.paste(source.crop(box), (96 - (anchor[0] - box[0]), 248 - (anchor[1] - box[1])))
        key = f"seasonal-{index + 1}-{season}"
        canvas.save(dest / f"{key}.png", optimize=True)
        paths[season] = f"Nature/{key}.png"
    add(f"Arbre saisonnier {index + 1}", f"seasonal-{index + 1}",
        Image.open(dest / f"seasonal-{index + 1}-summer.png"), (96, 248), paths)

(root / "NatureCollection.json").write_text(json.dumps(
    {"collectionName": "Nature", "tags": ["Nature"], "version": "1.0", "collection": entries},
    ensure_ascii=False, indent=2) + "\n")
