import type * as Phaser from "phaser";
import type { AquaticKind } from "./AquaticLife";

/**
 * The animals of the water, drawn here pixel by pixel (no asset to ship), heading right. A character a pixel:
 * "b" the body, "d" its darker fins and tail, "w" its light belly, "e" its eye, "." nothing.
 */
const FISH = ["d...bbbb..", "dd.bbbbbb.", "ddbbbbbbeb", "ddbbbbbbbb", "dd.bwwwwb.", "d...bbbb.."];
const DOLPHIN = [
    "..............dd............",
    ".............ddd............",
    "..........bbbbbbbbbb........",
    ".......bbbbbbbbbbbbbbbb.....",
    "d....bbbbbbbbbbbbbbbbbbeb...",
    "dd..bbbbbbbbbbbbbbbbbbbbbbb.",
    "dddbbbbbbbbbbbbbbbbbbbbbbbbb",
    "dd.bbbwwwwwwwwwwwwwwwwwwww..",
    "d...bbwwwwwwwwwwwwwwww......",
    ".......wwwwwddwwww..........",
    "............ddd.............",
    ".............dd.............",
];

interface Palette {
    b: string;
    d: string;
    w: string;
    e: string;
}
const SPRITES: Record<AquaticKind, { rows: string[]; palette: Palette }> = {
    // Males are blue, females pink.
    0: { rows: FISH, palette: { b: "#3b82f6", d: "#1d4ed8", w: "#bfdbfe", e: "#0f172a" } },
    1: { rows: FISH, palette: { b: "#f472b6", d: "#db2777", w: "#fce7f3", e: "#0f172a" } },
    2: { rows: DOLPHIN, palette: { b: "#7b93a8", d: "#566d82", w: "#dbe5ee", e: "#0f172a" } },
};

export const aquaticTextureKey = (kind: AquaticKind): string => `aquatic-life:${kind}`;

/** Makes the texture of a kind of animal, once for a scene. */
export function ensureAquaticTexture(scene: Pick<Phaser.Scene, "textures">, kind: AquaticKind): string {
    const key = aquaticTextureKey(kind);
    if (scene.textures.exists(key)) return key;
    const { rows, palette } = SPRITES[kind];
    const width = Math.max(...rows.map((row) => row.length));
    const texture = scene.textures.createCanvas(key, width, rows.length);
    if (!texture) return key;
    const context = texture.getContext();
    rows.forEach((row, y) => {
        [...row].forEach((char, x) => {
            if (char !== "b" && char !== "d" && char !== "w" && char !== "e") return;
            context.fillStyle = palette[char];
            context.fillRect(x, y, 1, 1);
        });
    });
    texture.refresh();
    return key;
}
