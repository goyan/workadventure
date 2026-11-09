import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EntityCollectionRaw, Season, WeatherType } from "@workadventure/map-editor";
import { seasonAt, treeSeasonAt } from "@wa/front/Phaser/Game/Nature/SeasonClock";
import { EntitiesManager } from "@wa/front/Phaser/Game/GameMap/EntitiesManager";
import type { Entity } from "@wa/front/Phaser/ECS/Entity";
import { getSolidRectangles } from "@wa/front/Utils/EntityHitbox";

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

    it("shows winter trees at once while the personal christmas theme is on, then the map season again", () => {
        const setSeason = vi.fn();
        const entity = { setSeason } as unknown as Entity;
        const settings = { weather: WeatherType.Clear };
        const manager = Object.assign(Object.create(EntitiesManager.prototype) as EntitiesManager, {
            entities: new Map([["tree", entity]]),
            season: Season.Summer,
            nextSeasonCheck: 0,
            scene: {
                markDirty: vi.fn(),
                getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings }) }) }),
            },
        }) as EntitiesManager;
        const date = new Date("2026-12-08T12:00:00Z");
        manager.updateSeason(0, date);
        expect(setSeason).not.toHaveBeenCalled();
        // Within the same minute: the theme switch must not wait for the next check.
        manager.updateSeason(10, date, Season.Winter);
        expect(setSeason).toHaveBeenLastCalledWith(Season.Winter);
        manager.updateSeason(20, date);
        expect(setSeason).toHaveBeenLastCalledWith(Season.Summer);
    });

    it("forces autumn trees for the autumn theme, then the map season again", () => {
        const setSeason = vi.fn();
        const entity = { setSeason } as unknown as Entity;
        const settings = { weather: WeatherType.Clear };
        const manager = Object.assign(Object.create(EntitiesManager.prototype) as EntitiesManager, {
            entities: new Map([["tree", entity]]),
            season: Season.Summer,
            nextSeasonCheck: 0,
            scene: {
                markDirty: vi.fn(),
                getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ settings }) }) }),
            },
        }) as EntitiesManager;
        const july = new Date("2026-07-08T12:00:00Z");
        manager.updateSeason(0, july, Season.Autumn);
        expect(setSeason).toHaveBeenLastCalledWith(Season.Autumn);
        manager.updateSeason(10, july);
        expect(setSeason).toHaveBeenLastCalledWith(Season.Summer);
    });

    it("snow covers trees, plants, rocks and trunks even with the autumn theme, then melts", () => {
        const entities = ["tree", "plant", "rock", "trunk"].map((id) => ({ id, setSeason: vi.fn() }));
        const manager = Object.assign(Object.create(EntitiesManager.prototype) as EntitiesManager, {
            entities: new Map(entities.map((entity) => [entity.id, entity as unknown as Entity])),
            season: Season.Autumn,
            nextSeasonCheck: 0,
            scene: {
                markDirty: vi.fn(),
                getGameMap: () => ({
                    getWamFile: () => ({ getWam: () => ({ settings: { weather: WeatherType.Automatic } }) }),
                }),
            },
        }) as EntitiesManager;
        manager.updateSeason(0, new Date("2026-11-08T13:31:00Z"), Season.Autumn);
        for (const entity of entities) expect(entity.setSeason).toHaveBeenLastCalledWith(Season.Winter);
        manager.updateSeason(60_000, new Date("2026-11-08T14:01:00Z"), Season.Autumn);
        for (const entity of entities) expect(entity.setSeason).toHaveBeenCalledTimes(1);
        manager.updateSeason(120_000, new Date("2026-11-08T14:11:00Z"), Season.Autumn);
        for (const entity of entities) expect(entity.setSeason).toHaveBeenLastCalledWith(Season.Autumn);
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

    it("switches every rock decoration to snow artwork only while snow covers the map", () => {
        const rocks = catalog.collection.filter((prefab) => /rochers?|pierres?/i.test(prefab.name ?? ""));
        expect(rocks).toHaveLength(12);
        const date = new Date("2026-12-08T12:00:00Z");
        for (const rock of rocks) {
            const seasonal = rock.seasonal;
            expect(seasonal).toBeDefined();
            expect(seasonal?.spring).toBe(seasonal?.summer);
            expect(seasonal?.autumn).toBe(seasonal?.summer);
            expect(seasonal?.winter).not.toBe(seasonal?.summer);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Clear, 0)]).toBe(seasonal?.summer);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Rain, 0)]).toBe(seasonal?.summer);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Snow, 0)]).toBe(seasonal?.winter);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Clear, 0.5)]).toBe(seasonal?.winter);
            for (const path of Object.values(seasonal ?? {})) {
                const image = readFileSync(resolve(publicRoot, path));
                expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([48, 40]);
            }
        }
    });

    it("keeps small vegetation and trunks at decoration scale and removes their snow after melting", () => {
        const decorations = catalog.collection.filter((prefab) =>
            /^Nature:(nature-(7|9|10|11|12)|snow-detail-([1-9]|10|11)|detail-grass-\d+|detail-flowers-\d+|detail-rocks-[6-9]|detail-snow-5):/.test(
                prefab.id,
            ),
        );
        expect(decorations).toHaveLength(44);
        const date = new Date("2026-12-08T12:00:00Z");
        for (const prefab of decorations) {
            const image = readFileSync(resolve(publicRoot, prefab.imagePath));
            expect(image.readUInt32BE(16), prefab.id).toBeLessThanOrEqual(64);
            expect(image.readUInt32BE(20), prefab.id).toBeLessThanOrEqual(64);
            const seasonal = prefab.seasonal;
            expect(seasonal, prefab.id).toBeDefined();
            expect(seasonal?.summer).toBe(prefab.imagePath);
            expect(seasonal?.spring).toBe(seasonal?.summer);
            expect(seasonal?.autumn).toBe(seasonal?.summer);
            expect(seasonal?.winter).not.toBe(seasonal?.summer);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Snow, 0)]).toBe(seasonal?.winter);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Clear, 0.5)]).toBe(seasonal?.winter);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Clear, 0)]).toBe(prefab.imagePath);
            expect(seasonal?.[treeSeasonAt(date, WeatherType.Rain, 0)]).toBe(prefab.imagePath);
            const winter = seasonal?.winter;
            if (winter) expect(readFileSync(resolve(publicRoot, winter)).equals(image), prefab.id).toBe(false);
        }
    });

    it("blocks walking through rocks, grass and flowers only at their ground contact", () => {
        const decorations = catalog.collection.filter((prefab) =>
            /^Nature:(nature-(8|9|10|11|12)|snow-detail-([1-3]|[6-9]|12|13)|detail-grass-\d+|detail-flowers-\d+|detail-rocks-([1-5]|9)|detail-snow-[1-5]):/.test(
                prefab.id,
            ),
        );
        expect(decorations).toHaveLength(48);
        for (const prefab of decorations) {
            const rectangles = prefab.collisionRectangles;
            expect(rectangles, prefab.id).toHaveLength(1);
            expect(prefab.collisionGrid).toBeUndefined();
            // Both snapped and freely placed objects block the character at the same pixels.
            expect(getSolidRectangles({ x: 64, y: 96 }, prefab, 32)).toEqual(rectangles);
            expect(getSolidRectangles({ x: 67, y: 99 }, prefab, 32)).toEqual(rectangles);
            const image = readFileSync(resolve(publicRoot, prefab.imagePath));
            const width = image.readUInt32BE(16);
            const height = image.readUInt32BE(20);
            for (const rectangle of rectangles ?? []) {
                expect(rectangle.width).toBeLessThan(width);
                expect(rectangle.height).toBeLessThanOrEqual(10);
                expect(rectangle.y).toBeGreaterThan(height / 2);
                expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(height);
            }
            expect(prefab.depthOffset).toBeLessThan(0);
        }
    });

    it("gives stumps, fallen trunks and branches a solid footprint in both weather variants", () => {
        const wood = catalog.collection.filter((prefab) =>
            /^Nature:(nature-7|snow-detail-(4|5|10|11)|detail-rocks-[6-8]):/.test(prefab.id),
        );
        expect(wood).toHaveLength(8);
        for (const prefab of wood) {
            const rectangles = prefab.collisionRectangles;
            expect(rectangles, prefab.id).toHaveLength(1);
            expect(getSolidRectangles({ x: 67, y: 99 }, prefab, 32)).toEqual(rectangles);
            const image = readFileSync(resolve(publicRoot, prefab.imagePath));
            for (const rectangle of rectangles ?? []) {
                expect(rectangle.width).toBeGreaterThan(image.readUInt32BE(16) / 2);
                expect(rectangle.height).toBeGreaterThanOrEqual(4);
                expect(rectangle.y).toBeGreaterThan(image.readUInt32BE(20) / 2);
            }
        }
    });

    it("ships transparent PNGs, with equal seasonal dimensions and collisions inside the resized trees", () => {
        expect(catalog.collection).toHaveLength(151);
        expect(new Set(catalog.collection.map((item) => item.id)).size).toBe(151);
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
            if (prefab.seasonal && prefab.collisionRectangles) {
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
