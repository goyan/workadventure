/**
 * Merges the entity collection URLs declared in the WAM file with the ones provided by the room
 * (e.g. by the Admin API). WAM URLs come first so that they take precedence, duplicates are dropped.
 */
export function mergeEntityCollectionUrls(wamUrls: string[], roomUrls: string[] | undefined | null): string[] {
    return [...new Set([...wamUrls, ...(roomUrls ?? [])])];
}

/**
 * Returns the entities whose id has not been seen yet and records their ids in `seenIds`.
 * The first entity with a given id wins, so collections loaded first take precedence.
 */
export function takeUnseenEntities<T extends { id: string }>(entities: T[], seenIds: Set<string>): T[] {
    const result: T[] = [];
    for (const entity of entities) {
        if (seenIds.has(entity.id)) {
            continue;
        }
        seenIds.add(entity.id);
        result.push(entity);
    }
    return result;
}
