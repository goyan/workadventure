import { isAtAreaLevel } from "./GameMap/GameMapAreas";
import { ENTITY_STATE_KEYS } from "./types";
import type { SwitchPropertyData, SwitchTargets } from "./types";

export type EntityStateKey = (typeof ENTITY_STATE_KEYS)[number];
export type EntityStateValue = "true" | "false";

/** An object the server knows nothing about is on: the maps made before the switches keep their lights. */
export const ENTITY_STATE_DEFAULT: EntityStateValue = "true";

/**
 * How far a switch reaches in "zone" mode, as the server checks it: 60 tiles, the largest light a lamp may have. The
 * front finds the room exactly; the server, which knows neither the size of the objects nor the raised floors, only
 * bounds the request.
 */
export const SWITCH_MAX_REACH_PX = 1920;

export function isEntityStateKey(key: string): key is EntityStateKey {
    return (ENTITY_STATE_KEYS as readonly string[]).includes(key);
}

export function isEntityStateValue(value: string): value is EntityStateValue {
    return value === "true" || value === "false";
}

/**
 * What a press on a switch sets its targets to, from their current states: everything off when one of them is on,
 * everything on otherwise (like a real panel). Undefined without target.
 */
export function alignedSwitchValue(current: readonly EntityStateValue[]): EntityStateValue | undefined {
    if (current.length === 0) {
        return undefined;
    }
    return current.includes("true") ? "false" : "true";
}

/** Whether the server lets a switch act on a target: listed in "ids" mode, close and on the same floor in "zone" mode. */
export function switchMayReach(
    switchEntity: { x: number; y: number; elevation?: number },
    target: { x: number; y: number; elevation?: number },
    targets: SwitchTargets,
    targetId: string,
): boolean {
    if (targets.mode === "ids") {
        return targets.ids.includes(targetId);
    }
    return (
        isAtAreaLevel(switchEntity, target.elevation ?? 0) &&
        Math.abs(target.x - switchEntity.x) <= SWITCH_MAX_REACH_PX &&
        Math.abs(target.y - switchEntity.y) <= SWITCH_MAX_REACH_PX
    );
}

/** Whether the switch is used without anybody touching it (a presence sensor, a timer). */
export function isAutomaticSwitch(property: SwitchPropertyData): boolean {
    return property.trigger !== undefined;
}

/**
 * The objects the server acts on for a switch with a trigger: the listed ones, or those the map editor resolved for a
 * switch that commands its room.
 */
export function automaticSwitchTargetIds(property: SwitchPropertyData): string[] {
    return property.targets.mode === "ids" ? property.targets.ids : (property.resolvedTargets ?? []);
}

const parisClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

/** Minutes since midnight in Paris: the timers of a map follow the time there, like its night. */
export function parisMinutesOfDay(date: Date): number {
    const parts = parisClock.formatToParts(date);
    const read = (type: "hour" | "minute"): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return read("hour") * 60 + read("minute");
}

function minutesOf(hour: string): number {
    const [hours, minutes] = hour.split(":");
    return Number(hours) * 60 + Number(minutes);
}

/**
 * Whether `minutes` (since midnight) is between `from`, included, and `to`, excluded, both as HH:MM. A range whose end
 * comes before its start passes midnight; an empty range (the same hour twice) never holds.
 */
export function isWithinHours(from: string, to: string, minutes: number): boolean {
    const start = minutesOf(from);
    const end = minutesOf(to);
    if (start === end) {
        return false;
    }
    return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Whether `point` is in a cone that starts at `origin`: within `reach` pixels, and within half of `angle` degrees on
 * each side of `direction` (degrees clockwise on the screen from the east, like the light of an RGB lamp). A cone of
 * 360 degrees is a disc; the origin itself is always in.
 */
export function isInCone(
    origin: { x: number; y: number },
    cone: { direction: number; angle: number; reach: number },
    point: { x: number; y: number },
): boolean {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (Math.hypot(dx, dy) > cone.reach) {
        return false;
    }
    if (cone.angle >= 360 || (dx === 0 && dy === 0)) {
        return true;
    }
    const bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
    const away = Math.abs(((((bearing - cone.direction) % 360) + 540) % 360) - 180);
    return away <= cone.angle / 2;
}
