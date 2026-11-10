import { PositionMessage_Direction } from "@workadventure/messages";
import { z } from "zod";
import { cardinalVehicleHeading, VEHICLE_DIRECTIONS } from "../../Vehicle/VehicleFrames";

export const NERF_EQUIPPED_VARIABLE = "_nerfEquipped";
export const NERF_SHOT_EVENT = "infogene.nerf.shot";
export const NERF_SOUND_KEY = "audio-nerf-pop";
export const NERF_SOUND_URL = "/resources/objects/nerf/pop.wav";
export const NERF_MAX_VOLUME = 0.7;
export const NERF_COOLDOWN_MS = 300;
export const NERF_SPEED = 320;
export const NERF_RANGE = 384;
export const NERF_HEARING_DISTANCE = 256;

const shotSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    seated: z.boolean().default(false),
    heading: z
        .number()
        .int()
        .min(0)
        .max(VEHICLE_DIRECTIONS - 1)
        .optional(),
    direction: z.union([
        z.literal(PositionMessage_Direction.UP),
        z.literal(PositionMessage_Direction.RIGHT),
        z.literal(PositionMessage_Direction.DOWN),
        z.literal(PositionMessage_Direction.LEFT),
    ]),
});

export type NerfShot = z.infer<typeof shotSchema>;

export function decodeNerfShot(name: string, data: unknown): NerfShot | undefined {
    if (name !== NERF_SHOT_EVENT) return undefined;
    const parsed = shotSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}

/** Hand position and barrel heading, shared by the accessory and the projectile's muzzle. */
export function nerfGunPose(
    direction: PositionMessage_Direction,
    heading = cardinalVehicleHeading(direction),
): {
    x: number;
    y: number;
    dx: number;
    dy: number;
    angle: number;
} {
    const dx = Math.round(-Math.sin((heading * Math.PI) / 4));
    const dy = Math.round(Math.cos((heading * Math.PI) / 4));
    const length = Math.hypot(dx, dy);
    return {
        x: direction === PositionMessage_Direction.LEFT ? -7 : 7,
        y: direction === PositionMessage_Direction.UP ? -9 : direction === PositionMessage_Direction.DOWN ? 1 : -1,
        dx: dx / length,
        dy: dy / length,
        angle: Math.atan2(dy, dx),
    };
}
