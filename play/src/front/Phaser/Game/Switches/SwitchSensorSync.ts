import type { SwitchPropertyData } from "@workadventure/map-editor";

function sameIds(stored: readonly string[] | undefined, found: readonly string[]): boolean {
    if (stored === undefined || stored.length !== found.length) {
        return false;
    }
    const ids = new Set(stored);
    return found.every((id) => ids.has(id));
}

/**
 * What the map editor must store in a switch that has a trigger, for the server: the room found for a sensor of its
 * room (`trigger.areaId`), and the lamps of a switch that commands its room (`resolvedTargets`). The server knows
 * neither the size of the objects nor what a lamp is: it acts on what is stored here. Returns the property to save,
 * or undefined when what is stored is right.
 *
 * `roomAreaId` is the smallest area of its floor the switch stands in, if any; `resolvedTargetIds` the objects it
 * commands now.
 */
export function syncedSensorProperty(
    property: SwitchPropertyData,
    roomAreaId: string | undefined,
    resolvedTargetIds: readonly string[],
): SwitchPropertyData | undefined {
    const { trigger } = property;
    if (!trigger) {
        return undefined;
    }
    let synced = property;
    if (trigger.type === "presence" && trigger.scope === "room" && trigger.areaId !== roomAreaId) {
        synced = { ...synced, trigger: { ...trigger, areaId: roomAreaId } };
    }
    if (property.targets.mode === "zone") {
        if (!sameIds(property.resolvedTargets, resolvedTargetIds)) {
            synced = { ...synced, resolvedTargets: [...resolvedTargetIds] };
        }
    } else if (property.resolvedTargets !== undefined) {
        // The list of the switch is what the server reads.
        synced = { ...synced, resolvedTargets: undefined };
    }
    return synced === property ? undefined : synced;
}
