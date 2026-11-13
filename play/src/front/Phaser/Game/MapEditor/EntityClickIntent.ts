import type { EntityPrefab } from "@workadventure/map-editor";

type Layered = Pick<EntityPrefab, "layer">;

/**
 * Whether a click on an object of the map selects it (its properties open) rather than placing the picked object.
 * A click on an object edits it, even while an object is picked to be placed, so that the object just placed can be
 * edited at once. Objects are still placed on floor objects (a chair on a rug), and over anything while Shift is held.
 */
export function clickSelectsEntity(picked: Layered | undefined, clicked: Layered, shiftDown: boolean): boolean {
    if (!picked) {
        return true;
    }
    if (shiftDown) {
        return false;
    }
    return clicked.layer !== "floor" || picked.layer === "floor";
}
