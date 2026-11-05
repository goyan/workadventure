import type { EntityDataProperties, EntityDataProperty } from "@workadventure/map-editor";

/**
 * Puts the property in place of the one with the same id, as is: no merge, so an array shrinks and an optional field
 * set to undefined goes away. Returns false when no property has this id.
 */
export function replaceEntityProperty(properties: EntityDataProperties, property: EntityDataProperty): boolean {
    const index = properties.findIndex((candidate) => candidate.id === property.id);
    if (index === -1) {
        return false;
    }
    properties[index] = property;
    return true;
}

/**
 * Whether the property gives the entity something to activate (the "press SPACE" prompt and its actions menu). An empty
 * description does not, nor a Gobeur, which has its own menu in the map editor and no action for the players.
 */
export function makesEntityActivatable(property: EntityDataProperty | undefined | null): boolean {
    if (property === undefined || property === null) {
        return false;
    }
    if (property.type === "entityDescriptionProperties" && property.description === "") {
        return false;
    }
    return property.type !== "gobeurPropertyData";
}
