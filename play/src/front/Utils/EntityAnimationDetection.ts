import { MAX_ENTITY_ANIMATION_FRAME_COUNT } from "@workadventure/map-editor";

export const DEFAULT_ENTITY_ANIMATION_FRAME_RATE = 8;

/** The pixels of an image, as in an `ImageData`: 4 bytes (RGBA) per pixel, row after row. */
export interface ImagePixels {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

const MIN_FRAME_WIDTH = 8;
const OPAQUE_ALPHA = 128;
// Sum of the RGB differences under which two neighbour pixels are taken as the same colour.
const SAME_COLOR_TOLERANCE = 96;
// Average overlap of the opaque pixels of two consecutive frames: the frames of an animation draw the same object.
const MIN_FRAME_SIMILARITY = 0.5;
// Share of the rows where a frame border continues into the next frame: past it, the "frames" are parts of one image.
const MAX_SEAM_CONTINUITY = 0.5;

/**
 * Guesses whether an image is a horizontal strip of animation frames, as exported from a tileset, and returns its
 * number of frames, or undefined for a still image.
 *
 * A strip is told from a wide still image by its cuts: its frames draw the same object (their opaque pixels overlap
 * much) and nothing continues across the border of two frames, whereas the parts of a still image join up there. A
 * row of identical frames is a repeated pattern (a fence), not an animation. Seamless opaque tiles (water) join up
 * at their borders too and are not detected: the uploader marks them by hand.
 */
export function detectEntityAnimationFrameCount(pixels: ImagePixels): number | undefined {
    const candidates: number[] = [];
    for (let frameCount = 2; frameCount <= MAX_ENTITY_ANIMATION_FRAME_COUNT; frameCount++) {
        const frameWidth = pixels.width / frameCount;
        if (frameWidth < MIN_FRAME_WIDTH) break;
        if (Number.isInteger(frameWidth) && frameWidth <= pixels.height * 4 && frameWidth * 4 >= pixels.height) {
            candidates.push(frameCount);
        }
    }
    // Square frames first, as in a tileset; then the most frames, since a strip also splits into groups of frames.
    candidates.sort((a, b) => {
        const aSquare = pixels.width / a === pixels.height;
        const bSquare = pixels.width / b === pixels.height;
        return aSquare === bSquare ? b - a : aSquare ? -1 : 1;
    });
    return candidates.find((frameCount) => isAnimationStrip(pixels, frameCount));
}

function isAnimationStrip(pixels: ImagePixels, frameCount: number): boolean {
    const frameWidth = pixels.width / frameCount;
    let similaritySum = 0;
    let allIdentical = true;
    for (let frame = 1; frame < frameCount; frame++) {
        const { similarity, identical } = compareFrames(
            pixels,
            (frame - 1) * frameWidth,
            frame * frameWidth,
            frameWidth,
        );
        similaritySum += similarity;
        allIdentical &&= identical;
    }
    if (allIdentical || similaritySum / (frameCount - 1) < MIN_FRAME_SIMILARITY) {
        return false;
    }
    return seamContinuity(pixels, frameCount, frameWidth) <= MAX_SEAM_CONTINUITY;
}

/** Overlap (intersection over union) of the opaque pixels of two frames, and whether they are pixel-identical. */
function compareFrames(
    pixels: ImagePixels,
    firstX: number,
    secondX: number,
    frameWidth: number,
): { similarity: number; identical: boolean } {
    let union = 0;
    let intersection = 0;
    let identical = true;
    for (let y = 0; y < pixels.height; y++) {
        for (let x = 0; x < frameWidth; x++) {
            const first = (y * pixels.width + firstX + x) * 4;
            const second = (y * pixels.width + secondX + x) * 4;
            const firstOpaque = pixels.data[first + 3] >= OPAQUE_ALPHA;
            const secondOpaque = pixels.data[second + 3] >= OPAQUE_ALPHA;
            if (firstOpaque || secondOpaque) union++;
            if (firstOpaque && secondOpaque) intersection++;
            if (identical) {
                for (let channel = 0; channel < 4; channel++) {
                    if (pixels.data[first + channel] !== pixels.data[second + channel]) {
                        identical = false;
                        break;
                    }
                }
            }
        }
    }
    return { similarity: union === 0 ? 1 : intersection / union, identical };
}

/** Share of the rows, among those with something drawn on a frame border, where the drawing goes on in the next frame. */
function seamContinuity(pixels: ImagePixels, frameCount: number, frameWidth: number): number {
    let drawnRows = 0;
    let continuousRows = 0;
    for (let frame = 1; frame < frameCount; frame++) {
        const seamX = frame * frameWidth;
        for (let y = 0; y < pixels.height; y++) {
            const left = (y * pixels.width + seamX - 1) * 4;
            const right = left + 4;
            const leftOpaque = pixels.data[left + 3] >= OPAQUE_ALPHA;
            const rightOpaque = pixels.data[right + 3] >= OPAQUE_ALPHA;
            if (!leftOpaque && !rightOpaque) continue;
            drawnRows++;
            if (
                leftOpaque &&
                rightOpaque &&
                Math.abs(pixels.data[left] - pixels.data[right]) +
                    Math.abs(pixels.data[left + 1] - pixels.data[right + 1]) +
                    Math.abs(pixels.data[left + 2] - pixels.data[right + 2]) <
                    SAME_COLOR_TOLERANCE
            ) {
                continuousRows++;
            }
        }
    }
    return drawnRows === 0 ? 0 : continuousRows / drawnRows;
}
