import type { EntityPrefab } from "@workadventure/map-editor";

/** Tags that say where an object comes from, not what it is: never a category. */
const GENERIC_TAGS = new Set(["basic", "custom", "default"]);
/** Floors and walls belong to the structure of the map (its own tool), not to the objects placed on it. */
const STRUCTURE_PATTERN = /^(murs?|sols?|walls?|floors?|cloisons?)\b|\b(murs?|sols?|walls?|floors?)\b/i;

/**
 * The category of an object in the library: its first meaningful tag. Uploads put the category chosen by the user
 * first. Undefined for an object without any (most images uploaded before categories were required).
 */
export function getEntityCategory(prefab: Pick<EntityPrefab, "tags">): string | undefined {
    const tag = prefab.tags.map((t) => t.trim()).find((t) => t !== "" && !GENERIC_TAGS.has(t.toLowerCase()));
    return tag === undefined ? undefined : formatCategory(tag);
}

/** One spelling per category, whatever the case of the tags: "furniture" and "Furniture" are the same. */
export function formatCategory(category: string): string {
    const trimmed = category.trim();
    return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

export function isSameCategory(a: string, b: string): boolean {
    return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/** Old floor and wall objects, kept apart from the furniture: the structure tool of the map replaces them. */
export function isStructureObject(prefab: Pick<EntityPrefab, "tags" | "collectionName">): boolean {
    const category = getEntityCategory(prefab);
    return (
        (category !== undefined && STRUCTURE_PATTERN.test(category)) || STRUCTURE_PATTERN.test(prefab.collectionName)
    );
}

/** Tags of an object with `category` first, without generic tags nor another spelling of the category. */
export function withCategory(tags: string[], category: string): string[] {
    return [
        formatCategory(category),
        ...tags.filter((tag) => !isSameCategory(tag, category) && !GENERIC_TAGS.has(tag.trim().toLowerCase())),
    ];
}

/** Every category of the library, sorted, one spelling each. */
export function listCategories(prefabs: Pick<EntityPrefab, "tags">[]): string[] {
    const byKey = new Map<string, string>();
    for (const prefab of prefabs) {
        const category = getEntityCategory(prefab);
        if (category && !byKey.has(category.toLocaleLowerCase())) {
            byKey.set(category.toLocaleLowerCase(), category);
        }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

const SEAT_PATTERN = /chais|chair|canap|sofa|couch|fauteuil|armchair|banc|bench|tabouret|stool|si[eè]ge|seat|pouf/i;

/** Objects players sit on by walking onto them (chairs, couches, benches…), recognized by category or name. */
export function isSeatObject(prefab: Pick<EntityPrefab, "tags" | "name">): boolean {
    return SEAT_PATTERN.test(getEntityCategory(prefab) ?? "") || SEAT_PATTERN.test(prefab.name);
}
