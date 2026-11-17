/** A picture of the game (a frame of a texture) as a canvas can draw it. `key` changes whenever the picture does. */
export interface ShadowPicture {
    key: string;
    /** What the texture holds: an image, a canvas… (see drawableSource). */
    source: unknown;
    cutX: number;
    cutY: number;
    cutWidth: number;
    cutHeight: number;
}

/** How a shadow is drawn: a plain oval, or the true silhouette of what throws it. */
export type ShadowShape = "oval" | "realistic";

/** What a browser can draw on a canvas, among what a texture of the game may hold; undefined otherwise. */
export function drawableSource(source: unknown): CanvasImageSource | undefined {
    if (
        (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
        (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) ||
        (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap)
    ) {
        return source;
    }
    return undefined;
}
