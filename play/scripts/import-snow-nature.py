"""Lossless native snow/grass crops. Run after import-seasonal-nature.py, passing the Downloads folder."""
import json
import sys
from pathlib import Path
from PIL import Image

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1] / "public/collections"
dest = root / "Nature"
snow = Image.open(source / "with_snow.png").convert("RGBA")
grass = Image.open(source / "herbe_tiles.png").convert("RGBA")
other = Image.open(source / "other_herbe_tiles.png").convert("RGBA")
if any(image.size != (1536, 1024) for image in (snow, grass, other)):
    raise ValueError("Expected native 1536 × 1024 source sheets")
catalog = json.loads((root / "NatureCollection.json").read_text())
catalog["collection"] = [entry for entry in catalog["collection"] if not entry["id"].startswith("Nature:snow-") and not entry["id"].startswith("Nature:grass-") and not entry["id"].startswith("Nature:winter-auto-")]

def add(name, key, sheet, box, tree=False, floor=False):
    image = sheet.crop(box)
    if not floor:
        bounds = image.getchannel("A").point(lambda a: 255 if a >= 32 else 0).getbbox()
        if bounds is None:
            raise ValueError(f"Empty crop {key}")
        image = image.crop(bounds)
    image.save(dest / f"{key}.png", optimize=True)
    entry = {"id": f"Nature:{key}:Default:Down", "name": name, "tags": ["Nature", "Sols" if floor else "Neige"], "imagePath": f"Nature/{key}.png", "direction": "Down", "color": "Default", "layer": "floor" if floor else "standing"}
    if floor:
        entry["footstepSound"] = "grass"
    if tree:
        entry["collisionRectangles"] = [{"x": image.width // 2 - 8, "y": image.height - 22, "width": 16, "height": 10}]
        entry["depthOffset"] = -12
    catalog["collection"].append(entry)

for i, (left, right) in enumerate([(650, 805), (805, 960), (960, 1165), (1165, 1320), (1320, 1430), (1430, 1536)]):
    add(f"Arbre enneigé {i + 1}", f"snow-tree-{i + 1}", snow, (left, 225, right, 425), tree=True)
for i, (left, right) in enumerate([(0, 165), (165, 305), (305, 440), (440, 590), (590, 735), (735, 885), (885, 1010), (1010, 1190), (1190, 1390), (1390, 1536)]):
    add(f"{'Sapin' if i < 7 else ['Saule', 'Chêne', 'Palmier'][i - 7]} enneigé {i + 1}", f"snow-evergreen-{i + 1}", snow, (left, 440 if i == 3 else 425, right, 655), tree=True)
for i, (left, right) in enumerate([(0, 155), (155, 275), (275, 415), (415, 530), (530, 615), (615, 700), (700, 795), (795, 875), (875, 995), (995, 1100), (1100, 1245), (1245, 1380), (1380, 1536)]):
    add(f"Décor enneigé {i + 1}", f"snow-detail-{i + 1}", snow, (left, 665, right, 770))
for i in range(8):
    for season, top, bottom in [("green", 1, 191), ("autumn", 342, 518), ("snow", 682, 848)]:
        key = f"snow-grass-{i + 1}" if season == "snow" else f"grass-{season}-{i + 1}"
        add(f"Herbe {'enneigée' if season == 'snow' else 'd’automne' if season == 'autumn' else 'verte'} {i + 1}", key, grass, (i * 192 + 1, top, (i + 1) * 192 - 1, bottom), floor=True)
for i, (left, right) in enumerate([(20, 180), (192, 355), (369, 545), (558, 721), (739, 909), (925, 1072), (1088, 1253), (1268, 1515)]):
    add(f"Herbe et neige mêlées {i + 1}", f"snow-mixed-{i + 1}", other, (left, 20, right, 207), floor=True)
# Stable IDs, collision and origin: the winter picture changes, never the tree's footprint.
for i, (box, anchor) in enumerate([((650, 225, 805, 425), (731, 397)), ((805, 225, 960, 425), (879, 399))]):
    canvas = Image.new("RGBA", (192, 288))
    canvas.paste(snow.crop(box), (96 - (anchor[0] - box[0]), 248 - (anchor[1] - box[1])))
    canvas.save(dest / f"seasonal-{i + 1}-winter.png", optimize=True)
# Evergreens retain their leaves; winter adds snow, with a stable native canvas and trunk origin.
for i, (base_key, winter_key, name) in enumerate([
    ("tree-2-8", "snow-evergreen-1", "Sapin saisonnier 1"),
    ("tree-2-9", "snow-evergreen-2", "Sapin saisonnier 2"),
    ("tree-3-1", "snow-evergreen-3", "Sapin saisonnier 3"),
    ("tree-3-2", "snow-evergreen-4", "Sapin saisonnier 4"),
    ("tree-3-9", "snow-evergreen-8", "Saule saisonnier"),
    ("nature-3", "snow-evergreen-10", "Palmier saisonnier"),
]):
    paths = {}
    for season, image_key in [("summer", base_key), ("winter", winter_key)]:
        image = Image.open(dest / f"{image_key}.png")
        canvas = Image.new("RGBA", (256, 320))
        canvas.paste(image, (128 - image.width // 2, 280 - (image.height - 12)))
        key = f"winter-auto-{i + 1}-{season}"
        canvas.save(dest / f"{key}.png", optimize=True)
        paths[season] = f"Nature/{key}.png"
    catalog["collection"].append({"id": f"Nature:winter-auto-{i + 1}:Default:Down", "name": name, "tags": ["Nature"],
        "imagePath": paths["summer"], "direction": "Down", "color": "Default", "layer": "standing",
        "seasonal": {"spring": paths["summer"], "summer": paths["summer"], "autumn": paths["summer"], "winter": paths["winter"]},
        "collisionRectangles": [{"x": 120, "y": 270, "width": 16, "height": 10}], "depthOffset": -40})
(root / "NatureCollection.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
