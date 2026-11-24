import * as Phaser from "phaser";
import { get } from "svelte/store";
import { detailedFlamesStore } from "../../../Stores/EffectsStore";
import {
    DETAILED_FRAME_HEIGHT_PX,
    DETAILED_FRAME_WIDTH_PX,
    DETAILED_FRAMES,
    DETAILED_FRAMES_PER_SECOND,
    DETAILED_VARIANTS,
    detailedFlamePixel,
    detailedFrameIndex,
    detailedVariant,
} from "./FlameArt";
import { QUICK_FLAME_LOOP } from "./FlameShape";
import type { FlameLoop } from "./FlameShape";

/** The drawn frames of the quick flames (drawn by FireView) and of the detailed ones. */
export const FLAMES_TEXTURE = "fire-flames";
export const DETAILED_FLAMES_TEXTURE = "fire-flames-detailed";

/** How the flames are drawn: the sheet of their frames, its loop, and the frame of the sheet for one of the loop. */
export interface FlameStyle {
    texture: string;
    loop: FlameLoop;
    /** `frame`: a frame of the loop, or the one after it (the still flame); `seed`: the own time of the flame. */
    frameOf(frame: number, seed: number): number;
}

const QUICK: FlameStyle = { texture: FLAMES_TEXTURE, loop: QUICK_FLAME_LOOP, frameOf: (frame) => frame };
const DETAILED: FlameStyle = {
    texture: DETAILED_FLAMES_TEXTURE,
    loop: { frames: DETAILED_FRAMES, framesPerSecond: DETAILED_FRAMES_PER_SECOND },
    frameOf: (frame, seed) => detailedFrameIndex(frame, detailedVariant(seed)),
};

/**
 * The flames this person chose: the detailed ones (a pixel-art fire in several variants, more frames, drawn more
 * often) or the quick ones. The detailed sheet is drawn the first time it is asked for; if it cannot be, the quick
 * flames stay.
 */
export function flameStyle(scene: Phaser.Scene): FlameStyle {
    if (!get(detailedFlamesStore)) return QUICK;
    return drawDetailedFlames(scene) ? DETAILED : QUICK;
}

/** Draws the sheet of the detailed flames: a row a variant, its loop then its still flame. */
function drawDetailedFlames(scene: Phaser.Scene): boolean {
    const textures = scene.textures;
    if (textures.exists(DETAILED_FLAMES_TEXTURE)) return true;
    const columns = DETAILED_FRAMES + 1;
    const width = DETAILED_FRAME_WIDTH_PX * columns;
    const height = DETAILED_FRAME_HEIGHT_PX * DETAILED_VARIANTS;
    const sheet = textures.createCanvas(DETAILED_FLAMES_TEXTURE, width, height);
    const context = sheet?.getContext();
    if (!sheet || !context) return false;
    const image = context.createImageData(width, height);
    for (let variant = 0; variant < DETAILED_VARIANTS; variant++) {
        for (let frame = 0; frame < columns; frame++) {
            const still = frame === DETAILED_FRAMES;
            const left = frame * DETAILED_FRAME_WIDTH_PX;
            const top = variant * DETAILED_FRAME_HEIGHT_PX;
            for (let y = 0; y < DETAILED_FRAME_HEIGHT_PX; y++) {
                for (let x = 0; x < DETAILED_FRAME_WIDTH_PX; x++) {
                    const pixel = detailedFlamePixel(x, y, still ? 0 : frame, variant, still);
                    if (pixel[3] === 0) continue;
                    image.data.set(pixel, ((top + y) * width + left + x) * 4);
                }
            }
            sheet.add(
                detailedFrameIndex(frame, variant),
                0,
                left,
                top,
                DETAILED_FRAME_WIDTH_PX,
                DETAILED_FRAME_HEIGHT_PX,
            );
        }
    }
    context.putImageData(image, 0, 0);
    // Pixel art: kept sharp when a flame is drawn bigger.
    sheet.setFilter(Phaser.Textures.FilterMode.NEAREST);
    sheet.refresh();
    return true;
}
