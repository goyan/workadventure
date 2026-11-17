import { SWITCH_MAX_TARGETS } from "@workadventure/map-editor";
import type { EntityDataProperties, SwitchPropertyData } from "@workadventure/map-editor";

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
 * of the room it was copied from.
 */
export function rewireSwitch(property: SwitchPropertyData, copiedIds: ReadonlyMap<string, string>): SwitchPropertyData {
    if (property.targets.mode !== "ids") {
        return property;
    }
    const ids = property.targets.ids.flatMap((id) => {
        const copy = copiedIds.get(id);
        return copy === undefined ? [] : [copy];
    });
    return { ...property, targets: { mode: "ids", ids } };
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
