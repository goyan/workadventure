import type { PositionMessage_Direction } from "@workadventure/messages";
import { nerfGunPose } from "../Nerf/NerfProtocol";

/** Whether the player holds a torch: public and not saved, like the Nerf's (no change to the protocol nor the back). */
export const TORCH_EQUIPPED_VARIABLE = "_torchEquipped";
/**
 * How bright the player set their torch, in percent: a second variable, public and not saved, so that an older client
 * keeps reading `_torchEquipped` as before (and ignores this one).
 */
export const TORCH_INTENSITY_VARIABLE = "_torchIntensity";
/** The intensity of a torch goes from 10 % to the full 100 %, by steps of 10 %. */
export const TORCH_INTENSITY_MIN = 10;
export const TORCH_INTENSITY_MAX = 100;
export const TORCH_INTENSITY_STEP = 10;
/** How far the light of a torch reaches, in tiles. */
export const TORCH_RADIUS_TILES = 5.5;
/** A warm orange. */
export const TORCH_COLOUR = 0xff8a2a;
/** From the hand to the flame, upwards: the torch is held upright. */
const FLAME_ABOVE_HAND_PX = 9;
/** A seated avatar holds things 4 px higher (see NerfGunEffect). */
const SEATED_LIFT_PX = 4;

/** Another player's torch, from their player variable: only `true` lights one. */
export function decodeTorchEquipped(value: unknown): boolean {
    return value === true;
}

/**
 * The intensity of a torch, in percent, from a player variable or the browser: an older client never sets it, and
 * anything but a finite number is the full intensity. A number is kept within the range, on the nearest step.
 */
export function decodeTorchIntensity(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return TORCH_INTENSITY_MAX;
    }
    const step = Math.round(value / TORCH_INTENSITY_STEP) * TORCH_INTENSITY_STEP;
    return Math.max(TORCH_INTENSITY_MIN, Math.min(TORCH_INTENSITY_MAX, step));
}

/** Where the flame is, from the position of the avatar: above the hand that would hold the Nerf. */
export function torchFlamePose(direction: PositionMessage_Direction, seated: boolean): { x: number; y: number } {
    const hand = nerfGunPose(direction);
    return { x: hand.x, y: hand.y - FLAME_ABOVE_HAND_PX - (seated ? SEATED_LIFT_PX : 0) };
}
