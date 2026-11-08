import type { EntityCollectionRaw, EntityRawPrefab } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import natureCollection from "../../../../public/collections/NatureCollection.json";
import { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";

describe("EntitiesCollectionsManager reload", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("offers only trees from Nature while keeping placed ground and decorations resolvable", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(natureCollection)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url: "https://example.com/NatureCollection.json", type: "Default" }]);

        expect(await manager.getEntityPrefab("Nature", "Nature:grass-autumn-1:Default:Down")).toBeDefined();
        expect(await manager.getEntityPrefab("Nature", "Nature:nature-8:Default:Down")).toBeDefined();
        const names = get(manager.getEntitiesPrefabsVariantStore()).map((variant) => variant.defaultPrefab.name);
        expect(names).toHaveLength(58);
        expect(names).toContain("Arbre saisonnier 1");
        expect(names).toContain("Palmier saisonnier");
        expect(names.every((name) => /chêne|arbre|cerisier|sapin|cyprès|saule|palmier/i.test(name))).toBe(true);
    });

    it("loads a newly uploaded resized image after reopening the map with an older cached catalog", async () => {
        const url = "https://example.com/map-storage/assets/entities/entities.json";
        const original: EntityRawPrefab = {
            id: "original-image",
            name: "Image",
            imagePath: "original.png",
            direction: "Down",
            tags: [],
            color: "",
        };
        const resized: EntityRawPrefab = { ...original, id: "resized-image", imagePath: "resized.png" };
        const cached: EntityCollectionRaw = {
            collectionName: "custom entities",
            collection: [original],
            tags: [],
            version: "1.0",
        };
        let saved = cached;
        // The observed s-max-age header permits browsers to keep a heuristically fresh local copy.
        vi.stubGlobal(
            "fetch",
            vi.fn((_url: string, options?: RequestInit) => {
                const revalidates = ["no-cache", "no-store", "reload"].includes(options?.cache ?? "default");
                return Promise.resolve(new Response(JSON.stringify(revalidates ? saved : cached)));
            }),
        );
        const beforeReload = new EntitiesCollectionsManager();
        beforeReload.loadCollections([{ url, type: "Custom" }]);
        expect(await beforeReload.getEntityPrefab("custom entities", original.id)).toBeDefined();
        beforeReload.addUploadedEntity(resized, url);
        saved = { ...cached, collection: [original, resized] };
        expect(await beforeReload.getEntityPrefab("custom entities", resized.id)).toBeDefined();

        const afterReload = new EntitiesCollectionsManager();
        afterReload.loadCollections([{ url, type: "Custom" }]);

        expect(await afterReload.getEntityPrefab("custom entities", resized.id)).toMatchObject({
            id: resized.id,
            imagePath: "https://example.com/map-storage/assets/entities/resized.png",
            type: "Custom",
        });
        expect(await afterReload.getEntityPrefab("custom entities", original.id)).toBeDefined();
    });

    it("resolves wander.sheetPath against the catalog URL like imagePath", async () => {
        const url = "https://beta.example/map-storage/infogene-animaux/animaux-entities.json";
        const duck: EntityRawPrefab = {
            id: "duck",
            name: "Duck",
            imagePath: "duck.png",
            direction: "Down",
            tags: [],
            color: "",
            wander: { sheetPath: "canard-sheet.png" },
        };
        const still: EntityRawPrefab = { ...duck, id: "still", wander: undefined };
        const catalog: EntityCollectionRaw = {
            collectionName: "animaux",
            collection: [duck, still],
            tags: [],
            version: "1.0",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(catalog)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url, type: "Default" }]);

        const loadedDuck = await manager.getEntityPrefab("animaux", "duck");
        expect(loadedDuck?.wander?.sheetPath).toBe(
            "https://beta.example/map-storage/infogene-animaux/canard-sheet.png",
        );
        expect((await manager.getEntityPrefab("animaux", "still"))?.wander).toBeUndefined();
    });
    it("resolves seasonal paths against the catalog URL", async () => {
        const url = "https://example.com/collections/NatureCollection.json";
        const seasonal = {
            spring: "Nature/spring.png",
            summer: "Nature/summer.png",
            autumn: "Nature/autumn.png",
            winter: "Nature/winter.png",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            collectionName: "Nature",
                            version: "1.0",
                            tags: [],
                            collection: [
                                {
                                    id: "tree",
                                    name: "Tree",
                                    imagePath: seasonal.summer,
                                    direction: "Down",
                                    tags: [],
                                    color: "",
                                    seasonal,
                                },
                            ],
                        }),
                    ),
                ),
            ),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url, type: "Default" }]);
        expect((await manager.getEntityPrefab("Nature", "tree"))?.seasonal).toEqual({
            spring: "https://example.com/collections/Nature/spring.png",
            summer: "https://example.com/collections/Nature/summer.png",
            autumn: "https://example.com/collections/Nature/autumn.png",
            winter: "https://example.com/collections/Nature/winter.png",
        });
    });
});
