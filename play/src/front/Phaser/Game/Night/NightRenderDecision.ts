import type { RgbLampLight } from "../../../Stores/RgbLampStore";
import type { Halo } from "./NightHalos";
import type { LitArea } from "./NightLights";

/** The part of the world shown by the camera (world pixels) and its zoom. */
export interface NightView {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
}

/** Everything the night veil depends on for one frame. */
export interface NightFrame {
    opacity: number;
    editorOpen: boolean;
    disabled: boolean;
    view: NightView;
    lit: readonly LitArea[];
    halos: readonly Halo[];
    /** The lights of the RGB lamps: the veil is pierced with their shape (see NightOverlay). */
    lamps: readonly RgbLampLight[];
    /** An area is fading or a halo is moving or changing radius: the veil changes again next frame. */
    fading: boolean;
}

export type NightRenderAction = "hidden" | "keep" | "draw";

function isHidden(frame: NightFrame): boolean {
    return frame.opacity === 0 || frame.editorOpen || frame.disabled;
}

function sameView(a: NightView, b: NightView): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.zoom === b.zoom;
}

function sameLit(a: readonly LitArea[], b: readonly LitArea[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((area, index) => {
        const other = b[index];
        return (
            area.id === other.id &&
            area.intensity === other.intensity &&
            area.x === other.x &&
            area.y === other.y &&
            area.width === other.width &&
            area.height === other.height
        );
    });
}

function sameHalos(a: readonly Halo[], b: readonly Halo[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((halo, index) => {
        const other = b[index];
        return halo.id === other.id && halo.x === other.x && halo.y === other.y && halo.radius === other.radius;
    });
}

function sameLamps(a: readonly RgbLampLight[], b: readonly RgbLampLight[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((lamp, index) => {
        const other = b[index];
        return (
            lamp.id === other.id &&
            lamp.revision === other.revision &&
            lamp.x === other.x &&
            lamp.y === other.y &&
            lamp.size === other.size &&
            lamp.textureKey === other.textureKey
        );
    });
}

/**
 * What to do with the night veil this frame: "hidden" (day, map editor open, or night turned off),
 * "keep" (nothing changed since `previous`, the texture already shows the right thing), or "draw".
 */
export function nightRenderAction(frame: NightFrame, previous: NightFrame | undefined): NightRenderAction {
    if (isHidden(frame)) {
        return "hidden";
    }
    if (
        previous === undefined ||
        isHidden(previous) ||
        frame.fading ||
        frame.opacity !== previous.opacity ||
        !sameView(frame.view, previous.view) ||
        !sameLit(frame.lit, previous.lit) ||
        !sameHalos(frame.halos, previous.halos) ||
        !sameLamps(frame.lamps, previous.lamps)
    ) {
        return "draw";
    }
    return "keep";
}
