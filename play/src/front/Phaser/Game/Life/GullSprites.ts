import type * as Phaser from "phaser";

/** A gull, drawn here pixel by pixel, heading right: wings up, wings down, and landed. */
export type GullPose = "up" | "down" | "landed";
/** Its wings go up, then down, this often. */
export const GULL_FLAP_MS = 220;

/** "w" white, "g" the grey of the wings, "d" their dark tips, "o" the beak and the feet, "e" the eye. */
const SHAPES: Record<GullPose, string[]> = {
    up: [
        "..d........d....",
        "..gg......gg....",
        "...ggg..ggg.....",
        "....ggwwgg...we.",
        ".....wwwwwwwwwoo",
        "......wwwwwww...",
    ],
    down: [
        ".............we.",
        "....wwwwwwwwwwoo",
        "...ggwwwwwwww...",
        "..ggg.wwww.ggg..",
        ".gg..........gg.",
        ".d............d.",
    ],
    landed: [".......we.", "......wwoo", "..gggwww..", ".ggggwww..", "dggwwwww..", "...wwww...", "....o.o..."],
};
const COLOURS: Record<string, string> = { w: "#f8fafc", g: "#94a3b8", d: "#334155", o: "#f59e0b", e: "#0f172a" };
/** A pixel of these drawings is this many pixels of the map. */
const PIXEL = 2;

export const gullTextureKey = (pose: GullPose): string => `gull-life:${pose}`;

/** Makes the texture of a pose, once for a scene. */
export function ensureGullTexture(scene: Pick<Phaser.Scene, "textures">, pose: GullPose): string {
    const key = gullTextureKey(pose);
    if (scene.textures.exists(key)) return key;
    const rows = SHAPES[pose];
    const width = Math.max(...rows.map((row) => row.length));
    const texture = scene.textures.createCanvas(key, width * PIXEL, rows.length * PIXEL);
    if (!texture) return key;
    const context = texture.getContext();
    rows.forEach((row, y) => {
        [...row].forEach((char, x) => {
            const colour = COLOURS[char];
            if (!colour) return;
            context.fillStyle = colour;
            context.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
        });
    });
    texture.refresh();
    return key;
}
