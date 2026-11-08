import type { AlphaMask, SnowEntity } from "../Christmas/SnowCaps";

/** Reads the alpha of an entity's frame through a canvas. Throws when the browser refuses (CORS). */
export function readFrameAlpha(scene: Phaser.Scene): (entity: SnowEntity) => AlphaMask | undefined {
    return (entity) => {
        const frame = scene.textures.getFrame(entity.texture.key, entity.frame.name);
        const source = frame?.source.image;
        if (!frame || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return undefined;
        const { cutX, cutY, cutWidth: width, cutHeight: height } = frame;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return undefined;
        context.drawImage(source, cutX, cutY, width, height, 0, 0, width, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const alpha = new Uint8ClampedArray(width * height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
        return { width, height, alpha };
    };
}
