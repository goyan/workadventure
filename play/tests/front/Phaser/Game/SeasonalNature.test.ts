import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EntityCollectionRaw, Season } from "@workadventure/map-editor";
import { seasonAt } from "@wa/front/Phaser/Game/Nature/SeasonClock";
import { EntitiesManager } from "@wa/front/Phaser/Game/GameMap/EntitiesManager";
import type { Entity } from "@wa/front/Phaser/ECS/Entity";

vi.mock("@wa/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

const publicRoot = resolve("public/collections");
const catalog = EntityCollectionRaw.parse(
    JSON.parse(readFileSync(resolve(publicRoot, "NatureCollection.json"), "utf8")),
);

describe("shared seasonal nature", () => {
    it.each([
        ["2026-02-28T22:59:59Z", Season.Winter],
        ["2026-02-28T23:00:00Z", Season.Spring],
        ["2026-05-31T21:59:59Z", Season.Spring],
        ["2026-05-31T22:00:00Z", Season.Summer],
        ["2026-08-31T22:00:00Z", Season.Autumn],
        ["2026-11-30T23:00:00Z", Season.Winter],
        ["2027-01-01T00:00:00Z", Season.Winter],
    ])("uses Paris server date at %s", (date, season) => {
        expect(seasonAt(new Date(date))).toBe(season);
    });

    it("keeps the fallback until server sync, checks at most once a minute, and changes only at boundaries", () => {
        const setSeason = vi.fn();
        const markDirty = vi.fn();
        const entity = { setSeason } as unknown as Entity;
        const manager = Object.assign(Object.create(EntitiesManager.prototype) as EntitiesManager, {
            entities: new Map([["tree", entity]]),
            season: Season.Summer,
            nextSeasonCheck: 0,
            scene: { markDirty },
        }) as EntitiesManager;
        manager.updateSeason(0, undefined);
        expect(setSeason).not.toHaveBeenCalled();
        manager.updateSeason(0, new Date("2026-11-08T12:00:00Z"));
        expect(setSeason).toHaveBeenCalledExactlyOnceWith(Season.Autumn);
        manager.updateSeason(100, new Date("2026-12-08T12:00:00Z"));
        manager.updateSeason(60_000, new Date("2026-11-08T12:00:00Z"));
        expect(setSeason).toHaveBeenCalledTimes(1);
        manager.updateSeason(120_000, new Date("2026-12-08T12:00:00Z"));
        expect(setSeason).toHaveBeenLastCalledWith(Season.Winter);
        expect(markDirty).toHaveBeenCalledTimes(2);
    });

    it("ships all referenced lossless PNGs, with equal seasonal dimensions and a fixed trunk collision", () => {
        expect(catalog.collection).toHaveLength(47);
        expect(new Set(catalog.collection.map((item) => item.id)).size).toBe(47);
        for (const prefab of catalog.collection) {
            for (const path of [prefab.imagePath, ...Object.values(prefab.seasonal ?? {})]) {
                const image = readFileSync(resolve(publicRoot, path));
                expect(image.subarray(1, 4).toString()).toBe("PNG");
                expect(image[25]).toBe(6); // RGBA, including the native transparent background.
                if (prefab.seasonal) {
                    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([192, 288]);
                }
            }
            if (prefab.seasonal) {
                expect(prefab.collisionRectangles).toEqual([{ x: 88, y: 238, width: 16, height: 10 }]);
                expect(prefab.depthOffset).toBe(-40);
            }
        }
    });
});
