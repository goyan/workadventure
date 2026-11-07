import { PersonalAreaAccessClaimMode, type AreaData } from "@workadventure/map-editor";
import { writable } from "svelte/store";

export const isInsidePersonalAreaStore = writable(false);

export const personalAreaDataStore = writable<AreaData | null>(null);

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
