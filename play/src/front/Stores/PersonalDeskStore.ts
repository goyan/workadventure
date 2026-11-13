import { PersonalAreaAccessClaimMode, type AreaData } from "@workadventure/map-editor";
import { derived, writable } from "svelte/store";
import { userSeatedStore } from "./GameStore";

export const isInsidePersonalAreaStore = writable(false);

export const personalAreaDataStore = writable<AreaData | null>(null);

/**
 * What the "my desk" buttons do: find a free desk (none reserved on this map), walk to it, sit down (standing in it),
 * or nothing (seated in it: the seat is then inside the desk area).
 */
export const personalDeskModeStore = derived(
    [personalAreaDataStore, isInsidePersonalAreaStore, userSeatedStore],
    ([desk, inside, seated]): "find" | "walk" | "sit" | "seated" =>
        !desk ? "find" : !inside ? "walk" : seated ? "seated" : "sit",
);

export function canClaimPersonalDesk(area: AreaData, loggedIn: boolean, hasTag: (tag: string) => boolean): boolean {
    const property = area.properties.find((property) => property.type === "personalAreaPropertyData");
    return (
        loggedIn &&
        property !== undefined &&
        property.ownerId === null &&
        property.accessClaimMode === PersonalAreaAccessClaimMode.enum.dynamic &&
        (property.allowedTags.length === 0 || property.allowedTags.some(hasTag))
    );
}
