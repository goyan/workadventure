import { NERF_DART_RANGE_PX, NERF_DART_SPEED_PX_S } from "@workadventure/map-editor";
import { PositionMessage_Direction } from "@workadventure/messages";
import { z } from "zod";
import { cardinalVehicleHeading, vehicleHeading, VEHICLE_DIRECTIONS } from "../../Vehicle/VehicleFrames";
import type { MapPoint } from "../../UserInput/PointerAim";
import { NERF_MAX_THIRDS } from "./NerfHearts";

export const NERF_EQUIPPED_VARIABLE = "_nerfEquipped";
export const NERF_SHOT_EVENT = "infogene.nerf.shot";
/** Thirds of heart left (0 to 15), public and not saved, unset while the Nerf is put away. */
export const NERF_HEARTS_VARIABLE = "_nerfHearts";
export const NERF_SOUND_KEY = "audio-nerf-pop";
export const NERF_SOUND_URL = "/resources/objects/nerf/pop.wav";
export const NERF_MAX_VOLUME = 0.7;
export const NERF_COOLDOWN_MS = 300;
/** Px/s and px: the same as the darts the horde of zombies is shot with (ZombieDart). */
export const NERF_SPEED = NERF_DART_SPEED_PX_S;
export const NERF_RANGE = NERF_DART_RANGE_PX;
export const NERF_HEARING_DISTANCE = 256;
/** From the grip to the end of the barrel: the dart leaves there. */
export const NERF_MUZZLE_LENGTH = 10;
/** A shot at the pointer keeps the blaster aimed this long at least, even if the avatar walks on meanwhile. */
export const NERF_AIM_HOLD_MS = 500;

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
    /**
     * A shot at the pointer: the angle of the barrel on the map (radians, 0 towards the east, growing towards the
     * south). Absent from a shot fired the way the avatar moves or faces, and unknown to older browsers, which fire
     * along `heading` (the nearest of its eight directions) instead.
     */
    angle: z.number().finite().min(-Math.PI).max(Math.PI).optional(),
    /**
     * The dart this shot sent into the horde of zombies, as the server was told it (whole map pixels, the step of the
     * horde): the browsers stop it where the log says it met a zombie. Absent when none was sent.
     */
    zombieDart: z
        .object({
            fromX: z.number().int(),
            fromY: z.number().int(),
            toX: z.number().int(),
            toY: z.number().int(),
            shotStep: z.number().int().min(0),
        })
        .optional(),
    direction: z.union([
        z.literal(PositionMessage_Direction.UP),
        z.literal(PositionMessage_Direction.RIGHT),
        z.literal(PositionMessage_Direction.DOWN),
        z.literal(PositionMessage_Direction.LEFT),
    ]),
});

export type NerfShot = z.infer<typeof shotSchema>;

const heartsSchema = z.number().int().min(0).max(NERF_MAX_THIRDS);

/** The thirds of heart another player publishes; undefined when unset or invalid. */
export function decodeNerfHearts(value: unknown): number | undefined {
    const parsed = heartsSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
}

export function decodeNerfShot(name: string, data: unknown): NerfShot | undefined {
    if (name !== NERF_SHOT_EVENT) return undefined;
    const parsed = shotSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}

/** Hand position and barrel heading, shared by the accessory and the projectile's muzzle; `angle` aims the barrel. */
export function nerfGunPose(
    direction: PositionMessage_Direction,
    heading = cardinalVehicleHeading(direction),
    angle?: number,
): {
    x: number;
    y: number;
    dx: number;
    dy: number;
    angle: number;
} {
    let dx: number;
    let dy: number;
    if (angle === undefined) {
        dx = Math.round(-Math.sin((heading * Math.PI) / 4));
        dy = Math.round(Math.cos((heading * Math.PI) / 4));
        const length = Math.hypot(dx, dy);
        dx /= length;
        dy /= length;
    } else {
        dx = Math.cos(angle);
        dy = Math.sin(angle);
    }
    return {
        // The grip sits in the hand, at the side the avatar faces, low on the body.
        x: direction === PositionMessage_Direction.LEFT ? -5 : 5,
        y: direction === PositionMessage_Direction.UP ? -3 : direction === PositionMessage_Direction.DOWN ? 7 : 5,
        dx,
        dy,
        angle: angle ?? Math.atan2(dy, dx),
    };
}

/** A shot at a point of the map: the way the avatar turns to face it, and the barrel from the hand through it. */
export interface NerfAim {
    direction: NerfShot["direction"];
    /** The nearest of the eight headings, for the browsers that do not know `angle`. */
    heading: number;
    angle: number;
}

/**
 * Aims the Nerf of an avatar standing at `from` at a point of the map: it faces the side of the point, and the dart
 * leaves its hand straight through the point (and on, as far as a dart flies). Undefined when the point is within
 * the barrel, on the avatar itself: the shot then goes the way the avatar moves or faces.
 */
export function nerfAimAt(from: MapPoint, target: MapPoint, seated: boolean): NerfAim | undefined {
    const towardX = target.x - from.x;
    const towardY = target.y - from.y;
    const direction =
        Math.abs(towardX) >= Math.abs(towardY)
            ? towardX < 0
                ? PositionMessage_Direction.LEFT
                : PositionMessage_Direction.RIGHT
            : towardY < 0
              ? PositionMessage_Direction.UP
              : PositionMessage_Direction.DOWN;
    const hand = nerfGunPose(direction);
    const dx = target.x - (from.x + hand.x);
    const dy = target.y - (from.y + hand.y - (seated ? 4 : 0));
    if (Math.hypot(dx, dy) <= NERF_MUZZLE_LENGTH) return undefined;
    // To the thousandth of a radian (under half a pixel at the end of the flight): shorter to send.
    const angle = Math.max(-Math.PI, Math.min(Math.PI, Math.round(Math.atan2(dy, dx) * 1000) / 1000));
    return { direction, heading: vehicleHeading(dx, dy), angle };
}

/** The angle a Nerf was last fired at, held by its avatar for a while. */
export interface NerfHeldAim {
    angle: number;
    /** The way the shot faced. */
    direction: PositionMessage_Direction;
    /** Where the avatar stood, and when (scene time). */
    x: number;
    y: number;
    at: number;
    /** The avatar has faced the shot (another player's turn may reach this browser after the shot). */
    faced: boolean;
}

/**
 * Whether an avatar still aims its Nerf where it last fired: until it turns away from the shot, or, after
 * NERF_AIM_HOLD_MS, until it walks off or has not turned to face the shot.
 */
export function nerfAimHeld(
    held: NerfHeldAim,
    avatar: { x: number; y: number; direction: PositionMessage_Direction },
    now: number,
): boolean {
    const facing = avatar.direction === held.direction;
    if (held.faced && !facing) return false;
    if (
        now - held.at > NERF_AIM_HOLD_MS &&
        (!facing || Math.abs(avatar.x - held.x) >= 2 || Math.abs(avatar.y - held.y) >= 2)
    ) {
        return false;
    }
    held.faced ||= facing;
    return true;
}
