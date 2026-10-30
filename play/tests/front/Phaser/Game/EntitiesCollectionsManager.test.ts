import type { EntityCollectionRaw, EntityRawPrefab } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";

describe("EntitiesCollectionsManager reload", () => {
    afterEach(() => vi.unstubAllGlobals());

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
});
