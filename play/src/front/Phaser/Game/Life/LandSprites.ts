import type * as Phaser from "phaser";

export type LandSpecies = "antelope" | "lion" | "tiger";

/** The species of the land by their number in the messages (2 antelope, 3 lion, 4 tiger). */
export function landSpeciesOf(kind: number): LandSpecies | undefined {
    const species = kind >> 1;
    return species === 2 ? "antelope" : species === 3 ? "lion" : species === 4 ? "tiger" : undefined;
}
export const isLandKind = (kind: number): boolean => landSpeciesOf(kind) !== undefined;

/** How the entry of each species of the land is named in a catalogue of animals (`<collection>:<name>:…`). */
const LAND_SHEET_NAMES = {
    lion: [":lion:"],
    tiger: [":tigre:", ":tiger:"],
    antelope: [":antilope:", ":antelope:"],
} as const satisfies Record<LandSpecies, readonly string[]>;

/** The wandering sheet of a species of the land among the objects of the catalogues of a map, when one has it. */
export function landSheetOf(
    species: LandSpecies,
    prefabs: readonly { id: string; wander?: { sheetPath: string } }[],
): string | undefined {
    return prefabs.find(
        (prefab) => prefab.wander !== undefined && LAND_SHEET_NAMES[species].some((name) => prefab.id.includes(name)),
    )?.wander?.sheetPath;
}

/**
 * The animals of the land, drawn here pixel by pixel, heading right: what is shown for an antelope, and for a lion
 * or a tiger while the sheet of the catalogue is not there. A character a pixel: "b" the body, "d" the darker parts
 * (mane, stripes, legs), "w" the light belly, "e" the eye, "h" the horns, "." nothing.
 */
const ANTELOPE = [
    "..............h.h.",
    "..............h.h.",
    ".............bbbb.",
    "............bbbeb.",
    "...bbbbbbbbbbbbbb.",
    "d.bbbbbbbbbbbbb...",
    ".dbbbbbbbbbbbbb...",
    "..bbwwwwwwwwbbb...",
    "..bb.wwwwww..bb...",
    "..d..d......d.d...",
    "..d..d......d.d...",
    "..d..d......d.d...",
];
const CAT = [
    ".............ddd..",
    "............dbbbb.",
    "...........ddbbeb.",
    "..bbbbbbbbbdddbbb.",
    ".bbbbbbbbbbbddb...",
    "dbbdbbdbbdbbbdb...",
    "dbbbbbbbbbbbbb....",
    "d.bbwwwwwwwwbb....",
    "..bb.wwwwww.bb....",
    "..bb........bb....",
    "..dd........dd....",
];

interface Palette {
    b: string;
    d: string;
    w: string;
    e: string;
    h: string;
}
const SPRITES: Record<LandSpecies, { rows: string[]; palette: Palette }> = {
    antelope: { rows: ANTELOPE, palette: { b: "#c8955a", d: "#7a5230", w: "#f3e3c8", e: "#1f1305", h: "#3b2a1a" } },
    // The lion: its darker parts are its mane; no stripe shows on a body of the same colour.
    lion: { rows: CAT, palette: { b: "#d9a441", d: "#8a5a1c", w: "#f4e2b0", e: "#1f1305", h: "#8a5a1c" } },
    tiger: { rows: CAT, palette: { b: "#f08a24", d: "#2b1a0c", w: "#fff1dc", e: "#1f1305", h: "#2b1a0c" } },
};

/** A pixel of these drawings is this many pixels of the map: an antelope is about as long as an avatar is tall. */
const PIXEL = 2;

export const landTextureKey = (species: LandSpecies): string => `land-life:${species}`;

/** Makes the drawn texture of a species of the land, once for a scene. */
export function ensureLandTexture(scene: Pick<Phaser.Scene, "textures">, species: LandSpecies): string {
    const key = landTextureKey(species);
    if (scene.textures.exists(key)) return key;
    const { rows, palette } = SPRITES[species];
    const width = Math.max(...rows.map((row) => row.length));
    const texture = scene.textures.createCanvas(key, width * PIXEL, rows.length * PIXEL);
    if (!texture) return key;
    const context = texture.getContext();
    rows.forEach((row, y) => {
        [...row].forEach((char, x) => {
            if (char !== "b" && char !== "d" && char !== "w" && char !== "e" && char !== "h") return;
            context.fillStyle = palette[char];
            context.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        });
    });
    texture.refresh();
    return key;
}
