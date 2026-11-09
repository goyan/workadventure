"""Add the supplied small nature decorations without replacing existing objects or trees.
Usage: python3 play/scripts/import-nature-objects.py /path/to/Downloads
Requires Pillow. Running it again updates the same IDs.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1] / "public/collections"
catalog_path = root / "NatureCollection.json"
catalog = json.loads(catalog_path.read_text())
originals = {entry["id"]: entry.copy() for entry in catalog["collection"]}
sheets = {name: Image.open(source / name).convert("RGBA")
          for name in ("other_herbe_tiles.png", "with_snow.png")}
if any(sheet.size != (1536, 1024) for sheet in sheets.values()):
    raise ValueError("Expected the original 1536 × 1024 sheets")

rows = [
    ("grass", 410, 540,
     [0, 125, 260, 430, 585, 735, 875, 955, 1070, 1165, 1280, 1375, 1536],
     ["Herbes fleuries", "Grandes herbes", "Herbes hautes enneigées", "Touffe d’herbe",
      "Touffe d’herbe enneigée", "Marguerites", "Fleurs jaunes", "Brins d’herbe enneigés",
      "Petite herbe enneigée", "Buisson enneigé", "Petite plante", "Grand buisson enneigé"]),
    ("flowers", 545, 675,
     [0, 135, 245, 370, 540, 680, 805, 955, 1090, 1220, 1370, 1536],
     ["Herbes à fleurs jaunes", "Petite touffe d’herbe", "Brins d’herbe", "Herbes sous la neige",
      "Herbes à neige", "Herbes à fleurs violettes", "Herbes à fleurs blanches", "Fleurs violettes",
      "Fleurs multicolores", "Buisson sous la neige", "Buisson à neige"]),
    ("rocks", 650, 790,
     [15, 185, 365, 460, 605, 790, 970, 1190, 1340, 1536],
     ["Gros rochers enneigés", "Deux rochers enneigés", "Petites pierres enneigées",
      "Rochers sous la neige", "Amas de rochers enneigés", "Grande souche enneigée",
      "Tronc et branche enneigés", "Branche enneigée", "Buisson rond enneigé"]),
]


def add(name, key, sheet, box, scale=0.65):
    image = sheet.crop(box)
    # The source alpha includes an almost invisible halo outside each sprite.
    alpha = image.getchannel("A").point(lambda value: value if value >= 32 else 0)
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"Empty crop: {key}")
    image.putalpha(alpha)
    image = image.crop(bounds)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                         Image.Resampling.NEAREST)
    image.save(root / "Nature" / f"{key}.png", optimize=True)
    entry = {"id": f"Nature:{key}:Default:Down", "name": name, "tags": ["Nature"],
             "imagePath": f"Nature/{key}.png", "direction": "Down", "color": "Default", "layer": "standing"}
    if any(existing["id"] == entry["id"] for existing in catalog["collection"]):
        catalog["collection"] = [entry if existing["id"] == entry["id"] else existing
                                 for existing in catalog["collection"]]
    else:
        catalog["collection"] = [*catalog["collection"], entry]


for group, top, bottom, columns, names in rows:
    for index, name in enumerate(names):
        # This rock row overlaps the preceding bushes vertically, but has separate columns.
        crop_top = 680 if group == "rocks" and index >= 2 else top
        crop_bottom = (660 if index in (3, 4) else 650) if group == "flowers" and index < 9 else bottom
        add(name, f"detail-{group}-{index + 1}", sheets["other_herbe_tiles.png"],
            (columns[index], crop_top, columns[index + 1], crop_bottom),
            scale=0.65 if group == "rocks" and index < 5 else 0.325)

for index, (name, box) in enumerate([
    ("Rocher coiffé de neige", (1410, 780, 1536, 900)),
    ("Petite pierre enneigée", (1370, 895, 1415, 930)),
    ("Deux pierres sous la neige", (1360, 935, 1430, 985)),
    ("Rochers coiffés de neige", (1430, 910, 1536, 985)),
    ("Petit buisson sous la neige", (1260, 900, 1360, 985)),
]):
    add(name, f"detail-snow-{index + 1}", sheets["with_snow.png"], box, scale=0.325 if index == 4 else 0.65)

snow_names = ["Buisson enneigé rond", "Petit buisson enneigé rond", "Buisson à baies enneigé",
              "Branches nues enneigées", "Petites branches nues enneigées", "Fleur enneigée",
              "Herbes givrées", "Petites herbes givrées", "Plante sous la neige", "Souche enneigée",
              "Tronc enneigé", "Rocher et pierre enneigés", "Groupe de rochers enneigés"]
for entry in catalog["collection"]:
    for index, name in enumerate(snow_names, start=1):
        if entry["id"] == f"Nature:snow-detail-{index}:Default:Down":
            entry["name"] = name

# These legacy decorations were kept at source-sheet size while trees were reduced.
# Re-crop the originals so repeated imports never shrink an already resized image.
tree_sheet = Image.open(source / "tree_nature.png").convert("RGBA")
if tree_sheet.size != (1536, 1024):
    raise ValueError("Expected the original 1536 × 1024 tree sheet")
legacy_crops = {
    "nature-7": (1170, 755, 1290, 865),
    "nature-9": (1410, 755, 1536, 865),
    "nature-10": (1170, 875, 1295, 980),
    "nature-11": (1300, 875, 1410, 980),
    "nature-12": (1410, 875, 1536, 980),
}
for key, box in legacy_crops.items():
    entry = originals[f"Nature:{key}:Default:Down"]
    add(entry["name"], key, tree_sheet, box, scale=0.5)
    catalog["collection"] = [entry.copy() if current["id"] == entry["id"] else current
                             for current in catalog["collection"]]

snow_columns = [0, 155, 275, 415, 530, 615, 700, 795, 875, 995, 1100, 1245]
for index in range(11):
    key = f"snow-detail-{index + 1}"
    entry = next(entry.copy() for entry in catalog["collection"] if entry["id"] == f"Nature:{key}:Default:Down")
    add(entry["name"], key, sheets["with_snow.png"],
        (snow_columns[index], 665, snow_columns[index + 1], 770), scale=0.5)
    catalog["collection"] = [entry if current["id"] == entry["id"] else current
                             for current in catalog["collection"]]

ids = [entry["id"] for entry in catalog["collection"]]
assert len(ids) == len(set(ids)), "Duplicate object IDs"
entries = {entry["id"].split(":")[1]: entry for entry in catalog["collection"]}
# Recolor the snow with the dry stone palette, keeping each rock's own outline and alpha.
dry_rocks = Image.open(root / "Nature/nature-8.png").convert("RGBA")
stone_palette = [(64, 60, 58), (93, 86, 78), (122, 113, 102), (151, 142, 128), (177, 169, 151)]


def dry_pixel(pixel):
    red, green, blue, alpha = pixel
    if alpha and max(red, green, blue) > 130 and blue >= red - 8 and blue >= green - 4:
        shade = max(0, min(4, round(((red + green + blue) / 3 - 80) / 175 * 4)))
        return (*stone_palette[shade], alpha)
    return pixel


rock_keys = ["nature-8", "snow-detail-12", "snow-detail-13"] + [
    f"detail-rocks-{index}" for index in range(1, 6)
] + [f"detail-snow-{index}" for index in range(1, 5)]
rock_size = (48, 40)
for key in rock_keys:
    entry = entries[key]
    snow_path = "Nature/detail-rocks-2.png" if key == "nature-8" else f"Nature/{key}.png"
    snowy = Image.open(root / snow_path).convert("RGBA")
    dry = dry_rocks.copy() if key == "nature-8" else snowy.copy()
    if key != "nature-8":
        dry.putdata([dry_pixel(pixel) for pixel in snowy.getdata()])
        assert dry.getchannel("A").tobytes() == snowy.getchannel("A").tobytes()
    paths = {}
    for weather, artwork in [("dry", dry), ("snow", snowy)]:
        scale = min(rock_size[0] / artwork.width, rock_size[1] / artwork.height)
        artwork = artwork.resize((max(1, round(artwork.width * scale)), max(1, round(artwork.height * scale))),
                                 Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", rock_size)
        canvas.paste(artwork, ((canvas.width - artwork.width) // 2, canvas.height - artwork.height))
        paths[weather] = f"Nature/weather-{key}-{weather}.png"
        canvas.save(root / paths[weather], optimize=True)
    entry["imagePath"] = paths["dry"]
    entry["seasonal"] = {"spring": paths["dry"], "summer": paths["dry"],
                         "autumn": paths["dry"], "winter": paths["snow"]}
    entry["name"] = entry["name"].replace(" enneigées", "").replace(" enneigés", "").replace(" enneigée", "").replace(" enneigé", "").replace(" sous la neige", "").replace(" coiffé de neige", "").replace(" coiffés de neige", "")

decoration_keys = list(legacy_crops) + [f"snow-detail-{index}" for index in range(1, 12)] + [
    f"detail-grass-{index}" for index in range(1, 13)
] + [f"detail-flowers-{index}" for index in range(1, 12)] + [
    f"detail-rocks-{index}" for index in range(6, 10)
] + ["detail-snow-5"]
snowy_keys = {f"snow-detail-{index}" for index in range(1, 12)} | {
    "detail-grass-3", "detail-grass-5", "detail-grass-8", "detail-grass-9",
    "detail-grass-10", "detail-grass-12", "detail-flowers-4", "detail-flowers-5",
    "detail-flowers-7", "detail-flowers-10", "detail-flowers-11",
    "detail-rocks-6", "detail-rocks-7", "detail-rocks-8", "detail-rocks-9", "detail-snow-5",
}
wood_keys = {"nature-7", "snow-detail-4", "snow-detail-5", "snow-detail-10", "snow-detail-11",
             "detail-rocks-6", "detail-rocks-7", "detail-rocks-8"}
dry_trunk_keys = {"snow-detail-10", "snow-detail-11", "detail-rocks-6", "detail-rocks-7", "detail-rocks-8"}
leaf_palette = [(32, 66, 35), (46, 92, 40), (65, 119, 46), (93, 145, 58), (132, 170, 74)]
wood_palette = [(75, 47, 29), (104, 66, 37), (137, 90, 48), (170, 119, 65), (205, 153, 91)]
snow_palette = [(120, 150, 180), (159, 186, 207), (193, 214, 230), (221, 234, 244), (246, 250, 255)]

for key in decoration_keys:
    entry = entries[key]
    native = Image.open(root / f"Nature/{key}.png").convert("RGBA")
    dry = native.copy()
    palette = wood_palette if key in wood_keys else leaf_palette
    if key in dry_trunk_keys:
        # Snow has its own silhouette: recoloring it leaves brown lumps on the wood.
        dry = Image.open(root / f"Nature/dry-source-{key}.png").convert("RGBA")
        snowy = native
    elif key in snowy_keys:
        pixels = []
        for red, green, blue, alpha in native.getdata():
            if alpha and max(red, green, blue) > 130 and blue >= red - 8 and blue >= green - 4:
                shade = max(0, min(4, round(((red + green + blue) / 3 - 130) / 125 * 4)))
                pixels.append((*palette[shade], alpha))
            else:
                pixels.append((red, green, blue, alpha))
        dry.putdata(pixels)
        snowy = native
    else:
        # Snow rests on the bright upper surfaces; preserve each sprite's exact footprint.
        snowy = native.copy()
        pixels = []
        for index, (red, green, blue, alpha) in enumerate(native.getdata()):
            height = index // native.width
            brightness = (red + green + blue) / 3
            surface = (red > blue and red >= green) if key in wood_keys else (green > red and green > blue)
            limit = native.height * (0.35 if key in wood_keys else 0.8)
            if alpha and surface and brightness > 90 and height < limit:
                shade = max(0, min(4, round((brightness - 90) / 100 * 4)))
                pixels.append((*snow_palette[shade], alpha))
            else:
                pixels.append((red, green, blue, alpha))
        snowy.putdata(pixels)
    assert dry.size == snowy.size, f"Weather variant changes size: {key}"
    if key not in dry_trunk_keys:
        assert dry.getchannel("A").tobytes() == snowy.getchannel("A").tobytes()
    assert dry.tobytes() != snowy.tobytes(), f"Missing weather variation: {key}"
    paths = {}
    for weather, artwork in [("dry", dry), ("snow", snowy)]:
        if key not in wood_keys:
            shadow = Image.new("RGBA", (artwork.width, artwork.height + 2))
            draw = ImageDraw.Draw(shadow)
            left, right = round(artwork.width * 0.15), round(artwork.width * 0.85)
            draw.ellipse((left, artwork.height - 4, right, artwork.height + 1), fill=(33, 41, 39, 55))
            draw.ellipse((left + 2, artwork.height - 3, right - 2, artwork.height), fill=(28, 34, 31, 85))
            shadow.alpha_composite(artwork)
            assert shadow.getpixel((artwork.width // 2, artwork.height + 1))[3] > 0
            artwork = shadow
        paths[weather] = f"Nature/weather-{key}-{weather}.png"
        artwork.save(root / paths[weather], optimize=True)
    entry["imagePath"] = paths["dry"]
    entry["seasonal"] = {"spring": paths["dry"], "summer": paths["dry"],
                         "autumn": paths["dry"], "winter": paths["snow"]}
    for suffix in [" enneigées", " enneigés", " enneigée", " enneigé", " sous la neige", " à neige", " givrées"]:
        entry["name"] = entry["name"].replace(suffix, "")

# Match the trees: a pixel-sized obstacle at the ground contact, never the foliage or its shadow.
for key in rock_keys + decoration_keys:
    entry = entries[key]
    artwork = Image.open(root / entry["imagePath"]).convert("RGBA")
    bounds = artwork.getchannel("A").point(lambda alpha: 255 if alpha >= 128 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"Missing solid artwork: {key}")
    left, top, right, bottom = bounds
    width_ratio = 0.8 if key in wood_keys else 0.65 if key in rock_keys else 0.45
    width = max(4, round((right - left) * width_ratio))
    height = max(4, min(14 if key in wood_keys else 10,
                        round((bottom - top) * (0.35 if key in wood_keys else 0.2))))
    entry["collisionRectangles"] = [{"x": (left + right - width) // 2, "y": bottom - height,
                                      "width": width, "height": height}]
    entry["depthOffset"] = bottom - artwork.height - 2
    assert bottom <= artwork.height and entry["collisionRectangles"][0]["x"] >= 0

for entry in catalog["collection"]:
    previous = originals.get(entry["id"])
    if previous and entry["id"].split(":")[1] not in rock_keys + decoration_keys:
        assert entry == previous, f"Existing object changed: {entry['id']}"
    assert (root / entry["imagePath"]).is_file(), f"Missing image: {entry['imagePath']}"
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
