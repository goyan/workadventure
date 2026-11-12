import type { PositionMessage_Direction } from "@workadventure/messages";
import { nerfGunPose } from "../Nerf/NerfProtocol";

/** Whether the player holds a torch: public and not saved, like the Nerf's (no change to the protocol nor the back). */
export const TORCH_EQUIPPED_VARIABLE = "_torchEquipped";
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

/** Where the flame is, from the position of the avatar: above the hand that would hold the Nerf. */
export function torchFlamePose(direction: PositionMessage_Direction, seated: boolean): { x: number; y: number } {
    const hand = nerfGunPose(direction);
    return { x: hand.x, y: hand.y - FLAME_ABOVE_HAND_PX - (seated ? SEATED_LIFT_PX : 0) };
}
