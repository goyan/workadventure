import * as Phaser from "phaser";
import { refreshCanvasTexture } from "../CanvasTextureRefresh";

/** What a block of the terrain is shown on: an image of the scene, and the texture its pixels are sent to. */
export interface ReliefSurface {
    readonly image: Phaser.GameObjects.Image;
    /** Shows these pixels (RGBA, the size the surface was made with) instead of the ones it showed. */
    show(pixels: Uint8ClampedArray): void;
    destroy(): void;
}

/**
 * The buffers the pixels go through on their way to the graphics card, one a size of block (64, 128 or 256 points
 * across). Phaser keeps a reference to the array a texture was made from: through a shared one, it keeps none a
 * block, and a block has one copy only, on the graphics card. After the WebGL context is lost and restored, Phaser
 * fills every texture again from that array (the last block shown): the blocks are then all drawn again (ReliefTiles).
 */
const scratches = new Map<number, Uint8Array>();

function scratchOf(size: number): Uint8Array {
    let scratch = scratches.get(size);
    if (!scratch) {
        scratch = new Uint8Array(size * size * 4);
        scratches.set(size, scratch);
    }
    return scratch;
}

/** What the surface needs of the texture of a block made from pixels (Phaser.Textures.Texture, WebGL). */
interface PixelTexture {
    key: string;
    source: {
        glTexture: {
            flipY: boolean;
            wrapS: number;
            wrapT: number;
            minFilter: number;
            magFilter: number;
            format: number;
            update(
                pixels: Uint8Array,
                width: number,
                height: number,
                flipY: boolean,
                wrapS: number,
                wrapT: number,
                minFilter: number,
                magFilter: number,
                format: number,
            ): void;
        };
    }[];
    destroy(): void;
}

/**
 * Makes the surface of a block and shows its first pixels: `size` points across and down, shown over `displaySize`
 * px of the map from (`left`, `top`), never smoothed (pixel art). With WebGL the pixels go straight to a texture of
 * the graphics card; without, to a canvas. Undefined when the texture cannot be made (its name is taken).
 */
export function createReliefSurface(
    scene: Phaser.Scene,
    name: string,
    left: number,
    top: number,
    size: number,
    displaySize: number,
    depth: number,
    pixels: Uint8ClampedArray,
): ReliefSurface | undefined {
    const place = (key: string): Phaser.GameObjects.Image =>
        scene.add.image(left, top, key).setOrigin(0, 0).setDisplaySize(displaySize, displaySize).setDepth(depth);
    // `sys` is absent from the scenes of the tests that draw on a canvas.
    const renderer = (scene.sys as Phaser.Scenes.Systems | undefined)?.game?.renderer;
    if (renderer?.type === Phaser.WEBGL) {
        const scratch = scratchOf(size);
        scratch.set(pixels);
        // Made by Phaser with the nearest filter, without mipmaps: pixel art.
        const texture = scene.textures.addUint8Array(name, scratch, size, size) as unknown as PixelTexture | null;
        if (!texture) return undefined;
        const image = place(texture.key);
        return {
            image,
            show(next: Uint8ClampedArray): void {
                const gl = texture.source[0].glTexture;
                scratch.set(next);
                gl.update(scratch, size, size, gl.flipY, gl.wrapS, gl.wrapT, gl.minFilter, gl.magFilter, gl.format);
            },
            destroy(): void {
                image.destroy();
                texture.destroy();
            },
        };
    }
    const texture = scene.textures.createCanvas(name, size, size);
    if (!texture) return undefined;
    // Pixel art: each point of the block is drawn as it is, never smoothed.
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const draw = (next: Uint8ClampedArray): void => {
        const context = texture.getContext();
        const data = context.createImageData(size, size);
        data.data.set(next);
        context.putImageData(data, 0, 0);
        refreshCanvasTexture(texture);
    };
    draw(pixels);
    const image = place(texture.key);
    return {
        image,
        show: draw,
        destroy(): void {
            image.destroy();
            texture.destroy();
        },
    };
}
