import type { CategorySettings, EntityPrefab, InteractionTrigger, ObjectInteraction } from "@workadventure/map-editor";
import { AvatarAction } from "../Phaser/Entity/AvatarAction";
import { getEntityCategory, isSameCategory, isSeatObject } from "./EntityCategory";

/**
 * Categories every map starts with. Their id is what objects store (first tag); their name is translated
 * (mapEditor.categories.base.<id>). A map may change their settings and add its own categories (WAM settings).
 */
export const BASE_CATEGORIES: readonly ({ id: string } & CategorySettings)[] = [
    { id: "seats", interaction: "sit", trigger: "auto" },
    { id: "pools", interaction: "swim", trigger: "key", layer: "floor" },
    { id: "rinks", interaction: "iceSkate", trigger: "auto", layer: "floor" },
    { id: "beds", interaction: AvatarAction.Sleep, trigger: "key" },
    { id: "toilets", interaction: AvatarAction.Toilet, trigger: "key" },
    { id: "coffee", interaction: AvatarAction.Coffee, trigger: "key" },
    { id: "sport", interaction: AvatarAction.Run, trigger: "key" },
    { id: "rugs", interaction: "none", trigger: "auto", layer: "floor" },
    { id: "lights", interaction: "none", trigger: "auto", layer: "overhead" },
    { id: "plants", interaction: "none", trigger: "auto" },
    { id: "tables", interaction: "none", trigger: "auto" },
    { id: "storage", interaction: "none", trigger: "auto" },
    { id: "decoration", interaction: "none", trigger: "auto" },
    { id: "electronics", interaction: "none", trigger: "auto" },
    { id: "misc", interaction: "none", trigger: "auto" },
];

export type MapCategories = Record<string, CategorySettings> | undefined;

/** The base category with this name (its id, whatever the case), if it is one. */
export function findBaseCategory(name: string): ({ id: string } & CategorySettings) | undefined {
    return BASE_CATEGORIES.find((category) => isSameCategory(category.id, name));
}

/** Settings of a category on a map: those the map set, else those of the base category, else none. */
export function getCategorySettings(
    name: string | undefined,
    mapCategories: MapCategories,
): CategorySettings | undefined {
    if (!name) return undefined;
    const fromMap = mapCategories?.[name.trim().toLocaleLowerCase()];
    if (fromMap) return fromMap;
    const base = findBaseCategory(name);
    return base ? { interaction: base.interaction, trigger: base.trigger, layer: base.layer } : undefined;
}

/**
 * What players do with an object, and how it starts. The object's own seat box comes first (`sittable`), then its
 * category on this map, then what its name suggests (a chair, a couch…). Water always lets players swim.
 */
export function getObjectInteraction(
    prefab: Pick<EntityPrefab, "tags" | "name" | "sittable" | "water">,
    mapCategories: MapCategories,
): { interaction: ObjectInteraction; trigger: InteractionTrigger } {
    const settings = getCategorySettings(getEntityCategory(prefab), mapCategories);
    const trigger = settings?.trigger ?? "auto";
    if (prefab.sittable) {
        return { interaction: "sit", trigger: settings?.interaction === "sit" ? trigger : "auto" };
    }
    // An unchecked seat box only says the object is not a seat: a bed or a treadmill keeps its action.
    const notSeat = prefab.sittable === false;
    if (settings && settings.interaction !== "none" && !(notSeat && settings.interaction === "sit")) {
        return { interaction: settings.interaction, trigger };
    }
    if (prefab.water?.length) {
        return { interaction: "swim", trigger: "key" };
    }
    if (/\b(toilets?|wc)\b/i.test(prefab.name)) return { interaction: AvatarAction.Toilet, trigger: "key" };
    if (/\b(beds?|lits?)\b/i.test(prefab.name)) return { interaction: AvatarAction.Sleep, trigger: "key" };
    if (/\b(coffee|café|cafeti[eè]re)\b/i.test(prefab.name))
        return { interaction: AvatarAction.Coffee, trigger: "key" };
    if (/\b(treadmills?|tapis de course)\b/i.test(prefab.name))
        return { interaction: AvatarAction.Run, trigger: "key" };
    if (!notSeat && isSeatObject(prefab)) {
        return { interaction: "sit", trigger: "auto" };
    }
    return { interaction: "none", trigger: "auto" };
}

/** An animated object players run on (a treadmill): its belt moves only while someone runs on it. */
export function isTreadmillBelt(
    prefab: Pick<EntityPrefab, "tags" | "name" | "sittable" | "water" | "animation">,
    mapCategories: MapCategories,
): boolean {
    return (
        prefab.animation !== undefined && getObjectInteraction(prefab, mapCategories).interaction === AvatarAction.Run
    );
}

/** Every category of a map: the base ones, then those the map added, in the order of their names. */
export function listMapCategories(
    mapCategories: MapCategories,
): { id: string; settings: CategorySettings; base: boolean }[] {
    const base = BASE_CATEGORIES.map((category) => ({
        id: category.id,
        settings: getCategorySettings(category.id, mapCategories) ?? category,
        base: true,
    }));
    const added = Object.entries(mapCategories ?? {})
        .filter(([name]) => !findBaseCategory(name))
        .map(([name, settings]) => ({ id: name, settings, base: false }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return [...base, ...added];
}
