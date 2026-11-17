import { isAtAreaLevel } from "./GameMap/GameMapAreas";
import { ENTITY_STATE_KEYS, SwitchPropertyData } from "./types";
import type { SwitchTargets } from "./types";

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

/**
 * The switch among the properties of an object, checked against its schema and with its defaults. The properties of
 * a map that is being edited are what the last edit command carried, which nothing validates: a switch that is not
 * well formed is ignored here rather than read by the code that runs at every image or every second.
 */
export function switchPropertyIn(properties: readonly unknown[] | undefined): SwitchPropertyData | undefined {
    const raw = properties?.find(
        (property) =>
            typeof property === "object" &&
            property !== null &&
            "type" in property &&
            property.type === "switchPropertyData",
    );
    if (raw === undefined) {
        return undefined;
    }
    const parsed = SwitchPropertyData.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
}
