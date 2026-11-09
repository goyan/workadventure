import type {
    EntityCollection,
    EntityCollectionRaw,
    EntityPrefab,
    EntityPrefabType,
    EntityRawPrefab,
    PrefabOverride,
} from "@workadventure/map-editor";
import type { Readable, Writable } from "svelte/store";
import { derived, writable } from "svelte/store";
import { entitiesFileMigration } from "@workadventure/map-editor/src/Migrations/EntitiesFileMigration";
import { asError } from "catch-unknown";
import { withCategory } from "../../../Utils/EntityCategory";
import { EntityVariant } from "./Entities/EntityVariant";
import { takeUnseenEntities } from "./EntityCollectionUrls";
import { isResizedVariant } from "./PlacedImageVariants";

/** How long a collection of entities is waited for, in milliseconds. */
const COLLECTION_FETCH_TIMEOUT_MS = 10_000;

export type CustomEntityModification = Pick<
    EntityPrefab,
    "name" | "tags" | "depthOffset" | "collisionGrid" | "collisionRectangles" | "layer" | "water" | "sittable"
>;

export class EntitiesCollectionsManager {
    private entitiesPrefabsMapPromise!: Promise<Map<string, EntityPrefab>>;
    private tags: string[] = [];

    private currentCollection: EntityCollection = { collectionName: "All Object Collection", collection: [], tags: [] };
    private readonly entitiesPrefabsStore: Writable<EntityPrefab[]>;
    private readonly entitiesPrefabsVariantStore: Readable<EntityVariant[]>;

    constructor() {
        this.entitiesPrefabsStore = writable([]);
        this.entitiesPrefabsVariantStore = derived(this.entitiesPrefabsStore, ($entitiesPrefabsStore) => {
            // entityVariants ordered by collectionName+name
            const entityVariants = new Map<string, EntityVariant>();
            for (const entityPrefab of $entitiesPrefabsStore) {
                // Ground textures belong to the terrain tool; trees and small decorations belong to objects.
                if (entityPrefab.collectionName === "Nature" && entityPrefab.layer !== "standing") continue;
                // A resized copy belongs to the instance placed with it: the library only offers the original.
                if (entityPrefab.type === "Custom" && isResizedVariant(entityPrefab)) continue;
                const idOrGeneratedName =
                    entityPrefab.type === "Custom"
                        ? (entityPrefab.variantOf ?? entityPrefab.id)
                        : entityPrefab.collectionName + "__" + entityPrefab.name;
                let variant = entityVariants.get(idOrGeneratedName);
                if (variant === undefined) {
                    variant = new EntityVariant(entityPrefab);
                    entityVariants.set(idOrGeneratedName, variant);
                } else {
                    variant.addPrefab(entityPrefab);
                }
            }
            return [...entityVariants.values()];
        });
    }

    public getEntitiesPrefabsVariantStore(): Readable<EntityVariant[]> {
        return this.entitiesPrefabsVariantStore;
    }

    /** The custom image carrying this tag, if any (a resized copy of an image, PlacedImageVariants). */
    public async findCustomPrefabByTag(tag: string): Promise<EntityPrefab | undefined> {
        const prefabsMap = await this.entitiesPrefabsMapPromise;
        return [...prefabsMap.values()].find((prefab) => prefab.type === "Custom" && prefab.tags.includes(tag));
    }

    public async getEntityPrefab(collectionName: string, entityPrefabId: string): Promise<EntityPrefab | undefined> {
        const prefabsMap = await this.entitiesPrefabsMapPromise;
        return prefabsMap.get(entityPrefabId);
    }

    /** Library prefabs as their catalog declares them, before the adjustments of the map. */
    private readonly basePrefabs = new Map<string, EntityPrefab>();
    private prefabOverrides: Record<string, PrefabOverride> = {};

    public loadCollections(
        collectionDescriptors: { url: string; type: EntityPrefabType }[],
        prefabOverrides: Record<string, PrefabOverride> = {},
    ): void {
        this.prefabOverrides = { ...prefabOverrides };
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            const entityCollections: { collection: EntityCollection; url: string }[] = [];
            const fetchUrlPromises: Promise<EntityCollectionRaw>[] = [];
            for (const descriptor of collectionDescriptors) {
                const promise = this.fetchRawCollection(descriptor.url);
                fetchUrlPromises.push(promise);
            }

            //TODO check tagSet and this.currentCollection
            Promise.allSettled(fetchUrlPromises)
                .then((promises) => {
                    for (let i = 0; i < promises.length; i++) {
                        const promise = promises[i];
                        const descriptor = collectionDescriptors[i];
                        if (promise.status === "fulfilled") {
                            let entityCollectionRaw = promise.value;
                            try {
                                entityCollectionRaw = entitiesFileMigration.migrate(entityCollectionRaw);
                                entityCollections.push({
                                    collection: this.parseRawCollection(entityCollectionRaw, descriptor.type),
                                    url: descriptor.url,
                                });
                            } catch (error) {
                                console.error("Error while parsing entity collection", descriptor.url, error);
                            }
                        } else {
                            console.error("Error while loading entity collection", descriptor.url, promise.reason);
                        }
                    }

                    // The first collection declaring an id wins (WAM collections are loaded first)
                    const seenIds = new Set<string>();
                    for (const { collection, url } of entityCollections) {
                        const tagSet = new Set<string>();
                        takeUnseenEntities(collection.collection, seenIds).forEach((entity: EntityPrefab) => {
                            this.currentCollection.collection.push({
                                name: entity.name,
                                id: entity.id,
                                collectionName: entity.collectionName,
                                depthOffset: entity.depthOffset ?? 0,
                                tags: [...entity.tags, ...collection.tags],
                                imagePath: new URL(entity.imagePath, url).toString(),
                                direction: entity.direction,
                                color: entity.color,
                                collisionGrid: entity.collisionGrid,
                                collisionRectangles: entity.collisionRectangles,
                                layer: entity.layer,
                                water: entity.water,
                                variantOf: entity.variantOf,
                                sittable: entity.sittable,
                                seat: entity.seat,
                                animation: entity.animation,
                                footstepSound: entity.footstepSound,
                                seasonal: entity.seasonal
                                    ? {
                                          spring: new URL(entity.seasonal.spring, url).toString(),
                                          summer: new URL(entity.seasonal.summer, url).toString(),
                                          autumn: new URL(entity.seasonal.autumn, url).toString(),
                                          winter: new URL(entity.seasonal.winter, url).toString(),
                                      }
                                    : undefined,
                                wander: entity.wander
                                    ? { sheetPath: new URL(entity.wander.sheetPath, url).toString() }
                                    : undefined,
                                lamp: entity.lamp,
                                type: entity.type,
                                ownerId: entity.ownerId,
                            });
                            entity.tags.forEach((tag: string) => tagSet.add(tag));
                        });

                        const tags = [...new Set([...tagSet, ...this.tags])];
                        tags.sort();
                        this.tags = tags;
                    }
                    // The map adjusts some objects of the library for itself (see PrefabOverride).
                    this.basePrefabs.clear();
                    this.currentCollection.collection = this.currentCollection.collection.map((prefab) => {
                        this.basePrefabs.set(prefab.id, prefab);
                        const override = this.prefabOverrides[prefab.id];
                        return override ? applyPrefabOverride(prefab, override) : prefab;
                    });
                    this.entitiesPrefabsStore.set(this.currentCollection.collection);

                    const prefabsMap = new Map<string, EntityPrefab>();
                    for (const prefab of this.currentCollection.collection) {
                        prefabsMap.set(prefab.id, prefab);
                    }
                    resolve(prefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(error instanceof Error ? error : new Error(JSON.stringify(error)));
                });
        });
    }

    public addUploadedEntity(uploadedEntity: EntityRawPrefab, customEntityCollectionUrl: string) {
        const uploadedEntityPrefab: EntityPrefab = {
            ...this.parseRawEntityPrefab("custom entities", uploadedEntity, "Custom"),
            imagePath: new URL(uploadedEntity.imagePath, customEntityCollectionUrl).toString(),
        };
        this.currentCollection.collection.push(uploadedEntityPrefab);

        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => [...currentEntitiesPrefabs, uploadedEntityPrefab]);
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    existingEntitiesPrefabsMap.set(uploadedEntityPrefab.id, uploadedEntityPrefab);
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    /**
     * Adjusts (or, with undefined, restores) a library object for this map. Returns the fields the placed copies must
     * take, or undefined when the object is unknown.
     */
    public setPrefabOverride(id: string, override: PrefabOverride | undefined): Partial<EntityPrefab> | undefined {
        const base = this.basePrefabs.get(id);
        if (!base) return undefined;
        const others = Object.fromEntries(Object.entries(this.prefabOverrides).filter(([prefabId]) => prefabId !== id));
        this.prefabOverrides = override ? { ...others, [id]: override } : others;
        const adjusted = override ? applyPrefabOverride(base, override) : base;
        const modification: Partial<EntityPrefab> = {
            layer: adjusted.layer,
            depthOffset: adjusted.depthOffset,
            collisionGrid: adjusted.collisionGrid,
            collisionRectangles: adjusted.collisionRectangles,
            water: adjusted.water,
            sittable: adjusted.sittable,
        };
        this.currentCollection.collection = this.currentCollection.collection.map((prefab) =>
            prefab.id === id ? adjusted : prefab,
        );
        this.entitiesPrefabsStore.update((prefabs) => prefabs.map((prefab) => (prefab.id === id ? adjusted : prefab)));
        this.entitiesPrefabsMapPromise = this.entitiesPrefabsMapPromise.then((prefabsMap) =>
            prefabsMap.set(id, adjusted),
        );
        return modification;
    }

    /** Applies the edition of a custom image to the catalog. Unset optional fields are removed, as on map-storage. */
    public modifyCustomEntity(id: string, modification: CustomEntityModification): void {
        const patch: CustomEntityModification = {
            name: modification.name,
            tags: modification.tags,
            depthOffset: modification.depthOffset,
            collisionGrid: modification.collisionGrid,
            collisionRectangles: modification.collisionRectangles,
            layer: modification.layer,
            water: modification.water,
            sittable: modification.sittable,
        };
        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => {
            const indexOfCustomEntity = currentEntitiesPrefabs.findIndex((entityPrefab) => entityPrefab.id === id);
            if (indexOfCustomEntity !== -1) {
                currentEntitiesPrefabs[indexOfCustomEntity] = {
                    ...currentEntitiesPrefabs[indexOfCustomEntity],
                    ...patch,
                };
            }
            return currentEntitiesPrefabs;
        });
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    const entity = existingEntitiesPrefabsMap.get(id);
                    if (entity) {
                        existingEntitiesPrefabsMap.set(id, { ...entity, ...patch });
                    }
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    public deleteCustomEntity(id: string): void {
        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => {
            return currentEntitiesPrefabs.filter((entityPrefab) => entityPrefab.id !== id);
        });
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    existingEntitiesPrefabsMap.delete(id);
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    private async fetchRawCollection(url: string): Promise<EntityCollectionRaw> {
        // Catalogs change when images are uploaded. Revalidate even after a page reload,
        // otherwise a cached catalog can hide entities referencing a new prefab.
        // A collection that does not answer must not hold back all the others: the entities of the map, and the floors and
        // walls of the map tool, wait for every collection to be loaded or to have failed.
        const response = await fetch(url, {
            cache: "no-cache",
            signal: AbortSignal.timeout(COLLECTION_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        return response.json();
    }

    private parseRawCollection(
        rawCollection: EntityCollectionRaw,
        rawCollectionType: EntityPrefabType,
    ): EntityCollection {
        return {
            collectionName: rawCollection.collectionName,
            tags: [...rawCollection.tags],
            collection: rawCollection.collection.map((rawPrefab: EntityRawPrefab) =>
                this.parseRawEntityPrefab(rawCollection.collectionName, rawPrefab, rawCollectionType),
            ),
        };
    }

    private parseRawEntityPrefab(
        collectionName: string,
        rawPrefab: EntityRawPrefab,
        entityPrefabType: EntityPrefabType,
    ): EntityPrefab {
        return {
            ...rawPrefab,
            collectionName,
            type: entityPrefabType,
        };
    }
}

/** The display level, collisions and water of the map replace those of the catalog (PrefabOverride). */
export function applyPrefabOverride(prefab: EntityPrefab, override: PrefabOverride): EntityPrefab {
    return {
        ...prefab,
        layer: override.layer,
        depthOffset: override.depthOffset,
        collisionGrid: override.collisionGrid,
        collisionRectangles: override.collisionRectangles,
        water: override.water,
        sittable: override.sittable,
        tags: override.category ? withCategory(prefab.tags, override.category) : prefab.tags,
    };
}
