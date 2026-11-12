import type { EntityCollectionRaw, EntityRawPrefab } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import natureCollection from "../../../../public/collections/NatureCollection.json";
import { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";

describe("EntitiesCollectionsManager reload", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("offers Nature trees and decorations once while keeping ground textures out of the picker", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(natureCollection)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url: "https://example.com/NatureCollection.json", type: "Default" }]);

        expect(await manager.getEntityPrefab("Nature", "Nature:grass-autumn-1:Default:Down")).toBeDefined();
        expect(await manager.getEntityPrefab("Nature", "Nature:nature-8:Default:Down")).toBeDefined();
        const variants = get(manager.getEntitiesPrefabsVariantStore());
        const names = variants.map((variant) => variant.defaultPrefab.name);
        expect(names).toContain("Arbre saisonnier 1");
        expect(names).toContain("Palmier saisonnier");
        expect(names).toEqual(expect.arrayContaining(["Rochers", "Souche", "Fleurs", "Herbes", "Tronc"]));
        expect(names).not.toContain("Herbe d’automne 1");
        const ids = variants.flatMap((variant) => variant.prefabIds);
        expect(new Set(ids).size).toBe(ids.length);
        expect(
            ids.filter((id) =>
                /^Nature:(tree-|seasonal-|snow-tree-|snow-evergreen-|winter-auto-|nature-[1-6]:)/.test(id),
            ),
        ).toHaveLength(58);
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

    it("gives a resized copy saved without a display level the level and seat setting of its original", async () => {
        const url = "https://example.com/map-storage/assets/entities/entities.json";
        const original: EntityRawPrefab = {
            id: "rink",
            name: "Rink",
            imagePath: "rink.png",
            direction: "Down",
            tags: ["Rinks"],
            color: "",
            layer: "floor",
            sittable: false,
        };
        // Copies made before the resize kept these settings: they were sorted like furniture, over the players.
        const oldCopy: EntityRawPrefab = {
            ...original,
            id: "old-copy",
            imagePath: "old-copy.png",
            tags: ["Rinks", "resized-from:rink:187x117"],
            layer: undefined,
            sittable: undefined,
        };
        const ownLevel: EntityRawPrefab = { ...oldCopy, id: "own-level", layer: "overhead", sittable: true };
        const collection: EntityCollectionRaw = {
            collectionName: "custom entities",
            collection: [original, oldCopy, ownLevel],
            tags: [],
            version: "1.0",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(collection)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url, type: "Custom" }]);

        expect(await manager.getEntityPrefab("custom entities", "old-copy")).toMatchObject({
            layer: "floor",
            sittable: false,
        });
        expect(await manager.getEntityPrefab("custom entities", "own-level")).toMatchObject({
            layer: "overhead",
            sittable: true,
        });
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
    it("passes the lamp definition of an object through, and leaves the others without one", async () => {
        const url = "https://beta.example/map-storage/infogene-lampes/lampes-entities.json";
        const lamp: EntityRawPrefab = {
            id: "disco-ball",
            name: "Disco ball",
            imagePath: "disco-ball.png",
            direction: "Down",
            tags: [],
            color: "",
            lamp: { kind: "disco", anchor: { x: 16, y: 20 } },
        };
        const plain: EntityRawPrefab = { ...lamp, id: "plain", lamp: undefined };
        const catalog: EntityCollectionRaw = {
            collectionName: "lampes",
            collection: [lamp, plain],
            tags: [],
            version: "1.0",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(catalog)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url, type: "Default" }]);

        expect((await manager.getEntityPrefab("lampes", "disco-ball"))?.lamp).toEqual({
            kind: "disco",
            anchor: { x: 16, y: 20 },
        });
        expect((await manager.getEntityPrefab("lampes", "plain"))?.lamp).toBeUndefined();
    });
    it("passes the mark of a tall object that casts a shadow through, and leaves the others without one", async () => {
        const url = "https://beta.example/map-storage/bureau/bureau-entities.json";
        const cupboard: EntityRawPrefab = {
            id: "cupboard",
            name: "Cupboard",
            imagePath: "cupboard.png",
            direction: "Down",
            tags: [],
            color: "",
            castsShadow: true,
        };
        const table: EntityRawPrefab = { ...cupboard, id: "table", castsShadow: undefined };
        const catalog: EntityCollectionRaw = {
            collectionName: "bureau",
            collection: [cupboard, table],
            tags: [],
            version: "1.0",
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(JSON.stringify(catalog)))),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url, type: "Default" }]);

        expect((await manager.getEntityPrefab("bureau", "cupboard"))?.castsShadow).toBe(true);
        expect((await manager.getEntityPrefab("bureau", "table"))?.castsShadow).toBeUndefined();
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
