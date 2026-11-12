import {
    RGB_LAMP_DEFAULT_ROTATION_SPEED,
    RGB_LAMP_MAX_ANGLE,
    RGB_LAMP_MAX_ROTATION_SPEED,
    RGB_LAMP_MIN_ROTATION_SPEED,
} from "@workadventure/map-editor";
import type { RgbLampSettings } from "./RgbLampSettings";

const MS_PER_MINUTE = 60_000;

/** How long one turn takes, in milliseconds, at a speed in turns a minute kept within its bounds. */
export function rotationPeriodMs(speed: number | undefined): number {
    const turns = speed !== undefined && Number.isFinite(speed) ? speed : RGB_LAMP_DEFAULT_ROTATION_SPEED;
    return MS_PER_MINUTE / Math.min(RGB_LAMP_MAX_ROTATION_SPEED, Math.max(RGB_LAMP_MIN_ROTATION_SPEED, turns));
}

/**
 * Whether the beam of a lamp moves: it was set to turn, it is not a full disc (a full disc that turns shows nothing),
 * and the lamp is not held `still` (reduced motion, or the map editor open: the handles stay on the beam).
 */
export function isTurning(settings: RgbLampSettings, still: boolean): boolean {
    return settings.rotation === true && settings.angle < RGB_LAMP_MAX_ANGLE && !still;
}

/**
 * Where the beam of a lamp points at a time, in degrees from 0 to 360, clockwise on the screen from the east. A turning
 * lamp goes round from the clock alone, with no message on the network: every player whose clock is right sees the
 * same beam at the same time. `time` is in milliseconds since the Unix epoch; at every whole turn since then the beam
 * points to the `direction` that was set, which is its phase. A lamp that does not turn points to its direction.
 */
export function rgbLampBeamDirection(settings: RgbLampSettings, time: number, still: boolean): number {
    if (!isTurning(settings, still)) {
        return settings.direction;
    }
    const period = rotationPeriodMs(settings.rotationSpeed);
    // The part of the current turn first, then the angle: exact even with a time of these years (about 1.8e12).
    const part = (((time % period) + period) % period) / period;
    const sense = settings.rotationClockwise === false ? -1 : 1;
    const direction = (settings.direction + sense * 360 * part) % 360;
    return direction < 0 ? direction + 360 : direction;
}
