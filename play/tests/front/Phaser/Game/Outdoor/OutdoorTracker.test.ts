import { describe, expect, it } from "vitest";
import { entityOutdoorRect, OutdoorTracker } from "../../../../../src/front/Phaser/Game/Outdoor/OutdoorTracker";

type TestEntity = { collectionName: string; x: number; y: number; width: number; height: number };

function setup() {
    let time = 0;
    const entities: TestEntity[] = [];
    const tracker = new OutdoorTracker(
        () => entities,
        () => ({ width: 320, height: 320 }),
        () => time,
    );
    const at = (t: number) => {
        time = t;
        tracker.update();
    };
    return { entities, tracker, at };
}

const wall = (x: number): TestEntity => ({ collectionName: "Carte Murs", x, y: 0, width: 32, height: 32 });

describe("OutdoorTracker", () => {
    it("computes on first update", () => {
        const { tracker, at } = setup();
        expect(tracker.grid).toBeUndefined();
        at(0);
        expect(tracker.grid).toBeDefined();
        expect(tracker.version).toBe(1);
    });

    it("recomputes 300 ms after the last wall change", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push(wall(64));
        at(1000);
        at(1200);
        expect(tracker.version).toBe(1);
        at(1301);
        expect(tracker.version).toBe(2);
        expect(tracker.grid?.isOutdoorAt(64, 0)).toBe(false);
    });

    it("waits again when walls keep changing", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push(wall(64));
        at(1000);
        entities.push(wall(128));
        at(1250);
        at(1400);
        expect(tracker.version).toBe(1);
        at(1551);
        expect(tracker.version).toBe(2);
    });

    it("leaves the grass beside a wall that starts mid-cell outdoors", () => {
        const { entities, tracker, at } = setup();
        // The team map puts its walls at x = 26 (mod 32): a 32 px cell would swallow 26 px of grass.
        entities.push({ collectionName: "Carte Murs", x: 26, y: 0, width: 12, height: 320 });
        at(0);
        expect(tracker.grid?.isOutdoorAt(20, 10)).toBe(true);
        expect(tracker.grid?.isOutdoorAt(30, 10)).toBe(false);
    });

    it("ignores non-wall entities", () => {
        const { entities, tracker, at } = setup();
        at(0);
        entities.push({ collectionName: "Infogène Sols", x: 0, y: 0, width: 32, height: 32 });
        at(1000);
        at(2000);
        expect(tracker.version).toBe(1);
    });
});

describe("entityOutdoorRect", () => {
    const door = {
        x: 64,
        y: 32,
        displayWidth: 32,
        displayHeight: 60,
        scaleX: 1,
        scaleY: 1,
        getPrefab: () => ({ collectionName: "Carte Portes", imagePath: "door.png" }),
    };

    it("measures an animated door by its prefab image, not its open frame", () => {
        expect(entityOutdoorRect(door, () => ({ width: 32, height: 32 }))).toEqual({
            collectionName: "Carte Portes",
            x: 64,
            y: 32,
            width: 32,
            height: 32,
        });
    });

    it("falls back to the displayed size without a prefab image", () => {
        expect(entityOutdoorRect(door, () => undefined)).toMatchObject({ width: 32, height: 60 });
    });
});
