import type { EntityDataProperty } from "@workadventure/map-editor";

/**
 * Whether the property gives the entity something to activate (the "press SPACE" prompt and its actions menu). An empty
 * description does not.
 */
export function makesEntityActivatable(property: EntityDataProperty | undefined | null): boolean {
    if (property === undefined || property === null) {
        return false;
    }
    if (property.type === "entityDescriptionProperties" && property.description === "") {
        return false;
    }
    return true;
}
