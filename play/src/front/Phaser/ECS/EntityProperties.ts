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
