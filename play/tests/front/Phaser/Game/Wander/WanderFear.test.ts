import { describe, expect, it } from "vitest";
import { lifeFireOf } from "@workadventure/map-editor";
import {
    BRAVE_SHARE,
    FEAR_RUN_PX,
    fearedPoint,
    FIRE_CALM_PX,
    fleeTarget,
    isBrave,
    nearestThreat,
    straightRunIsClear,
} from "../../../../../src/front/Phaser/Game/Wander/WanderFear";

const DAY_MS = 24 * 60 * 60 * 1000;
const everywhere = (): boolean => true;

describe("WanderFear", () => {
    it("makes about one animal in five brave, the same for every client, others another day", () => {
        const ids = Array.from({ length: 2000 }, (_, index) => `jungle-${index}`);
        const brave = ids.filter((id) => isBrave(id, 10 * DAY_MS));
        expect(brave.length / ids.length).toBeGreaterThan(BRAVE_SHARE - 0.05);
        expect(brave.length / ids.length).toBeLessThan(BRAVE_SHARE + 0.05);
        expect(ids.filter((id) => isBrave(id, 10 * DAY_MS + 1000))).toEqual(brave);
        expect(ids.filter((id) => isBrave(id, 11 * DAY_MS))).not.toEqual(brave);
    });

    it("fears the closest avatar within its radius, none farther", () => {
        const animal = { x: 0, y: 0 };
        expect(
            nearestThreat(
                animal,
                [
                    { x: 90, y: 0 },
                    { x: 0, y: 40 },
                ],
                96,
            ),
        ).toEqual({ x: 0, y: 40 });
        expect(nearestThreat(animal, [{ x: 200, y: 0 }], 96)).toBeUndefined();
    });

    it("runs straight away from the avatar on open ground", () => {
        const target = fleeTarget({ x: 100, y: 100 }, { x: 60, y: 100 }, everywhere);
        expect(target?.x).toBeCloseTo(100 + FEAR_RUN_PX);
        expect(target?.y).toBeCloseTo(100);
    });

    it("never runs into a building: it turns aside along the wall", () => {
        // A building starts 16 px to the right of the animal: straight away is blocked, it slips up or down.
        const outdoors = (x: number): boolean => x < 116;
        const from = { x: 100, y: 300 };
        const target = fleeTarget(from, { x: 60, y: 300 }, outdoors);
        expect(target).toBeDefined();
        expect(target && straightRunIsClear(from, target, outdoors)).toBe(true);
        expect(Math.abs((target?.y ?? 300) - 300)).toBeGreaterThan(FEAR_RUN_PX / 2 - 1);
    });

    it("stays where it is when cornered", () => {
        const pen = (x: number, y: number): boolean => Math.abs(x - 100) < 20 && Math.abs(y - 100) < 20;
        expect(fleeTarget({ x: 100, y: 100 }, { x: 90, y: 100 }, pen)).toBeUndefined();
    });

    it("tells whether the straight way back crosses a building", () => {
        const outdoors = (x: number): boolean => x < 50 || x > 80;
        expect(straightRunIsClear({ x: 0, y: 0 }, { x: 40, y: 0 }, outdoors)).toBe(true);
        expect(straightRunIsClear({ x: 0, y: 0 }, { x: 120, y: 0 }, outdoors)).toBe(false);
    });

    describe("the fire", () => {
        // A fire on the tile 7,5: its middle is at (240, 176).
        const fire = lifeFireOf({ fireAt: (x, y) => (x === 7 && y === 5 ? 1 : 0) });
        const flames = { x: 240, y: 176 };

        it("is feared from five tiles, before an avatar that stands nearer", () => {
            const feet = { x: 100, y: 176 };
            expect(fearedPoint(feet, [{ x: 60, y: 176 }], fire, false)).toEqual(flames);
            // 161 px from it: only the avatar.
            expect(fearedPoint({ x: 79, y: 176 }, [{ x: 60, y: 176 }], fire, false)).toEqual({ x: 60, y: 176 });
            expect(fearedPoint({ x: 79, y: 176 }, [], fire, false)).toBeUndefined();
        });

        it("is feared by an animal that does not fear the avatars: no avatar is given for it", () => {
            expect(fearedPoint({ x: 100, y: 176 }, undefined, fire, false)).toEqual(flames);
            expect(fearedPoint({ x: 100, y: 176 }, undefined, undefined, false)).toBeUndefined();
        });

        it("keeps a frightened animal away until it is seven tiles from it", () => {
            expect(FIRE_CALM_PX).toBe(224);
            expect(fearedPoint({ x: 240 - 220, y: 176 }, undefined, fire, true)).toEqual(flames);
            expect(fearedPoint({ x: 240 - 220, y: 176 }, undefined, fire, false)).toBeUndefined();
            expect(fearedPoint({ x: 240 - 225, y: 176 }, undefined, fire, true)).toBeUndefined();
        });

        it("leaves the fear of the avatars as it was without a fire", () => {
            const avatars = [{ x: 90, y: 0 }];
            expect(fearedPoint({ x: 0, y: 0 }, avatars, undefined, false)).toEqual({ x: 90, y: 0 });
            expect(fearedPoint({ x: 0, y: 0 }, [{ x: 120, y: 0 }], undefined, false)).toBeUndefined();
            expect(fearedPoint({ x: 0, y: 0 }, [{ x: 120, y: 0 }], undefined, true)).toEqual({ x: 120, y: 0 });
        });
    });
});
