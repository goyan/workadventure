import { projectionShown } from "./ReliefProjection";

/**
 * Which engine draws the ground, the relief and the water of a map:
 * - "flat": the one of TerrainView, as ever (nothing of it in Basique, which it sees by itself);
 * - "oblique": the same, its shaders drawing the relief in 3/4;
 * - "blocks": the blocks of ReliefTiles, in 3/4, where the shaders cannot (no WebGL, too few textures).
 */
export type GroundEngine = "flat" | "oblique" | "blocks";

export function groundEngineOf(where: {
    /** The player asked for the relief in 3/4. */
    chosen: boolean;
    editorOpen: boolean;
    basic: boolean;
    /** The shaders of the flat engine can draw the relief in 3/4 on this graphics card. */
    shader: boolean;
}): GroundEngine {
    if (!projectionShown(where)) return "flat";
    return where.shader ? "oblique" : "blocks";
}

/**
 * What the blocks of the relief are told at each image (GroundEngines.sync): made only where the shaders cannot draw
 * the 3/4 and the player asked for it, shown while they are the engine that draws, kept hidden in the editor and in
 * Basique.
 */
export function blocksStateOf(where: Parameters<typeof groundEngineOf>[0]): { chosen: boolean; shown: boolean } {
    return { chosen: where.chosen && !where.shader, shown: groundEngineOf(where) === "blocks" };
}
