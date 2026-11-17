import { SWITCH_MAX_TARGETS, SwitchTrigger } from "@workadventure/map-editor";
import type { EntityDataProperties, EntityPrefab, SwitchPropertyData } from "@workadventure/map-editor";

/**
 * A click on an object while a switch is being wired in the map editor: the switch commands it from now on, or no
 * longer does. A switch that commanded its room starts a list. Nothing is added once the list is full.
 */
export function toggleSwitchTarget(property: SwitchPropertyData, entityId: string): SwitchPropertyData {
    const ids = property.targets.mode === "ids" ? property.targets.ids : [];
    if (ids.includes(entityId)) {
        return { ...property, targets: { mode: "ids", ids: ids.filter((id) => id !== entityId) } };
    }
    if (ids.length >= SWITCH_MAX_TARGETS) {
        return { ...property, targets: { mode: "ids", ids: [...ids] } };
    }
    return { ...property, targets: { mode: "ids", ids: [...ids, entityId] } };
}

/**
 * The wiring of a switch that was copied: a target copied with it (`copiedIds`: the id of the original to the id of
 * its copy) is commanded through its copy, any other target is let go, so that a copied room never switches the lamps
 * of the room it was copied from. What the map editor stored for the original (the room of a sensor of its room, the
 * lamps of that room) is forgotten too: the editor finds them again where the copy stands (see syncedSensorProperty).
 */
export function rewireSwitch(property: SwitchPropertyData, copiedIds: ReadonlyMap<string, string>): SwitchPropertyData {
    let rewired = property;
    if (property.resolvedTargets !== undefined) {
        rewired = { ...rewired, resolvedTargets: undefined };
    }
    const { trigger } = property;
    if (trigger?.type === "presence" && trigger.scope === "room" && trigger.areaId !== undefined) {
        rewired = { ...rewired, trigger: { ...trigger, areaId: undefined } };
    }
    if (property.targets.mode !== "ids") {
        return rewired;
    }
    const ids = property.targets.ids.flatMap((id) => {
        const copy = copiedIds.get(id);
        return copy === undefined ? [] : [copy];
    });
    return { ...rewired, targets: { mode: "ids", ids } };
}

/** The properties of a copied object, its switch rewired (see rewireSwitch). */
export function rewireSwitchProperties(
    properties: EntityDataProperties | undefined,
    copiedIds: ReadonlyMap<string, string>,
): EntityDataProperties | undefined {
    return properties?.map((property) =>
        property.type === "switchPropertyData" ? rewireSwitch(property, copiedIds) : property,
    );
}

/** A presence sensor on the room of the switch, with the defaults (30 s). */
export function roomPresenceTrigger(): SwitchTrigger {
    return SwitchTrigger.parse({ type: "presence", scope: "room" });
}

/** A presence sensor around the switch, with the defaults (3 tiles, 30 s). */
export function proximityPresenceTrigger(): SwitchTrigger {
    return SwitchTrigger.parse({ type: "presence", scope: "proximity" });
}

/** A timer for the night, with the defaults. */
export function hoursTrigger(): SwitchTrigger {
    return { type: "hours", from: "18:00", to: "08:00" };
}

/**
 * The properties an object placed from the catalog starts with: one whose catalog entry says `switch` commands the
 * lamps of its room at once, without anything to set — by hand (`true`), as a presence sensor of its room
 * (`"presence"`) or as a timer (`"hours"`).
 */
export function newSwitchProperties(prefab: Pick<EntityPrefab, "switch">, newId: () => string): EntityDataProperties {
    if (prefab.switch === undefined || prefab.switch === false) {
        return [];
    }
    const property: SwitchPropertyData = {
        id: newId(),
        type: "switchPropertyData",
        key: "on",
        targets: { mode: "zone" },
    };
    if (prefab.switch === "presence") {
        property.trigger = roomPresenceTrigger();
    } else if (prefab.switch === "hours") {
        property.trigger = hoursTrigger();
    }
    return [property];
}

/**
 * A lamp that carries its own sensor: it lights itself when somebody is within 3 tiles, and goes out 30 s after
 * they left. It can be given other lamps to command, like any switch.
 */
export function selfSensorProperty(lampId: string, newId: () => string): SwitchPropertyData {
    return {
        id: newId(),
        type: "switchPropertyData",
        key: "on",
        targets: { mode: "ids", ids: [lampId] },
        trigger: proximityPresenceTrigger(),
    };
}
