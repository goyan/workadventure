import type * as Phaser from "phaser";
import { TILE_PX } from "@workadventure/map-editor";
import { treePixelPart } from "./SnowyTreeTexture";

/** Where the foot of a tree is in its image: a tile right of its left edge, two tiles under its top (LandTrees). */
export const TREE_FOOT = { x: TILE_PX, y: 2 * TILE_PX };
/** A tree growing back is drawn at one of these many sizes. */
export const GROW_STEPS = 8;
/** The size a tree grows back from, a share of its own: a sapling. */
const SAPLING_SHARE = 0.15;
/** The stump left standing: the trunk this far above the foot (pixels of the image). */
const STUMP_PX = 6;

/** The size step a tree growing back is drawn at, from 1 (a sapling) to GROW_STEPS (as before). */
export function growStep(grown: number): number {
    if (!Number.isFinite(grown)) return GROW_STEPS;
    return Math.min(GROW_STEPS, Math.max(1, Math.ceil(grown * GROW_STEPS)));
}

/** The share of its own size a tree is drawn at, at a size step. */
export function growShare(step: number): number {
    return SAPLING_SHARE + ((1 - SAPLING_SHARE) * Math.min(GROW_STEPS, Math.max(1, step))) / GROW_STEPS;
}

/** The pixels of an image of a tree into a new canvas texture, drawn by `draw`; the key if made or kept. */
function madeTexture(
    scene: Phaser.Scene,
    sourceKey: string,
    key: string,
    draw: (
        context: CanvasRenderingContext2D,
        source: CanvasImageSource,
        cut: { x: number; y: number; width: number; height: number },
    ) => void,
): string | undefined {
    if (scene.textures.exists(key)) return key;
    if (!scene.textures.exists(sourceKey)) return undefined;
    const frame = scene.textures.getFrame(sourceKey);
    const source = frame?.source.image as CanvasImageSource | undefined;
    if (!frame || !source) return undefined;
    const cut = { x: frame.cutX, y: frame.cutY, width: frame.cutWidth, height: frame.cutHeight };
    const canvas = scene.textures.createCanvas(key, cut.width, cut.height);
    const context = canvas?.getContext();
    if (!canvas || !context) return undefined;
    context.imageSmoothingEnabled = false;
    draw(context, source, cut);
    canvas.refresh();
    return key;
}

/**
 * What stands of a tree the wind laid down: the bottom of its trunk at its foot and its shadow, the rest cleared (the
 * tree itself lies on the ground, drawn apart: FallenTreeView).
 */
export function stumpTexture(scene: Phaser.Scene, sourceKey: string): string | undefined {
    return madeTexture(scene, sourceKey, `tree-stump:${sourceKey}`, (context, source, cut) => {
        context.drawImage(source, cut.x, cut.y, cut.width, cut.height, 0, 0, cut.width, cut.height);
        const image = context.getImageData(0, 0, cut.width, cut.height);
        const pixels = image.data;
        for (let row = 0; row < cut.height; row++) {
            for (let column = 0; column < cut.width; column++) {
                const at = (row * cut.width + column) * 4;
                const pixel: [number, number, number, number] = [
                    pixels[at],
                    pixels[at + 1],
                    pixels[at + 2],
                    pixels[at + 3],
                ];
                const part = treePixelPart(pixel, row / cut.height);
                const kept = row >= TREE_FOOT.y - STUMP_PX && part === "wood";
                if (!kept) pixels[at + 3] = 0;
            }
        }
        context.putImageData(image, 0, 0);
    });
}

/** A tree growing back, at a size step: its own image smaller, its foot where it was. */
export function growingTreeTexture(scene: Phaser.Scene, sourceKey: string, step: number): string | undefined {
    const at = Math.min(GROW_STEPS, Math.max(1, Math.round(step)));
    if (at >= GROW_STEPS) return scene.textures.exists(sourceKey) ? sourceKey : undefined;
    const share = growShare(at);
    return madeTexture(scene, sourceKey, `tree-grow:${sourceKey}:${at}`, (context, source, cut) => {
        const width = Math.max(1, Math.round(cut.width * share));
        const height = Math.max(1, Math.round(cut.height * share));
        const left = Math.round(TREE_FOOT.x - TREE_FOOT.x * share);
        const top = Math.round(TREE_FOOT.y - TREE_FOOT.y * share);
        context.drawImage(source, cut.x, cut.y, cut.width, cut.height, left, top, width, height);
    });
}
