import type { EntityDimensions, EntityPrefab } from "@workadventure/map-editor";

/**
 * A resized image is uploaded as a custom entity of its own (the official back and map-storage keep no size per placed
 * instance). It carries this tag: the original it was made from and its size. Resizing again starts from the original,
 * never from a resized copy (each step would blur it more), a copy of the same size is reused, and resized copies stay
 * out of the library: they belong to the instances placed with them. Tags are saved by the official map-storage too.
 */
const RESIZED_FROM = "resized-from:";

export function resizedVariantTag(originalId: string, size: EntityDimensions): string {
    return `${RESIZED_FROM}${originalId}:${size.width}x${size.height}`;
}

/** The tags of a resized copy: those of the original (its category first), then the resize tag. */
export function resizedVariantTags(originalTags: string[], originalId: string, size: EntityDimensions): string[] {
    return [...originalTags.filter((tag) => !tag.startsWith(RESIZED_FROM)), resizedVariantTag(originalId, size)];
}

/** The id of the original image a resized copy was made from; undefined for an original. */
export function getResizedFrom(prefab: Pick<EntityPrefab, "tags">): string | undefined {
    const tag = prefab.tags.find((t) => t.startsWith(RESIZED_FROM));
    if (!tag) return undefined;
    const value = tag.slice(RESIZED_FROM.length);
    const separator = value.lastIndexOf(":");
    return separator > 0 ? value.slice(0, separator) : undefined;
}

export function isResizedVariant(prefab: Pick<EntityPrefab, "tags">): boolean {
    return getResizedFrom(prefab) !== undefined;
}

export function resizedVariantName(originalName: string, size: EntityDimensions): string {
    return `${originalName} (${size.width}×${size.height})`;
}
