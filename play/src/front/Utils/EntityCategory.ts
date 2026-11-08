import type { EntityPrefab } from "@workadventure/map-editor";
import { MAP_LAYER_COLLECTIONS } from "../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";

/** Tags that say where an object comes from, not what it is: never a category. */
const GENERIC_TAGS = new Set(["basic", "custom", "default"]);
/**
 * Floor and wall catalogs published before the map tool: the map tool replaces them, their pieces already placed on a
 * map stay there, but the library does not offer them anymore.
 */
const FORMER_STRUCTURE_COLLECTIONS: readonly string[] = ["Infogène Sols", "Infogène Murs fins"];

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

/** Floors and walls have their own tool, the map tool: the library of objects does not offer them. */
export function isHiddenFromLibrary(prefab: Pick<EntityPrefab, "collectionName">): boolean {
    return (
        MAP_LAYER_COLLECTIONS.includes(prefab.collectionName) ||
        FORMER_STRUCTURE_COLLECTIONS.includes(prefab.collectionName)
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
