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
        !sameLit(frame.lit, previous.lit)
    ) {
        return "draw";
    }
    return "keep";
}
