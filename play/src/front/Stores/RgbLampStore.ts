import { writable } from "svelte/store";
import type { RgbLampSettings } from "../Phaser/Game/Lamps/RgbLampSettings";

/** The light of an RGB lamp as it is drawn now: a square of the map, and the texture that holds its shape. */
export interface RgbLampLight {
    /** The id of the object that carries the lamp. */
    id: string;
    /** Top-left corner and side of the square the texture covers, in map pixels. */
    x: number;
    y: number;
    size: number;
    textureKey: string;
    /** Changes whenever the texture is drawn again: the shape of the light changed, though it may not have moved. */
    revision: number;
}

/**
 * The lights of the RGB lamps of the map, as they are drawn: the night veil is pierced with the same shapes, so that a
 * lamp lights the same by day and by night.
 */
export const rgbLampLightsStore = writable<readonly RgbLampLight[]>([]);

/**
 * The settings of the RGB lamp being set in the map editor, before they are saved: the lamp shows them while a handle
 * or a slider is dragged.
 */
export const rgbLampPreviewStore = writable<{ entityId: string; settings: RgbLampSettings } | undefined>(undefined);
