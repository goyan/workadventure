import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EntityCollectionRaw, Season, WeatherType } from "@workadventure/map-editor";
import { seasonAt, treeSeasonAt } from "@wa/front/Phaser/Game/Nature/SeasonClock";
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
        const settings = { weather: WeatherType.Clear };
        const manager = Object.assign(Object.create(EntitiesManager.prototype) as EntitiesManager, {
            entities: new Map([["tree", entity]]),
            season: Season.Summer,
            nextSeasonCheck: 0,
            scene: {
                markDirty,
                getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings }) }) }),
            },
        }) as EntitiesManager;
        manager.updateSeason(0, undefined);
        expect(setSeason).not.toHaveBeenCalled();
        manager.updateSeason(0, new Date("2026-11-08T12:00:00Z"));
        expect(setSeason).toHaveBeenCalledExactlyOnceWith(Season.Autumn);
        manager.updateSeason(100, new Date("2026-12-08T12:00:00Z"));
        manager.updateSeason(60_000, new Date("2026-11-08T12:00:00Z"));
        expect(setSeason).toHaveBeenCalledTimes(1);
        manager.updateSeason(120_000, new Date("2026-12-08T12:00:00Z"));
        expect(setSeason).toHaveBeenLastCalledWith(Season.Summer);
        expect(markDirty).toHaveBeenCalledTimes(2);
        settings.weather = WeatherType.Snow;
        manager.updateSeason(120_010, new Date("2026-12-08T12:00:00Z"));
        expect(setSeason).toHaveBeenLastCalledWith(Season.Winter);
        settings.weather = WeatherType.Rain;
        manager.updateSeason(120_020, new Date("2026-12-08T12:00:00Z"));
        expect(setSeason).toHaveBeenLastCalledWith(Season.Summer);
        expect(markDirty).toHaveBeenCalledTimes(4);
    });

    it("keeps autumn orange in rain and uses white artwork only during snow or its melting phase", () => {
        const autumn = new Date("2026-11-08T12:00:00Z");
        expect(treeSeasonAt(autumn, WeatherType.Rain, 0)).toBe(Season.Autumn);
        expect(treeSeasonAt(autumn, WeatherType.Snow, 0)).toBe(Season.Winter);
        expect(treeSeasonAt(autumn, WeatherType.Clear, 0.5)).toBe(Season.Winter);
        expect(treeSeasonAt(autumn, WeatherType.Clear, 0)).toBe(Season.Autumn);
        expect(treeSeasonAt(new Date("2026-01-08T12:00:00Z"), WeatherType.Rain, 0)).toBe(Season.Summer);
    });

    it("links all 58 selectable trees, including legacy green and explicitly snowy IDs", () => {
        const trees = catalog.collection.filter(
            (prefab) =>
                /^Nature:(tree-|seasonal-|snow-tree-|snow-evergreen-|winter-auto-|nature-[1-6]:)/.test(prefab.id) &&
                !prefab.name?.startsWith("Feuillage"),
        );
        expect(trees).toHaveLength(58);
        expect(
            trees.every((prefab) => prefab.seasonal?.summer && prefab.seasonal.autumn && prefab.seasonal.winter),
        ).toBe(true);
    });

    it("ships transparent PNGs, with equal seasonal dimensions and collisions inside the resized trees", () => {
        expect(catalog.collection).toHaveLength(114);
        expect(new Set(catalog.collection.map((item) => item.id)).size).toBe(114);
        for (const prefab of catalog.collection) {
            const base = readFileSync(resolve(publicRoot, prefab.imagePath));
            const dimensions = [base.readUInt32BE(16), base.readUInt32BE(20)];
            for (const path of [prefab.imagePath, ...Object.values(prefab.seasonal ?? {})]) {
                const image = readFileSync(resolve(publicRoot, path));
                expect(image.subarray(1, 4).toString()).toBe("PNG");
                expect(image[25]).toBe(6); // RGBA, including the native transparent background.
                if (prefab.seasonal) {
                    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual(dimensions);
                }
            }
            if (prefab.seasonal) {
                expect(prefab.collisionRectangles).toHaveLength(1);
                for (const rectangle of prefab.collisionRectangles ?? []) {
                    expect(rectangle.x).toBeGreaterThanOrEqual(0);
                    expect(rectangle.y).toBeGreaterThanOrEqual(0);
                    expect(rectangle.width).toBeGreaterThan(0);
                    expect(rectangle.height).toBeGreaterThan(0);
                    expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(dimensions[0]);
                    expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(dimensions[1]);
                }
                expect(prefab.depthOffset).toBeLessThan(0);
                expect(dimensions[1]).toBeLessThanOrEqual(218);
            }
        }
    });
});
